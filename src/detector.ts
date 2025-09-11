import { log, logError, logWarn, setPluginManager } from '@/helpers/log.js';
import { getObjectSafely } from '@/helpers/object.js';
import { parseHasuraEvent } from '@/helpers/hasura.js';
import { ObservabilityPlugin } from '@/plugins/observability-plugin.js';
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
  JobResult
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
 * @param optionsOverride - Configuration options for event detection behavior
 * @param context - Context object passed to each event handler
 * @returns Promise resolving to detection results with job execution outcomes
 */
export const listenTo = async (
  hasuraEvent: HasuraEventPayload,
  optionsOverride: Partial<ListenToOptions> = {},
  context: Record<string, any> = {}
): Promise<ListenToResponse> => {
  // Track execution start time
  const start = Date.now();
  
  // Runtime validation of input payload
  if (!validateHasuraEventPayload(hasuraEvent)) {
    logError('listenTo', 'Invalid Hasura event payload structure');
    return {
      events: [],
      duration: Date.now() - start
    };
  }

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
      logWarn('PluginSystem', 'Failed to initialize plugins, continuing without them', error as Error);
    }
  }

  // Inject context into hasuraEvent object
  hasuraEvent.__context = context;

  const options: ListenToOptions = {
    autoLoadEventModules: true,
    eventModulesDirectory: './events',
    listenedEvents: [],
    ...optionsOverride
  };

  // Parse Hasura event for observability
  const parsedEvent = parseHasuraEvent(hasuraEvent);
  
  // Extract or generate correlation ID
  const correlationId = extractCorrelationId(hasuraEvent, parsedEvent, options.sourceFunction || 'listenTo');
  
  // Add correlation ID to context for plugins and jobs
  hasuraEvent.__correlationId = correlationId;
  
  // Call plugin hook for invocation start
  await pluginManager.callHook('onInvocationStart', hasuraEvent, options, context, correlationId);

  // If configured to do so, load the events from the file system
  if (options.autoLoadEventModules) {
    options.listenedEvents = await detectEventModules(options.eventModulesDirectory);
  }

  const detectedEvents: EventName[] = [];
  const eventHandlersToRun: Promise<JobResult[]>[] = [];
  const eventExecutionRecords = new Map<EventName, string | null>();
  
  for (const event of options.listenedEvents || []) {
    const detectionStart = Date.now();
    let eventExecutionId: string | null = null;
    
    try {
      // Call plugin hook for event detection start
      await pluginManager.callHook('onEventDetectionStart', event, hasuraEvent, correlationId);

      const eventHandler = await detectWithObservability(
        event, 
        hasuraEvent, 
        options.eventModulesDirectory,
        correlationId
      );

      const detectionDuration = Date.now() - detectionStart;
      const detected = eventHandler !== null;

      // Call plugin hook for event detection end
      await pluginManager.callHook('onEventDetectionEnd', event, detected, hasuraEvent, correlationId);

      if (detected) {
        eventExecutionRecords.set(event, eventExecutionId);
      }

      if (!eventHandler || typeof eventHandler !== 'function') continue;

      detectedEvents.push(event);
      eventHandlersToRun.push(
        (async (): Promise<JobResult[]> => {
          const handlerStart = Date.now();
          try {
            if (!eventHandler) throw new Error('Handler not defined');
            if (typeof eventHandler !== 'function') throw new Error('Handler not a function');
            
            // Call plugin hook for event handler start
            await pluginManager.callHook('onEventHandlerStart', event, hasuraEvent, correlationId);
            
            // Pass correlation ID to handler for job context
            hasuraEvent.__correlationId = correlationId;
            
            const res = await eventHandler(event, hasuraEvent);
            const handlerDuration = Date.now() - handlerStart;

            // Call plugin hook for event handler end
            await pluginManager.callHook('onEventHandlerEnd', event, res, hasuraEvent, correlationId);

            return res;
          } catch (error) {
            const handlerDuration = Date.now() - handlerStart;
            
            // Call plugin hook for error
            await pluginManager.callHook('onError', error as Error, 'event_handler', correlationId);

            log(event, `Handler crashed: ${(error as Error).stack}`);
            throw new Error(`Handler crashed: ${(error as Error).stack}`);
          }
        })()
      );
    } catch (error) {
      const detectionDuration = Date.now() - detectionStart;
      
      // Call plugin hook for error
      await pluginManager.callHook('onError', error as Error, 'event_detection', correlationId);

      logError(event, 'Error detecting events', error as Error);
    }
  }

  log('EventHandlers', 'Event handlers to run', eventHandlersToRun.length);
  const response = await Promise.allSettled(eventHandlersToRun);
  const preppedRes = preparedResponse(detectedEvents, response);

  preppedRes.duration = Date.now() - start;

  // Call plugin hook for invocation end
  await pluginManager.callHook('onInvocationEnd', hasuraEvent, preppedRes, correlationId);

  consoleLogResponse(detectedEvents, preppedRes);

  return preppedRes;
};

