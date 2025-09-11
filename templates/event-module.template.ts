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
 * 
 * CORRELATION ID USAGE
 * ====================
 * Correlation IDs are automatically provided to jobs via options.correlationId.
 * You can provide correlation IDs in two ways:
 * 
 * 1. Manual injection in options:
 *    const correlationId = hasuraEvent.event.data.new?.process_id;
 *    await listenTo(hasuraEvent, { correlationId });
 * 
 * 2. Plugin-based extraction (automatic):
 *    Use UpdatedByCorrelationPlugin's onPreConfigure hook to automatically extract from payload
 *    await listenTo(hasuraEvent); // System extracts or generates correlation ID
 * 
 * See examples below for how to access and use correlation IDs in jobs.
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
  
  // Access context metadata (passed as 3rd param to listenTo)
  const context = hasuraEvent.__context;
  
  // The 'event' parameter contains the name derived from your filename
  // For example, if this file is named 'user-activation.js', then event = 'user-activation'
  console.log(`🔍 Detecting event: ${event} in ${context?.environment || 'unknown'} environment`);
  
  // Example: Skip detection in test mode unless forced
  if (context?.testMode && !context?.forceDetection) {
    console.log('⏭️  Skipping detection in test mode');
    return false;
  }
  
  // Example: Different behavior per environment
  if (context?.environment === 'development') {
    // More lenient detection in development
    console.log('🔧 Development mode - using relaxed detection');
  }
  
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
  const { dbEvent, user, hasuraEventId, operation } = parseHasuraEvent(hasuraEvent);
  
  // Access context metadata
  const context = hasuraEvent.__context;
  
  // The 'event' parameter contains the name derived from your filename
  // You can use this in your job logic, logging, analytics, etc.
  console.log(`⚡ Handling event: ${event} (Request ID: ${context?.requestId || 'none'})`);
  
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
    // Example job: Send notification (conditionally based on context)
    ...(context?.featureFlags?.enableNotifications !== false ? [
      job(async function sendNotification(event, hasuraEvent, options) {
        const recordId = dbEvent?.new?.id;
        
        // Access the job name and correlation ID from options
        const jobName = options?.jobName || 'unknown';
        const correlationId = options?.correlationId;
        
        console.log(`🔧 Job '${jobName}' processing event '${event}' for record ${recordId}`);
        console.log(`🔗 Correlation ID: ${correlationId}`);
        
        // Skip in test mode unless explicitly enabled
        if (context?.testMode && !context?.enableTestNotifications) {
          console.log('📧 Skipping email in test mode');
          return {
            action: 'skipped',
            reason: 'test_mode',
            jobName
          };
        }
        
        // Use API keys from context
        const apiKey = context?.apiKeys?.sendgrid || process.env.SENDGRID_KEY;
        
        // Your notification logic here
        // Examples:
        // - Send email via SendGrid/SES
        // - Post to Slack/Discord
        // - Send push notification
        // - Update external systems
        
        // Example: Create database record with correlation ID for tracking
        const notificationRecord = {
          id: `notification_${Date.now()}`,
          record_id: recordId,
          correlation_id: correlationId, // Include correlation ID in database row
          event_name: event,
          job_name: jobName,
          user_id: user,
          notification_type: 'email',
          status: 'sent',
          environment: context?.environment,
          created_at: new Date().toISOString()
        };
        
        // In a real application, you would save this to your database:
        // await db.notifications.create(notificationRecord);
        console.log('💾 Would create notification record:', notificationRecord);
        
        return {
          action: 'notification_sent',
          jobName,
          recordId,
          correlationId, // Include in job result for tracking
          user,
          environment: context?.environment,
          timestamp: new Date().toISOString()
        };
      }, {
        timeout: context?.timeouts?.notification || 5000,
        retries: context?.retries?.notification || 3
      })
    ] : []),
    
    // Example job: Update analytics (always runs for tracking)
    job(async function recordAnalytics(event, hasuraEvent, options) {
      const recordId = dbEvent?.new?.id;
      const jobName = options?.jobName || 'unknown';
      const correlationId = options?.correlationId;
      
      console.log(`📊 Job '${jobName}' recording analytics for event '${event}'`);
      console.log(`🔗 Using correlation ID: ${correlationId} for analytics tracking`);
      
      // Include context metadata in analytics
      const analyticsData = {
        eventName: event,
        recordId,
        userId: user,
        environment: context?.environment || 'unknown',
        deployment: context?.deployment,
        requestId: context?.requestId,
        correlationId,
        timestamp: new Date().toISOString()
      };
      
      // Example: Create analytics record with correlation ID
      const analyticsRecord = {
        id: `analytics_${Date.now()}`,
        correlation_id: correlationId, // Link to business process
        event_name: event,
        job_name: jobName,
        user_id: user,
        record_id: recordId,
        properties: analyticsData,
        created_at: new Date().toISOString()
      };
      
      // In a real application:
      // await db.analytics_events.create(analyticsRecord);
      console.log('📈 Would create analytics record:', analyticsRecord);
      
      // Your analytics logic here
      // Examples:
      // - Track event in Mixpanel/Amplitude
      // - Update data warehouse
      // - Increment counters
      // - Log business metrics
      
      return {
        action: 'analytics_recorded',
        jobName,
        correlationId,
        ...analyticsData
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
    }),
    
    // Example job: Audit logging (if context includes audit info)
    ...(context?.audit ? [
      job(async function auditLog(event, hasuraEvent, options) {
        const jobName = options?.jobName || 'unknown';
        
        console.log(`📝 Job '${jobName}' creating audit log`);
        
        // Create comprehensive audit trail
        const auditEntry = {
          // From context
          ...context.audit,
          
          // Event information
          eventName: event,
          eventId: hasuraEventId,
          operation,
          tableName: hasuraEvent.table?.name,
          
          // Record changes
          recordId: dbEvent?.new?.id || dbEvent?.old?.id,
          changes: operation === 'UPDATE' ? {
            before: dbEvent?.old,
            after: dbEvent?.new
          } : null,
          
          // Execution metadata
          correlationId: options?.correlationId,
          jobName,
          timestamp: new Date().toISOString()
        };
        
        // Log to audit system
        console.log('📋 Audit Entry:', JSON.stringify(auditEntry, null, 2));
        
        return {
          action: 'audit_logged',
          jobName,
          auditId: `audit_${Date.now()}`
        };
      })
    ] : [])
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