const { log, logError, logWarn, setPluginManager } = require('./helpers/log');
const { getObjectSafely } = require('./helpers/object');
const { parseHasuraEvent } = require('./helpers/hasura');
const { ObservabilityPlugin } = require('./observability-plugin');
const { pluginManager, CorrelationIdUtils } = require('./plugin-system');
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

  // Initialize plugin system if not already done
  if (!pluginManager.initialized) {
    // Register observability plugin if configured
    if (optionsOverride.observability) {
      const observabilityPlugin = new ObservabilityPlugin(optionsOverride.observability);
      pluginManager.register(observabilityPlugin);
    }

    // Initialize all plugins
    try {
      await pluginManager.initialize();
      // Set up internal logger to use plugin system
      setPluginManager(pluginManager);
    } catch (error) {
      logWarn('PluginSystem', 'Failed to initialize plugins, continuing without them', error);
    }
  }

  // Inject context into hasuraEvent object
  hasuraEvent.__context = context;

  let options = {
    autoLoadEventModules: true,
    eventModulesDirectory: './events',
    listenedEvents: [],
  };

  // Start with default options then apply any overrides passed in
  Object.assign(options, optionsOverride);

  // Parse Hasura event for observability
  const parsedEvent = parseHasuraEvent(hasuraEvent);
  
  // Extract or generate correlation ID
  const correlationId = extractCorrelationId(hasuraEvent, parsedEvent, options.sourceFunction || 'unknown');
  
  // Add correlation ID to context for plugins and jobs
  hasuraEvent.__correlationId = correlationId;
  
  // Call plugin hook for invocation start
  await pluginManager.callHook('onInvocationStart', hasuraEvent, options, context, correlationId);

  // If configured to do so, load the events from the file system
  if (options.autoLoadEventModules) {
    options.listenedEvents = detectEventModules(options.eventModulesDirectory);
  }

  let detectedEvents = [];
  let eventHandlersToRun = [];
  let eventExecutionRecords = new Map();
  
  for (let eventKey in options.listenedEvents) {
    const event = options.listenedEvents[eventKey];
    const detectionStart = +new Date();
    let eventExecutionId = null;
    
    try {
      // Call plugin hook for event detection start
      await pluginManager.callHook('onEventDetectionStart', event, hasuraEvent, correlationId);

      const eventHandler = await detectWithObservability(
        event, 
        hasuraEvent, 
        options.eventModulesDirectory,
        correlationId
      );

      const detectionDuration = +new Date() - detectionStart;
      const detected = eventHandler !== null;

      // Call plugin hook for event detection end
      await pluginManager.callHook('onEventDetectionEnd', event, detected, hasuraEvent, correlationId);

      if (detected) {
        eventExecutionRecords.set(event, eventExecutionId);
      }

      if (!eventHandler || typeof eventHandler !== 'function') continue;

      detectedEvents.push(event);
      eventHandlersToRun.push(
        (async () => {
          const handlerStart = +new Date();
          try {
            if (!eventHandler) throw Error('Handler not defined');
            if (typeof eventHandler !== 'function') throw Error('Handler not a function');
            
            // Call plugin hook for event handler start
            await pluginManager.callHook('onEventHandlerStart', event, hasuraEvent, correlationId);
            
            // Pass correlation ID to handler for job context
            hasuraEvent.__correlationId = correlationId;
            
            const res = await eventHandler(event, hasuraEvent);
            const handlerDuration = +new Date() - handlerStart;

            // Call plugin hook for event handler end
            await pluginManager.callHook('onEventHandlerEnd', event, res, hasuraEvent, correlationId);

            return res;
          } catch (error) {
            const handlerDuration = +new Date() - handlerStart;
            
            // Call plugin hook for error
            await pluginManager.callHook('onError', error, 'event_handler', correlationId);

            log(event, `Handler crashed: ${error.stack}`);
            throw Error(`Handler crashed: ${error.stack}`);
          }
        })()
      );
    } catch (error) {
      const detectionDuration = +new Date() - detectionStart;
      
      // Call plugin hook for error
      await pluginManager.callHook('onError', error, 'event_detection', correlationId);

      logError(event, 'Error detecting events', error);
    }
  }

  log('EventHandlers', 'Event handlers to run', eventHandlersToRun.length);
  const response = await Promise.allSettled(eventHandlersToRun);
  const preppedRes = preparedResponse(detectedEvents, response);

  preppedRes.duration = +new Date() - start;

  // Call plugin hook for invocation end
  await pluginManager.callHook('onInvocationEnd', hasuraEvent, preppedRes, correlationId);

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
    logError('DetectEventModules', 'Failed to list modules', error);
    return [];
  }
};

/**
 * Enhanced detect function with observability hooks
 */
const detectWithObservability = async (event, hasuraEvent, eventModulesDirectory, correlationId) => {
  return await detect(event, hasuraEvent, eventModulesDirectory);
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
  log('EventDetection', `🔔 Detected ${detectedEvents.length} events from the database event in ${response?.duration} ms`);

  if (!Array.isArray(response?.events) || response?.events.length < 1) return;

  for (const eventIndex in response?.events) {
    const event = response?.events[eventIndex];

    log('EventDetection', `   ⭐️ ${event.name}`);

    if (!Array.isArray(event?.jobs) || event?.jobs?.length < 1) {
      log('EventDetection', '      No jobs');
      continue;
    }

    event?.jobs.forEach(job => {
      const icon = job?.completed ? '✅' : '❌';
      let message = '';
      if (typeof job?.result === 'object') message = getObjectSafely(job?.result);
      if (typeof job?.result !== 'object') message = job?.result?.toString();
      log('EventDetection', `      ${icon} ${job?.name} ${job?.duration || 0} ms`);
      log('EventDetection', `            ${message}`);
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
    logError('loadEventModule', `Failed to load module from ${modulePath}`, error);
    return {};
  }
};

/**
 * Extract correlation ID from Hasura event or generate a new one
 * @param {Object} hasuraEvent - The Hasura event payload
 * @param {Object} parsedEvent - Parsed event data
 * @param {string} sourceFunction - Source function name for generating new correlation ID
 * @returns {string} Correlation ID
 */
const extractCorrelationId = (hasuraEvent, parsedEvent, sourceFunction) => {
  // Only check for correlation ID in UPDATE operations
  if (parsedEvent.operation === 'UPDATE') {
    const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
    
    if (updatedBy && CorrelationIdUtils.isCorrelationId(updatedBy)) {
      // Found existing correlation ID, continue the chain
      log('CorrelationId', `Continuing correlation chain: ${updatedBy}`);
      return updatedBy;
    }
  }
  
  // Generate new correlation ID for this chain
  const newCorrelationId = CorrelationIdUtils.generate(sourceFunction);
  log('CorrelationId', `Starting new correlation chain: ${newCorrelationId}`);
  return newCorrelationId;
};

module.exports = { listenTo };
