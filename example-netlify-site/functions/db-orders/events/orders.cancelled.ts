import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendCancellationNotificationEmail } from '../jobs/send-cancellation-notification-email';
import { restoreInventoryCount } from '../jobs/restore-inventory-count';
import { processRefundTransaction } from '../jobs/process-refund-transaction';

/**
 * Event: orders.cancelled
 *
 * Table: orders (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'cancelled'
 *
 * DETECTOR: Determines if this event matches (separation of concerns)
 * - Only checks if event matches criteria
 * - No business logic
 * - Returns boolean
 *
 * HANDLER: Orchestrates which jobs to run (separation of concerns)
 * - Maps event to appropriate jobs
 * - Each job is single-purpose and action-oriented
 * - No direct business logic execution
 */

/**
 * Detector: Check if order status changed to 'cancelled'
 *
 * Best Practice: Use descriptive variables for conditions so the return
 * statement reads like a sentence describing the event detection criteria.
 */
export const detector: DetectorFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  // ONLY detection logic - no business logic
  const isOrdersTable = hasuraEvent.table?.name === 'orders';
  const operation = hasuraEvent.event?.op;

  switch (operation) {
    case 'INSERT':
      return false; // INSERTs handled by orders.created

    case 'UPDATE':
      const oldData = hasuraEvent.event.data.old;
      const newData = hasuraEvent.event.data.new;

      const statusChanged = oldData?.status !== newData?.status;
      const isNowCancelled = newData?.status === 'cancelled';

      // Reads like a sentence: "orders table AND status changed AND is now cancelled"
      return isOrdersTable && statusChanged && isNowCancelled;

    case 'DELETE':
      return false; // Deletes not handled

    case 'MANUAL':
      return false; // Manual triggers not handled

    default:
      return false;
  }
};

/**
 * Handler: Orchestrate jobs for order cancellation
 */
export const handler: HandlerFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  // Map event to single-purpose, action-oriented jobs
  const jobs = [
    job(sendCancellationNotificationEmail),
    job(restoreInventoryCount),
    job(processRefundTransaction),
  ];

  // Execute all jobs
  return await run(eventName, hasuraEvent, jobs);
};
