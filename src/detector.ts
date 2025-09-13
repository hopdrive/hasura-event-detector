import { log, logError, logWarn, setPluginManager } from '@/helpers/log.js';
import { getObjectSafely } from '@/helpers/object.js';
import { parseHasuraEvent } from '@/helpers/hasura.js';
import { pluginManager, CorrelationIdUtils } from '@/plugins/plugin-system.js';
import { promises as fs } from 'fs';
import path from 'path';
import type {
  HasuraEventPayload,
  ListenToOptions,
  ListenToResponse,
  EventResponse,
  EventName,
  CorrelationId,
  DetectorFunction,
  HandlerFunction,
  EventModule,
  JobResult,
} from '@/types/index.js';

/**
 * Runtime validation for Hasura event payload
 * @param payload - The payload to validate
 * @returns True if valid, false otherwise
 */
const validateHasuraEventPayload = (payload: unknown): payload is HasuraEventPayload => {
  if (!payload || typeof payload !== 'object') {
    logWarn('Validation', 'Hasura event payload is not an object');
    return false;
  }

  const event = payload as Record<string, any>;

  // Check for required Hasura event structure
  if (!event.event || typeof event.event !== 'object') {
    logWarn('Validation', 'Missing or invalid event object in Hasura payload');
    return false;
  }

  if (!event.event.data || typeof event.event.data !== 'object') {
    logWarn('Validation', 'Missing or invalid event.data in Hasura payload');
    return false;
  }

  if (!event.event.op || typeof event.event.op !== 'string') {
    logWarn('Validation', 'Missing or invalid event.op in Hasura payload');
    return false;
  }

  return true;
};

/**
 * Main entry point for all automated event detection based on event
 * modules defined in the events folder for the event detector instance.
 *
 * Detects business events by analyzing Hasura event trigger payloads and
 * executes corresponding jobs through a modular, plugin-aware architecture.
 *
 * @param hasuraEvent - Hasura event trigger payload
 * @param options - Optional configuration including context, correlation ID, and behavior settings
 * @returns Promise resolving to detection results with job execution outcomes
 */
export const listenTo = async (
  hasuraEvent: HasuraEventPayload,
  options: Partial<ListenToOptions> = {}
): Promise<ListenToResponse> => {
  // Track execution start time
  const start = Date.now();

  // Runtime validation of input payload
  if (!validateHasuraEventPayload(hasuraEvent)) {
    logError('listenTo', 'Invalid Hasura event payload structure');
    return {
      events: [],
      durationMs: Date.now() - start,
    };
  }

  // Allow plugins to modify options before processing (including correlation ID extraction)
  let modifiedOptions = { ...options };

  // Initialize plugin system if not already done
  if (!pluginManager.initialized) {
    // Initialize all plugins
    try {
      await pluginManager.initialize();
      // Set up internal logger to use plugin system
      setPluginManager(pluginManager);
    } catch (error) {
      logWarn('PluginSystem', 'Failed to initialize plugins, continuing without them', error as Error);
    }
  }

  try {
    // Special handling for onPreConfigure which returns modified options
    for (const plugin of pluginManager.getEnabledPlugins()) {
      if (typeof plugin.onPreConfigure === 'function') {
        const pluginModifiedOptions = await plugin.onPreConfigure(hasuraEvent, modifiedOptions);
        if (pluginModifiedOptions && typeof pluginModifiedOptions === 'object') {
          modifiedOptions = { ...modifiedOptions, ...pluginModifiedOptions };
        }
      }
    }
  } catch (error) {
    logWarn('PreConfigure', 'Plugin pre-configuration failed, continuing with original options', error as Error);
  }

  // Extract context and inject into hasuraEvent object
  const context = modifiedOptions.context || {};
  hasuraEvent.__context = context;

  const resolvedOptions: ListenToOptions = {
    autoLoadEventModules: true,
    eventModulesDirectory: './events',
    listenedEvents: [],
    ...modifiedOptions,
  };

  // Parse Hasura event
  const parsedEvent = parseHasuraEvent(hasuraEvent);

  // Extract or generate correlation ID
  let finalCorrelationId: CorrelationId;

  // 1. Check if correlation ID set in options (from plugin onPreConfigure or manual)
  if (resolvedOptions.correlationId && CorrelationIdUtils.isCorrelationId(resolvedOptions.correlationId)) {
    finalCorrelationId = resolvedOptions.correlationId as CorrelationId;
    log('CorrelationId', `Using correlation ID from options: ${finalCorrelationId}`);
  } else {
    // 2. Generate new correlation ID if not provided (always generates UUID)
    finalCorrelationId = CorrelationIdUtils.generate(resolvedOptions.sourceFunction || 'listenTo');
    log('CorrelationId', `Generated new correlation ID: ${finalCorrelationId}`);
  }

  // Add correlation ID to event for jobs and plugins
  hasuraEvent.__correlationId = finalCorrelationId;

  // Call plugin hook for invocation start
  await pluginManager.callHook('onInvocationStart', hasuraEvent, resolvedOptions, context, finalCorrelationId);

  if (!resolvedOptions.eventModulesDirectory) {
    logError('listenTo', 'Event modules directory is not set');
    return {
      events: [],
      durationMs: Date.now() - start,
    };
  }

  // If configured to do so, load the events from the file system
  if (resolvedOptions.autoLoadEventModules) {
    resolvedOptions.listenedEvents = await detectEventModules(resolvedOptions.eventModulesDirectory);
  }

  if (
    (resolvedOptions.listenedEvents && resolvedOptions.listenedEvents.length === 0) ||
    !resolvedOptions.listenedEvents
  ) {
    logError('listenTo', 'No events to listen for');
    return {
      events: [],
      durationMs: Date.now() - start,
    };
  }

  const eventHandlersToRun: Promise<JobResult[]>[] = [];
  const detectedEventNames: EventName[] = [];

  // Run all event detectors in parallel.
  await Promise.allSettled(
    (resolvedOptions.listenedEvents || []).map(async eventName => {
      try {
        const eventHandler = runDetectorWithHooks(
          eventName,
          hasuraEvent,
          resolvedOptions.eventModulesDirectory || './events',
          finalCorrelationId
        );
        eventHandlersToRun.push(eventHandler);
        detectedEventNames.push(eventName);
      } catch (error) {
        await pluginManager.callHook('onError', error as Error, 'event_detection', finalCorrelationId);
        logError(eventName, 'Error detecting events', error as Error);
      }
    })
  );

  // Run all event handlers in parallel.
  log('EventHandlers', 'Event handlers to run', eventHandlersToRun.length);
  const response = await Promise.allSettled(eventHandlersToRun);
  const preppedRes = preparedResponse(detectedEventNames, response);

  preppedRes.durationMs = Date.now() - start;

  // Call plugin hook for invocation end
  await pluginManager.callHook('onInvocationEnd', hasuraEvent, preppedRes, finalCorrelationId);

  consoleLogResponse(detectedEventNames, preppedRes);

  return preppedRes;
};

