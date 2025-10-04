import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Send Account Closure Email
 *
 * Purpose: Sends ONE account closure confirmation email to the user
 * Action-Oriented: "send" is the action, "account closure email" is what
 * Single-Purpose: ONLY sends email, doesn't revoke permissions or archive data
 */

export const sendAccountClosureEmail: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const userData = hasuraEvent.event.data.new;

  console.log('[sendAccountClosureEmail] Sending email to user:', userData.id);

  // Simulate email service
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production: Send via email service
  // await emailService.send({
  //   to: userData.email,
  //   template: 'account-closed',
  //   data: {
  //     userId: userData.id,
  //     name: userData.name,
  //   }
  // });

  return {
    success: true,
    emailSent: true,
    userId: userData.id,
  };
};
