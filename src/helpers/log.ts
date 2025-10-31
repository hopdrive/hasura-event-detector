/**
 * Internal logger for Hasura Event Detector system
 *
 * This logger integrates with the plugin system when available to ensure
 * consistent logging behavior across the entire system.
 */

import type { PluginManager } from '@/plugin';
import type { JobName, CorrelationId, EventName, HasuraEventPayload, JobOptions } from '../types';

let pluginManager: PluginManager | null = null;
let consoleLoggingEnabled = true;

/**
 * Context information for scoped logging
 */
interface LogContext {
  eventName?: EventName;
  jobName: JobName;
  correlationId: CorrelationId;
}

/**
 * Set the plugin manager instance for integrated logging
 */
export const setPluginManager = (manager: PluginManager): void => {
  pluginManager = manager;
};

/**
 * Enable or disable console logging
 */
export const setConsoleLogging = (enabled: boolean): void => {
  consoleLoggingEnabled = enabled;
};

/**
 * Internal log function with context support
 */
const logWithContext = (prefix: string, message: string, context: LogContext, ...args: any[]): void => {
  const formattedMessage =
    args.length > 0
      ? `${message} ${args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ')}`
      : message;

  // Write to console if enabled
  if (consoleLoggingEnabled) {
    console.log(`[${prefix}] ${formattedMessage}`);
  }

  // If plugin system is available, use it for consistent logging
  if (pluginManager && pluginManager.initialized) {
    pluginManager
      .callOnLog(
        'info',
        `[${prefix}] ${formattedMessage}`,
        {
          source: 'internal_logger',
          prefix,
          originalArgs: args,
          ...(context.eventName && { eventName: context.eventName }),
        },
        context.jobName,
        context.correlationId
      )
      .catch(() => {
        // Fallback to console if plugin system fails
        console.log(`[${prefix}] ${formattedMessage}`);
      });
  } else {
    // Fallback to console when plugin system not available
    console.log(`[${prefix}] ${formattedMessage}`);
  }
};

/**
 * Internal log function that uses plugin system when available
 */
export const log = (prefix: string, message: string, ...args: any[]): void => {
  logWithContext(prefix, message, { jobName: 'system' as JobName, correlationId: '' as CorrelationId }, ...args);
};

/**
 * Internal error logging function with context support
 */
const logErrorWithContext = (
  prefix: string,
  message: string,
  error: Error | null = null,
  context: LogContext,
  ...args: any[]
): void => {
  const errorMessage = error ? `${message}: ${error.message}` : message;
  const formattedMessage =
    args.length > 0
      ? `${errorMessage} ${args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ')}`
      : errorMessage;

  // Write to console if enabled
  if (consoleLoggingEnabled) {
    console.error(`[${prefix}] ${formattedMessage}`);
    if (error?.stack) {
      console.error(error.stack);
    }
  }

  if (pluginManager && pluginManager.initialized) {
    pluginManager
      .callOnLog(
        'error',
        `[${prefix}] ${formattedMessage}`,
        {
          source: 'internal_logger',
          prefix,
          error: error
            ? {
                name: error.name,
                message: error.message,
                stack: error.stack,
              }
            : null,
          originalArgs: args,
          ...(context.eventName && { eventName: context.eventName }),
        },
        context.jobName,
        context.correlationId
      )
      .catch(() => {
        // Fallback to console if plugin system fails
        console.error(`[${prefix}] ${formattedMessage}`);
      });
  } else {
    // Fallback to console when plugin system not available
    console.error(`[${prefix}] ${formattedMessage}`);
  }
};

/**
 * Internal error logging function
 */
export const logError = (prefix: string, message: string, error: Error | null = null, ...args: any[]): void => {
  logErrorWithContext(prefix, message, error, { jobName: 'system' as JobName, correlationId: '' as CorrelationId }, ...args);
};

/**
 * Internal warning logging function with context support
 */
