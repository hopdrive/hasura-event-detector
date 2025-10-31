import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Update Order Tracking Info
 *
 * Purpose: Updates tracking information in external systems
 * Action-Oriented: "update" is the action, "order tracking info" is what
 * Single-Purpose: ONLY updates tracking data, doesn't send notifications or modify order status
 */

export const updateOrderTrackingInfo: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[updateOrderTrackingInfo] Updating tracking for order:', orderData.id);

  // Simulate external API call
  await new Promise(resolve => setTimeout(resolve, 250));

  // In production: Update external tracking system
  // await trackingAPI.update({
  //   orderId: orderData.id,
  //   trackingNumber: orderData.tracking_number,
  //   carrier: orderData.carrier,
  //   estimatedDelivery: orderData.estimated_delivery_date,
  // });

  return {
    success: true,
    orderId: orderData.id,
    trackingNumber: orderData.tracking_number,
    updatedAt: new Date().toISOString(),
  };
};
