import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendShippingNotificationEmail } from '../jobs/send-shipping-notification-email';
import { updateOrderTrackingInfo } from '../jobs/update-order-tracking-info';
import { notifyCustomerSupportTeam } from '../jobs/notify-customer-support-team';

/**
 * Event: orders.shipped
 *
 * Table: orders (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'shipped'
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
 * Detector: Check if order status changed to 'shipped'
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
      const isNowShipped = newData?.status === 'shipped';

      // Reads like a sentence: "orders table AND status changed AND is now shipped"
      return isOrdersTable && statusChanged && isNowShipped;

    case 'DELETE':
      return false; // Deletes not handled

    case 'MANUAL':
      return false; // Manual triggers not handled

    default:
      return false;
  }
};

/**
 * Handler: Orchestrate jobs for order shipment
 */
export const handler: HandlerFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  // Map event to single-purpose, action-oriented jobs
  const jobs = [
    job(sendShippingNotificationEmail),
    job(updateOrderTrackingInfo),
    job(notifyCustomerSupportTeam),
  ];

  // Execute all jobs
  return await run(eventName, hasuraEvent, jobs);
};
