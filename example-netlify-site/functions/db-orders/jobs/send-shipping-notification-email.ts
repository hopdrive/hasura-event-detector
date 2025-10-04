import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Send Shipping Notification Email
 *
 * Purpose: Sends ONE shipping notification email to the customer
 * Action-Oriented: "send" is the action, "shipping notification email" is what
 * Single-Purpose: ONLY sends email notification, nothing else
 */

export const sendShippingNotificationEmail: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[sendShippingNotificationEmail] Sending notification for order:', orderData.id);

  // Simulate email service
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production: Send via email service
  // await emailService.send({
  //   to: orderData.customer_email,
  //   template: 'order-shipped',
  //   data: {
  //     orderId: orderData.id,
  //     trackingNumber: orderData.tracking_number,
  //     trackingUrl: orderData.tracking_url,
  //   }
  // });

  return {
    success: true,
    emailSent: true,
    orderId: orderData.id,
    trackingNumber: orderData.tracking_number,
  };
};
