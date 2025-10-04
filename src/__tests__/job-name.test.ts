/**
 * Job Name Option Tests
 *
 * Tests that user-provided jobName in options is respected
 */

import { describe, it, expect } from '@jest/globals';
import { run, job } from '../handler';
import { createMockHasuraEvent } from '../../tests/test-utils';
import type { EventName } from '../types';

describe('Job Name Options', () => {
  it('should use jobName from options for anonymous functions', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const eventName = 'test-event' as EventName;

    // Anonymous arrow function
    const anonymousJob = async () => {
      return { success: true };
    };

    const results = await run(eventName, hasuraEvent, [
      job(anonymousJob, { jobName: 'customJobName' as any })
    ]);

    expect(results).toBeDefined();
    expect(results).toHaveLength(1);
    expect(results![0].name).toBe('customJobName');
  });

  it('should use jobName from options over function name', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const eventName = 'test-event' as EventName;

    // Named function
    const namedFunction = async function myFunctionName() {
      return { success: true };
    };

    const results = await run(eventName, hasuraEvent, [
      job(namedFunction, { jobName: 'overriddenName' as any })
    ]);

    expect(results).toBeDefined();
    expect(results).toHaveLength(1);
    expect(results![0].name).toBe('overriddenName');
  });

  it('should fall back to function name when jobName not provided', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const eventName = 'test-event' as EventName;

    // Named function
    const namedFunction = async function myFunctionName() {
      return { success: true };
    };

    const results = await run(eventName, hasuraEvent, [
      job(namedFunction)
    ]);

    expect(results).toBeDefined();
    expect(results).toHaveLength(1);
    expect(results![0].name).toBe('myFunctionName');
  });

  it('should use anonymous for unnamed functions without jobName option', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const eventName = 'test-event' as EventName;

    // Truly anonymous inline arrow function without jobName
    const results = await run(eventName, hasuraEvent, [
      job(async () => {
        return { success: true };
      })
    ]);

    expect(results).toBeDefined();
    expect(results).toHaveLength(1);
    expect(results![0].name).toBe('anonymous');
  });
});
