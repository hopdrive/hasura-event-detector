import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendOrderConfirmationEmail } from '../jobs/send-order-confirmation-email';
import { createInvoiceRecord } from '../jobs/create-invoice-record';
import { updateInventoryCount } from '../jobs/update-inventory-count';
import { notifyWarehouseTeam } from '../jobs/notify-warehouse-team';

/**
 * Event: orders.created
 *
 * Table: orders (plural naming convention)
 * Operation: INSERT
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
 * Detector: Check if this is a new order creation
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
      const isNewOrder = true; // All INSERTs on orders table are new orders
      return isOrdersTable && isNewOrder;

    case 'UPDATE':
      return false; // Updates are handled by other events (shipped, cancelled)

    case 'DELETE':
      return false; // Deletes not handled

    case 'MANUAL':
      return false; // Manual triggers not handled

    default:
      return false;
  }
};

/**
 * Handler: Orchestrate jobs for order creation
 */
export const handler: HandlerFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  // Map event to single-purpose, action-oriented jobs
  const jobs = [
    // Example with explicit jobName (optional - shown for demonstration)
    job(sendOrderConfirmationEmail, {
      jobName: 'sendOrderConfirmationEmail',
    }),
    // Most jobs can use the simpler syntax without jobName
    job(createInvoiceRecord),
    job(updateInventoryCount),
    job(notifyWarehouseTeam),
  ];

  // Execute all jobs
  return await run(eventName, hasuraEvent, jobs);
};
