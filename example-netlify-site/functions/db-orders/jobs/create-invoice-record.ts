import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Create Invoice Record
 *
 * Purpose: Creates ONE invoice record in the database
 * Action-Oriented: "create" is the action, "invoice record" is what
 * Single-Purpose: ONLY creates invoice, doesn't send it or process payment
 */

export const createInvoiceRecord: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const orderData = hasuraEvent.event.data.new;

  console.log('[createInvoiceRecord] Creating invoice for order:', orderData.id);

  // Simulate database insert
  await new Promise(resolve => setTimeout(resolve, 200));

  // In production: Insert into invoices table
  // await db.query(`
  //   INSERT INTO invoices (order_id, amount, status, created_at)
  //   VALUES ($1, $2, $3, NOW())
  // `, [orderData.id, orderData.total, 'pending']);

  const invoiceId = `inv_${Date.now()}`;

  return {
    success: true,
    invoiceId,
    orderId: orderData.id,
    amount: orderData.total,
  };
};
