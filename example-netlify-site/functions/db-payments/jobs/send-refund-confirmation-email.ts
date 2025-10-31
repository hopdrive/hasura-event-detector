import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Send Refund Confirmation Email
 *
 * Purpose: Sends ONE refund confirmation email to the customer
 * Action-Oriented: "send" is the action, "refund confirmation email" is what
 * Single-Purpose: ONLY sends email, doesn't process refund or update accounting
 */

export const sendRefundConfirmationEmail: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const paymentData = hasuraEvent.event.data.new;

  console.log('[sendRefundConfirmationEmail] Sending email for payment:', paymentData.id);

  // Simulate email service
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production: Send via email service
  // await emailService.send({
  //   to: paymentData.customer_email,
  //   template: 'refund-confirmation',
  //   data: {
  //     paymentId: paymentData.id,
  //     amount: paymentData.amount,
  //     refundedAt: new Date().toISOString(),
  //   }
  // });

  return {
    success: true,
    emailSent: true,
    paymentId: paymentData.id,
    amount: paymentData.amount,
  };
};
