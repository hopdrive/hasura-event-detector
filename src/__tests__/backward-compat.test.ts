/**
 * Tests to ensure backward compatibility after timeout changes
 */

import { listenTo } from '../detector';
import type { HasuraEventPayload, ListenToOptions } from '../types';

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

describe('Backward Compatibility', () => {
  it('should work without any timeout configuration (original API)', async () => {
    const hasuraEvent = createMockHasuraEvent();

    // Original usage - no timeout config at all
    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
    };

    const result = await listenTo(hasuraEvent, options);

    expect(result).toBeDefined();
    expect(result.events).toEqual([]);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.timedOut).toBeUndefined(); // No timeout info when not configured
  });

  it('should preserve user context data separately from runtime context', async () => {
    const hasuraEvent = createMockHasuraEvent();

    const userContext = {
      userId: 'user-123',
      requestId: 'req-456',
      customData: { foo: 'bar' },
    };

    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
      context: userContext, // User data only
    };

    const result = await listenTo(hasuraEvent, options);

    // The user context should be attached to hasuraEvent.__context
    expect(hasuraEvent.__context).toEqual(userContext);

    // Should not have runtime functions in user context
    expect(hasuraEvent.__context?.getRemainingTimeInMillis).toBeUndefined();
    expect(hasuraEvent.__context?.isUsingFallbackTimer).toBeUndefined();
  });

  it('should work with timeout config but no runtime function', async () => {
    const hasuraEvent = createMockHasuraEvent();

    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
      timeoutConfig: {
        enabled: true,
        maxExecutionTime: 5000, // Use fallback
        serverlessMode: true,
      },
    };

    const result = await listenTo(hasuraEvent, options);

    expect(result).toBeDefined();
    expect(result.timedOut).toBeFalsy();
  });

  it('should work with both user context and timeout config', async () => {
    const hasuraEvent = createMockHasuraEvent();

    const userContext = {
      source: 'test-suite',
      version: '1.0.0',
    };

    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
      context: userContext,
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: () => 10000,
        safetyMargin: 2000,
        serverlessMode: true,
      },
    };

    const result = await listenTo(hasuraEvent, options);

    expect(result).toBeDefined();

    // User context should be preserved
    expect(hasuraEvent.__context).toEqual(userContext);

    // Runtime functions should NOT be in user context
    expect(hasuraEvent.__context?.getRemainingTimeInMillis).toBeUndefined();
  });

  it('should handle correlation ID as before', async () => {
    const hasuraEvent = createMockHasuraEvent();

    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
      correlationId: 'test-correlation-123',
    };

    const result = await listenTo(hasuraEvent, options);

    expect(hasuraEvent.__correlationId).toBe('test-correlation-123');
  });

  it('should work with minimal config (most common use case)', async () => {
    const hasuraEvent = createMockHasuraEvent();

    // Most common usage pattern
    const result = await listenTo(hasuraEvent, {
      autoLoadEventModules: false,
      listenedEvents: [],
    });

    expect(result).toBeDefined();
    expect(result.events).toEqual([]);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should handle serverless mode without runtime function', async () => {
    const hasuraEvent = createMockHasuraEvent();

    const options: ListenToOptions = {
      autoLoadEventModules: false,
      listenedEvents: [],
      context: { custom: 'data' },
      timeoutConfig: {
        enabled: true,
        serverlessMode: true,
        maxExecutionTime: 10000, // Will use fallback timer
      },
    };

    const result = await listenTo(hasuraEvent, options);

    expect(result).toBeDefined();
    expect(hasuraEvent.__context).toEqual({ custom: 'data' });
  });
});