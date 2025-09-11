/**
 * Event Module Template
 * 
 * This template shows how to create a new event module for the Hasura Event Detector.
 * Copy this file to the events directory and customize for your specific business event.
 */

import type { 
  EventName, 
  HasuraEventPayload, 
  DetectorFunction, 
  HandlerFunction,
  JobResult 
} from '@hopdrive/hasura-event-detector';
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

// Define your event name
const EVENT_NAME: EventName = 'example-event' as EventName;

/**
 * Detector function - determines if this event occurred
 * 
 * @param event - The event name being detected
 * @param hasuraEvent - The Hasura event trigger payload
 * @returns Promise<boolean> - true if the event was detected
 */
export const detector: DetectorFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<boolean> => {
  // Parse the Hasura event for easier access to data
  const { dbEvent, operation, user } = parseHasuraEvent(hasuraEvent);
  
  // Example detection logic - customize based on your business rules
  
  // Check if this is the right table and operation
  if (operation !== 'UPDATE') return false;
  
  // Check if a specific column changed
  if (!columnHasChanged('status', dbEvent)) return false;
  
  // Check if the status changed to a specific value
  const newStatus = dbEvent?.new?.status;
  if (newStatus !== 'active') return false;
  
  // Add any additional business logic here
  // Examples:
  // - Check user permissions
  // - Validate data integrity
  // - Check time-based conditions
  // - Verify related records
  
  return true;
};

/**
 * Handler function - executes jobs when the event is detected
 * 
 * @param event - The event name that was detected
 * @param hasuraEvent - The Hasura event trigger payload
 * @returns Promise<JobResult[]> - Results from all executed jobs
 */
export const handler: HandlerFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<JobResult[]> => {
  // Parse event data for use in jobs
  const { dbEvent, user, hasuraEventId } = parseHasuraEvent(hasuraEvent);
  
  // Define jobs to execute when this event is detected
  const jobs = [
    // Example job: Send notification
    job(async (event, hasuraEvent, options) => {
      const recordId = dbEvent?.new?.id;
      
      // Simulate sending a notification
      console.log(`Sending notification for record ${recordId} activated by ${user}`);
      
      // Your notification logic here
      // Examples:
      // - Send email via SendGrid/SES
      // - Post to Slack/Discord
      // - Send push notification
      // - Update external systems
      
      return {
        action: 'notification_sent',
        recordId,
        user,
        timestamp: new Date().toISOString()
      };
    }, {
      timeout: 5000,
      retries: 3
    }),
    
    // Example job: Update analytics
    job(async (event, hasuraEvent, options) => {
      const recordId = dbEvent?.new?.id;
      
      // Simulate analytics update
      console.log(`Recording analytics event for ${recordId}`);
      
      // Your analytics logic here
      // Examples:
      // - Track event in Mixpanel/Amplitude
      // - Update data warehouse
      // - Increment counters
      // - Log business metrics
      
      return {
        action: 'analytics_recorded',
        recordId,
        event_name: event,
        correlation_id: options?.correlationId
      };
    }),
    
    // Example job: Sync with external service
    job(async (event, hasuraEvent, options) => {
      const record = dbEvent?.new;
      
      // Simulate external API call
      console.log(`Syncing record ${record?.id} with external service`);
      
      // Your sync logic here
      // Examples:
      // - Update CRM (Salesforce, HubSpot)
      // - Sync with payment processor
      // - Update inventory systems
      // - Trigger webhooks
      
      return {
        action: 'external_sync',
        recordId: record?.id,
        syncTimestamp: new Date().toISOString()
      };
    }, {
      timeout: 10000,
      retries: 2
    })
  ];
  
  // Execute all jobs in parallel
  return await run(event, hasuraEvent, jobs) || [];
};

// Export the module for the event detector
export default {
  detector,
  handler
};

/**
 * Type-safe event module interface
 * This ensures your module exports the correct functions
 */
export interface EventModule {
  detector: DetectorFunction;
  handler: HandlerFunction;
}