import { Handler } from '@netlify/functions';
import { listenTo } from '@hopdrive/hasura-event-detector';
import type { HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * DATABASE Event Handler - Payments Table (Background Function)
 *
 * Type: Background Function (async, returns 202)
 * Database Table: payments (plural)
 * Handles: INSERT, UPDATE, DELETE, MANUAL operations
 * Max Execution: 15 minutes
 * Observability: ENABLED (full tracking for payment audit trail)
 *
 * This example shows:
 * - Plural table naming convention (db-payments, not db-payment-processed)
 * - Single entry point handles ALL operations on the table
 * - Multiple event files with dot notation (payments.completed, payments.refunded, etc.)
 * - Background processing with observability
 * - Multiple single-purpose, action-oriented jobs for payment workflow
 * - Full audit trail for compliance
 */

export const handler: Handler = async (event, context) => {
  console.log('[db-payments] Function invoked');

  let hasuraEvent: HasuraEventPayload;
  try {
    hasuraEvent = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  if (!hasuraEvent.event || !hasuraEvent.table) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Not a valid Hasura event' }),
    };
  }

  try {
    const result = await listenTo(hasuraEvent, {
      eventModulesDirectory: './events',
      autoLoadEventModules: true,
      context: {
        functionName: 'db-payments',
        isBackground: true,
      },
      // Enable observability for payment audit trail
      observability: {
        enabled: process.env.OBSERVABILITY_ENABLED === 'true',
        transport: process.env.DATABASE_URL ? 'sql' : 'graphql',
        sql: {
          connectionString: process.env.DATABASE_URL,
        },
        graphql: {
          endpoint: process.env.HASURA_GRAPHQL_ENDPOINT,
          adminSecret: process.env.HASURA_ADMIN_SECRET,
        },
        captureEventPayloads: true,
        captureJobResults: true,
        captureErrorStacks: true, // Important for payment debugging
      },
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: context.getRemainingTimeInMillis,
        safetyMargin: 2000,
        maxExecutionTime: 14 * 60 * 1000,
        serverlessMode: true,
      },
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
    console.error('[db-payments] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Event processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
