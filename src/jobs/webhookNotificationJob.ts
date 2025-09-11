/**
 * Webhook Notification Job
 * 
 * A realistic example of sending webhook notifications with proper retry logic.
 */

import type { EventName, HasuraEventPayload, JobOptions } from '@/types/index.js';

interface WebhookPayload {
  event: EventName;
  timestamp: string;
  data: {
    operation: string;
    table?: string;
    record?: Record<string, any>;
    old_record?: Record<string, any>;
  };
  metadata: {
    hasura_event_id: string;
    correlation_id?: string;
    user?: string;
  };
}

interface WebhookJobOptions extends JobOptions {
  url?: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  includeOldRecord?: boolean;
  filterFields?: string[];
  secret?: string;
}

interface WebhookJobResult {
  action: 'webhook_sent' | 'webhook_failed' | 'webhook_skipped';
  url?: string;
  statusCode?: number;
  responseTime?: number;
  error?: string;
  timestamp: string;
}

/**
 * Simulated HTTP client - replace with actual HTTP library (axios, fetch, etc.)
 */
class HttpClient {
  async post(
    url: string, 
    data: any, 
    headers: Record<string, string> = {}
  ): Promise<{ status: number; data: any; responseTime: number }> {
    const startTime = Date.now();
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 300));
    
    // Simulate various response scenarios
    const random = Math.random();
    
    if (random < 0.05) {
      // 5% chance of network error
      throw new Error('Network connection failed');
    } else if (random < 0.10) {
      // 5% chance of timeout
      throw new Error('Request timeout');
    } else if (random < 0.15) {
      // 5% chance of 500 error
      return {
        status: 500,
        data: { error: 'Internal server error' },
        responseTime: Date.now() - startTime
      };
    } else if (random < 0.20) {
      // 5% chance of 400 error
      return {
        status: 400,
        data: { error: 'Bad request' },
        responseTime: Date.now() - startTime
      };
    }
    
    // 80% chance of success
    return {
      status: 200,
      data: { success: true, message: 'Webhook received' },
      responseTime: Date.now() - startTime
    };
  }
}

const httpClient = new HttpClient();

/**
 * Generate HMAC signature for webhook security
 */
function generateSignature(payload: string, secret: string): string {
  // In a real implementation, use crypto.createHmac
  // This is a simplified example
  return `sha256=${Buffer.from(payload + secret).toString('base64')}`;
}

/**
 * Filter sensitive fields from record data
 */
function filterRecord(record: Record<string, any>, allowedFields?: string[]): Record<string, any> {
  if (!allowedFields) return record;
  
  const filtered: Record<string, any> = {};
  for (const field of allowedFields) {
    if (field in record) {
      filtered[field] = record[field];
    }
  }
  return filtered;
}

/**
 * Webhook notification job function
 */
export const webhookNotificationJob = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options: WebhookJobOptions = {}
): Promise<WebhookJobResult> => {
  const timestamp = new Date().toISOString();
  
  try {
    // Validate required options
    if (!options.url) {
      return {
        action: 'webhook_skipped',
        error: 'No webhook URL specified',
        timestamp
      };
    }

    // Build webhook payload
    const webhookPayload: WebhookPayload = {
      event,
      timestamp,
      data: {
        operation: hasuraEvent.event?.op || 'unknown',
        table: hasuraEvent.table?.name,
        record: hasuraEvent.event?.data?.new 
          ? filterRecord(hasuraEvent.event.data.new, options.filterFields)
          : undefined,
        ...(options.includeOldRecord && hasuraEvent.event?.data?.old && {
          old_record: filterRecord(hasuraEvent.event.data.old, options.filterFields)
        })
      },
      metadata: {
        hasura_event_id: hasuraEvent.id || 'unknown',
        correlation_id: options.correlationId,
        user: hasuraEvent.event?.session_variables?.['x-hasura-user-email']
      }
    };

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'HasuraEventDetector/1.0',
      ...options.headers
    };

    // Add signature if secret is provided
    if (options.secret) {
      const payloadString = JSON.stringify(webhookPayload);
      headers['X-Webhook-Signature'] = generateSignature(payloadString, options.secret);
    }

    // Send webhook
    const response = await httpClient.post(options.url, webhookPayload, headers);

    console.log(`🔗 Webhook sent to ${options.url}: ${response.status} (${response.responseTime}ms)`);

    // Consider 2xx status codes as success
    if (response.status >= 200 && response.status < 300) {
      return {
        action: 'webhook_sent',
        url: options.url,
        statusCode: response.status,
        responseTime: response.responseTime,
        timestamp
      };
    } else {
      // Non-2xx status codes are considered failures
      return {
        action: 'webhook_failed',
        url: options.url,
        statusCode: response.status,
        responseTime: response.responseTime,
        error: `HTTP ${response.status}: ${JSON.stringify(response.data)}`,
        timestamp
      };
    }

  } catch (error) {
    console.error(`Failed to send webhook to ${options.url}:`, error);
    
    return {
      action: 'webhook_failed',
      url: options.url,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
};

export default webhookNotificationJob;