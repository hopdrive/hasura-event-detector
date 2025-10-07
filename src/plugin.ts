/**
 * Plugin System for Hasura Event Detector
 *
 * This module provides a base plugin architecture that allows multiple plugins
 * to hook into the event detector lifecycle. Plugins can observe and react to
 * various events during execution (invocation start/end, event detection, job execution, etc.)
 */

import { log, logError, logWarn } from '@/helpers/log';
import type {
  PluginConfig,
  PluginName,
  EventName,
  JobName,
  JobResult,
  CorrelationId,
  HasuraEventPayload,
  ListenToOptions,
  ListenToResponse,
  JobOptions,
  LogEntry,
  BasePluginInterface,
  PluginManagerInterface,
  PluginLifecycleHooks,
} from './types';

/**
 * Base Plugin Interface
 * All plugins should extend this class and implement the hooks they need
 */
export class BasePlugin<TConfig extends PluginConfig = PluginConfig> implements BasePluginInterface<TConfig> {
  public readonly name: PluginName;
  public readonly config: TConfig;
  public enabled: boolean;

  constructor(config: TConfig = {} as TConfig) {
    this.config = config;
    this.enabled = config.enabled !== false; // Default to enabled
    this.name = this.constructor.name as PluginName;
  }

  // Lifecycle hooks - plugins can override any of these

  /**
   * Called when plugin system initializes
   */
  async initialize(): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before listenTo() starts processing
   */
  async onInvocationStart(hasuraEvent: HasuraEventPayload, options: ListenToOptions): Promise<void> {
    // Override in subclass
  }

  /**
   * Called when listenTo() completes
   */
  async onInvocationEnd(hasuraEvent: HasuraEventPayload, result: ListenToResponse, durationMs: number): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before event detection starts
   */
  async onEventDetectionStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void> {
    // Override in subclass
  }

  /**
   * Called after event detection completes
   */
  async onEventDetectionEnd(
    eventName: EventName,
    detected: boolean,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before event handler starts (only for detected events)
   */
  async onEventHandlerStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void> {
    // Override in subclass
  }

  /**
   * Called after event handler completes
   */
  async onEventHandlerEnd(
    eventName: EventName,
    jobResults: JobResult[],
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    // Override in subclass
  }

  /**
   * Called before a job starts executing
   * Plugins can modify jobOptions to inject values
   */
  async onJobStart(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void> {
    // Override in subclass
  }

  /**
   * Called after a job completes (success or failure)
   */
  async onJobEnd(
    jobName: JobName,
    result: JobResult,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    // Override in subclass
  }

  /**
   * Called when console logging occurs during job execution
   */
  async onLog(
    level: LogEntry['level'],
    message: string,
    data: any,
    jobName: JobName,
    correlationId: CorrelationId
  ): Promise<void> {
    // Override in subclass
  }

  /**
   * Called when an error occurs during execution
   */
  async onError(error: Error, context: string, correlationId: CorrelationId): Promise<void> {
    // Override in subclass
  }

  /**
   * Flush any buffered data without full shutdown
   */
  async flush(): Promise<void> {
    // Default no-op implementation
    // Override in plugins that buffer data (e.g., ObservabilityPlugin)
  }

  /**
   * Called during plugin shutdown
   */
  async shutdown(): Promise<void> {
    // Override in subclass
  }

  /**
   * Get plugin status and configuration info
   */
  getStatus(): {
    name: PluginName;
    enabled: boolean;
    config: TConfig;
  } {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config,
    };
  }
}

/**
 * Plugin Manager
 * Manages multiple plugins and coordinates their lifecycle
 */
export class PluginManager implements PluginManagerInterface {
  private plugins = new Map<PluginName, BasePluginInterface>();
  private _initialized: boolean = false;

