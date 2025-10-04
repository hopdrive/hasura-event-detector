import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Update Inventory Count
 *
 * Purpose: Updates inventory counts for ordered items
 * Action-Oriented: "update" is the action, "inventory count" is what
 * Single-Purpose: ONLY updates inventory, doesn't check availability or reorder
 */

export const updateInventoryCount: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[updateInventoryCount] Updating inventory for order:', orderData.id);

  // Simulate inventory update
  await new Promise(resolve => setTimeout(resolve, 250));

  // In production: Update inventory table
  // await db.query(`
  //   UPDATE inventory
  //   SET quantity = quantity - $1
  //   WHERE product_id = $2
  // `, [orderData.quantity, orderData.product_id]);

  return {
    success: true,
    orderId: orderData.id,
    itemsUpdated: orderData.items?.length || 1,
  };
};
