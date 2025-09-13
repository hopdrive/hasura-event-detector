/**
 * Analytics Tracking Job
 * 
 * A realistic example of tracking business events with proper TypeScript typing.
 */

import type { EventName, HasuraEventPayload, JobOptions } from '@/types/index';

interface AnalyticsEvent {
  userId?: string;
  anonymousId?: string;
  eventName: string;
  properties: Record<string, any>;
  timestamp: string;
  context?: {
    source: string;
    correlationId?: string;
    hasuraEventId?: string;
  };
}

interface AnalyticsJobOptions extends JobOptions {
  eventName?: string;
  userId?: string;
  properties?: Record<string, any>;
  anonymousId?: string;
  source?: string;
}

interface AnalyticsJobResult {
  action: 'analytics_tracked' | 'analytics_failed' | 'analytics_skipped';
  eventName?: string;
  userId?: string;
  trackingId?: string;
  error?: string;
  timestamp: string;
}

/**
 * Simulated analytics service - replace with actual provider (Mixpanel, Amplitude, etc.)
 */
class AnalyticsService {
  private events: AnalyticsEvent[] = [];

  async track(analyticsEvent: AnalyticsEvent): Promise<{ trackingId: string }> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

    // Simulate occasional failures (3% chance)
    if (Math.random() < 0.03) {
      throw new Error('Analytics service rate limit exceeded');
    }

    // Store event (in real implementation, this would send to external service)
    this.events.push(analyticsEvent);
    
    const trackingId = `track_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📊 Analytics event tracked: ${analyticsEvent.eventName} [${trackingId}]`);
    console.log(`   User: ${analyticsEvent.userId || 'anonymous'}`);
    console.log(`   Properties:`, analyticsEvent.properties);
    
    return { trackingId };
  }

  // Helper method to get tracked events (for testing/debugging)
  getTrackedEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  // Clear events (for testing)
  clearEvents(): void {
    this.events = [];
  }
}

const analyticsService = new AnalyticsService();

/**
 * Analytics tracking job function
 */
export const analyticsTrackingJob = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options: AnalyticsJobOptions = {}
): Promise<AnalyticsJobResult> => {
  const timestamp = new Date().toISOString();
  
  try {
    // Extract event name (use provided or infer from event)
    const eventName = options.eventName || `hasura_${event}`;
    
    // Build analytics event
    const analyticsEvent: AnalyticsEvent = {
      eventName,
      properties: {
        // Include Hasura event metadata
        hasura_operation: hasuraEvent.event?.op,
        hasura_table: hasuraEvent.table?.name,
        hasura_schema: hasuraEvent.table?.schema,
        
        // Include custom properties
        ...options.properties,
        
        // Add data from the database event
        ...(hasuraEvent.event?.data?.new && {
          record_id: hasuraEvent.event.data.new.id,
          record_type: hasuraEvent.table?.name
        })
      },
      timestamp,
      context: {
        source: options.source || 'hasura_event_detector',
        correlationId: options.correlationId,
        hasuraEventId: hasuraEvent.id
      }
    };

    // Add user identification
    if (options.userId) {
      analyticsEvent.userId = options.userId;
    } else if (options.anonymousId) {
      analyticsEvent.anonymousId = options.anonymousId;
    } else {
      // Try to extract user from session variables
      const sessionVars = hasuraEvent.event?.session_variables;
      if (sessionVars?.['x-hasura-user-id']) {
        analyticsEvent.userId = sessionVars['x-hasura-user-id'];
      } else if (sessionVars?.['x-hasura-user-email']) {
        analyticsEvent.userId = sessionVars['x-hasura-user-email'];
      }
    }

    // Track the event
    const result = await analyticsService.track(analyticsEvent);

    return {
      action: 'analytics_tracked',
      eventName,
      userId: analyticsEvent.userId,
      trackingId: result.trackingId,
      timestamp
    };

  } catch (error) {
    console.error(`Failed to track analytics event:`, error);
    
    return {
      action: 'analytics_failed',
      eventName: options.eventName,
      userId: options.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
};

// Export the service for testing/debugging
export { analyticsService };

export default analyticsTrackingJob;