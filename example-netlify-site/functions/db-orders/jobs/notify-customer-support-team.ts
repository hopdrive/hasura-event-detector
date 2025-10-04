import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Notify Customer Support Team
 *
 * Purpose: Sends notification to customer support about shipment
 * Action-Oriented: "notify" is the action, "customer support team" is who
 * Single-Purpose: ONLY notifies support team, doesn't update records or send customer emails
 */

export const notifyCustomerSupportTeam: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[notifyCustomerSupportTeam] Notifying support about order:', orderData.id);

  // Simulate notification service
  await new Promise(resolve => setTimeout(resolve, 150));

  // In production: Send to Slack, Teams, or internal notification system
  // await slack.postMessage({
  //   channel: '#customer-support',
  //   text: `Order ${orderData.id} has been shipped. Tracking: ${orderData.tracking_number}`
  // });

  return {
    success: true,
    notificationSent: true,
    orderId: orderData.id,
    channel: 'customer-support',
  };
};
