/**
 * Event Module Template - Example Event
 * 
 * This template shows how to create a new event module for the Hasura Event Detector.
 * 
 * IMPORTANT: Event Name Configuration
 * ====================================
 * The event name is automatically derived from your filename:
 * - user-activation.js  → event name: 'user-activation'
 * - order-completed.ts  → event name: 'order-completed'
 * - product-updated.js  → event name: 'product-updated'
 * 
 * The derived event name is passed as the first parameter to both your 
 * detector and handler functions, so you can access it via the 'event' parameter.
 * 
 * No manual configuration is needed - just name your file appropriately!
 */

import type { 
  EventName, 
  HasuraEventPayload, 
  DetectorFunction, 
  HandlerFunction,
  JobResult 
} from '@hopdrive/hasura-event-detector';
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

/**
 * Detector function - determines if this event occurred
 * 
 * @param event - The event name automatically derived from your filename (e.g., 'example-event')
 * @param hasuraEvent - The Hasura event trigger payload from Hasura
 * @returns Promise<boolean> - true if the event was detected, false otherwise
 */
export const detector: DetectorFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<boolean> => {
  // Parse the Hasura event for easier access to data
  const { dbEvent, operation, user } = parseHasuraEvent(hasuraEvent);
  
  // The 'event' parameter contains the name derived from your filename
  // For example, if this file is named 'user-activation.js', then event = 'user-activation'
  console.log(`🔍 Detecting event: ${event}`);
  
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
 * @param event - The event name that was detected (same as filename without extension)
 * @param hasuraEvent - The Hasura event trigger payload from Hasura
 * @returns Promise<JobResult[]> - Results from all executed jobs
 */
export const handler: HandlerFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<JobResult[]> => {
  // Parse event data for use in jobs
  const { dbEvent, user, hasuraEventId } = parseHasuraEvent(hasuraEvent);
  
  // The 'event' parameter contains the name derived from your filename
  // You can use this in your job logic, logging, analytics, etc.
  console.log(`⚡ Handling event: ${event}`);
  
  // Define jobs to execute when this event is detected
  // 
  // IMPORTANT: Job Name Access
  // ==========================
  // Each job function can access its own name via options.jobName
  // The job name is derived from the function name:
  // - function sendNotification() → jobName: 'sendNotification'
  // - async function recordAnalytics() → jobName: 'recordAnalytics'
  // - Anonymous functions → jobName: 'anonymous'
  const jobs = [
    // Example job: Send notification
    job(async function sendNotification(event, hasuraEvent, options) {
      const recordId = dbEvent?.new?.id;
      
      // Access the job name from options (derived from function name)
      const jobName = options?.jobName || 'unknown';
      console.log(`🔧 Job '${jobName}' processing event '${event}' for record ${recordId}`);
      
      // Your notification logic here
      // Examples:
      // - Send email via SendGrid/SES
      // - Post to Slack/Discord
      // - Send push notification
      // - Update external systems
      
      return {
        action: 'notification_sent',
        jobName,  // Include job name in result
        recordId,
        user,
        timestamp: new Date().toISOString()
      };
    }, {
      timeout: 5000,
      retries: 3
    }),
    
    // Example job: Update analytics  
    job(async function recordAnalytics(event, hasuraEvent, options) {
      const recordId = dbEvent?.new?.id;
      const jobName = options?.jobName || 'unknown';
      
      console.log(`📊 Job '${jobName}' recording analytics for event '${event}'`);
      
      // Your analytics logic here
      // Examples:
      // - Track event in Mixpanel/Amplitude
      // - Update data warehouse
      // - Increment counters
      // - Log business metrics
      
      return {
        action: 'analytics_recorded',
        jobName,
        recordId,
        event_name: event,
        correlation_id: options?.correlationId
      };
    }),
    
    // Example job: Sync with external service
    job(async function syncWithExternal(event, hasuraEvent, options) {
      const record = dbEvent?.new;
      const jobName = options?.jobName || 'unknown';
      
      console.log(`🔄 Job '${jobName}' syncing record ${record?.id} with external service`);
      
      // Your sync logic here
      // Examples:
      // - Update CRM (Salesforce, HubSpot)
      // - Sync with payment processor
      // - Update inventory systems
      // - Trigger webhooks
      
      return {
        action: 'external_sync',
        jobName,
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