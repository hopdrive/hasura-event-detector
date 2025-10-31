import { BasePlugin } from '../../plugin';
import {
  type PluginConfig,
  type CorrelationId,
  type EventName,
  type JobName,
  type JobResult,
  type JobOptions,
  type HasuraEventPayload,
  type ListenToOptions,
  type ListenToResponse,
  type LogEntry
} from '../../types';

export interface SimpleLoggingConfig extends PluginConfig {
  format: 'simple' | 'structured' | 'json';
  includeTimestamp: boolean;
  includeCorrelationId: boolean;
  includeJobContext: boolean;
  logLevel: LogEntry['level'];
  colorize: boolean;
  prefix: string;
}

type LogLevel = LogEntry['level'];

interface LogLevels {
  debug: number;
  info: number;
  warn: number;
  error: number;
}

interface Colors {
  debug: string;
  info: string;
  warn: string;
  error: string;
  reset: string;
  bold: string;
  dim: string;
}

/**
 * SimpleLoggingPlugin - Listens to log events and performs structured console logging
 *
 * This plugin listens to the onLog hook and provides enhanced console logging
 * with structured formatting, job context, and correlation ID tracking.
 *
 * Unlike ConsoleInterceptorPlugin which monkey-patches console methods,
 * this plugin only responds to log events triggered through the plugin system.
 */
export class SimpleLoggingPlugin extends BasePlugin<SimpleLoggingConfig> {
  private readonly logLevels: LogLevels;
  private readonly colors: Colors;

