/**
 * Plugin System for Hasura Event Detector
 * 
 * This module provides a base plugin architecture that allows multiple plugins
 * to hook into the event detector lifecycle. Plugins can observe and react to
 * various events during execution (invocation start/end, event detection, job execution, etc.)
 */

const { log, logError, logWarn } = require('./helpers/log');

/**
 * Base Plugin Interface
 * All plugins should extend this class and implement the hooks they need
 */
class BasePlugin {
  constructor(config = {}) {
    this.config = config;
    this.enabled = config.enabled !== false; // Default to enabled
    this.name = this.constructor.name;
  }

  // Lifecycle hooks - plugins can override any of these

  /**
   * Called when plugin system initializes
   */
  async initialize() {
    // Override in subclass
  }

  /**
   * Called before listenTo() starts processing
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {Object} options - Options passed to listenTo()
   * @param {Object} context - Context object
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onInvocationStart(hasuraEvent, options, context, correlationId) {
    // Override in subclass
  }

  /**
   * Called when listenTo() completes
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {Object} result - Execution results
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onInvocationEnd(hasuraEvent, result, correlationId) {
    // Override in subclass
  }

  /**
   * Called before event detection starts
   * @param {string} eventName - Name of the event being checked
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onEventDetectionStart(eventName, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called after event detection completes
   * @param {string} eventName - Name of the event that was checked
   * @param {boolean} detected - Whether the event was detected
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onEventDetectionEnd(eventName, detected, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called before event handler starts (only for detected events)
   * @param {string} eventName - Name of the detected event
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onEventHandlerStart(eventName, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called after event handler completes
   * @param {string} eventName - Name of the detected event
   * @param {Array} jobResults - Results from all jobs
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onEventHandlerEnd(eventName, jobResults, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called before a job starts executing
   * @param {string} jobName - Name of the job function
   * @param {Object} jobOptions - Options passed to the job
   * @param {string} eventName - Name of the event that triggered this job
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onJobStart(jobName, jobOptions, eventName, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called after a job completes (success or failure)
   * @param {string} jobName - Name of the job function
   * @param {Object} result - Job execution result
   * @param {string} eventName - Name of the event that triggered this job
   * @param {Object} hasuraEvent - The Hasura event payload
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onJobEnd(jobName, result, eventName, hasuraEvent, correlationId) {
    // Override in subclass
  }

  /**
   * Called when console logging occurs during job execution
   * @param {string} level - Log level (info, error, warn, debug)
   * @param {string} message - Log message
   * @param {any} data - Additional log data
   * @param {string} jobName - Name of the job that logged
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onLog(level, message, data, jobName, correlationId) {
    // Override in subclass
  }

  /**
   * Called when an error occurs during execution
   * @param {Error} error - The error that occurred
   * @param {string} context - Context where error occurred (invocation, event, job)
   * @param {string} correlationId - Correlation ID for this execution chain
   */
  async onError(error, context, correlationId) {
    // Override in subclass
  }

  /**
   * Called during plugin shutdown
   */
  async shutdown() {
    // Override in subclass
  }

  /**
   * Get plugin status and configuration info
   */
  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config
    };
  }
}

/**
 * Plugin Manager
 * Manages multiple plugins and coordinates their lifecycle
 */
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.initialized = false;
  }

  /**
   * Register a plugin
   * @param {BasePlugin} plugin - Plugin instance to register
   */
  register(plugin) {
    if (!(plugin instanceof BasePlugin)) {
      throw new Error('Plugin must extend BasePlugin');
    }
    
    this.plugins.set(plugin.name, plugin);
    return this;
  }

  /**
   * Initialize all registered plugins
   */
  async initialize() {
    if (this.initialized) return;

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;
      
      try {
        // Provide plugin manager reference to plugins that need it
        if (typeof plugin.setPluginManager === 'function') {
          plugin.setPluginManager(this);
        }
        
        await plugin.initialize();
        log('PluginSystem', `Initialized plugin: ${name}`);
      } catch (error) {
        logError('PluginSystem', `Failed to initialize plugin ${name}`, error);
        // Disable failed plugin
        plugin.enabled = false;
      }
    }
    
    this.initialized = true;
  }

  /**
   * Call a hook on all enabled plugins
   * @param {string} hookName - Name of the hook to call
   * @param {...any} args - Arguments to pass to the hook
   */
  async callHook(hookName, ...args) {
    if (!this.initialized) {
      logWarn('PluginSystem', 'Attempting to call hook before initialization');
      return;
    }

    const promises = [];
    
    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;
      if (typeof plugin[hookName] !== 'function') continue;
      
      promises.push(
        plugin[hookName](...args).catch(error => {
          logError('PluginSystem', `Plugin ${name} hook ${hookName} failed`, error);
          return null;
        })
      );
    }

    if (promises.length > 0) {
      await Promise.allSettled(promises);
    }
  }

  /**
   * Get a specific plugin by name
   * @param {string} name - Plugin name
   * @returns {BasePlugin|null}
   */
  getPlugin(name) {
    return this.plugins.get(name) || null;
  }

  /**
   * Get all enabled plugins
   * @returns {BasePlugin[]}
   */
  getEnabledPlugins() {
    return Array.from(this.plugins.values()).filter(plugin => plugin.enabled);
  }

  /**
   * Shutdown all plugins
   */
  async shutdown() {
    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;
      
      try {
        await plugin.shutdown();
        log('PluginSystem', `Shut down plugin: ${name}`);
      } catch (error) {
        logError('PluginSystem', `Failed to shutdown plugin ${name}`, error);
      }
    }
    
    this.initialized = false;
  }

  /**
   * Get status of all plugins
   */
  getStatus() {
    const status = {
      initialized: this.initialized,
      pluginCount: this.plugins.size,
      enabledCount: this.getEnabledPlugins().length,
      plugins: {}
    };

    for (const [name, plugin] of this.plugins) {
      status.plugins[name] = plugin.getStatus();
    }

    return status;
  }
}

/**
 * Global plugin manager instance
 */
const pluginManager = new PluginManager();

/**
 * Correlation ID utilities
 */
class CorrelationIdUtils {
  /**
   * Check if a value looks like a correlation ID
   * @param {string} value - Value to check
   * @returns {boolean}
   */
  static isCorrelationId(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Format: {source_function}.{uuid}
    const parts = value.split('.');
    return parts.length === 2 && 
           parts[0].length > 0 && 
           parts[1].length > 0 &&
           /^[a-f0-9-]+$/i.test(parts[1]); // UUID-like format
  }

  /**
   * Generate a new correlation ID
   * @param {string} sourceFunction - Source function name
   * @returns {string}
   */
  static generate(sourceFunction) {
    const { v4: uuidv4 } = require('uuid');
    return `${sourceFunction}.${uuidv4()}`;
  }

  /**
   * Parse a correlation ID into components
   * @param {string} correlationId - Correlation ID to parse
   * @returns {Object|null}
   */
  static parse(correlationId) {
    if (!this.isCorrelationId(correlationId)) return null;
    
    const parts = correlationId.split('.');
    return {
      sourceFunction: parts[0],
      uuid: parts[1],
      full: correlationId
    };
  }
}

module.exports = {
  BasePlugin,
  PluginManager,
  CorrelationIdUtils,
  pluginManager // Export singleton instance
};