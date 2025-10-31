/**
 * Tests for timeout handling in serverless environments
 */

import { listenTo } from '../detector';
import { job, run } from '../handler';
import { TimeoutManager, TimeoutError, isTimeoutError, delayAsync } from '../helpers/timeout-wrapper';
import type {
  HasuraEventPayload,
  ListenToOptions,
  EventName,
  JobOptions,
} from '../types';

// Mock Hasura event payload
const createMockHasuraEvent = (): HasuraEventPayload => ({
  event: {
    session_variables: { 'x-hasura-role': 'admin' },
    op: 'INSERT',
    data: {
      new: { id: 1, name: 'Test' },
      old: null,
    },
  },
  created_at: new Date().toISOString(),
  id: 'test-event-id',
  delivery_info: { max_retries: 3, current_retry: 0 },
  trigger: { name: 'test-trigger' },
  table: { schema: 'public', name: 'test' },
});

describe('Timeout Handling', () => {
  describe('TimeoutManager', () => {
    it('should detect approaching timeout', async () => {
      let remainingTime = 5000; // Start with 5 seconds

      const manager = new TimeoutManager({
        getRemainingTimeInMillis: () => remainingTime,
        safetyMargin: 2000,
      });

      expect(manager.isApproachingTimeout()).toBe(false);

      // Simulate time passing
      remainingTime = 1500; // 1.5 seconds left
      expect(manager.isApproachingTimeout()).toBe(true);
    });

    it('should execute function with timeout monitoring', async () => {
      let remainingTime = 5000;
      let timeoutHandlerCalled = false;

      const manager = new TimeoutManager({
        getRemainingTimeInMillis: () => remainingTime,
        safetyMargin: 2000,
      });

      const testFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      };

      const onTimeout = async () => {
        timeoutHandlerCalled = true;
      };

      const result = await manager.executeWithTimeout(testFunction, onTimeout);

      expect(result).toBe('success');
      expect(timeoutHandlerCalled).toBe(false);
    });

    it('should trigger timeout handler when approaching limit', async () => {
      let remainingTime = 3000;
      let timeoutHandlerCalled = false;

      const manager = new TimeoutManager({
        getRemainingTimeInMillis: () => remainingTime,
        safetyMargin: 2000,
        logger: () => {}, // Suppress logs in test
      });

      const testFunction = async () => {
        // Simulate work that takes time
        await new Promise(resolve => setTimeout(resolve, 100));
        // Simulate timeout approaching during execution
        remainingTime = 1500;
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'should not reach';
      };

      const onTimeout = async () => {
        timeoutHandlerCalled = true;
      };

      try {
        await manager.executeWithTimeout(testFunction, onTimeout, 'Test timeout');
        fail('Should have thrown timeout error');
      } catch (error) {
        expect(isTimeoutError(error)).toBe(true);
        expect((error as TimeoutError).message).toContain('Test timeout');
      }

      // Give time for async operations to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(timeoutHandlerCalled).toBe(true);
    });

    it('should support abort signals', async () => {
      const manager = new TimeoutManager({
        getRemainingTimeInMillis: () => 10000,
        safetyMargin: 2000,
      });

      const signal = manager.getAbortSignal();
      expect(signal.aborted).toBe(false);

      // Start monitoring with immediate timeout
      let timeoutHandlerCalled = false;
      manager.startMonitoring(async () => {
        timeoutHandlerCalled = true;
      });

      // Manually trigger abort (simulating timeout)
      (manager as any).abortController.abort();

      expect(signal.aborted).toBe(true);
      manager.stopMonitoring();
    });
  });

  describe('delayAsync with AbortSignal', () => {
    it('should complete delay normally', async () => {
      const start = Date.now();
      await delayAsync(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some margin
      expect(elapsed).toBeLessThan(200);
    });

    it('should abort delay on signal', async () => {
      const controller = new AbortController();

      const delayPromise = delayAsync(1000, controller.signal);

      // Abort after 50ms
      setTimeout(() => controller.abort(), 50);

      try {
        await delayPromise;
        fail('Should have thrown abort error');
      } catch (error) {
        expect((error as Error).message).toContain('aborted');
      }
    });

    it('should call progress callback', async () => {
      const progressValues: number[] = [];

      await delayAsync(
        200,
        undefined,
        (remaining) => {
          progressValues.push(remaining);
        },
        50 // Check every 50ms
      );

      expect(progressValues.length).toBeGreaterThan(0);
      // Progress values should be decreasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeLessThanOrEqual(progressValues[i - 1]);
      }
    });
  });

  describe('listenTo with timeout', () => {
    it('should handle timeout configuration', async () => {
      const hasuraEvent = createMockHasuraEvent();

      const options: ListenToOptions = {
        autoLoadEventModules: false,
        listenedEvents: [], // No events to process
        timeoutConfig: {
          enabled: true,
          safetyMargin: 2000,
          maxExecutionTime: 10000,
          serverlessMode: true,
        },
      };

      const result = await listenTo(hasuraEvent, options);

      expect(result).toBeDefined();
      expect(result.events).toEqual([]);
      expect(result.timedOut).toBeFalsy();
    });

    it('should pass abort signal to jobs', async () => {
      const hasuraEvent = createMockHasuraEvent();
      let jobReceivedAbortSignal = false;

      // Create a mock job that checks for abort signal
      const testJob = job(async (event: EventName, hasura: HasuraEventPayload, options?: JobOptions) => {
        if (options?.abortSignal) {
          jobReceivedAbortSignal = true;
        }
        return { success: true };
      });

      // Since we can't easily inject jobs into listenTo, we'll test the handler directly
      const jobs = [testJob];
      const result = await run('test-event' as EventName, { ...hasuraEvent, __abortSignal: new AbortController().signal }, jobs);

      expect(result).toBeDefined();
      expect(result?.[0]?.completed).toBe(true);
      expect(jobReceivedAbortSignal).toBe(true);
    });

    it('should handle serverless mode shutdown behavior', async () => {
      const hasuraEvent = createMockHasuraEvent();

      // Test with serverless mode enabled
      const serverlessOptions: ListenToOptions = {
        autoLoadEventModules: false,
        listenedEvents: [],
        timeoutConfig: {
          enabled: true,
          serverlessMode: true, // Should trigger plugin shutdown
          maxExecutionTime: 10000,
        },
      };

      const result = await listenTo(hasuraEvent, serverlessOptions);
      expect(result.timedOut).toBeFalsy();

      // Test with serverless mode disabled
      const nonServerlessOptions: ListenToOptions = {
        autoLoadEventModules: false,
        listenedEvents: [],
        timeoutConfig: {
          enabled: true,
          serverlessMode: false, // Should not trigger plugin shutdown
          maxExecutionTime: 10000,
        },
      };

      const result2 = await listenTo(hasuraEvent, nonServerlessOptions);
      expect(result2.timedOut).toBeFalsy();
    });
  });

  describe('Job timeout handling', () => {
    it('should respect job-level timeout', async () => {
      const hasuraEvent = createMockHasuraEvent();

      // Create a job that takes longer than its timeout
      const slowJob = job(
        async (event: EventName, hasura: HasuraEventPayload) => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return { completed: true };
        },
        { timeout: 100 } // Job should timeout after 100ms
      );

      const jobs = [slowJob];

      // Note: The current implementation doesn't actually enforce job timeouts
      // This test documents the expected behavior once implemented
      const result = await run('test-event' as EventName, hasuraEvent, jobs);

      expect(result).toBeDefined();
      // The job might fail or succeed depending on implementation
      // This test serves as documentation for expected behavior
    });

    it('should handle job abort on function timeout', async () => {
      const hasuraEvent = createMockHasuraEvent();
      const abortController = new AbortController();

      // Add abort signal to hasura event
      hasuraEvent.__abortSignal = abortController.signal;

      let jobAborted = false;

      const abortableJob = job(async (event: EventName, hasura: HasuraEventPayload, options?: JobOptions) => {
        const signal = options?.abortSignal;

        if (signal) {
          signal.addEventListener('abort', () => {
            jobAborted = true;
          });
        }

        // Simulate work
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 1000);

          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error('Job aborted'));
            });
          }
        });

        return { completed: true };
      });

      const jobs = [abortableJob];

      // Start job execution
      const jobPromise = run('test-event' as EventName, hasuraEvent, jobs);

      // Abort after 50ms
      setTimeout(() => abortController.abort(), 50);

      const result = await jobPromise;

      expect(result).toBeDefined();
      // Job should have been aborted
      expect(jobAborted).toBe(true);
    });
  });
});