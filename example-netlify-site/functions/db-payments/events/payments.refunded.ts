import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendRefundConfirmationEmail } from '../jobs/send-refund-confirmation-email';
import { reverseAccountingEntry } from '../jobs/reverse-accounting-entry';
import { updateRefundStatus } from '../jobs/update-refund-status';

/**
 * Event: payments.refunded
 *
 * Table: payments (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'refunded'
 *
 * Detects when a payment status changes to 'refunded'
 * Triggers refund processing workflow
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

      const wasNotRefunded = oldData?.status !== 'refunded';
      const isNowRefunded = newData?.status === 'refunded';

      // Reads like a sentence: "payments table AND was not refunded AND is now refunded"
      return isPaymentsTable && wasNotRefunded && isNowRefunded;

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
    job(sendRefundConfirmationEmail),
    job(reverseAccountingEntry),
    job(updateRefundStatus),
  ];

  return await run(eventName, hasuraEvent, jobs);
};
