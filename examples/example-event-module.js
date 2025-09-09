// Example Event Module with Observability Support
// This demonstrates how event modules work with the observability plugin

const { log, columnHasChanged, parseHasuraEvent } = require('@hopdrive/hasura-event-detector');
const { run, job } = require('@hopdrive/hasura-event-detector');

// Example jobs that this event will trigger
const { sendNotification, updateAnalytics, auditLog } = require('../../lib/jobs');
const { processSpecificBusinessLogic } = require('../jobs');

module.exports.detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);

  // Example: Detect when a user status changes to "active"
  switch (operation) {
    case 'INSERT':
      // Detect new user registration
      const isNewActiveUser = dbEvent?.new?.status === 'active';
      return isNewActiveUser;
      
    case 'UPDATE':
      // Detect when user becomes active (status change)
      const statusChanged = columnHasChanged('status', dbEvent);
      const isNowActive = dbEvent?.new?.status === 'active' && dbEvent?.old?.status !== 'active';
      return statusChanged && isNowActive;
      
    case 'DELETE':
      return false; // Not interested in deletes for this event
      
    case 'MANUAL':
      // Manual trigger - could be used for testing
      return dbEvent?.new?.test_trigger === 'user_activation';
      
    default:
      return false;
  }
};

module.exports.handler = async (event, hasuraEvent) => {
  const { user, dbEvent } = parseHasuraEvent(hasuraEvent);
  
  // When this handler runs, the observability plugin will automatically:
  // 1. Record that this event was detected and handled
  // 2. Track timing for the handler execution
  // 3. Record each job execution with results
  // 4. Capture console logs from each job
  // 5. Store error details if any job fails

  let jobs = [];

  // Add jobs that should run when this event is detected
  jobs.push(job(sendNotification, {
    userId: dbEvent?.new?.id,
    type: 'welcome',
    template: 'user_activated',
    // These options will be captured for debugging if enabled
  }));

  jobs.push(job(updateAnalytics, {
    event: 'user_activated',
    userId: dbEvent?.new?.id,
    timestamp: new Date().toISOString(),
    metadata: {
      previousStatus: dbEvent?.old?.status,
      currentStatus: dbEvent?.new?.status
    }
  }));

  jobs.push(job(auditLog, {
    action: 'user_status_change',
    userId: dbEvent?.new?.id,
    changes: {
      status: {
        from: dbEvent?.old?.status,
        to: dbEvent?.new?.status
      }
    },
    user,
    timestamp: hasuraEvent.created_at
  }));

  jobs.push(job(processSpecificBusinessLogic, {
    userId: dbEvent?.new?.id,
    userData: dbEvent?.new,
    context: hasuraEvent.__context
  }));

  // Run all jobs in parallel
  // The observability plugin will track:
  // - Individual job execution times
  // - Success/failure status of each job
  // - Console logs from each job function
  // - Results and errors from each job
  return await run(event, hasuraEvent, jobs);
};

// Example job function that demonstrates console logging
// These logs will be captured by the observability plugin
const exampleJob = async (event, hasuraEvent, options) => {
  console.log(`Starting job for user ${options.userId}`);
  console.info(`Processing event: ${event}`);
  
  try {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Job completed successfully for user ${options.userId}`);
    return { success: true, userId: options.userId };
  } catch (error) {
    console.error(`Job failed for user ${options.userId}:`, error.message);
    throw error;
  }
};

module.exports.exampleJob = exampleJob;