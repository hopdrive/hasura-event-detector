import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Notify Warehouse Team
 *
 * Purpose: Sends notification to warehouse team about new order
 * Action-Oriented: "notify" is the action, "warehouse team" is who
 * Single-Purpose: ONLY notifies warehouse, doesn't create tasks or update status
 */

export const notifyWarehouseTeam: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[notifyWarehouseTeam] Notifying warehouse about order:', orderData.id);

  // Simulate notification service
  await new Promise(resolve => setTimeout(resolve, 150));

  // In production: Send to Slack, Teams, or internal notification system
  // await slack.postMessage({
  //   channel: '#warehouse',
  //   text: `New order ${orderData.id} ready for fulfillment`
  // });

  return {
    success: true,
    notificationSent: true,
    orderId: orderData.id,
    channel: 'warehouse',
  };
};
