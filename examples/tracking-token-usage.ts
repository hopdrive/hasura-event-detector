/**
 * TrackingToken Usage Examples
 *
 * This demonstrates the recommended patterns for using TrackingToken in your jobs
 * to track execution lineage through database mutations and across job chains.
 */

import { TrackingToken, parseHasuraEvent } from '@hopdrive/hasura-event-detector';
import type { JobFunction, EventName, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

// =============================================================================
// RECOMMENDED PATTERN: Use TrackingToken.forJob()
// =============================================================================

/**
 * Example 1: Simple job using forJob() - RECOMMENDED
 *
 * This is the easiest and most common pattern. The forJob() helper automatically:
 * - Reuses existing tracking tokens from previous updates (via options.sourceTrackingToken)
 * - Creates new tokens for new records
 * - Includes the current job execution ID for observability tracking
 */
export const simpleJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);

  // ONE-LINER: Get tracking token (reuses existing or creates new)
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || role || 'system' // Fallback source for new records
  );

  // Use in your database update
  // await db.query(`
  //   UPDATE records
  //   SET status = 'processed',
  //       updated_by = $1
  //   WHERE id = $2
  // `, [trackingToken, recordId]);

  return { success: true, trackingToken };
};

/**
 * Example 2: Job with meaningful source context
 *
 * Use descriptive sources that make it clear what initiated the change.
 * This helps when tracking through the observability database.
 */
export const orderProcessingJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);
  const orderId = hasuraEvent.event.data.new?.id;

  // Use specific service/job name as fallback for new records
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || role || 'order-processor'  // Descriptive fallback
  );

  // await db.query(`
  //   UPDATE orders
  //   SET status = 'processing',
  //       updated_by = $1,
  //       updated_at = NOW()
  //   WHERE id = $2
  // `, [trackingToken, orderId]);

  return {
    success: true,
    orderId,
    trackingToken
  };
};

/**
 * Example 3: Job that creates a new record
 *
 * When creating new records, there's no previous token to reuse.
 * forJob() will create a new token using your fallback source.
 */
export const createRecordJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);

  // For new records, the fallback source will be used
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || 'api-handler'
  );

  // await db.query(`
  //   INSERT INTO shipments (order_id, status, updated_by)
  //   VALUES ($1, $2, $3)
  // `, [orderId, 'pending', trackingToken]);

  return { success: true, trackingToken };
};

/**
 * Example 4: Job that updates an existing record
 *
 * When updating records that already have an updated_by value,
 * the TrackingTokenExtractionPlugin extracts it and passes it via options.sourceTrackingToken.
 * forJob() reuses the source and correlationId, only updating the jobExecutionId.
 */
export const updateRecordJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const recordId = hasuraEvent.event.data.new?.id;

  // If record was previously updated, options.sourceTrackingToken will exist
  // forJob() reuses it automatically - fallback won't be used
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    'fallback-unused'  // Only used if no previous token exists
  );

  // await db.query(`
  //   UPDATE shipments
  //   SET status = 'shipped',
  //       updated_by = $1,
  //       updated_at = NOW()
  //   WHERE id = $2
  // `, [trackingToken, recordId]);

  return { success: true, trackingToken };
};

/**
 * Example 5: Job with user email as source
 *
 * For user-initiated actions, use the user's email or ID as the source.
 * This creates a clear audit trail in the updated_by column.
 */
export const userInitiatedJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);
  const userEmail = user || hasuraEvent.event.session_variables?.['x-hasura-user-email'];

  // Use user email as the primary source for audit trail
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    userEmail || role || 'unknown-user'
  );

  // await db.query(`
  //   UPDATE orders
  //   SET cancelled = true,
  //       cancelled_reason = $1,
  //       updated_by = $2
  //   WHERE id = $3
  // `, ['User cancellation', trackingToken, orderId]);

  return { success: true, trackingToken };
};

// =============================================================================
// ADVANCED PATTERNS: Direct token manipulation
// =============================================================================

/**
 * Example 6: Advanced - Manual token creation
 *
 * Most jobs should use forJob(), but you can create tokens manually
 * for special cases where you need full control.
 */
export const advancedManualTokenJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const correlationId = hasuraEvent.__correlationId;
  const jobExecutionId = options?.jobExecutionId;

  // Manual token creation - only use if forJob() doesn't fit your needs
  const trackingToken = TrackingToken.create(
    'custom-source',
    correlationId,
    jobExecutionId
  );

  return { success: true, trackingToken };
};

