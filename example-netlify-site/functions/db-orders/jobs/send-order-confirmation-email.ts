import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Send Order Confirmation Email
 *
 * Purpose: Sends ONE confirmation email to the customer
 * Action-Oriented: "send" is the action, "order confirmation email" is what
 * Single-Purpose: ONLY sends email, nothing else
 */

export const sendOrderConfirmationEmail: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[sendOrderConfirmationEmail] Sending email to:', orderData.user_email);

  // Simulate email service API call
  await new Promise(resolve => setTimeout(resolve, 300));

  // In production: Call SendGrid, SES, etc.
  // await emailService.send({
  //   to: orderData.user_email,
  //   template: 'order-confirmation',
  //   data: { orderId: orderData.id, total: orderData.total }
  // });

  return {
    success: true,
    emailSent: true,
    recipient: orderData.user_email,
    orderId: orderData.id,
  };
};
