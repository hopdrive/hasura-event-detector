# Hasura-Event-Detector

System for dynamically identifying business events by name by evaluating database event payloads from Hasura Event Trigger invocations. Asynchronously run 0 or more jobs defined in separate modules when an event is detected.

Detect events by name by interogating Hasura Event Trigger Payloads using a modular approach. The system works like this...

Each event that is to be detected has an event module with a detector function. That function takes in the Hasura Event Trigger payload and determines (true|false) if the payload indicates that this event has been detected.

Once detected, then the handler function is invoked. This function will typically implement a single call to the `runAsyncJobs()` function. The function takes an array of async functions that should be run when this event is detected. They are all run using `Promise.allSettled()` to ensure that even if one of them fails, they all get a chance to complete.

Jobs are defined as javascript modules that export a single async function named the same as the module. This is a job that would appear in the array passed to `runAsyncJobs()`. Require it into the event module, then call it in the array passed to `runAsyncJobs()`. Each async function in the array will be started at the same time as to have them run as parallel as possible. Any asyncronous activity like API calls being made inside the functions will be able to run side-by-side.

## How To

Create a netlify function folder and file with the same name. This is the function that will be triggered by the Hasura Event Trigger. Inside of that directory make a folder called events.

### Netlify Function Naming Convention

Create each netlify function with a naming convention of "event-detector-" followed by the name of the table being monitored.

```
`event-detector-${table.name}`
```

### Netlify Function Folder Structure

```
/netlify-function-name
   /events
      index.js (exports all event modules in the directory)
      some.event.status.js (requires various job modules)
   /jobs
      index.js (exports all local jobs in the directory)
      localJob.js
   netlify-function-name.js (requires shared and local jobs directories)
```

### Event Module Dependencies

Netlify will not be able to track down the dependencies from within any event modules since they are dynamically loaded. So to get around this, we create an index.js file in the events folder that exports every event module from the events folder. We import all of these exported modules from the events folder into the netlify function with a single import but then we don't use it. Just requiring it is enough to ensure all of the event modules and their dependencies are included in the netlify function build. 

### Sharing Job Functions

It's common to have a bit of code that needs to be invoked from multiple event detectors. For instance, if we are writing audit log records whenever various changes are detected then a single job for writing the log could be reused across multiple event detectors.

Because of the way Netlify packages up the Netlify Function into an AWS Lambda,
we must include a reference to all shared job modules in the core Netlify Function
otherwise they will not be bundled into the Lambda at build time.

You can accomplish this pretty easily by creating a shared jobs directory somewhere
outside of the Netlify Function directory such as a lib folder. In that folder you
will place a module for each shared job as well as an index.js file that exports
each one of them.

Then in the Netlify Function file simply require the shared jobs
directory and because the index.js file exports everything, it will tell Netlify
to build the Function with all shared jobs.

Here's an example folder structure...

```
/functions
  /lib
    /jobs
      index.js (exports all shared jobs in the directory)
      sharedJob.js
      sharedJob2.js
  /netlify-function-name
    /events
      index.js (exports all events in the directory)
      some.event.status.js (requires '../../lib/jobs/sharedJob')
      some.other.status.js (requires '../../lib/jobs/sharedJob2')
      yet.another.status.js (requires '../jobs/localJob')
    /jobs
      index.js (exports all local jobs in the directory)
      localJob.js
    netlify-function-name.js (requires '../lib/jobs' and './jobs')
```

### Event Detector Netlify Function

Use the following code for the Netlify function.

```javascript title="netlify-function-name.js"
const auth = require('../lib/functionAuth');
const { listenTo, handleSuccess, handleFailure } = require(`@hopdrive/hasura-event-detector`);
const sharedJobs = require('../~lib/jobs');
const localJobs = require('./jobs');
const events = require('./events');

exports.handler = async (event, context) => {
  try {
    if (!auth.hasValidPassphrase(event)) return { statusCode: 401, body: `Unauthorized!` };

    const res = await listenTo(JSON.parse(event.body), {
      autoLoadEventModules: true,
      eventModulesDirectory: `${__dirname}/events`,
    });

    return handleSuccess(res);
  } catch (e) {
    return handleFailure(e);
  }
};
```

### Events

For each event to detect, create a `js` file in the events directory named exactly to the name of the event.

Example Event Module

