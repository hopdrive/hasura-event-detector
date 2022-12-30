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
      some.event.status.js (requires various job modules)
   /jobs
      index.js (exports all local jobs in the directory)
      localJob.js
   netlify-function-name.js (requires shared and local jobs directories)
```

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
const { handleSuccess, handleFailure } = require('../lib/EventDetector/helpers');
const { listenTo } = require('../lib/EventDetector/detector');

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
