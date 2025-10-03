/**
 * Example demonstrating timeout handling in serverless environments
 *
 * This example shows how to configure and use timeout protection
 * to prevent Lambda/Netlify function timeouts.
 */

import { listenTo } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import type {
  HasuraEventPayload,
  ListenToOptions,
  EventModule,
  JobOptions,
} from '@hopdrive/hasura-event-detector';

// Example 1: Basic timeout configuration
async function basicTimeoutExample(hasuraEvent: HasuraEventPayload) {
  const options: ListenToOptions = {
    autoLoadEventModules: true,
    eventModulesDirectory: './events',

    // Enable timeout protection for serverless
    timeoutConfig: {
      enabled: true,
      getRemainingTimeInMillis: () => {
        // In real Lambda/Netlify, this would be from context
        // For example: return context.getRemainingTimeInMillis()
        return 8000; // Simulate 8 seconds remaining
      },
      safetyMargin: 2000, // Stop 2 seconds before timeout
      maxExecutionTime: 10000, // Fallback when no runtime context
      serverlessMode: true, // Optimize for serverless
      maxJobExecutionTime: 3000, // Max 3 seconds per job
    },

    // User-provided context (your custom data, not runtime functions)
    context: {
      userId: 'user-123',
      environment: 'production',
      // Any other custom data you want to pass to event handlers
    },
  };

  const result = await listenTo(hasuraEvent, options);

  if (result.timedOut) {
    console.log('⚠️ Processing was interrupted due to timeout');
    console.log('Partial results:', result);
  } else {
    console.log('✅ Processing completed successfully');
  }

  return result;
}

// Example 2: Job with timeout awareness
const timeoutAwareJob = job(
  async (event, hasuraEvent, options?: JobOptions) => {
    const abortSignal = options?.abortSignal;

    // Check if we should abort before starting expensive operation
    if (abortSignal?.aborted) {
      console.log('Job aborted before start');
      return { aborted: true };
    }

    try {
      // Simulate work that can be interrupted
      await performInterruptibleWork(abortSignal);
      return { success: true };
    } catch (error) {
      if (abortSignal?.aborted) {
        console.log('Job aborted during execution');
        return { aborted: true };
      }
      throw error;
    }
  },
  { timeout: 2000 } // Individual job timeout
);

async function performInterruptibleWork(signal?: AbortSignal): Promise<void> {
  const chunks = 10;
  for (let i = 0; i < chunks; i++) {
    // Check abort signal between chunks
    if (signal?.aborted) {
      throw new Error('Work interrupted by abort signal');
    }

    // Simulate chunk of work
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`Completed chunk ${i + 1}/${chunks}`);
  }
}

// Example 3: Event module with timeout handling
const timeoutAwareEventModule: EventModule = {
  // Detector should be fast to avoid timeout during detection
  detector: async (event, hasuraEvent) => {
    // Quick detection logic
    const data = hasuraEvent.event?.data;
    return data?.new?.status === 'active';
  },

  // Handler with timeout-aware jobs
  handler: async (event, hasuraEvent) => {
    // Access user context data if needed
    const userContext = hasuraEvent.__context;
    console.log('User context:', userContext);

    // Note: Runtime timeout checking is handled internally
    // Jobs will automatically receive abort signals if timeout approaches

    // Run jobs with timeout protection
    return run(event, hasuraEvent, [
      timeoutAwareJob,
      job(async () => {
        // Quick job that won't timeout
        return { processed: true };
      }),
    ]);
  },
};

// Example 4: Netlify function with timeout handling
export async function netlifyHandler(event: any, context: any) {
  try {
    const hasuraEvent = JSON.parse(event.body);

    // Configure with Netlify context - proper separation
    const options: ListenToOptions = {
      autoLoadEventModules: true,
      eventModulesDirectory: './events',

      // User context data (metadata about the invocation)
      context: {
        functionName: context.functionName,
        requestId: context.awsRequestId,
        // Any other custom data, but NOT runtime functions
      },

      // Runtime timeout configuration
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: context.getRemainingTimeInMillis, // Runtime function
        safetyMargin: 2000, // Stop 2 seconds before Netlify timeout
        maxExecutionTime: 10000, // Fallback for Netlify 10-second limit
        serverlessMode: true,
        maxJobExecutionTime: 3000,
      },
    };

    const result = await listenTo(hasuraEvent, options);

    // Return result even if timed out (with partial data)
    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (error as Error).message }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
}

// Example 5: Custom timeout handling with retries
async function customTimeoutHandling(hasuraEvent: HasuraEventPayload) {
  let remainingTime = 10000; // Start with 10 seconds
  const startTime = Date.now();

  const options: ListenToOptions = {
    autoLoadEventModules: false,
    listenedEvents: ['user-activation', 'order-created'],

    // User context can contain any custom data
    context: {
      retryAttempt: 1,
      source: 'custom-handler',
    },

    timeoutConfig: {
      enabled: true,
      // Dynamic remaining time calculation
      getRemainingTimeInMillis: () => {
        const elapsed = Date.now() - startTime;
        return Math.max(0, remainingTime - elapsed);
      },
      safetyMargin: 1500, // More aggressive margin
      serverlessMode: true,
    },
  };

  // First attempt
  let result = await listenTo(hasuraEvent, options);

  // If timed out, save partial results and prepare for retry
  if (result.timedOut) {
    console.log('First attempt timed out, saving partial results');

    // In a real scenario, you might:
    // 1. Save partial results to a database
    // 2. Queue unprocessed events for retry
    // 3. Send a response indicating partial completion

    return {
      ...result,
      message: 'Partial processing completed, queued for retry',
    };
  }

  return result;
}

// Export for use in other modules
export {
  basicTimeoutExample,
  timeoutAwareJob,
  timeoutAwareEventModule,
  customTimeoutHandling,
};