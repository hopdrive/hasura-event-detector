/**
 * Event Detection Integration Tests
 * 
 * End-to-end tests for complete event detection and job execution flows.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { listenTo } from '../../src/detector.js';
import { emailNotificationJob, analyticsTrackingJob } from '../../src/jobs/index.js';
import { job } from '../../src/handler.js';
import { 
  createMockHasuraEvent, 
  createTestConfig, 
  createTempDir, 
  cleanupTempDir,
  createMockEventModule
} from '../test-utils.js';
import fs from 'fs';
import path from 'path';

describe('Event Detection Integration', () => {
  let tempDir: string;
  let mockConsole: ReturnType<typeof global.testUtils.mockConsole>;

  beforeEach(async () => {
    tempDir = await createTempDir();
    mockConsole = global.testUtils.mockConsole();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    mockConsole.restore();
  });

  describe('Complete Event Flow', () => {
    it('should detect and process a user activation event end-to-end', async () => {
      // Create a realistic user activation event module
      const eventModulePath = path.join(tempDir, 'user-activation.js');
      const moduleContent = `
const { parseHasuraEvent, columnHasChanged, job, run, emailNotificationJob } = require('../../src/index.js');

const detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);
  
  return operation === 'UPDATE' && 
         columnHasChanged('active', dbEvent) &&
         dbEvent?.old?.active === false &&
         dbEvent?.new?.active === true;
};

const handler = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [
    job(async () => {
      // Simulate welcome email
      return {
        action: 'welcome_email_sent',
        recipient: dbEvent.new.email,
        template: 'user_activation'
      };
    }),
    
    job(async () => {
      // Simulate analytics tracking
      return {
        action: 'analytics_tracked',
        event: 'User Activated',
        userId: dbEvent.new.id
      };
    }),
    
    job(async () => {
      // Simulate onboarding setup
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
      return {
        action: 'onboarding_created',
        userId: dbEvent.new.id,
        tasks: ['complete_profile', 'verify_email', 'take_tour']
      };
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;

      await fs.promises.writeFile(eventModulePath, moduleContent);

      // Create the Hasura event
      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        tableName: 'users',
        old: { id: 123, email: 'john@example.com', active: false, plan: 'free' },
        new: { id: 123, email: 'john@example.com', active: true, plan: 'free' },
        sessionVariables: {
          'x-hasura-role': 'user',
          'x-hasura-user-id': '123',
          'x-hasura-user-email': 'john@example.com'
        }
      });

      // Configure the detector
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      // Process the event
      const result = await listenTo(hasuraEvent, config);

      // Verify results
      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('user-activation');
      expect(result.events[0].jobs).toHaveLength(3);

      // Check individual job results
      const jobs = result.events[0].jobs;
      expect(jobs[0].completed).toBe(true);
      expect(jobs[0].result.action).toBe('welcome_email_sent');
      expect(jobs[0].result.recipient).toBe('john@example.com');

      expect(jobs[1].completed).toBe(true);
      expect(jobs[1].result.action).toBe('analytics_tracked');
      expect(jobs[1].result.userId).toBe(123);

      expect(jobs[2].completed).toBe(true);
      expect(jobs[2].result.action).toBe('onboarding_created');
      expect(jobs[2].result.tasks).toHaveLength(3);

      // Verify correlation ID was added
      expect(hasuraEvent.__correlationId).toBeValidCorrelationId();

      // Verify timing
      expect(result.duration).toBeGreaterThan(0);
      jobs.forEach(job => {
        expect(job.duration).toBeGreaterThan(0);
        expect(job.startTime).toBeInstanceOf(Date);
        expect(job.endTime).toBeInstanceOf(Date);
      });
    });

    it('should handle multiple events detected from single Hasura trigger', async () => {
      // Create multiple event modules that detect the same Hasura event
      await createMockEventModule(tempDir, 'user-status-change', true, 1);
      await createMockEventModule(tempDir, 'audit-log', true, 1);
      await createMockEventModule(tempDir, 'notification-trigger', true, 2);

      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        old: { id: 1, status: 'pending' },
        new: { id: 1, status: 'approved' }
      });

      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(3);
      
      const eventNames = result.events.map(e => e.name).sort();
      expect(eventNames).toEqual(['audit-log', 'notification-trigger', 'user-status-change']);

      // Verify total job count
      const totalJobs = result.events.reduce((sum, e) => sum + e.jobs.length, 0);
      expect(totalJobs).toBe(4); // 1 + 1 + 2

      // All jobs should have completed successfully
      result.events.forEach(event => {
        event.jobs.forEach(job => {
          expect(job.completed).toBe(true);
        });
      });
    });

    it('should continue processing when one event module fails', async () => {
      // Create one working event module
      await createMockEventModule(tempDir, 'working-event', true, 1);

      // Create a failing event module
      const failingModulePath = path.join(tempDir, 'failing-event.js');
      const failingContent = `
const detector = async () => true;
const handler = async () => {
  throw new Error('Simulated handler failure');
};
module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(failingModulePath, failingContent);

      // Create another working event module
      await createMockEventModule(tempDir, 'another-working-event', true, 2);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      // Should still process the working events
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      
      // Find the working events
      const workingEvents = result.events.filter(e => 
        e.name === 'working-event' || e.name === 'another-working-event'
      );
      expect(workingEvents).toHaveLength(2);

      // Working events should have completed successfully
      workingEvents.forEach(event => {
        event.jobs.forEach(job => {
          expect(job.completed).toBe(true);
        });
      });
    });

    it('should handle event modules with no jobs', async () => {
      const emptyJobsModulePath = path.join(tempDir, 'empty-jobs.js');
      const moduleContent = `
const detector = async () => true;
const handler = async () => [];
module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(emptyJobsModulePath, moduleContent);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('empty-jobs');
      expect(result.events[0].jobs).toHaveLength(0);
    });
  });

  describe('Built-in Job Integration', () => {
    it('should execute built-in email notification job', async () => {
      const eventModulePath = path.join(tempDir, 'email-test.js');
      const moduleContent = `
const { parseHasuraEvent, job, run, emailNotificationJob } = require('../../src/index.js');

const detector = async () => true;

const handler = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [
    job(emailNotificationJob, {
      to: dbEvent.new.email,
      template: 'welcome',
      variables: { name: dbEvent.new.name }
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(eventModulePath, moduleContent);

      const hasuraEvent = createMockHasuraEvent({
        new: { id: 1, email: 'test@example.com', name: 'Test User' }
      });

      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].jobs).toHaveLength(1);
      
      const jobResult = result.events[0].jobs[0];
      expect(jobResult.completed).toBe(true);
      expect(jobResult.result.action).toBe('email_sent');
      expect(jobResult.result.recipient).toBe('test@example.com');
    });

    it('should execute built-in analytics tracking job', async () => {
      const eventModulePath = path.join(tempDir, 'analytics-test.js');
      const moduleContent = `
const { parseHasuraEvent, job, run, analyticsTrackingJob } = require('../../src/index.js');

const detector = async () => true;

const handler = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [
    job(analyticsTrackingJob, {
      eventName: 'User Registered',
      userId: dbEvent.new.id.toString(),
      properties: {
        plan: dbEvent.new.plan,
        source: 'hasura_trigger'
      }
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(eventModulePath, moduleContent);

      const hasuraEvent = createMockHasuraEvent({
        new: { id: 456, plan: 'premium', email: 'premium@example.com' }
      });

      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].jobs).toHaveLength(1);
      
      const jobResult = result.events[0].jobs[0];
      expect(jobResult.completed).toBe(true);
      expect(jobResult.result.action).toBe('analytics_tracked');
      expect(jobResult.result.eventName).toBe('User Registered');
      expect(jobResult.result.userId).toBe('456');
    });
  });

  describe('Error Handling Integration', () => {
    it('should isolate job failures within an event', async () => {
      const mixedJobsModulePath = path.join(tempDir, 'mixed-jobs.js');
      const moduleContent = `
const { job, run } = require('../../src/index.js');

const detector = async () => true;

const handler = async (event, hasuraEvent) => {
  const jobs = [
    job(async () => ({ action: 'success_1' })),
    job(async () => { throw new Error('Job 2 failed'); }),
    job(async () => ({ action: 'success_3' })),
    job(async () => { throw new Error('Job 4 failed'); }),
    job(async () => ({ action: 'success_5' }))
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(mixedJobsModulePath, moduleContent);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].jobs).toHaveLength(5);

      const jobs = result.events[0].jobs;
      
      // Jobs 1, 3, and 5 should succeed
      expect(jobs[0].completed).toBe(true);
      expect(jobs[0].result.action).toBe('success_1');
      
      expect(jobs[2].completed).toBe(true);
      expect(jobs[2].result.action).toBe('success_3');
      
      expect(jobs[4].completed).toBe(true);
      expect(jobs[4].result.action).toBe('success_5');

      // Jobs 2 and 4 should fail
      expect(jobs[1].completed).toBe(false);
      expect(jobs[1].error?.message).toContain('Job 2 failed');
      
      expect(jobs[3].completed).toBe(false);
      expect(jobs[3].error?.message).toContain('Job 4 failed');
    });

    it('should handle detector function failures gracefully', async () => {
      const failingDetectorPath = path.join(tempDir, 'failing-detector.js');
      const moduleContent = `
const detector = async () => {
  throw new Error('Detector failed');
};

const handler = async () => [];

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(failingDetectorPath, moduleContent);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      // Should not crash, should continue processing
      expect(result.events).toHaveLength(0);
      expect(result.duration).toBeGreaterThan(0);
    });
  });

  describe('Context and Correlation ID Integration', () => {
    it('should preserve correlation ID through entire flow', async () => {
      let capturedCorrelationId: string | undefined;
      
      const correlationTestPath = path.join(tempDir, 'correlation-test.js');
      const moduleContent = `
const { job, run } = require('../../src/index.js');

const detector = async () => true;

const handler = async (event, hasuraEvent) => {
  const jobs = [
    job(async (event, hasuraEvent, options) => {
      return { 
        action: 'correlation_captured',
        correlationId: options.correlationId 
      };
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(correlationTestPath, moduleContent);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].jobs).toHaveLength(1);

      const jobResult = result.events[0].jobs[0];
      expect(jobResult.completed).toBe(true);
      expect(jobResult.result.correlationId).toBeValidCorrelationId();
      expect(jobResult.result.correlationId).toBe(hasuraEvent.__correlationId);
    });

    it('should pass context through to event handlers', async () => {
      const contextTestPath = path.join(tempDir, 'context-test.js');
      const moduleContent = `
const { job, run } = require('../../src/index.js');

const detector = async (event, hasuraEvent) => {
  return hasuraEvent.__context && hasuraEvent.__context.testFlag === true;
};

const handler = async (event, hasuraEvent) => {
  const jobs = [
    job(async () => ({
      action: 'context_processed',
      context: hasuraEvent.__context
    }))
  ];
  
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
      `;
      await fs.promises.writeFile(contextTestPath, moduleContent);

      const hasuraEvent = createMockHasuraEvent();
      const testContext = {
        testFlag: true,
        requestId: 'test-request-456',
        metadata: { source: 'integration-test' }
      };
      
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config, testContext);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].jobs).toHaveLength(1);

      const jobResult = result.events[0].jobs[0];
      expect(jobResult.completed).toBe(true);
      expect(jobResult.result.context).toEqual(testContext);
    });
  });
});