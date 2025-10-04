import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Reverse Accounting Entry
 *
 * Purpose: Reverses the accounting entry for the refunded payment
 * Action-Oriented: "reverse" is the action, "accounting entry" is what
 * Single-Purpose: ONLY reverses accounting entry, doesn't send emails or update payment status
 */

export const reverseAccountingEntry: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const paymentData = hasuraEvent.event.data.new;

  console.log('[reverseAccountingEntry] Reversing entry for payment:', paymentData.id);

  // Simulate accounting system
  await new Promise(resolve => setTimeout(resolve, 300));

  // In production: Create reversal entry in accounting system
  // await accountingSystem.createEntry({
  //   type: 'reversal',
  //   originalEntryId: paymentData.accounting_entry_id,
  //   amount: -paymentData.amount,
  //   reason: 'refund',
  //   paymentId: paymentData.id,
  // });

  return {
    success: true,
    paymentId: paymentData.id,
    reversalEntryId: `rev_${Date.now()}`,
    amount: paymentData.amount,
  };
};