```javascript title="some.event.status.js"
const { log, columnHasChanged, parseHasuraEvent } = require('../../lib/EventDetector/helpers');
const { publishEventLog, jobSimulator, rerunAR } = require('../../lib/EventDetector/jobs');
const { run, job } = require('../../lib/EventDetector/handler');

module.exports.detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);

  switch (operation) {
    case 'INSERT':
      return false;
    case 'UPDATE':
      const statusChanged = columnHasChanged('status', dbEvent);
      const isThisEvent = dbEvent?.new?.status === 'pickup successful';
      return statusChanged && isThisEvent;
    case 'DELETE':
      return false;
    case 'MANUAL':
      return false;
    default:
      return false;
  }
};

module.exports.handler = async (event, hasuraEvent) => {
  const { user, dbEvent } = parseHasuraEvent(hasuraEvent);

  let jobs = [];

  jobs.push(job(jobSimulator, { delay: 3000, message: 'Job 1' }));
  jobs.push(job(jobSimulator, { delay: 2000, message: 'Job 2' }));
  jobs.push(job(jobSimulator, { delay: 1000, message: 'Job 3' }));
  jobs.push(job(publishEventLog, { user }));
  jobs.push(job(rerunAR, { moveId: dbEvent?.new?.id }));

  return await run(event, hasuraEvent, jobs);
};
```

## Output

When the event trigger calls this function, the console log output will look something like this:

```
Request from ::ffff:127.0.0.1: POST /.netlify/functions/event-detector-moves
[DetectEventModules] Auto-detected event modules found in: /Users/robnewton/Github/admin-portal/functions/event-detector-moves/events [ 'move.cancel.pending.js', 'move.pickup.successful.js' ]
[loadEventModule] 🧩 Loaded move.cancel.pending module from /Users/robnewton/Github/admin-portal/functions/event-detector-moves/events/move.cancel.pending.js
[move.cancel.pending] Event detected
[jobSimulator] Job 1 delaying 3000 ms...
[jobSimulator] Job 2 delaying 2000 ms...
[move.cancel.pending.runJobs] Running 2 jobs...
[loadEventModule] 🧩 Loaded move.pickup.successful module from /Users/robnewton/Github/admin-portal/functions/event-detector-moves/events/move.pickup.successful.js
[move.pickup.successful] Event detected
[jobSimulator] Job 1 delaying 3000 ms...
[jobSimulator] Job 2 delaying 2000 ms...
[jobSimulator] Job 3 delaying 1000 ms...
Rerunning AR for move 13107
[move.pickup.successful.runJobs] Running 5 jobs...
[jobSimulator] Job 3 complete!
[jobSimulator] Job 2 complete!
[jobSimulator] Job 2 complete!
[jobSimulator] Job 1 complete!
[move.cancel.pending.runJobs] Completed 2 jobs
[jobSimulator] Job 1 complete!
[move.pickup.successful.runJobs] Completed 5 jobs

🔔  Detected 2 events from the database event:

   ⭐️ move.cancel.pending

      ✅ Job 1 complete!

      ✅ Job 2 complete!

   ⭐️ move.pickup.successful

      ✅ Job 1 complete!

      ✅ Job 2 complete!

      ✅ Job 3 complete!

      ✅ Wrote event log for move.pickup.successful

      ✅ You ran AR

Response with status 200 in 3035 ms.
```

## Correlation ID Tracking

The Hasura Event Detector includes a powerful correlation ID tracking system that enables end-to-end traceability across related database events and job executions. This feature allows you to trace the complete flow of business logic as it cascades through multiple database operations.

### How Correlation IDs Work

**Automatic Correlation ID Extraction**: When processing UPDATE operations, the system automatically checks the `updated_by` column for existing correlation IDs. If found, the system continues the correlation chain, enabling traceability across multiple invocations.

**Correlation ID Generation**: For new event chains (or when no existing correlation ID is found), the system generates a new correlation ID in the format: `{source_function}.{uuid}`

**Cross-Invocation Tracking**: Jobs receive the correlation ID through their options parameter and can use it in their database mutations, creating a chain of related events that can be traced through the observability system.

### Using Correlation IDs in Jobs

All job functions receive a `correlationId` through their options parameter. Use this ID in your database mutations to create traceable event chains:

```javascript
// Example job that uses correlation ID for traceability
module.exports = async (event, hasuraEvent, options) => {
  const { correlationId } = options;
  
  // Use correlation ID in database mutations
  const result = await updateRecord({
    id: recordId,
    status: 'processed',
    updated_by: correlationId  // This enables correlation chain continuation
  });
  
  return result;
};
```