const preparedResponse = (
  detectedEvents: EventName[], 
  response: PromiseSettledResult<JobResult[]>[]
): ListenToResponse => {
  const res: ListenToResponse = {
    events: [],
    duration: 0 // Will be set by caller
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
 * Enhanced detect function with observability hooks
 */
const detectWithObservability = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload, 
  eventModulesDirectory: string, 
  correlationId: CorrelationId
): Promise<HandlerFunction | null> => {
  return await detect(event, hasuraEvent, eventModulesDirectory);
};

/**
 * Detect if the database trigger event passed in by Hasura contains
 * the criteria needed to define that the event passed in the first
 * parameter did in fact occur.
 *
 * @param event - Name of the event to detect
 * @param hasuraEvent - Hasura event trigger payload
 * @param eventModulesDirectory - Path to the modules directory
 * @returns Handler function from the event module, only returned if event is detected
 */
const detect = async (
  event: EventName, 
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
  const { detector, handler } = loadEventModule(event, eventModulesDirectory);

  //log(event, 'Detector and handler loaded: ', detector, handler);

  if (!detector) return null;
  if (typeof detector !== 'function') return null;
  if (!handler) return null;
  if (typeof handler !== 'function') return null;

  try {
    const detected = await detector(event, hasuraEvent);
    if (!detected) {
      log(event, `No event detected`);
      return null;
    }
  } catch (error) {
    log(event, `Error detecting event`, (error as Error).message);
    return null;
  }

  log(event, 'Event detected');
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
  log('EventDetection', `🔔 Detected ${detectedEvents.length} events from the database event in ${response?.duration} ms`);

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
      if (typeof job?.result === 'object') message = getObjectSafely(job?.result);
      if (typeof job?.result !== 'object') message = job?.result?.toString() || '';
      log('EventDetection', `      ${icon} ${job?.name} ${job?.duration || 0} ms`);
      log('EventDetection', `            ${message}`);
    });
  }
};

/**
 * Load a JavaScript event module from the /events directory
 * based on the name of the event.
 *
 * @param event - Name of the event to load the module for
 * @param eventModulesDirectory - Path to the events directory
 * @returns The loaded event module if it exists, else an empty object
 */
const loadEventModule = (event: EventName, eventModulesDirectory: string): Partial<EventModule> => {
  const modulePath = path.join(eventModulesDirectory, `${event}.js`);
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

/**
 * Extract correlation ID from Hasura event or generate a new one
 * @param hasuraEvent - The Hasura event payload
 * @param parsedEvent - Parsed event data
 * @param sourceFunction - Source function name for generating new correlation ID
 * @returns Correlation ID
 */
const extractCorrelationId = (
  hasuraEvent: HasuraEventPayload, 
  parsedEvent: any, 
  sourceFunction: string
): CorrelationId => {
  // Only check for correlation ID in UPDATE operations
  if (parsedEvent.operation === 'UPDATE') {
    const updatedBy = parsedEvent.dbEvent?.new?.updated_by as string | undefined;
    
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

// Main export - the listenTo function is already exported above
