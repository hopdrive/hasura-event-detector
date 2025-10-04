import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendPaymentReceipt } from '../jobs/send-payment-receipt';
import { updateOrderStatus } from '../jobs/update-order-status';
import { recordAccountingEntry } from '../jobs/record-accounting-entry';
import { notifyFulfillmentTeam } from '../jobs/notify-fulfillment-team';

/**
 * Event: payments.completed
 *
 * Table: payments (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'completed'
 *
 * Detects when a payment status changes to 'completed'
 * Triggers payment confirmation workflow
 */

export const detector: DetectorFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  const isPaymentsTable = hasuraEvent.table?.name === 'payments';
  const operation = hasuraEvent.event?.op;

  switch (operation) {
    case 'INSERT':
      return false; // New payment creation not handled by this event

    case 'UPDATE':
      const oldData = hasuraEvent.event.data.old;
      const newData = hasuraEvent.event.data.new;

      const wasNotCompleted = oldData?.status !== 'completed';
      const isNowCompleted = newData?.status === 'completed';

      // Reads like a sentence: "payments table AND was not completed AND is now completed"
      return isPaymentsTable && wasNotCompleted && isNowCompleted;

    case 'DELETE':
      return false; // Deletes not handled

    case 'MANUAL':
      return false; // Manual triggers not handled

    default:
      return false;
  }
};

export const handler: HandlerFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  const jobs = [
    job(sendPaymentReceipt),
    job(updateOrderStatus),
    job(recordAccountingEntry),
    job(notifyFulfillmentTeam),
  ];

  return await run(eventName, hasuraEvent, jobs);
};
