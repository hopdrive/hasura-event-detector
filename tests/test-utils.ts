/**
 * Test Utilities
 * 
 * Helper functions for creating test data and mocking dependencies.
 */

import type { 
  HasuraEventPayload, 
  HasuraOperation, 
  EventName,
  JobOptions,
  JobResult,
  ListenToOptions 
} from '../src/types/index';

/**
 * Create a mock Hasura event payload
 */
export function createMockHasuraEvent(overrides: Partial<{
  operation: HasuraOperation;
  tableName: string;
  schema: string;
  old: Record<string, any>;
  new: Record<string, any>;
  sessionVariables: Record<string, string>;
  eventId: string;
  createdAt: string;
}> = {}): HasuraEventPayload {
  const {
    operation = 'UPDATE',
    tableName = 'users',
    schema = 'public',
    old = { id: 1, status: 'inactive' },
    new: newRecord = { id: 1, status: 'active' },
    sessionVariables = {
      'x-hasura-role': 'user',
      'x-hasura-user-id': '123',
      'x-hasura-user-email': 'test@example.com'
    },
    eventId = `evt_${Date.now()}`,
    createdAt = new Date().toISOString()
  } = overrides;

  return {
    id: eventId,
    created_at: createdAt,
    table: {
      name: tableName,
      schema: schema
    },
    delivery_info: {
      max_retries: 0,
      current_retry: 0
    },
    trigger: {
      name: `${tableName}_event_trigger`
    },
    event: {
      op: operation,
      data: {
        ...(operation !== 'INSERT' && { old }),
        ...(operation !== 'DELETE' && { new: newRecord })
      },
      session_variables: sessionVariables,
      trace_context: {
        trace_id: `trace_${Date.now()}`,
        span_id: `span_${Date.now()}`
      }
    }
  };
}

/**
 * Create a mock job result
 */
export function createMockJobResult(overrides: Partial<JobResult> = {}): JobResult {
  return {
    name: 'testJob' as any,
    duration: 100,
    result: { action: 'completed' },
    completed: true,
    startTime: new Date(),
    endTime: new Date(),
    ...overrides
  };
}

/**
 * Create test job options
 */
export function createTestJobOptions(overrides: Partial<JobOptions> = {}): JobOptions {
  return {
    timeout: 5000,
    retries: 2,
    correlationId: `test.${Date.now()}` as any,
    ...overrides
  };
}

/**
 * Create test configuration
 */
export function createTestConfig(overrides: Partial<ListenToOptions> = {}): Partial<ListenToOptions> {
  return {
    autoLoadEventModules: false, // Don't auto-load in tests
    eventModulesDirectory: './tests/fixtures/events',
    sourceFunction: 'test',
    listenedEvents: [],
    ...overrides
  };
}

/**
 * Mock async job function
 */
export function createMockJob(
  result: any = { action: 'test_completed' },
  delay: number = 0,
  shouldFail: boolean = false
) {
  return async (event: EventName, hasuraEvent: HasuraEventPayload, options?: JobOptions) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (shouldFail) {
      throw new Error('Mock job failed');
    }
    
    return result;
  };
}

/**
 * Mock detector function
 */
export function createMockDetector(shouldDetect: boolean = true) {
  return async (event: EventName, hasuraEvent: HasuraEventPayload): Promise<boolean> => {
    return shouldDetect;
  };
}

/**
 * Mock handler function
 */
export function createMockHandler(jobResults: JobResult[] = []) {
  return async (event: EventName, hasuraEvent: HasuraEventPayload): Promise<JobResult[]> => {
    return jobResults;
  };
}

/**
 * Create a temporary directory for test files
 */
export async function createTempDir(): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const tempDir = path.join(os.tmpdir(), `hasura-event-detector-test-${Date.now()}`);
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  return tempDir;
}

/**
 * Clean up temporary directory
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  const fs = await import('fs');
  
  try {
    await fs.promises.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors in tests
  }
}

/**
 * Create a mock event module file
 */
export async function createMockEventModule(
  dirPath: string, 
  eventName: string, 
  detector: boolean = true,
  jobCount: number = 1
): Promise<string> {
  const fs = await import('fs');
  const path = await import('path');
  
  const modulePath = path.join(dirPath, `${eventName}.js`);
  
  const moduleContent = `
const detector = async (event, hasuraEvent) => {
  return ${detector};
};

const handler = async (event, hasuraEvent) => {
  const results = [];
  for (let i = 0; i < ${jobCount}; i++) {
    results.push({
      name: 'mockJob' + i,
      duration: 50,
      result: { action: 'mock_completed', jobIndex: i },
      completed: true,
      startTime: new Date(),
      endTime: new Date()
    });
  }
  return results;
};

module.exports = { detector, handler };
`;

  await fs.promises.writeFile(modulePath, moduleContent);
  return modulePath;
}

/**
 * Wait for a condition to be true (useful for async testing)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Spy on console methods
 */
export function spyOnConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  const logSpy = jest.fn();
  const errorSpy = jest.fn();
  const warnSpy = jest.fn();
  
  console.log = logSpy;
  console.error = errorSpy;
  console.warn = warnSpy;
  
  return {
    log: logSpy,
    error: errorSpy,
    warn: warnSpy,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }
  };
}