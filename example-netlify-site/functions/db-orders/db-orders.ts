import { Handler } from '@netlify/functions';
import { listenTo } from '@hopdrive/hasura-event-detector';
import type { HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * DATABASE Event Handler - Orders Table (Background Function)
 *
 * Type: Background Function (async, returns 202 immediately)
 * Database Table: orders (plural)
 * Handles: INSERT, UPDATE, DELETE, MANUAL operations
 * Max Execution: 15 minutes
 * Observability: DISABLED (simple logging only)
 *
 * This example shows:
 * - Plural table naming convention (db-orders, not db-order-created)
 * - Single entry point handles ALL operations on the table
 * - Multiple event files with dot notation (orders.created, orders.shipped, etc.)
 * - Background function pattern for long-running tasks
 * - Multiple single-purpose, action-oriented jobs
 * - Separation of concerns between detection and execution
 * - WITHOUT observability plugin (minimal overhead)
 */

export const handler: Handler = async (event, context) => {
  console.log('[db-orders] Function invoked');

  // Parse Hasura event
  let hasuraEvent: HasuraEventPayload;
  try {
    hasuraEvent = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  // Validate Hasura event structure
  if (!hasuraEvent.event || !hasuraEvent.table) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Not a valid Hasura event' }),
    };
  }

  console.log('[db-orders] Processing event:', {
    table: hasuraEvent.table.name,
    operation: hasuraEvent.event.op,
    triggerId: hasuraEvent.trigger?.name,
  });

  try {
    // Process event with detector
    // NOTE: observability is NOT configured - runs lightweight
    const result = await listenTo(hasuraEvent, {
      eventModulesDirectory: './events',
      autoLoadEventModules: true,
      context: {
        functionName: 'db-orders',
        isBackground: true,
      },
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: context.getRemainingTimeInMillis,
        safetyMargin: 2000, // 2s safety margin for background
        maxExecutionTime: 14 * 60 * 1000, // 14 minutes max
        serverlessMode: true,
      },
    });

    console.log('[db-orders] Completed:', {
      detected: result.events.filter(e => e.detected).length,
      totalEvents: result.events.length,
      durationMs: result.durationMs,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        detected: result.events.filter(e => e.detected).length,
        durationMs: result.durationMs,
      }),
    };
  } catch (error) {
    console.error('[db-orders] Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Event processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
