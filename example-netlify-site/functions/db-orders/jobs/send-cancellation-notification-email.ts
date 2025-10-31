import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Send Cancellation Notification Email
 *
 * Purpose: Sends ONE cancellation notification email to the customer
 * Action-Oriented: "send" is the action, "cancellation notification email" is what
 * Single-Purpose: ONLY sends email notification, doesn't process refunds or restore inventory
 */

export const sendCancellationNotificationEmail: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[sendCancellationNotificationEmail] Sending notification for order:', orderData.id);

  // Simulate email service
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production: Send via email service
  // await emailService.send({
  //   to: orderData.customer_email,
  //   template: 'order-cancelled',
  //   data: {
  //     orderId: orderData.id,
  //     reason: orderData.cancellation_reason,
  //     refundAmount: orderData.total,
  //   }
  // });

  return {
    success: true,
    emailSent: true,
    orderId: orderData.id,
    reason: orderData.cancellation_reason,
  };
};
