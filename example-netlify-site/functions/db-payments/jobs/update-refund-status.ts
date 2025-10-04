import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Update Refund Status
 *
 * Purpose: Updates refund status in external payment processor
 * Action-Oriented: "update" is the action, "refund status" is what
 * Single-Purpose: ONLY updates status, doesn't send emails or reverse accounting
 */

export const updateRefundStatus: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const paymentData = hasuraEvent.event.data.new;

  console.log('[updateRefundStatus] Updating status for payment:', paymentData.id);

  // Simulate payment processor API
  await new Promise(resolve => setTimeout(resolve, 250));

  // In production: Update payment processor
  // await paymentProcessor.updateRefundStatus({
  //   paymentId: paymentData.id,
  //   refundId: paymentData.refund_id,
  //   status: 'completed',
  //   processedAt: new Date().toISOString(),
  // });

  return {
    success: true,
    paymentId: paymentData.id,
    refundId: paymentData.refund_id,
    statusUpdated: true,
  };
};