const preparedResponse = (
  detectedEvents: EventName[],
  response: PromiseSettledResult<JobResult[]>[]
): ListenToResponse => {
  const res: ListenToResponse = {
    events: [],
    durationMs: 0, // Will be set by caller
  };

  for (let i = 0; i < response.length; i++) {
    const handlerResponse = response[i];
    const handlerResponseDetails = handlerResponse?.status === 'fulfilled' ? handlerResponse.value : [];
    const event = detectedEvents[i];
    if (event) {
      res.events.push({
        name: event,
        jobs: handlerResponseDetails || [],
      });
    }
  }

  return res;
};

/**
 * Get a list of all events to listen for that have event modules.
 *
 * @param modulesDir - Path to the events directory containing JavaScript modules
 * @returns Promise resolving to list of event names derived from file names
 */
const detectEventModules = async (modulesDir: string): Promise<EventName[]> => {
  try {
    const filenames = await fs.readdir(modulesDir);
    log('DetectEventModules', `Auto-detected event modules found in: ${modulesDir}`, filenames);
    return filenames
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'))
      .map(file => file.replace(/\.(js|ts)$/, '') as EventName);
  } catch (error) {
    logError('DetectEventModules', 'Failed to list modules', error as Error);
    return [];
  }
};

/**
 * Enhanced detect function with plugin hooks
 */
const runDetectorWithHooks = async (
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  eventModulesDirectory: string,
  correlationId: CorrelationId
): Promise<JobResult[]> => {
  const detectionStart = Date.now();

  // Call plugin hook for event detection start
  await pluginManager.callHook('onEventDetectionStart', eventName, hasuraEvent, correlationId);

  const eventHandler = await detect(eventName, hasuraEvent, eventModulesDirectory);

  const detectionDuration = Date.now() - detectionStart;
  const detected = eventHandler !== null;

  // Call plugin hook for event detection end
  await pluginManager.callHook(
    'onEventDetectionEnd',
    eventName,
    detected,
    hasuraEvent,
    correlationId,
    detectionDuration
  );

  if (!eventHandler || typeof eventHandler !== 'function') throw new Error('Event handler not defined');

  return runEventHandlerWithHooks(eventHandler, eventName, hasuraEvent, correlationId);
};

