/**
 * Netlify Function Template for Hasura Event Detector
 * 
 * This template shows how to integrate the Hasura Event Detector
 * with Netlify Functions using TypeScript.
 */

import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import { 
  listenTo, 
  handleSuccess, 
  handleFailure,
  type HasuraEventPayload,
  type ListenToOptions 
} from '@hopdrive/hasura-event-detector';

// Configuration for the event detector
const eventDetectorConfig: Partial<ListenToOptions> = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  sourceFunction: 'netlify-function',
  
  // Optional: Enable observability plugin
  observability: {
    enabled: process.env.NODE_ENV === 'production',
    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
    },
    schema: process.env.OBSERVABILITY_SCHEMA || 'event_detector',
    batchSize: 10,
    flushInterval: 5000
  }
};

/**
 * Main Netlify function handler
 */
export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  console.log('🚀 Hasura Event Detector function invoked');
  
  try {
    // Validate HTTP method
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    // Parse request body
    if (!event.body) {
      return handleFailure(new Error('Request body is required'));
    }

    let hasuraEvent: HasuraEventPayload;
    try {
      hasuraEvent = JSON.parse(event.body);
    } catch (parseError) {
      return handleFailure(new Error('Invalid JSON in request body'));
    }

    // Add Netlify context to the event processing
    const netlifyContext = {
      functionName: context.functionName,
      functionVersion: context.functionVersion,
      requestId: context.awsRequestId,
      region: process.env.AWS_REGION,
      environment: process.env.NODE_ENV || 'development'
    };

    console.log('📥 Processing Hasura event:', {
      eventId: hasuraEvent.id,
      operation: hasuraEvent.event?.op,
      table: hasuraEvent.table?.name,
      requestId: context.awsRequestId
    });

    // Process the event using the detector system
    const result = await listenTo(
      hasuraEvent, 
      eventDetectorConfig,
      netlifyContext
    );

    console.log('✅ Event processing completed:', {
      eventsDetected: result.events.length,
      totalJobs: result.events.reduce((sum, e) => sum + e.jobs.length, 0),
      duration: result.duration,
      requestId: context.awsRequestId
    });

    // Return success response
    return handleSuccess(result);

  } catch (error) {
    console.error('❌ Event processing failed:', error);
    
    // Log additional context for debugging
    console.error('Request context:', {
      functionName: context.functionName,
      requestId: context.awsRequestId,
      remainingTimeInMillis: context.getRemainingTimeInMillis?.()
    });

    return handleFailure(error as Error);
  }
};

/**
 * Optional: Health check endpoint
 * 
 * Create a separate function or modify this one to handle health checks
 */
export const healthCheck: Handler = async (event, context) => {
  if (event.httpMethod === 'GET' && event.path?.endsWith('/health')) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || 'unknown',
        environment: process.env.NODE_ENV || 'development'
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
  
  // Delegate to main handler for other requests
  return handler(event, context);
};

// Export the main handler as default
export default handler;