  constructor() {
    // Use getter for readonly property
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Register a plugin
   */
  register<T extends BasePluginInterface>(plugin: T): this {
    if (!(plugin instanceof BasePlugin)) {
      throw new Error('Plugin must extend BasePlugin');
    }

    this.plugins.set(plugin.name, plugin);
    return this;
  }

  /**
   * Initialize all registered plugins
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        // Provide plugin manager reference to plugins that need it
        if (typeof (plugin as any).setPluginManager === 'function') {
          (plugin as any).setPluginManager(this);
        }

        await plugin.initialize?.();
        log('PluginSystem', `Initialized plugin: ${name}`);
      } catch (error) {
        logError('PluginSystem', `Failed to initialize plugin ${name}`, error as Error);
        // Disable failed plugin
        (plugin as any).enabled = false;
      }
    }

    this._initialized = true;
  }

  /**
   * Call a hook on all enabled plugins
   */
  async callHook(hookName: keyof PluginLifecycleHooks, ...args: any[]): Promise<void> {
    if (!this._initialized) {
      logWarn('PluginSystem', 'Attempting to call hook before initialization');
      return;
    }

    const promises: Promise<any>[] = [];

    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;
      const hookMethod = (plugin as any)[hookName];
      if (typeof hookMethod !== 'function') continue;

      promises.push(
        hookMethod.call(plugin, ...args).catch((error: Error) => {
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
   * Typed wrapper methods for plugin hooks - provide type safety
   */

  async callOnInvocationStart(
    hasuraEvent: HasuraEventPayload,
    options: ListenToOptions
  ): Promise<void> {
    return this.callHook('onInvocationStart', hasuraEvent, options);
  }

  async callOnInvocationEnd(
    hasuraEvent: HasuraEventPayload,
    result: ListenToResponse,
    durationMs: number
  ): Promise<void> {
    return this.callHook('onInvocationEnd', hasuraEvent, result, durationMs);
  }

  async callOnEventDetectionStart(
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void> {
    return this.callHook('onEventDetectionStart', eventName, hasuraEvent);
  }

  async callOnEventDetectionEnd(
    eventName: EventName,
    detected: boolean,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    return this.callHook('onEventDetectionEnd', eventName, detected, hasuraEvent, durationMs);
  }

  async callOnEventHandlerStart(
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void> {
    return this.callHook('onEventHandlerStart', eventName, hasuraEvent);
  }

  async callOnEventHandlerEnd(
    eventName: EventName,
    jobResults: JobResult[],
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    return this.callHook('onEventHandlerEnd', eventName, jobResults, hasuraEvent, durationMs);
  }

  async callOnJobStart(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void> {
    return this.callHook('onJobStart', jobName, jobOptions, eventName, hasuraEvent);
  }

  async callOnJobEnd(
    jobName: JobName,
    result: JobResult,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    return this.callHook('onJobEnd', jobName, result, eventName, hasuraEvent, durationMs);
  }

  async callOnLog(
    level: LogEntry['level'],
    message: string,
    data: any,
    jobName: JobName,
    correlationId: CorrelationId
  ): Promise<void> {
    // test
    console.log(`[callOnLog] level: ${level}`);
    console.log(`[callOnLog] data: `, JSON.stringify(data, null, 2));
    console.log(`[callOnLog] jobName: ${jobName}`);
    console.log(`[callOnLog] correlationId: ${correlationId}`);
    // test
    return this.callHook('onLog', level, message, data, jobName, correlationId);
  }

  async callOnError(
    error: Error,
    context: string,
    correlationId: CorrelationId
  ): Promise<void> {
    return this.callHook('onError', error, context, correlationId);
  }

  /**
   * Get a specific plugin by name
   */
  getPlugin<T extends BasePluginInterface = BasePluginInterface>(name: PluginName): T | null {
    return (this.plugins.get(name) as T) || null;
  }

  /**
   * Get all enabled plugins
   */
  getEnabledPlugins<T extends BasePluginInterface = BasePluginInterface>(): T[] {
    return Array.from(this.plugins.values()).filter(plugin => plugin.enabled) as T[];
  }

  /**
   * Shutdown all plugins
   */
  async shutdown(): Promise<void> {
    for (const [name, plugin] of this.plugins) {
      if (!plugin.enabled) continue;

      try {
        await plugin.shutdown?.();
        log('PluginSystem', `Shut down plugin: ${name}`);
      } catch (error) {
        logError('PluginSystem', `Failed to shutdown plugin ${name}`, error as Error);
      }
    }

    this._initialized = false;
  }

  /**
   * Get status of all plugins
   */
  getStatus(): {
    initialized: boolean;
    pluginCount: number;
    enabledCount: number;
    plugins: Record<string, ReturnType<BasePluginInterface['getStatus']>>;
  } {
    const status = {
      initialized: this._initialized,
      pluginCount: this.plugins.size,
      enabledCount: this.getEnabledPlugins().length,
      plugins: {} as Record<string, ReturnType<BasePluginInterface['getStatus']>>,
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
export const pluginManager = new PluginManager();

/**
 * Simple correlation ID utilities for UUID generation and validation
 */
export class CorrelationIdUtils {
  /**
   * Check if a value looks like a correlation ID (UUID)
   */
  static isCorrelationId(value: unknown): value is CorrelationId {
    if (!value || typeof value !== 'string') return false;

    // Simple UUID validation
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }
}