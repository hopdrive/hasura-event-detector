/**
 * Internal logger for Hasura Event Detector system
 * 
 * This logger integrates with the plugin system when available to ensure
 * consistent logging behavior across the entire system.
 */

let pluginManager = null;

/**
 * Set the plugin manager instance for integrated logging
 */
const setPluginManager = (manager) => {
  pluginManager = manager;
};

/**
 * Internal log function that uses plugin system when available
 */
const log = (prefix, message, ...args) => {
  const formattedMessage = args.length > 0 ? 
    `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}` : 
    message;

  // If plugin system is available, use it for consistent logging
  if (pluginManager && pluginManager.initialized) {
    pluginManager.callHook('onLog', 'info', `[${prefix}] ${formattedMessage}`, {
      source: 'internal_logger',
      prefix,
      originalArgs: args
    }, 'system', null).catch(() => {
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
const logError = (prefix, message, error = null, ...args) => {
  const errorMessage = error ? `${message}: ${error.message}` : message;
  const formattedMessage = args.length > 0 ? 
    `${errorMessage} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}` : 
    errorMessage;

  if (pluginManager && pluginManager.initialized) {
    pluginManager.callHook('onLog', 'error', `[${prefix}] ${formattedMessage}`, {
      source: 'internal_logger',
      prefix,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : null,
      originalArgs: args
    }, 'system', null).catch(() => {
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
const logWarn = (prefix, message, ...args) => {
  const formattedMessage = args.length > 0 ? 
    `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}` : 
    message;

  if (pluginManager && pluginManager.initialized) {
    pluginManager.callHook('onLog', 'warn', `[${prefix}] ${formattedMessage}`, {
      source: 'internal_logger',
      prefix,
      originalArgs: args
    }, 'system', null).catch(() => {
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
const getPluginManager = () => pluginManager;

module.exports = { 
  log, 
  logError, 
  logWarn, 
  setPluginManager, 
  getPluginManager 
};
