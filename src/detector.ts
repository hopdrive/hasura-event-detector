import { log, logError, logWarn, setPluginManager } from '@/helpers/log';
import { getObjectSafely } from '@/helpers/object';
import { parseHasuraEvent } from '@/helpers/hasura';
import { resolveFromCaller } from '@/helpers/caller-path';
import { pluginManager, CorrelationIdUtils } from '@/plugin';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { TimeoutManager, TimeoutError, isTimeoutError, type TimeoutConfig } from '@/helpers/timeout-wrapper';
import type {
  HasuraEventPayload,
  ListenToOptions,
  ListenToResponse,
  EventResponse,
  EventProcessingResult,
  EventName,
  CorrelationId,
  DetectorFunction,
  HandlerFunction,
  EventModule,
  JobResult,
} from './types';

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

  // Initialize timeout manager if enabled
  let timeoutManager: TimeoutManager | null = null;
  let isTimedOut = false;

  // Set up timeout configuration
  const timeoutConfig = options.timeoutConfig || {};
  const isTimeoutEnabled =
    timeoutConfig.enabled !== false && (timeoutConfig.getRemainingTimeInMillis || timeoutConfig.serverlessMode);

  if (isTimeoutEnabled) {
    const timeoutManagerConfig: TimeoutConfig = {
      safetyMargin: timeoutConfig.safetyMargin || 2000,
      maxExecutionTime: timeoutConfig.maxExecutionTime || 10000,
      isUsingFallbackTimer: !timeoutConfig.getRemainingTimeInMillis,
      logger: log,
    };

    // Only add getRemainingTimeInMillis if it's defined
    if (timeoutConfig.getRemainingTimeInMillis) {
      timeoutManagerConfig.getRemainingTimeInMillis = timeoutConfig.getRemainingTimeInMillis;
    }

    timeoutManager = new TimeoutManager(timeoutManagerConfig);

    log('listenTo', `Timeout protection enabled (remaining: ${Math.round(timeoutManager.getRemainingTime() / 1000)}s)`);
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
    const enabledPlugins = pluginManager.getEnabledPlugins();
    for (const plugin of enabledPlugins) {
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

  // Resolve eventModulesDirectory relative to caller if it's a relative path
  let eventModulesDir = modifiedOptions.eventModulesDirectory || './events';
  if (!path.isAbsolute(eventModulesDir)) {
    // Resolve relative paths from the caller's directory
    // Stack depth: listenTo() -> getCallerDirectory() needs to go 2 levels up
    eventModulesDir = resolveFromCaller(eventModulesDir, 2);
  }

  const resolvedOptions: ListenToOptions = {
    autoLoadEventModules: true,
    eventModulesDirectory: eventModulesDir,
    listenedEvents: [],
    ...modifiedOptions,
  };

  // Extract or generate correlation ID
  let finalCorrelationId: CorrelationId;

  // 1. Check if correlation ID set in options (from plugin onPreConfigure or manual)
  if (resolvedOptions.correlationId && CorrelationIdUtils.isCorrelationId(resolvedOptions.correlationId)) {
    finalCorrelationId = resolvedOptions.correlationId as CorrelationId;
    log('CorrelationId', `Using correlation ID from options: ${finalCorrelationId}`);
  } else {
    // 2. Generate new correlation ID if not provided (always generates UUID)
    finalCorrelationId = uuidv4() as CorrelationId;
    log('CorrelationId', `Generated new correlation ID: ${finalCorrelationId}`);
  }

  // Add correlation ID to event for jobs and plugins
  hasuraEvent.__correlationId = finalCorrelationId;

  // Call plugin hook for invocation start
  await pluginManager.callOnInvocationStart(hasuraEvent, resolvedOptions);

  if (!resolvedOptions.eventModulesDirectory) {
    logError('listenTo', 'Event modules directory is not set');

    // Ensure plugin shutdown even on early return
    try {
      await pluginManager.shutdown();
    } catch (error) {
      logError('PluginSystem', 'Error during plugin shutdown on early return', error as Error);
    }

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

    // Ensure plugin shutdown even on early return
    try {
      await pluginManager.shutdown();
    } catch (error) {
      logError('PluginSystem', 'Error during plugin shutdown on early return', error as Error);
    }

    return {
      events: [],
      durationMs: Date.now() - start,
    };
  }

  // Create timeout handler
  const handleTimeout = async () => {
    isTimedOut = true;
    log('listenTo', 'TIMEOUT: Function approaching timeout, initiating graceful shutdown');

    // Flush but don't fully shutdown plugins
    if (pluginManager.initialized) {
      try {
        // Call flush on all plugins to save buffered data
        for (const plugin of pluginManager.getEnabledPlugins()) {
          if (plugin.flush) {
            await plugin.flush();
          }
        }
      } catch (error) {
        logError('PluginSystem', 'Error flushing plugins on timeout', error as Error);
      }
    }
  };

  // Main execution function
  const executeEventProcessing = async (): Promise<ListenToResponse> => {
    const eventProcessingPromises: Promise<EventProcessingResult>[] = [];

    // Add abort signal and job timeout to hasuraEvent for jobs to use
    if (timeoutManager) {
      hasuraEvent.__abortSignal = timeoutManager.getAbortSignal();
      if (timeoutConfig.maxJobExecutionTime) {
        hasuraEvent.__maxJobExecutionTime = timeoutConfig.maxJobExecutionTime;
      }
    }

    // Run all event detectors in parallel.
    for (const eventName of resolvedOptions.listenedEvents || []) {
      const processingPromise = runEventDetectorWithHooks(
        eventName,
        hasuraEvent,
        resolvedOptions.eventModulesDirectory || './events',
        finalCorrelationId
      ).catch(error => {
        // If there's an error in detection, still return a result indicating not detected
        pluginManager.callOnError(error as Error, 'event_detection', finalCorrelationId);
        logError(eventName, 'Error detecting events', error as Error);
        return {
          eventName,
          detected: false,
          jobs: [],
        };
      });
      eventProcessingPromises.push(processingPromise);
    }

    // Run all event processors in parallel.
    log('EventHandlers', 'Event processors to run', eventProcessingPromises.length);
    const response = await Promise.allSettled(eventProcessingPromises);
    const preppedRes = preparedResponse(response);

    preppedRes.durationMs = Date.now() - start;

    // Call plugin hook for invocation end
    await pluginManager.callOnInvocationEnd(hasuraEvent, preppedRes, preppedRes.durationMs);

    return preppedRes;
  };

  // Execute with timeout protection if enabled
  let result: ListenToResponse;

  log(
    'listenTo',
    `Running event processing for ${resolvedOptions?.listenedEvents?.length} events`,
    resolvedOptions.listenedEvents
  );

  try {
    if (timeoutManager) {
      // Execute with timeout protection
      result = await timeoutManager.executeWithTimeout(
        executeEventProcessing,
        handleTimeout,
        'Event processing exceeded time limit'
      );
    } else {
      // Execute without timeout protection
      result = await executeEventProcessing();
    }

    // Only shutdown plugins if this is a normal completion (not timeout)
    // and we're in a serverless environment
    if (!isTimedOut && timeoutConfig.serverlessMode) {
      try {
        log(
          'listenTo',
          '[FLUSH TIMING] Normal completion - shutting down plugins for serverless environment (serverlessMode=true)'
        );
        await pluginManager.shutdown();
      } catch (error) {
        logError('PluginSystem', 'Error during plugin shutdown', error as Error);
      }
    } else if (!isTimedOut) {
      // In non-serverless mode, just flush without full shutdown
      try {
        log(
          'listenTo',
          '[FLUSH TIMING] Normal completion - flushing plugins in non-serverless mode (serverlessMode=false or undefined)'
        );
        for (const plugin of pluginManager.getEnabledPlugins()) {
          if (plugin.flush) {
            await plugin.flush();
          }
        }
      } catch (error) {
        logError('PluginSystem', 'Error flushing plugins', error as Error);
      }
    }

    consoleLogResponse(result);
    return result;
  } catch (error) {
    // Handle timeout or other errors
    if (isTimeoutError(error) || isTimedOut) {
      log(
        'listenTo',
        `Execution timed out: ${isTimeoutError(error) ? (error as TimeoutError).message : 'Function timeout'}`
      );

      // Create partial response for timeout
      const timeoutResponse: ListenToResponse = {
        events: [],
        durationMs: Date.now() - start,
        timedOut: true,
        error: isTimeoutError(error) ? (error as TimeoutError).message : 'Function execution exceeded time limit',
      };

      // Call plugin hook for timeout
      await pluginManager.callOnInvocationEnd(hasuraEvent, timeoutResponse, timeoutResponse.durationMs);

      return timeoutResponse;
    }

    // For other errors, shutdown plugins and rethrow
    try {
      await pluginManager.shutdown();
    } catch (shutdownError) {
      logError('PluginSystem', 'Error during emergency shutdown', shutdownError as Error);
    }

    throw error;
  }
};

const preparedResponse = (response: PromiseSettledResult<EventProcessingResult>[]): ListenToResponse => {
  const res: ListenToResponse = {
    events: [],
    durationMs: 0, // Will be set by caller
  };

  for (const result of response) {
    if (result.status === 'fulfilled' && result.value) {
      const { eventName, detected, jobs } = result.value;
      res.events.push({
        name: eventName,
        detected,
        jobs: jobs || [],
      });
    }
    // Note: If result.status === 'rejected', the error was already handled in the catch block
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

    // Get unique event names, preferring source .ts files over generated artifacts
    const eventNames = new Set<EventName>();

    for (const file of filenames) {
      // Skip non-JS/TS files
      if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;

      // Skip index files
      if (file === 'index.js' || file === 'index.ts') continue;

      // Skip generated files - they are build artifacts
      // The .generated.js files are produced from .ts source files
      if (file.includes('.generated.')) continue;

      // Extract event name (remove extension)
      const eventName = file.replace(/\.(js|ts)$/, '') as EventName;
      eventNames.add(eventName);
    }

    const eventNamesWithFoundModules = Array.from(eventNames);

    log(`Found event ${eventNamesWithFoundModules?.length} event modules: `, eventNamesWithFoundModules.join(' | '));

    return eventNamesWithFoundModules;
  } catch (error) {
    logError('DetectEventModules', 'Failed to list modules', error as Error);
    return [];
  }
};

/**
 * Enhanced detect function with plugin hooks
 */
const runEventDetectorWithHooks = async (
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  eventModulesDirectory: string,
  correlationId: CorrelationId
): Promise<EventProcessingResult> => {
  const detectionStart = Date.now();

  // Call plugin hook for event detection start
  await pluginManager.callOnEventDetectionStart(eventName, hasuraEvent);

  const eventHandler = await detect(eventName, hasuraEvent, eventModulesDirectory);

  const detectionDuration = Date.now() - detectionStart;
  const detected = eventHandler !== null;

  // Call plugin hook for event detection end
  await pluginManager.callOnEventDetectionEnd(eventName, detected, hasuraEvent, detectionDuration);

  // If event was not detected, return empty job list
  if (!eventHandler || typeof eventHandler !== 'function') {
    return {
      eventName,
      detected: false,
      jobs: [],
    };
  }

  // Event was detected, run the handler
  const jobs = await runEventHandlerWithHooks(eventHandler, eventName, hasuraEvent, correlationId);
  return {
    eventName,
    detected: true,
    jobs,
  };
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
    await pluginManager.callOnEventHandlerStart(eventName, hasuraEvent);

    const res = await eventHandler(eventName, hasuraEvent);
    const handlerDuration = Date.now() - handlerStart;

    // Call plugin hook for event handler end
    await pluginManager.callOnEventHandlerEnd(eventName, res, hasuraEvent, handlerDuration);

    return res;
  } catch (error) {
    const handlerDuration = Date.now() - handlerStart;

    // Call plugin hook for error
    await pluginManager.callOnError(error as Error, 'event_handler', correlationId);

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
  const eventModule = await loadEventModule(eventName, eventModulesDirectory);
  const { detector, handler } = eventModule;

  log(eventName, 'Event module loaded: ', {
    eventModulesDirectory,
    wasLoaded: eventModule ? true : false,
    eventModule,
  });

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
const consoleLogResponse = (response: ListenToResponse): void => {
  const detectedCount = response.events.filter(e => e.detected).length;
  const totalCount = response.events.length;
  log(
    'EventDetection',
    `🔔 Detected ${detectedCount} of ${totalCount} events from the database event in ${response?.durationMs} ms`
  );

  if (!Array.isArray(response?.events) || response?.events.length < 1) return;

  for (const event of response.events) {
    if (!event.detected) {
      continue;
    }

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
 * Load a JavaScript/TypeScript event module from the /events directory
 * based on the name of the event.
 *
 * @param eventName - Name of the event to load the module for
 * @param eventModulesDirectory - Path to the events directory
 * @returns The loaded event module if it exists, else an empty object
 */
const loadEventModule = async (eventName: EventName, eventModulesDirectory: string): Promise<Partial<EventModule>> => {
  // Try multiple extensions in priority order:
  // 1. .generated.js (compiled from TypeScript by build-events - preferred in production)
  // 2. .js (user-written JavaScript - for backwards compatibility)
  // 3. .mjs (ESM modules)
  // 4. .ts (TypeScript source - only in development with ts-node/tsx)
  const extensions = ['.generated.js', '.js', '.mjs', '.ts'];

  for (const ext of extensions) {
    const modulePath = path.join(eventModulesDirectory, `${eventName}${ext}`);
    try {
      // Convert absolute path to file URL for ESM compatibility
      // In ESM environments, import() requires file URLs for absolute paths
      // In CommonJS, it accepts both paths and URLs
      const moduleUrl = path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath;

      log(eventName, `Importing module from ${moduleUrl}`, {
        pathIsAbsolute: path.isAbsolute(modulePath),
        pathToFileURL: pathToFileURL(modulePath),
        pathToFileURLHref: pathToFileURL(modulePath).href,
        modulePath,
      });

      // Using dynamic import for ES modules compatibility (works in both CJS and ESM)
      const importedModule = await import(moduleUrl);

      log(eventName, 'Imported module returned by await import(moduleUrl): ', importedModule);

      // Handle both CommonJS (module.exports) and ES modules (export default/named exports)
      // CommonJS modules imported via import() have exports on the module object directly
      // or sometimes on .default depending on the transpilation
      const module = (importedModule.default || importedModule) as EventModule;

      log(eventName, `🧩 Loaded event module from ${modulePath}`, module);
      return module;
    } catch (error) {
      log(eventName, `🧩 Error loading event module`, error.message, error);
      // Continue to next extension if this one fails
      if (ext === extensions[extensions.length - 1]) {
        // Only log error on the last attempt
        logError('loadEventModule', `Failed to load module ${eventName} from ${eventModulesDirectory}`, error as Error);
      }
    }
  }

  return {};
};