/**
 * Run the event handler with plugin hooks.
 *
 * @param eventName - Name of the event to run the handler for
 * @param hasuraEvent - Hasura event trigger payload
 * @param eventHandler - Handler function to run
 * @param correlationId - Correlation ID to use
 * @returns Promise resolving to job execution results
 */
const runEventHandlerWithHooks = async (
  eventHandler: HandlerFunction,
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<JobResult[]> => {
  const handlerStart = Date.now();
  try {
    if (!eventHandler) throw new Error('Handler not defined');
    if (typeof eventHandler !== 'function') throw new Error('Handler not a function');

    // Call plugin hook for event handler start
    await pluginManager.callHook('onEventHandlerStart', eventName, hasuraEvent, correlationId);

    const res = await eventHandler(eventName, hasuraEvent);
    const handlerDuration = Date.now() - handlerStart;

    // Call plugin hook for event handler end
    await pluginManager.callHook('onEventHandlerEnd', eventName, res, hasuraEvent, correlationId);

    return res;
  } catch (error) {
    const handlerDuration = Date.now() - handlerStart;

    // Call plugin hook for error
    await pluginManager.callHook('onError', error as Error, 'event_handler', correlationId);

    log(eventName, `Handler crashed: ${(error as Error).stack}`);
    throw new Error(`Handler crashed: ${(error as Error).stack}`);
  }
};

/**
 * Detect if the database trigger event passed in by Hasura contains
 * the criteria needed to define that the event passed in the first
 * parameter did in fact occur.
 *
 * @param eventName - Name of the event to detect
 * @param hasuraEvent - Hasura event trigger payload
 * @param eventModulesDirectory - Path to the modules directory
 * @returns Handler function from the event module, only returned if event is detected
 */
const detect = async (
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  eventModulesDirectory: string
): Promise<HandlerFunction | null> => {
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
  const { detector, handler } = loadEventModule(eventName, eventModulesDirectory);

  //log(event, 'Detector and handler loaded: ', detector, handler);

  if (!detector) return null;
  if (typeof detector !== 'function') return null;
  if (!handler) return null;
  if (typeof handler !== 'function') return null;

  try {
    const detected = await detector(eventName, hasuraEvent);
    if (!detected) {
      log(eventName, `No event detected`);
      return null;
    }
  } catch (error) {
    log(eventName, `Error detecting event`, (error as Error).message);
    return null;
  }

  log(eventName, 'Event detected');
  return handler;
};

/**
 * Write out the outcome of the listenTo() process. Which events were detected, and
 * what jobs were run from the handler of each event's module.
 *
 * @param detectedEvents - List of event names that were detected in the data
 * @param response - Results from event handler execution
 */
const consoleLogResponse = (detectedEvents: EventName[], response: ListenToResponse): void => {
  log(
    'EventDetection',
    `🔔 Detected ${detectedEvents.length} events from the database event in ${response?.durationMs} ms`
  );

  if (!Array.isArray(response?.events) || response?.events.length < 1) return;

  for (const event of response.events) {
    log('EventDetection', `   ⭐️ ${event.name}`);

    if (!Array.isArray(event?.jobs) || event?.jobs?.length < 1) {
      log('EventDetection', '      No jobs');
      continue;
    }

    event.jobs.forEach(job => {
      const icon = job?.completed ? '✅' : '❌';
      let message = '';
      if (typeof job?.result === 'object' && job?.result !== null) {
        const safeObj = getObjectSafely(job?.result);
        message = JSON.stringify(safeObj, null, 2);
      } else if (job?.result != null) {
        message = job?.result.toString();
      }
      log('EventDetection', `      ${icon} ${job?.name} ${job?.durationMs || 0} ms`);
      if (message) {
        log('EventDetection', `            ${message}`);
      }
    });
  }
};

/**
 * Load a JavaScript event module from the /events directory
 * based on the name of the event.
 *
 * @param eventName - Name of the event to load the module for
 * @param eventModulesDirectory - Path to the events directory
 * @returns The loaded event module if it exists, else an empty object
 */
const loadEventModule = (eventName: EventName, eventModulesDirectory: string): Partial<EventModule> => {
  const modulePath = path.join(eventModulesDirectory, `${eventName}.js`);
  try {
    // Using dynamic import for ES modules
    const module = require(modulePath) as EventModule;
    //log('loadEventModule', `🧩 Loaded ${event} module from ${modulePath}`, module);
    return module;
  } catch (error) {
    logError('loadEventModule', `Failed to load module from ${modulePath}`, error as Error);
    return {};
  }
};

// Main export - the listenTo function is already exported above
