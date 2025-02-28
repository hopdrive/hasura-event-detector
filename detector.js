const { log } = require('./helpers/log');
const { getObjectSafely } = require('./helpers/object');
const fs = require('fs');
const path = require('path');

/**
 * Main entry point for all automated event detection based on event
 * modules defined in the events folder for the event detector instance.
 *
 * @param {Object} hasuraEvent Hasura event trigger payload as
 *    defined here: https://hasura.io/docs/latest/event-triggers/payload/
 * @param {Options} optionsOverride Configuration object to dictate how the function
 *    should behave.
 * @param {Boolean} optionsOverride.autoLoadEventModules Indicate whether or not to
 *    use the file system to list all files in the provided event modules
 *    directory (options.eventModulesDirectory).
 * @param {String} optionsOverride.eventModulesDirectory Path to the events directory
 *    housing all event javascript modules. Each file expected to have a
 *    detector and a handler function exported.
 * @param {String} optionsOverride.listenedEvents A list of event names to listen
 *    for if they are not auto loaded from the file system. If this is
 *    specified alongside the autoLoadEventModules, then it will be
 *    ignored and overwritten by the auto loader.
 * @param {String[]} listenedEvents List of event names to listen
 *    for and load modules for
 * @param {Object} [context={}] Context object passed to each event handler
 * @returns {Promise.AllSettledResult} For each outcome object, a status
 * string is present. If the status is fulfilled, then a value is present.
 * If the status is rejected, then a reason is present. The value (or reason)
 * reflects what value each promise was fulfilled (or rejected) with.
 */
const listenTo = async (hasuraEvent, optionsOverride = {}, context = {}) => {
  // Use the urnary (+) to get starting time as milliseconds
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Unary_plus
  let start = +new Date();

  // Inject context into hasuraEvent object
  hasuraEvent.__context = context;

  let options = {
    autoLoadEventModules: true,
    eventModulesDirectory: './events',
    listenedEvents: [],
  };

  // Start with default options then apply any overrides passed in
  Object.assign(options, optionsOverride);

  // If configured to do so, load the events from the file system
  if (options.autoLoadEventModules) {
    options.listenedEvents = detectEventModules(options.eventModulesDirectory);
  }

  let detectedEvents = [];
  let eventHandlersToRun = [];
  for (let eventKey in options.listenedEvents) {
    const event = options.listenedEvents[eventKey];
    try {
      const eventHandler = await detect(event, hasuraEvent, options.eventModulesDirectory);

      //log('listenTo', `Processing event ${event}`, eventHandler);

      if (!eventHandler) continue;
      if (typeof eventHandler !== 'function') continue;

      if (eventHandler) {
        detectedEvents.push(event);
        //eventHandlersToRun.push(handler(event, hasuraEvent));
        eventHandlersToRun.push(
          (async () => {
            try {
              if (!eventHandler) throw Error('Handler not defined');
              if (typeof eventHandler !== 'function') throw Error('Handler not a function');
              const res = await eventHandler(event, hasuraEvent);
              return res;
            } catch (error) {
              log(event, `Handler crashed: ${error.stack}`);
              throw Error(`Handler crashed: ${error.stack}`);
            }
          })()
        );
      }
    } catch (error) {
      console.error(`Error detecting events for ${event}`, error.message);
    }
  }

  console.log('eventHandlersToRun', eventHandlersToRun);
  const response = await Promise.allSettled(eventHandlersToRun);
  const preppedRes = preparedResponse(detectedEvents, response);

  preppedRes.duration = +new Date() - start;

  consoleLogResponse(detectedEvents, preppedRes);

  return preppedRes;
};

const preparedResponse = (detectedEvents, response) => {
  let res = {
    events: [],
  };

  for (const responseIndex in response) {
    const handlerResponse = response[responseIndex];
    const handlerResponseDetails = handlerResponse?.value;
    const event = detectedEvents[responseIndex];
    res.events.push({
      name: event,
      jobs: handlerResponseDetails,
    });
  }

  return res;
};

/**
 * Get a list of all events to listen for that have event modules.
 *
 * @returns {String[]} List of event names derived from file names
 * of JavaScript modules found in the /events directory.
 */
