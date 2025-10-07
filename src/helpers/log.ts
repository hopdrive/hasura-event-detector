/**
 * Internal logger for Hasura Event Detector system
 *
 * This logger integrates with the plugin system when available to ensure
 * consistent logging behavior across the entire system.
 */

import type { PluginManager } from '@/plugin';
import type { JobName, CorrelationId } from '../types';

let pluginManager: PluginManager | null = null;
let consoleLoggingEnabled = false;

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
 * Internal log function that uses plugin system when available
 */
export const log = (prefix: string, message: string, ...args: any[]): void => {
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
        },
        'system' as JobName,
        '' as CorrelationId
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
 * Internal error logging function
 */
export const logError = (prefix: string, message: string, error: Error | null = null, ...args: any[]): void => {
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
        },
        'system' as JobName,
        '' as CorrelationId
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
 * Internal warning logging function
 */
export const logWarn = (prefix: string, message: string, ...args: any[]): void => {
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
        },
        'system' as JobName,
        '' as CorrelationId
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
 * Get current plugin manager (for testing/debugging)
 */
export const getPluginManager = (): PluginManager | null => pluginManager;