const logWarnWithContext = (prefix: string, message: string, context: LogContext, ...args: any[]): void => {
  const formattedMessage =
    args.length > 0
      ? `${message} ${args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ')}`
      : message;

  // Write to console if enabled
  if (consoleLoggingEnabled) {
    console.warn(`[${prefix}] ${formattedMessage}`);
  }

  if (pluginManager && pluginManager.initialized) {
    pluginManager
      .callOnLog(
        'warn',
        `[${prefix}] ${formattedMessage}`,
        {
          source: 'internal_logger',
          prefix,
          originalArgs: args,
          ...(context.eventName && { eventName: context.eventName }),
        },
        context.jobName,
        context.correlationId
      )
      .catch(() => {
        // Fallback to console if plugin system fails
        console.warn(`[${prefix}] ${formattedMessage}`);
      });
  } else {
    // Fallback to console when plugin system not available
    console.warn(`[${prefix}] ${formattedMessage}`);
  }
};

/**
 * Internal warning logging function
 */
export const logWarn = (prefix: string, message: string, ...args: any[]): void => {
  logWarnWithContext(prefix, message, { jobName: 'system' as JobName, correlationId: '' as CorrelationId }, ...args);
};

/**
 * Get current plugin manager (for testing/debugging)
 */
export const getPluginManager = (): PluginManager | null => pluginManager;

/**
 * Scoped logger interface - console.log-like API with automatic prefix
 */
export interface ScopedLogger {
  log: (message: string, ...args: any[]) => void;
  logError: (message: string, error?: Error | null, ...args: any[]) => void;
  logWarn: (message: string, ...args: any[]) => void;
}

/**
 * Create a scoped logger with automatic context and prefix
 */
export const createScopedLogger = (context: LogContext, autoPrefix: string): ScopedLogger => ({
  log: (message: string, ...args: any[]) => logWithContext(autoPrefix, message, context, ...args),
  logError: (message: string, error: Error | null = null, ...args: any[]) =>
    logErrorWithContext(autoPrefix, message, error, context, ...args),
  logWarn: (message: string, ...args: any[]) => logWarnWithContext(autoPrefix, message, context, ...args),
});

/**
 * Get a scoped logger for event module level (detectors and handlers)
 *
 * Automatically uses the event name as the log prefix.
 *
 * @param hasuraEvent - The Hasura event payload
 * @param eventName - The event name
 * @returns A scoped logger with automatic context capture and prefix
 *
 * @example
 * ```typescript
 * export const detector: DetectorFunction = async (eventName, hasuraEvent) => {
 *   const { log, logError, logWarn } = getEventLogger(eventName, hasuraEvent);
 *   log('Checking event match'); // Logs: [eventName] Checking event match
 *   return isMatch;
 * };
 * ```
 */
export const getEventLogger = (eventName: EventName, hasuraEvent: HasuraEventPayload): ScopedLogger => {
  const correlationId = hasuraEvent?.__correlationId || ('' as CorrelationId);

  return createScopedLogger(
    {
      eventName: eventName,
      jobName: 'system' as JobName,
      correlationId,
    },
    eventName as string // Use event name as automatic prefix
  );
};

/**
 * Get a scoped logger for job level
 *
 * Automatically uses the job name as the log prefix.
 *
 * @param hasuraEvent - The Hasura event payload
 * @param options - The job options (jobName is automatically set by the library)
 * @returns A scoped logger with automatic context capture and prefix
 *
 * @example
 * ```typescript
 * export const myJob: JobFunction = async (event, hasuraEvent, options) => {
 *   const { log, logError, logWarn } = getJobLogger(hasuraEvent, options);
 *   log('Processing order'); // Logs: [myJob] Processing order
 *   return result;
 * };
 * ```
 */
export const getJobLogger = (hasuraEvent: HasuraEventPayload, options: JobOptions): ScopedLogger => {
  // First try to get pre-injected logger (parallel-safe)
  if (options?.__logger) {
    return options.__logger;
  }

  // Fallback: create on-demand (for backward compatibility)
  const correlationId = hasuraEvent?.__correlationId || ('' as CorrelationId);
  const jobName = options?.jobName || ('unknown' as JobName);

  return createScopedLogger(
    {
      jobName,
      correlationId,
    },
    jobName as string // Use job name as automatic prefix
  );
};