  constructor(config: Partial<SimpleLoggingConfig> = {}) {
    const defaultConfig: SimpleLoggingConfig = {
      enabled: true,
      format: 'structured',
      includeTimestamp: true,
      includeCorrelationId: true,
      includeJobContext: true,
      logLevel: 'info',
      colorize: true,
      prefix: '[HED]',
      ...config,
    };

    super(defaultConfig);

    // Log level hierarchy for filtering
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    // Console colors
    this.colors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      reset: '\x1b[0m', // Reset
      bold: '\x1b[1m', // Bold
      dim: '\x1b[2m', // Dim
    };
  }

  override async initialize() {
    if (!this.config.enabled) return;

    // Note: Can't use internal logger here as it depends on plugin system
    // This is the bootstrap phase, so console.log is appropriate
    console.log('[SimpleLoggingPlugin] Initialized successfully');
  }

  /**
   * Handle log events from the plugin system
   */
  override async onLog(level: LogLevel, message: string, data: any, jobName: JobName, correlationId: CorrelationId) {
    if (!this.config.enabled) return;

    // Filter by log level
    if (!this.shouldLog(level)) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: level,
      message: message,
      correlationId: correlationId,
      jobName: jobName,
      source: data?.source || 'unknown',
      rawData: data,
    };

    this.outputLog(logEntry);
  }

  /**
   * Check if we should log based on configured log level
   */
  shouldLog(level: string): boolean {
    const currentLevel = this.logLevels[level as keyof LogLevels] || 1;
    const minimumLevel = this.logLevels[this.config.logLevel] || 1;
    return currentLevel >= minimumLevel;
  }

  /**
   * Output formatted log entry
   */
  outputLog(logEntry: any): void {
    switch (this.config.format) {
      case 'json':
        this.outputJsonLog(logEntry);
        break;
      case 'structured':
        this.outputStructuredLog(logEntry);
        break;
      case 'simple':
      default:
        this.outputSimpleLog(logEntry);
        break;
    }
  }

  /**
   * Output simple formatted log
   */
  outputSimpleLog(logEntry: any) {
    const parts = [];

    if (this.config.includeTimestamp) {
      parts.push(this.colorize('dim', new Date(logEntry.timestamp).toLocaleTimeString()));
    }

    parts.push(this.config.prefix);
    parts.push(this.colorize(logEntry.level, `[${logEntry.level.toUpperCase()}]`));

    if (this.config.includeJobContext && logEntry.jobName) {
      parts.push(this.colorize('bold', `[${logEntry.jobName}]`));
    }

    if (this.config.includeCorrelationId && logEntry.correlationId) {
      parts.push(this.colorize('dim', `[${logEntry.correlationId.split('.')[0]}]`));
    }

    parts.push(logEntry.message);

    // Use appropriate console method
    const consoleMethod = this.getConsoleMethod(logEntry.level);
    consoleMethod(parts.join(' '));
  }

  /**
   * Output structured formatted log
   */
  outputStructuredLog(logEntry: any): void {
    const timestamp = this.config.includeTimestamp
      ? this.colorize('dim', `[${new Date(logEntry.timestamp).toLocaleTimeString()}]`)
      : '';

    const levelBadge = this.colorize(logEntry.level, `[${logEntry.level.toUpperCase()}]`);

    const context = [];
    if (this.config.includeJobContext && logEntry.jobName) {
      context.push(`job: ${this.colorize('bold', logEntry.jobName)}`);
    }

    if (this.config.includeCorrelationId && logEntry.correlationId) {
      context.push(`correlation: ${this.colorize('dim', logEntry.correlationId)}`);
    }

    if (logEntry.source && logEntry.source !== 'unknown') {
      context.push(`source: ${this.colorize('dim', logEntry.source)}`);
    }

    const contextStr = context.length > 0 ? ` ${this.colorize('dim', `{${context.join(', ')}}`)}` : '';

    const logLine = `${timestamp} ${this.config.prefix} ${levelBadge}${contextStr} ${logEntry.message}`;

    // Use appropriate console method
    const consoleMethod = this.getConsoleMethod(logEntry.level);
    consoleMethod(logLine);
  }

  /**
   * Output JSON formatted log
   */
  outputJsonLog(logEntry: any) {
    const jsonLog: any = {
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      message: logEntry.message,
      correlationId: logEntry.correlationId,
      jobName: logEntry.jobName,
      source: logEntry.source,
    };

    // Add raw data if available
    if (logEntry.rawData) {
      jsonLog.data = logEntry.rawData;
    }

    // Use appropriate console method
    const consoleMethod = this.getConsoleMethod(logEntry.level);
    consoleMethod(JSON.stringify(jsonLog));
  }

  /**
   * Apply colors if colorize is enabled
   */
  colorize(level: string, text: string): string {
    if (!this.config.colorize) return text;

    const color = this.colors[level as keyof Colors] || this.colors.reset;
    return `${color}${text}${this.colors.reset}`;
  }

  /**
   * Get appropriate console method for log level
   */
  getConsoleMethod(level: string) {
    switch (level) {
      case 'error':
        return console.error;
      case 'warn':
        return console.warn;
      case 'debug':
      case 'info':
      default:
        return console.log;
    }
  }

  /**
   * Log invocation start
   */
  override async onInvocationStart(hasuraEvent: HasuraEventPayload, options: any) {
    if (!this.config.enabled) return;

    const sourceFunction = options.sourceFunction || 'unknown';
    await this.onLog(
      'info',
      `Starting invocation: ${sourceFunction}`,
      {
        source: 'invocation_start',
        hasuraEventId: hasuraEvent?.id,
        operation: hasuraEvent?.event?.op,
      },
      '' as JobName,
      (hasuraEvent?.__correlationId || '') as CorrelationId
    );
  }

  /**
   * Log invocation end
   */
  override async onInvocationEnd(hasuraEvent: HasuraEventPayload, result: any) {
    if (!this.config.enabled) return;

    const durationMs = result?.durationMs || 0;
    const eventsCount = result?.events?.length || 0;
    const totalJobs = result?.events?.reduce((sum: number, event: any) => sum + (event?.jobs?.length || 0), 0) || 0;

    await this.onLog(
      'info',
      `Completed invocation in ${durationMs}ms: ${eventsCount} events, ${totalJobs} jobs`,
      {
        source: 'invocation_end',
        durationMs,
        eventsCount,
        totalJobs,
      },
      '' as JobName,
      (hasuraEvent?.__correlationId || '') as CorrelationId
    );
  }

  /**
   * Log job start
   */
  override async onJobStart(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ) {
    if (!this.config.enabled) return;

    await this.onLog(
      'debug',
      `Starting job: ${jobName}`,
      {
        source: 'job_start',
        eventName,
        jobOptions: Object.keys(jobOptions || {}).length > 0 ? Object.keys(jobOptions) : null,
      },
      jobName,
      hasuraEvent?.__correlationId as CorrelationId
    );
  }

  /**
   * Log job end
   */
  override async onJobEnd(jobName: JobName, result: JobResult, eventName: EventName, hasuraEvent: HasuraEventPayload) {
    if (!this.config.enabled) return;

    const durationMs = result?.durationMs || 0;
    const success = !result?.result || typeof result.result !== 'string' || !result.result.includes('crashed');

    await this.onLog(
      success ? 'info' : 'error',
      `${success ? 'Completed' : 'Failed'} job: ${jobName} in ${durationMs}ms`,
      {
        source: 'job_end',
        eventName,
        durationMs,
        success,
        result: result?.result,
      },
      jobName,
      hasuraEvent?.__correlationId as CorrelationId
    );
  }

  /**
   * Log errors
   */
  override async onError(error: Error, context: any, correlationId: CorrelationId) {
    if (!this.config.enabled) return;

    await this.onLog(
      'error',
      `Error in ${context}: ${error.message}`,
      {
        source: 'error',
        context,
        errorName: error.name,
        errorStack: error.stack,
      },
      '' as JobName,
      correlationId
    );
  }

  override getStatus() {
    return {
      ...super.getStatus(),
      format: this.config.format,
      logLevel: this.config.logLevel,
      colorize: this.config.colorize,
    };
  }
}

// Export the plugin class