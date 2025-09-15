/**
 * Example usage of TrackingToken for job authors
 *
 * This demonstrates how to use TrackingToken to track execution lineage
 * through database mutations and across job chains.
 */

import { TrackingToken } from './tracking-token';
import type { JobFunction, EventName, HasuraEventPayload } from '../types';

/**
 * Example job that demonstrates TrackingToken usage
 */
export const exampleDatabaseUpdateJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const correlationId = hasuraEvent.__correlationId || 'default-correlation-id';
  const jobName = options?.jobName || 'example-job';

  // Create a tracking token for this job execution
  const trackingToken = TrackingToken.create(
    'job-system',      // Source identifier
    correlationId,     // Correlation ID from the event
    jobName           // This specific job's identifier
  );

  // Example: Update a database record with the tracking token
  // The updated_by column serves as the transport mechanism
  const updateQuery = {
    query: `
      UPDATE my_table
      SET
        status = 'processed',
        updated_by = $1,
        updated_at = NOW()
      WHERE id = $2
    `,
    values: [trackingToken, hasuraEvent.event.data.new?.id]
  };

  // Execute the update (pseudo-code)
  // await db.query(updateQuery);

  console.log('Created tracking token:', trackingToken);
  // Output: "job-system.550e8400-e29b-41d4-a716-446655440000.example-job"

  return {
    success: true,
    trackingToken
  };
};

/**
 * Example job that reads and continues a tracking chain
 */
export const chainedJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  // Extract tracking information from a previous job's update
  const previousToken = hasuraEvent.event.data.new?.updated_by;

  if (previousToken && TrackingToken.isValid(previousToken)) {
    // Parse the previous token to understand the chain
    const components = TrackingToken.parse(previousToken);
    console.log('Previous execution chain:', {
      source: components?.source,
      correlationId: components?.correlationId,
      previousJob: components?.jobId
    });

    // Create a new token for this job, maintaining the correlation
    const newToken = TrackingToken.withJobId(
      previousToken,
      options?.jobName || 'chained-job'
    );

    // Or create with a different source but same correlation
    const apiToken = TrackingToken.withSource(
      previousToken,
      'api-handler'
    );

    return {
      success: true,
      previousToken,
      newToken,
      apiToken
    };
  }

  // Fallback if no valid tracking token found
  const freshToken = TrackingToken.create(
    'chained-job',
    hasuraEvent.__correlationId || 'new-correlation',
    options?.jobName
  );

  return {
    success: true,
    trackingToken: freshToken
  };
};

/**
 * Example: Using TrackingToken in a webhook notification
 */
export const webhookWithTracking: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const trackingToken = TrackingToken.create(
    'webhook',
    hasuraEvent.__correlationId!,
    'webhook-notification'
  );

  // Include tracking token in webhook headers for distributed tracing
  const webhookPayload = {
    url: 'https://api.example.com/webhook',
    headers: {
      'X-Tracking-Token': trackingToken,
      'X-Correlation-Id': TrackingToken.getCorrelationId(trackingToken),
      'X-Source-System': TrackingToken.getSource(trackingToken)
    },
    body: {
      event: event,
      data: hasuraEvent.event.data.new,
      tracking: {
        token: trackingToken,
        correlationId: hasuraEvent.__correlationId,
        timestamp: new Date().toISOString()
      }
    }
  };

  // Send webhook (pseudo-code)
  // await fetch(webhookPayload.url, {
  //   method: 'POST',
  //   headers: webhookPayload.headers,
  //   body: JSON.stringify(webhookPayload.body)
  // });

  return {
    success: true,
    trackingToken,
    webhookSent: true
  };
};