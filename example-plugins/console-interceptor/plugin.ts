import {
  BasePlugin,
  type PluginConfig,
  type CorrelationId,
  type EventName,
  type JobName,
  type JobResult,
  type JobOptions,
  type HasuraEventPayload,
  type LogEntry
} from '@hopdrive/hasura-event-detector';

interface ConsoleInterceptorConfig extends PluginConfig {
  levels: string[];
  includeTimestamp: boolean;
  includeJobContext: boolean;
}

interface JobContext {
  jobName: JobName;
  eventName: EventName;
  correlationId: CorrelationId;
  startTime: number;
}

/**
 * ConsoleInterceptorPlugin - Monkey-patches console methods to intercept ALL console logs
 *
 * This plugin captures console logs from ANY source within job execution context,
 * including direct console.log calls from jobs that don't use the hasura event detector logger.
 *
 * The intercepted logs are forwarded through the plugin system's onLog hook,
 * allowing other plugins (like SimpleLoggingPlugin) to handle the actual logging.
 */
export class ConsoleInterceptorPlugin extends BasePlugin<ConsoleInterceptorConfig> {
  private originalConsole: Record<string, any> = {};
  private isIntercepting: boolean = false;
  private currentJobContext: JobContext | null = null;
  private pluginManager: any = null;

  constructor(config: Partial<ConsoleInterceptorConfig> = {}) {
    const defaultConfig: ConsoleInterceptorConfig = {
      enabled: true,
      levels: ['log', 'error', 'warn', 'info'],
      includeTimestamp: true,
      includeJobContext: true,
      ...config,
    };

    super(defaultConfig);
  }

  override async initialize() {
    if (!this.config.enabled) return;

    // Note: Can't use internal logger here as it depends on plugin system
    // This is the bootstrap phase, so console.log is appropriate
    console.log('[ConsoleInterceptorPlugin] Initialized successfully');
  }

  /**
   * Called before a job starts executing
   * Sets up console interception for this specific job
   */
  override async onJobStart(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    correlationId: CorrelationId
  ) {
    if (!this.config.enabled) return;

    // Store job context for log attribution
    this.currentJobContext = {
      jobName,
      eventName,
      correlationId,
      startTime: Date.now(),
    };

    // Start intercepting console methods
    this.startIntercepting();
  }

  /**
   * Called after a job completes
   * Restores original console methods
   */
  override async onJobEnd(
    jobName: JobName,
    result: JobResult,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    correlationId: CorrelationId
  ) {
    if (!this.config.enabled) return;

    // Stop intercepting and restore original console
    this.stopIntercepting();

    // Clear job context
    this.currentJobContext = null;
  }

  /**
   * Start intercepting console methods
   */
  startIntercepting() {
    if (this.isIntercepting) return;

    // Store original console methods
    this.config.levels.forEach(level => {
      this.originalConsole[level] = console[level];

      // Replace with intercepted version
      console[level] = (...args) => {
        // Call original console method first
        this.originalConsole[level](...args);

        // Forward to plugin system for other plugins to handle
        this.forwardLogEvent(level, args);
      };
    });

    this.isIntercepting = true;
  }

  /**
   * Stop intercepting and restore original console methods
   */
  stopIntercepting() {
    if (!this.isIntercepting) return;

    // Restore original console methods
    this.config.levels.forEach(level => {
      if (this.originalConsole[level]) {
        console[level] = this.originalConsole[level];
      }
    });

    this.isIntercepting = false;
  }

  /**
   * Forward intercepted log to other plugins via the plugin manager
   */
  forwardLogEvent(level, args) {
    if (!this.currentJobContext) return;

    const logData = {
      level: level === 'log' ? 'info' : level, // Normalize 'log' to 'info'
      message: args.join(' '),
      rawArgs: args,
      timestamp: new Date(),
      jobContext: this.config.includeJobContext ? this.currentJobContext : null,
      source: 'console_interceptor',
    };

    // Forward to plugin manager's onLog hook
    // Note: We can't await here as console methods are synchronous
    if (this.pluginManager) {
      setImmediate(() => {
        this.pluginManager
          .callHook(
            'onLog',
            logData.level,
            logData.message,
            logData,
            this.currentJobContext.jobName,
            this.currentJobContext.correlationId
          )
          .catch(error => {
            // Use original console to avoid recursion
            this.originalConsole.error('[ConsoleInterceptorPlugin] Error forwarding log:', error.message);
          });
      });
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    this.stopIntercepting();
    // Note: Can't use internal logger here as it may already be torn down
    console.log('[ConsoleInterceptorPlugin] Shutdown complete');
  }

  /**
   * Attach plugin manager reference for forwarding logs
   */
  setPluginManager(pluginManager) {
    this.pluginManager = pluginManager;
  }

  override getStatus() {
    return {
      ...super.getStatus(),
      isIntercepting: this.isIntercepting,
      interceptedLevels: this.config.levels,
      currentJobContext: this.currentJobContext,
    };
  }
}

// Export the plugin class