### Event Module Example with Correlation ID

```javascript title="order.fulfillment.complete.js"
const { log, columnHasChanged, parseHasuraEvent } = require('../../lib/EventDetector/helpers');
const { sendNotification, updateInventory } = require('../../lib/jobs');
const { run, job } = require('../../lib/EventDetector/handler');

module.exports.detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);
  
  if (operation === 'UPDATE') {
    const statusChanged = columnHasChanged('status', dbEvent);
    const isFulfilled = dbEvent?.new?.status === 'fulfilled';
    return statusChanged && isFulfilled;
  }
  return false;
};

module.exports.handler = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  const orderId = dbEvent?.new?.id;
  
  let jobs = [];
  
  // Jobs automatically receive correlationId in options
  jobs.push(job(sendNotification, { 
    type: 'fulfillment_complete', 
    orderId 
  }));
  
  jobs.push(job(updateInventory, { 
    orderId,
    action: 'reserve_shipped_items'
  }));
  
  return await run(event, hasuraEvent, jobs);
};
```

### Job Implementation with Correlation Tracking

```javascript title="updateInventory.js"
const { makeGraphQLMutation } = require('../helpers/graphql');

module.exports = async (event, hasuraEvent, options) => {
  const { correlationId, orderId, action } = options;
  
  try {
    // Perform inventory updates
    const inventoryResult = await makeGraphQLMutation(`
      mutation UpdateInventory($orderId: uuid!, $updatedBy: String!) {
        update_inventory_items(
          where: { order_id: { _eq: $orderId } }
          _set: { 
            status: "reserved"
            updated_by: $updatedBy
          }
        ) {
          affected_rows
        }
      }
    `, {
      orderId,
      updatedBy: correlationId  // Continues the correlation chain
    });
    
    return {
      success: true,
      affectedRows: inventoryResult.update_inventory_items.affected_rows,
      correlationId
    };
  } catch (error) {
    console.error('Inventory update failed:', error.message);
    throw error;
  }
};
```

### Observability and Debugging

The correlation ID system integrates with the observability plugin to provide:

- **Complete Event Chains**: Track all related invocations across multiple database operations
- **Performance Analysis**: Measure total chain duration and identify bottlenecks
- **Error Tracing**: Quickly locate all events and jobs related to a failed operation
- **Visual Flow Diagrams**: Use the React Flow visualizer to see correlation chains graphically

### Visualization Features

The dashboard includes enhanced visualization capabilities for correlation chains:

1. **Correlation Chain View**: Switch between single invocation and correlation chain visualization modes
2. **Chain Statistics**: View aggregated metrics across all invocations in a chain
3. **Sequential Flow**: See how invocations trigger each other in chronological order
4. **Performance Metrics**: Track success rates, duration, and job counts across chains

### Best Practices

1. **Always Use Correlation IDs**: Include the `correlationId` from options in any database mutations that might trigger subsequent events
2. **Consistent Field Naming**: Use `updated_by` as the standard field for correlation ID tracking
3. **Error Handling**: Include correlation IDs in error logs for easier debugging
4. **Chain Limits**: Monitor correlation chain length to prevent infinite loops
5. **Clean Chain Termination**: Ensure chains have clear endpoints to avoid indefinite correlation tracking

### Configuration

Correlation ID tracking is automatically enabled when using the observability plugin:

```javascript
const { listenTo } = require('@hopdrive/hasura-event-detector');

exports.handler = async (event, context) => {
  const res = await listenTo(JSON.parse(event.body), {
    autoLoadEventModules: true,
    eventModulesDirectory: `${__dirname}/events`,
    observability: {
      enabled: true,
      database: {
        connectionString: process.env.OBSERVABILITY_DB_URL
      }
    }
  });
  
  return handleSuccess(res);
};
```

The system automatically:
- Extracts correlation IDs from UPDATE operations
- Generates new IDs for event chain initiation
- Passes correlation IDs to all job functions
- Tracks correlation data in the observability database
- Provides visualization in the dashboard

## Plugin System & Logging

The Hasura Event Detector uses a flexible plugin architecture that separates concerns between observability metrics and logging functionality. This design allows you to choose your preferred logging approach without being locked into a specific solution.

### Available Plugins