/**
 * Example 7: Advanced - Token parsing and inspection
 *
 * Parse existing tracking tokens to extract information
 */
export const inspectTokenJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const updatedBy = hasuraEvent.event.data.old?.updated_by;

  if (updatedBy && TrackingToken.isValid(updatedBy)) {
    // Parse the full token
    const components = TrackingToken.parse(updatedBy);
    console.log({
      source: components.source,
      correlationId: components.correlationId,
      jobExecutionId: components.jobExecutionId
    });

    // Or extract specific components
    const correlationId = TrackingToken.getCorrelationId(updatedBy);
    const source = TrackingToken.getSource(updatedBy);
    const jobId = TrackingToken.getJobExecutionId(updatedBy);

    console.log({ correlationId, source, jobId });
  }

  // Still use forJob() for creating the new token
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    'inspector-job'
  );

  return { success: true, trackingToken };
};

/**
 * Example 8: Advanced - Conditional token usage
 *
 * Check if a previous token exists and handle accordingly
 */
export const conditionalTokenJob: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user } = parseHasuraEvent(hasuraEvent);
  const sourceTrackingToken = options?.sourceTrackingToken;

  // Check if this is continuing an existing chain or starting a new one
  const isNewChain = !sourceTrackingToken || !TrackingToken.isValid(sourceTrackingToken);

  if (isNewChain) {
    console.log('Starting new tracking chain');
  } else {
    const previousSource = TrackingToken.getSource(sourceTrackingToken);
    console.log(`Continuing chain from: ${previousSource}`);
  }

  // forJob() handles both cases automatically
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || 'system'
  );

  return { success: true, trackingToken, isNewChain };
};

// =============================================================================
// ANTI-PATTERNS: Don't do these
// =============================================================================

/**
 * ❌ ANTI-PATTERN: Manual token reuse logic
 *
 * Don't write this code - use forJob() instead!
 */
export const manualTokenReuseAntiPattern: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);

  // ❌ BAD: Too much boilerplate
  const sourceTrackingToken = options?.sourceTrackingToken;
  const jobExecutionId = options?.jobExecutionId;
  let trackingToken;

  if (sourceTrackingToken && TrackingToken.isValid(sourceTrackingToken)) {
    // Reuse existing token
    trackingToken = TrackingToken.withJobExecutionId(
      sourceTrackingToken,
      jobExecutionId || 'unknown'
    );
  } else {
    // Create new token
    const correlationId = hasuraEvent.__correlationId;
    trackingToken = TrackingToken.create(
      user || role || 'system',
      correlationId,
      jobExecutionId
    );
  }

  // ✅ GOOD: Replace all the above with one line:
  // const trackingToken = TrackingToken.forJob(hasuraEvent, options, user || role || 'system');

  return { success: true, trackingToken };
};

/**
 * ❌ ANTI-PATTERN: Not using tracking tokens at all
 *
 * Always use tracking tokens in updated_by columns for observability
 */
export const noTrackingAntiPattern: JobFunction = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const recordId = hasuraEvent.event.data.new?.id;

  // ❌ BAD: No tracking token
  // await db.query(`
  //   UPDATE records SET status = 'processed' WHERE id = $1
  // `, [recordId]);

  // ✅ GOOD: Always include tracking token
  const trackingToken = TrackingToken.forJob(hasuraEvent, options, 'system');
  // await db.query(`
  //   UPDATE records
  //   SET status = 'processed',
  //       updated_by = $1,
  //       updated_at = NOW()
  //   WHERE id = $2
  // `, [trackingToken, recordId]);

  return { success: true, trackingToken };
};

// =============================================================================
// SUMMARY
// =============================================================================

/**
 * Quick Reference:
 *
 * 1. ALWAYS use TrackingToken.forJob() for job implementations
 *    const token = TrackingToken.forJob(hasuraEvent, options, fallbackSource);
 *
 * 2. Choose meaningful fallback sources:
 *    - user || role || 'system'           // User actions
 *    - 'api-handler'                      // API-initiated
 *    - 'payment-processor'                // Specific service
 *    - user || 'order-processor'          // Hybrid
 *
 * 3. Always update updated_by and updated_at columns:
 *    SET status = $1, updated_by = $2, updated_at = NOW()
 *
 * 4. Enable required plugins:
 *    - TrackingTokenExtractionPlugin: Extracts previous tokens
 *    - ObservabilityPlugin: Provides jobExecutionId
 *
 * 5. Only use manual methods (create, parse, etc.) for special cases
 *    where forJob() doesn't meet your needs
 */
