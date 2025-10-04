import { Handler } from '@netlify/functions';
import { listenTo } from '@hopdrive/hasura-event-detector';
import type { HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * WEBHOOK Function Example (Synchronous)
 *
 * This is a webhook endpoint that receives POST requests from external services.
 * It CAN use the Hasura Event Detector if the webhook payload is a Hasura event,
 * or it can process any webhook payload directly.
 *
 * Type: Synchronous (waits for completion, returns detailed response)
 * Use Case: External service notifications (Stripe, SendGrid, Twilio, etc.)
 * Max Execution: 10-26 seconds
 *
 * This example shows a webhook that can handle both:
 * 1. Hasura event payloads (use event detector)
 * 2. Custom webhook payloads (process directly)
 */

export const handler: Handler = async (event, context) => {
  console.log('[webhook-order-webhook] Received webhook');

  // Parse payload
  let payload: any;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON payload' }),
    };
  }

  // Check if this is a Hasura event (has event.table structure)
  const isHasuraEvent = payload.event && payload.table;

  if (isHasuraEvent) {
    // Handle as Hasura event using event detector
    return await handleHasuraEvent(payload as HasuraEventPayload, context);
  } else {
    // Handle as generic webhook
    return await handleGenericWebhook(payload, event.headers);
  }
};

/**
 * Handle Hasura events using the event detector
 */
async function handleHasuraEvent(hasuraEvent: HasuraEventPayload, context: any) {
  console.log('[webhook-order-webhook] Processing Hasura event');

  try {
    const result = await listenTo(hasuraEvent, {
      eventModulesDirectory: './events',
      autoLoadEventModules: true,
      context: {
        functionName: 'webhook-order-webhook',
        source: 'hasura',
      },
      timeoutConfig: {
        enabled: true,
        getRemainingTimeInMillis: context.getRemainingTimeInMillis,
        safetyMargin: 1000,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        source: 'hasura',
        detected: result.events.filter(e => e.detected).length,
        events: result.events,
      }),
    };
  } catch (error) {
    console.error('[webhook-order-webhook] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Hasura event processing failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

/**
 * Handle generic webhooks (Stripe, SendGrid, etc.)
 */
async function handleGenericWebhook(payload: any, headers: any) {
  console.log('[webhook-order-webhook] Processing generic webhook:', {
    type: payload.type,
    source: headers['x-webhook-source'],
  });

  // Example: Handle Stripe webhook
  if (headers['stripe-signature']) {
    return handleStripeWebhook(payload);
  }

  // Example: Handle generic webhook
  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      source: 'generic',
      received: true,
      payloadType: payload.type || 'unknown',
    }),
  };
}

/**
 * Handle Stripe webhook (example)
 */
async function handleStripeWebhook(payload: any) {
  console.log('[webhook-order-webhook] Processing Stripe event:', payload.type);

  // In production: Verify Stripe signature, process event
  // await stripe.webhooks.constructEvent(...)

  return {
    statusCode: 200,
    body: JSON.stringify({
      success: true,
      source: 'stripe',
      eventType: payload.type,
      received: true,
    }),
  };
}