**ObservabilityPlugin**: Focuses on execution metrics, performance analytics, and correlation tracking. Stores data in a dedicated observability database for monitoring and debugging.

**ConsoleInterceptorPlugin**: Monkey-patches console methods (`console.log`, `console.error`, etc.) to intercept ALL console output from jobs, including direct console calls that don't use the hasura event detector logger.

**SimpleLoggingPlugin**: Listens to log events from the plugin system and provides structured console logging with correlation IDs, timestamps, and job context.

### Logging Plugin Usage

You can use the logging plugins individually or together:

```javascript
const { ConsoleInterceptorPlugin } = require('@hopdrive/hasura-event-detector/console-interceptor-plugin');
const { SimpleLoggingPlugin } = require('@hopdrive/hasura-event-detector/simple-logging-plugin');
const { pluginManager } = require('@hopdrive/hasura-event-detector/plugin-system');

// Option 1: Console interception only (captures ALL console logs)
const consoleInterceptor = new ConsoleInterceptorPlugin({
  enabled: true,
  levels: ['log', 'error', 'warn', 'info']
});

// Option 2: Structured logging only (plugin lifecycle logs)
const simpleLogger = new SimpleLoggingPlugin({
  enabled: true,
  format: 'structured', // 'simple', 'structured', or 'json'
  includeCorrelationId: true,
  includeJobContext: true,
  colorize: true
});

// Register plugins
pluginManager
  .register(consoleInterceptor)    // Intercepts all console calls
  .register(simpleLogger);         // Provides structured output

exports.handler = async (event, context) => {
  const res = await listenTo(JSON.parse(event.body), {
    autoLoadEventModules: true,
    eventModulesDirectory: `${__dirname}/events`,
  });
  
  return handleSuccess(res);
};
```

### Console Interception vs. Event Logging

**ConsoleInterceptorPlugin**:
- Captures direct `console.log()`, `console.error()`, etc. calls from job functions
- Monkey-patches console methods during job execution
- Forwards intercepted logs to other plugins via the `onLog` hook
- Perfect for capturing logs from jobs that use standard console methods

**SimpleLoggingPlugin**:
- Listens to `onLog` events from the plugin system
- Provides structured formatting with correlation IDs and job context
- Logs invocation lifecycle events (start/end, job start/end, errors)
- Can output in simple, structured, or JSON formats

### Example Job with Console Logging

```javascript
// This job's console logs will be intercepted and structured
module.exports = async (event, hasuraEvent, options) => {
  const { correlationId, orderId } = options;
  
  // These will be intercepted by ConsoleInterceptorPlugin
  // and formatted by SimpleLoggingPlugin
  console.log('Starting order processing');
  console.info('Processing order:', orderId);
  
  try {
    const result = await updateOrder(orderId, {
      status: 'processing',
      updated_by: correlationId  // Continue correlation chain
    });
    
    console.log('Order updated successfully');
    return result;
  } catch (error) {
    console.error('Order update failed:', error.message);
    throw error;
  }
};
```

### Logging Output Examples

With both plugins enabled, you'll see structured output like:

```
[15:30:15] [HED] [INFO] {job: updateOrder, correlation: orderService.abc123} Starting order processing
[15:30:15] [HED] [INFO] {job: updateOrder, correlation: orderService.abc123} Processing order: 12345
[15:30:16] [HED] [INFO] {job: updateOrder, correlation: orderService.abc123} Order updated successfully
[15:30:16] [HED] [INFO] {job: updateOrder, correlation: orderService.abc123} Completed job: updateOrder in 850ms
```

### Plugin Configuration Options

**ConsoleInterceptorPlugin Options**:
- `levels`: Console methods to intercept (default: ['log', 'error', 'warn', 'info'])
- `includeTimestamp`: Add timestamps to log data
- `includeJobContext`: Include job name and correlation ID

**SimpleLoggingPlugin Options**:
- `format`: Output format - 'simple', 'structured', or 'json'
- `logLevel`: Minimum log level to output ('debug', 'info', 'warn', 'error')
- `colorize`: Use colors in console output
- `includeTimestamp`: Show timestamps
- `includeCorrelationId`: Show correlation IDs
- `prefix`: Custom prefix for log messages

This separation allows you to:
- Use observability for metrics and performance data
- Choose your preferred logging approach (console, files, external services)
- Maintain clean separation between monitoring and logging concerns
- Easily swap or configure different logging strategies