const detectEventModules = modulesDir => {
  try {
    let filenames = fs.readdirSync(modulesDir);
    log('DetectEventModules', `Auto-detected event modules found in: ${modulesDir}`, filenames);
    return filenames.map(file => file.replace('.js', ''));
  } catch (error) {
    console.error(`[ListModules] Failed to list modules`, error.message);
    return [];
  }
};

/**
 * Detect if the database trigger event passed in by Hasura contains
 * the criteria needed to define that the event passed in the first
 * parameter did in fact occur.
 *
 * @param {String} event Name of the event to detect
 * @param {Object} hasuraEvent Hasura event trigger payload as
 *    defined here: https://hasura.io/docs/latest/event-triggers/payload/
 * @param {string} eventModulesDirectory Path to the modules directory
 * @returns {EventHandler} Handler function from the event module
 *    only returned if event is detected
 */
const detect = async (event, hasuraEvent, eventModulesDirectory) => {
  // TODO: We could implement specific functions for each type of hasura
  // event (insert, update, delete, or manual). We would run the correct
  // event module function based on the event. If the event is update and
  // there is a "checkUpdate" function exported from the event module
  // then it would be called here.
  //
  // It could look like this on the client side:
  //
  //    module.exports.checkUpdate = async (event, hasuraEvent) => {
  //      const { dbEvent } = parseHasuraEvent(hasuraEvent);
  //      const wasJustActivated = dbEvent?.old?.active != dbEvent?.new?.active && dbEvent?.new?.active;
  //      return wasJustActivated;
  //    }
  //
  const { detector, handler } = loadEventModule(event, eventModulesDirectory);

  //log(event, 'Detector and handler loaded: ', detector, handler);

  if (!detector) return;
  if (typeof detector !== 'function') return;
  if (!handler) return;
  if (typeof handler !== 'function') return;

  try {
    const detected = await detector(event, hasuraEvent);
    if (!detected) {
      log(event, `No event detected`);
      return;
    }
  } catch (error) {
    log(event, `Error detecting event`, error.message);
    return;
  }

  log(event, 'Event detected');
  return handler;
};

/**
 * Write out the outcome of the listenFor() process. Which events were detected, and
 * what jobs were run from the handler of each event's module.
 *
 * @param {String[]} detectedEvents List of event names that were detected in the data
 * @param {Promise.AllSettledResult} resulta For each outcome object, a status
 * string is present. If the status is fulfilled, then a value is present.
 * If the status is rejected, then a reason is present. The value (or reason)
 * reflects what value each promise was fulfilled (or rejected) with.
 */
const consoleLogResponse = (detectedEvents, response) => {
  console.log(`\n🔔  Detected ${detectedEvents.length} events from the database event in ${response?.duration} ms:\n`);

  //console.log('response', response, 'response.events', response.events)

  if (!Array.isArray(response?.events) || response?.events.length < 1) return;

  for (const eventIndex in response?.events) {
    const event = response?.events[eventIndex];

    console.log(`   ⭐️ ${event.name}\n`);

    if (!Array.isArray(event?.jobs) || event?.jobs?.length < 1) {
      console.log(`      No jobs\n`);
      continue;
    }

    event?.jobs.forEach(job => {
      const icon = job?.completed ? '✅' : '❌';
      let message = '';
      if (typeof job?.result === 'object') message = getObjectSafely(job?.result);
      if (typeof job?.result !== 'object') message = job?.result?.toString();
      console.log(`      ${icon} ${job?.name} ${job?.duration || 0} ms\n`);
      console.log(`            ${message}\n`);
    });
  }
};

/**
 * Load a JavaScript event module from the /events directory
 * based on the name of the event.
 *
 * @param {String} event Name of the event to load the module for
 * @returns {Module} The result of the required() module if it exists,
 * else an empty object
 */
const loadEventModule = (event, eventModulesDirectory) => {
  const modulePath = path.join(eventModulesDirectory, `${event}.js`);
  try {
    const module = require(modulePath);
    //log('loadEventModule', `🧩 Loaded ${event} module from ${modulePath}`, module);
    return module;
  } catch (error) {
    console.error(`Failed to load module from ${modulePath}`, error.message, error.stack, error);
    return {};
  }
};

module.exports = { listenTo };
