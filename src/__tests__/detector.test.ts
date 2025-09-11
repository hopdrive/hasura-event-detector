/**
 * Detector Unit Tests
 * 
 * Tests for the core event detection system.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { listenTo } from '../detector.js';
import { createMockHasuraEvent, createTestConfig, createTempDir, cleanupTempDir, createMockEventModule } from '../../tests/test-utils.js';
import type { HasuraEventPayload, ListenToOptions } from '../types/index.js';

describe('Event Detector', () => {
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

  describe('listenTo', () => {
    it('should process a valid Hasura event', async () => {
      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        old: { id: 1, active: false },
        new: { id: 1, active: true }
      });

      const config = createTestConfig({
        eventModulesDirectory: tempDir,
        listenedEvents: []
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result).toMatchObject({
        events: [],
        duration: expect.any(Number)
      });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should detect events when modules are provided', async () => {
      // Create a mock event module
      await createMockEventModule(tempDir, 'user-activation', true, 2);

      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        old: { id: 1, active: false },
        new: { id: 1, active: true }
      });

      const config = createTestConfig({
        eventModulesDirectory: tempDir,
        listenedEvents: ['user-activation' as any]
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        name: 'user-activation',
        jobs: expect.arrayContaining([
          expect.objectContaining({
            name: 'mockJob0',
            completed: true,
            result: { action: 'mock_completed', jobIndex: 0 }
          })
        ])
      });
    });

    it('should handle detector that returns false', async () => {
      // Create a mock event module that doesn't detect
      await createMockEventModule(tempDir, 'no-detection', false, 1);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        eventModulesDirectory: tempDir,
        listenedEvents: ['no-detection' as any]
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(0);
    });

    it('should validate Hasura event payload structure', async () => {
      const invalidEvent = {
        id: 'test',
        // Missing required event.data and event.op structure
        event: {
          // Missing data and op fields
        }
      } as any;

      const config = createTestConfig();
      const result = await listenTo(invalidEvent, config);

      expect(result.events).toHaveLength(0);
      expect(mockConsole.mockError).toHaveBeenCalledWith(
        expect.stringContaining('Invalid Hasura event payload structure')
      );
    });

    it('should handle missing event modules directory gracefully', async () => {
      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        eventModulesDirectory: '/nonexistent/directory'
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should add correlation ID to Hasura event', async () => {
      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig();

      await listenTo(hasuraEvent, config);

      expect(hasuraEvent.__correlationId).toBeValidCorrelationId();
    });

    it('should preserve existing correlation ID in UPDATE operations', async () => {
      const existingCorrelationId = 'existing.correlation.id';
      const hasuraEvent = createMockHasuraEvent({
        operation: 'UPDATE',
        old: { id: 1, updated_by: 'user' },
        new: { id: 1, updated_by: existingCorrelationId }
      });

      const config = createTestConfig();

      await listenTo(hasuraEvent, config);

      expect(hasuraEvent.__correlationId).toBe(existingCorrelationId);
    });

    it('should inject context into Hasura event', async () => {
      const testContext = { 
        requestId: 'test-request-123',
        userAgent: 'test-agent' 
      };
      
      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig();

      await listenTo(hasuraEvent, config, testContext);

      expect(hasuraEvent.__context).toEqual(testContext);
    });

    it('should handle plugin system initialization errors gracefully', async () => {
      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        observability: {
          enabled: true,
          database: {
            host: 'invalid-host',
            port: 5432,
            database: 'test',
            user: 'test',
            password: 'test'
          }
        } as any
      });

      // Should not throw, should continue without observability
      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should process multiple events in parallel', async () => {
      // Create multiple event modules
      await createMockEventModule(tempDir, 'event-1', true, 1);
      await createMockEventModule(tempDir, 'event-2', true, 2);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        eventModulesDirectory: tempDir,
        listenedEvents: ['event-1' as any, 'event-2' as any]
      });

      const startTime = Date.now();
      const result = await listenTo(hasuraEvent, config);
      const endTime = Date.now();

      expect(result.events).toHaveLength(2);
      
      // Should process in parallel, not sequentially
      expect(endTime - startTime).toBeLessThan(200); // Generous threshold for parallel execution
      
      // Check individual event results
      const event1 = result.events.find(e => e.name === 'event-1');
      const event2 = result.events.find(e => e.name === 'event-2');
      
      expect(event1?.jobs).toHaveLength(1);
      expect(event2?.jobs).toHaveLength(2);
    });

    it('should auto-load event modules when configured', async () => {
      await createMockEventModule(tempDir, 'auto-loaded-event', true, 1);

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        autoLoadEventModules: true,
        eventModulesDirectory: tempDir
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(1);
      expect(result.events[0].name).toBe('auto-loaded-event');
    });

    it('should handle malformed event modules gracefully', async () => {
      // Create an invalid event module
      const fs = await import('fs');
      const path = await import('path');
      const invalidModulePath = path.join(tempDir, 'invalid-module.js');
      await fs.promises.writeFile(invalidModulePath, 'invalid javascript content');

      const hasuraEvent = createMockHasuraEvent();
      const config = createTestConfig({
        eventModulesDirectory: tempDir,
        listenedEvents: ['invalid-module' as any]
      });

      const result = await listenTo(hasuraEvent, config);

      expect(result.events).toHaveLength(0);
      expect(mockConsole.mockError).toHaveBeenCalled();
    });
  });

  describe('Runtime Validation', () => {
    it('should validate required Hasura event fields', async () => {
      const cases = [
        { event: null, description: 'null event' },
        { event: undefined, description: 'undefined event' },
        { event: 'string', description: 'string event' },
        { event: { id: 'test' }, description: 'missing event object' },
        { event: { id: 'test', event: {} }, description: 'missing event.data' },
        { event: { id: 'test', event: { data: {} } }, description: 'missing event.op' },
      ];

      for (const { event, description } of cases) {
        const config = createTestConfig();
        const result = await listenTo(event as any, config);

        expect(result.events).toHaveLength(0);
        expect(mockConsole.mockError).toHaveBeenCalledWith(
          'listenTo',
          'Invalid Hasura event payload structure'
        );

        // Reset mock for next iteration
        mockConsole.mockError.mockClear();
      }
    });
  });
});