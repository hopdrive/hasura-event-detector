import { Handler } from '@netlify/functions';
import { listenTo } from '@hopdrive/hasura-event-detector';
import type { HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * DATABASE Event Handler - Users Table (Synchronous Function)
 *
 * Type: Synchronous Function
 * Database Table: users (plural)
 * Handles: INSERT, UPDATE, DELETE, MANUAL operations
 * Max Execution: 10-26 seconds
 * Observability: DISABLED (lightweight, simple logging)
 *
 * This example shows:
 * - Plural table naming convention (db-users, not db-user-activated)
 * - Single entry point handles ALL operations on the table
 * - Multiple event files with dot notation (users.activated, users.deactivated, etc.)
 * - Sync processing without observability overhead
 * - Action-oriented job naming
 * - Clean separation of detection and execution
 */

export const handler: Handler = async (event, context) => {
  console.log('[db-users] Function invoked');

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
        functionName: 'db-users',
      },
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: context.getRemainingTimeInMillis,
        safetyMargin: 1000,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        detected: result.events.filter(e => e.detected).length,
        events: result.events.map(e => ({
          name: e.name,
          detected: e.detected,
          jobs: e.jobs?.map(j => ({
            name: j.name,
            completed: j.completed,
            durationMs: j.durationMs,
          })),
        })),
        durationMs: result.durationMs,
      }),
    };
  } catch (error) {
    console.error('[db-users] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Event processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
