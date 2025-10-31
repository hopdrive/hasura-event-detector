import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Process Refund Transaction
 *
 * Purpose: Processes ONE refund transaction for the cancelled order
 * Action-Oriented: "process" is the action, "refund transaction" is what
 * Single-Purpose: ONLY processes refund, doesn't send emails or restore inventory
 */

export const processRefundTransaction: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[processRefundTransaction] Processing refund for order:', orderData.id);

  // Simulate payment processor API
  await new Promise(resolve => setTimeout(resolve, 300));

  // In production: Call payment processor API
  // const refund = await paymentProcessor.refund({
  //   orderId: orderData.id,
  //   paymentId: orderData.payment_id,
  //   amount: orderData.total,
  //   reason: orderData.cancellation_reason,
  // });

  return {
    success: true,
    orderId: orderData.id,
    refundAmount: orderData.total,
    refundId: `refund_${Date.now()}`,
  };
};
