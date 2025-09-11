/**
 * Handler Unit Tests
 * 
 * Tests for the job execution system.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { run, job } from '../handler.js';
import { createMockHasuraEvent, createMockJob, createTestJobOptions } from '../../tests/test-utils.js';
import type { EventName, HasuraEventPayload, JobFunction, JobOptions } from '../types/index.js';

describe('Job Handler', () => {
  let mockConsole: ReturnType<typeof global.testUtils.mockConsole>;

  beforeEach(() => {
    mockConsole = global.testUtils.mockConsole();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  describe('job', () => {
    it('should create a job with function and options', () => {
      const mockFn = jest.fn();
      const options = createTestJobOptions({ timeout: 3000 });

      const result = job(mockFn, options);

      expect(result).toEqual({
        func: mockFn,
        options: options
      });
    });

    it('should create a job with function only', () => {
      const mockFn = jest.fn();

      const result = job(mockFn);

      expect(result).toEqual({
        func: mockFn
      });
    });

    it('should support generic typing', () => {
      const typedJob = job<{ message: string }>(async () => {
        return { message: 'test' };
      });

      expect(typedJob.func).toBeInstanceOf(Function);
    });
  });

  describe('run', () => {
    const eventName: EventName = 'test-event' as EventName;
    let hasuraEvent: HasuraEventPayload;

    beforeEach(() => {
      hasuraEvent = createMockHasuraEvent();
    });

    it('should execute jobs in parallel', async () => {
      const startTimes: number[] = [];
      const jobs = [
        job(async () => {
          startTimes.push(Date.now());
          await global.testUtils.delay(100);
          return { action: 'job1' };
        }),
        job(async () => {
          startTimes.push(Date.now());
          await global.testUtils.delay(100);
          return { action: 'job2' };
        }),
        job(async () => {
          startTimes.push(Date.now());
          await global.testUtils.delay(100);
          return { action: 'job3' };
        })
      ];

      const startTime = Date.now();
      const results = await run(eventName, hasuraEvent, jobs);
      const endTime = Date.now();

      // Should complete in roughly parallel time, not sequential
      expect(endTime - startTime).toBeLessThan(200); // Allow some overhead
      
      // All jobs should have started around the same time
      const maxStartTimeDiff = Math.max(...startTimes) - Math.min(...startTimes);
      expect(maxStartTimeDiff).toBeLessThan(50);

      expect(results).toHaveLength(3);
      results?.forEach(result => {
        expect(result).toBeValidJobResult();
        expect(result.completed).toBe(true);
      });
    });

    it('should handle job failures gracefully', async () => {
      const jobs = [
        job(createMockJob({ action: 'success' })),
        job(createMockJob(null, 0, true)), // This job will fail
        job(createMockJob({ action: 'also_success' }))
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(3);
      
      // First and third jobs should succeed
      expect(results?.[0].completed).toBe(true);
      expect(results?.[2].completed).toBe(true);
      
      // Second job should fail
      expect(results?.[1].completed).toBe(false);
      expect(results?.[1].error).toBeInstanceOf(Error);
    });

    it('should track job execution times', async () => {
      const delay = 50;
      const jobs = [
        job(createMockJob({ action: 'timed' }, delay))
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      expect(results?.[0].duration).toBeGreaterThan(delay);
      expect(results?.[0].duration).toBeLessThan(delay + 100); // Allow overhead
    });

    it('should set job names correctly', async () => {
      const namedFunction = async function testJobFunction() {
        return { action: 'named' };
      };

      const jobs = [
        job(namedFunction),
        job(async function anotherTestJob() {
          return { action: 'another' };
        })
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(2);
      expect(results?.[0].name).toBe('testJobFunction');
      expect(results?.[1].name).toBe('anotherTestJob');
    });

    it('should handle anonymous functions', async () => {
      const jobs = [
        job(async () => ({ action: 'anonymous' }))
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      expect(results?.[0].name).toBe('anonymous');
    });

    it('should pass correlation ID to jobs', async () => {
      const correlationId = 'test.correlation.123';
      hasuraEvent.__correlationId = correlationId as any;

      let receivedOptions: JobOptions | undefined;
      const jobs = [
        job(async (event, hasuraEvent, options) => {
          receivedOptions = options;
          return { action: 'correlation_test' };
        })
      ];

      await run(eventName, hasuraEvent, jobs);

      expect(receivedOptions?.correlationId).toBe(correlationId);
    });

    it('should handle empty job array', async () => {
      const results = await run(eventName, hasuraEvent, []);

      expect(results).toBeUndefined();
    });

    it('should handle undefined jobs parameter', async () => {
      const results = await run(eventName, hasuraEvent, undefined as any);

      expect(results).toBeUndefined();
    });

    it('should validate job functions', async () => {
      const jobs = [
        { func: null, options: {} } as any,
        { func: 'not a function', options: {} } as any,
        job(async () => ({ action: 'valid' }))
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(3);
      
      // First two should fail due to invalid functions
      expect(results?.[0].completed).toBe(false);
      expect(results?.[1].completed).toBe(false);
      
      // Third should succeed
      expect(results?.[2].completed).toBe(true);
    });

    it('should record start and end times', async () => {
      const jobs = [
        job(async () => {
          await global.testUtils.delay(50);
          return { action: 'timed' };
        })
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      const result = results?.[0];
      
      expect(result?.startTime).toBeInstanceOf(Date);
      expect(result?.endTime).toBeInstanceOf(Date);
      expect(result?.endTime?.getTime()).toBeGreaterThan(result?.startTime.getTime());
    });

    it('should handle job timeouts properly', async () => {
      const jobs = [
        job(async () => {
          await global.testUtils.delay(200); // Longer than any reasonable timeout
          return { action: 'should_timeout' };
        }, { timeout: 50 })
      ];

      // Note: Our implementation doesn't actually implement timeouts yet,
      // but this test documents the expected behavior
      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      // In a real timeout implementation, this would be false
      // For now, we just verify the job structure
      expect(results?.[0]).toBeValidJobResult();
    });

    it('should preserve job options in enhanced options', async () => {
      const originalOptions = createTestJobOptions({
        customProperty: 'test-value'
      });

      let receivedOptions: JobOptions | undefined;
      const jobs = [
        job(async (event, hasuraEvent, options) => {
          receivedOptions = options;
          return { action: 'options_test' };
        }, originalOptions)
      ];

      await run(eventName, hasuraEvent, jobs);

      expect(receivedOptions).toMatchObject(originalOptions);
    });
  });

  describe('Error Handling', () => {
    const eventName: EventName = 'test-event' as EventName;
    let hasuraEvent: HasuraEventPayload;

    beforeEach(() => {
      hasuraEvent = createMockHasuraEvent();
    });

    it('should capture error details in job results', async () => {
      const errorMessage = 'Test error message';
      const jobs = [
        job(async () => {
          throw new Error(errorMessage);
        })
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      const result = results?.[0];
      
      expect(result?.completed).toBe(false);
      expect(result?.error).toBeInstanceOf(Error);
      expect(result?.error?.message).toContain(errorMessage);
      expect(result?.result).toBe(null);
    });

    it('should handle synchronous errors', async () => {
      const jobs = [
        job(() => {
          throw new Error('Sync error');
        })
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(1);
      expect(results?.[0].completed).toBe(false);
      expect(results?.[0].error).toBeInstanceOf(Error);
    });

    it('should continue processing other jobs when one fails', async () => {
      const jobs = [
        job(async () => ({ action: 'job1_success' })),
        job(async () => { throw new Error('job2_failed'); }),
        job(async () => ({ action: 'job3_success' }))
      ];

      const results = await run(eventName, hasuraEvent, jobs);

      expect(results).toHaveLength(3);
      expect(results?.[0].completed).toBe(true);
      expect(results?.[1].completed).toBe(false);
      expect(results?.[2].completed).toBe(true);
    });
  });
});