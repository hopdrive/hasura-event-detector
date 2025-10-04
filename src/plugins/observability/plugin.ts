import { v4 as uuidv4 } from 'uuid';
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
  type DatabaseConfig,
  type HasuraOperation,
} from '../../types';
import { log, logError } from '../../helpers/log';
import { parseHasuraEvent } from '../../helpers/hasura';
import type { ConsoleServerConfig } from './console-server';
import type { ObservabilityTransport, BufferedInvocation, BufferedEventExecution, BufferedJobExecution } from './transports/types';
import { SQLTransport } from './transports/sql-transport';
import type { GraphQLConfig } from './transports/graphql-transport';

// Observability-specific types moved from core types
export interface ObservabilityMetrics {
  invocationCount: number;
  eventDetectionCount: number;
  jobExecutionCount: number;
  errorCount: number;
  avgDuration: number;
  correlationChainsActive: number;
}

export interface ObservabilityData {
  correlationId: CorrelationId;
  eventName?: EventName;
  jobName?: JobName;
  durationMs?: number;
  error?: Error;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface InvocationRecord {
  id: string;
  correlation_id: CorrelationId;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  event_count: number;
  job_count: number;
  error_count: number;
  hasura_event: Record<string, any>;
  context: Record<string, any>;
  created_at: Date;
}

export interface EventDetectionRecord {
  id: string;
  correlation_id: CorrelationId;
  invocation_id: string;
  event_name: EventName;
  detected: boolean;
  detection_duration_ms: number;
  hasura_operation: HasuraOperation;
  table_name: string;
  schema_name: string;
  created_at: Date;
}

export interface JobExecutionRecord {
  id: string;
  correlation_id: CorrelationId;
  invocation_id: string;
  event_detection_id: string;
  job_name: JobName;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: Record<string, any>;
  error?: string;
  options: Record<string, any>;
  created_at: Date;
}

export interface ObservabilityQueryVariables {
  correlationId?: CorrelationId;
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}

export interface ObservabilityConfig extends PluginConfig {
  enabled?: boolean;

  // Transport configuration
  transport?: 'sql' | 'graphql';  // Default: 'sql' for backward compatibility

  // SQL configuration (existing)
  database?: DatabaseConfig & {
    connectionString?: string | undefined;
  };

  // GraphQL configuration (new)
  graphql?: GraphQLConfig;

  // Shared configuration
  schema: string;
  captureJobOptions: boolean;
  captureHasuraPayload: boolean;
  captureErrorStacks: boolean;
  batchSize: number;
  flushInterval: number;
  retryAttempts: number;
  retryDelay: number;
  maxJsonSize: number;
  console?: ConsoleServerConfig;
}

/**
 * ObservabilityPlugin for Hasura Event Detector
 *
 * This plugin captures detailed execution metadata for event detection and job processing
 * to provide comprehensive observability and debugging capabilities. It uses buffered
 * writes to minimize performance impact while providing rich monitoring data.
 *
 * Extends BasePlugin to integrate with the plugin system and support correlation ID tracking.
 */
export class ObservabilityPlugin extends BasePlugin<ObservabilityConfig> {
  private transport: ObservabilityTransport | null = null;
  private buffer: {
    invocations: Map<string, BufferedInvocation>;
    eventExecutions: Map<string, BufferedEventExecution>;
    jobExecutions: Map<string, BufferedJobExecution>;
  };
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private activeInvocations: Map<CorrelationId, string> = new Map(); // Track correlation ID -> invocation ID mapping
  private completedInvocations: Set<string> = new Set(); // Track which invocations have completed
  private activeEventExecutions: Map<string, string> = new Map(); // Track "${correlationId}:${eventName}" -> event execution ID
  private activeJobExecutions: Map<string, string> = new Map(); // Track "${correlationId}:${eventName}:${jobName}" -> job execution ID

  constructor(config: Partial<ObservabilityConfig> = {}) {
    const defaultConfig: Partial<ObservabilityConfig> = {
      enabled: true,
      transport: 'sql',  // Default to SQL for backward compatibility
      database: {
        connectionString: process.env.OBSERVABILITY_DB_URL,
        host: process.env.OBSERVABILITY_DB_HOST || 'localhost',
        port: parseInt(process.env.OBSERVABILITY_DB_PORT || '5432'),
        database: process.env.OBSERVABILITY_DB_NAME || 'observability',
        user: process.env.OBSERVABILITY_DB_USER || 'postgres',
        password: process.env.OBSERVABILITY_DB_PASSWORD || '',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
      schema: 'public',
      captureJobOptions: true,
      captureHasuraPayload: true,
      captureErrorStacks: true,
      batchSize: 100,
      flushInterval: 5000, // ms
      retryAttempts: 3,
      retryDelay: 1000, // ms
      maxJsonSize: 1000000, // 1MB default limit
      console: {
        enabled: false,  // Console should only be started via CLI, not during normal operation
        port: 3001,
        host: 'localhost',
        serveInProduction: false,
      },
    };

    // Add graphql config if environment variable is set
    if (process.env.HASURA_GRAPHQL_ENDPOINT) {
      defaultConfig.graphql = {
        endpoint: process.env.HASURA_GRAPHQL_ENDPOINT,
        headers: process.env.HASURA_ADMIN_SECRET
          ? { 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET }
          : process.env.HASURA_JWT
          ? { 'authorization': `Bearer ${process.env.HASURA_JWT}` }
          : {},
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
      };
    }

    const mergedConfig = { ...defaultConfig, ...config } as ObservabilityConfig;
    super(mergedConfig);

    this.buffer = {
      invocations: new Map(),
      eventExecutions: new Map(),
      jobExecutions: new Map(),
    };

    // Auto-initialize if enabled
    if (this.config.enabled) {
      this.initialize().catch((error: Error) => {
        logError('ObservabilityPlugin', 'Auto-initialization failed', error);
      });
    }
  }

  override async initialize(): Promise<void> {
    if (!this.config.enabled || this.isInitialized) return;

    try {
      // Initialize appropriate transport based on configuration
      if (this.config.transport === 'graphql') {
        // Validate GraphQL configuration
        if (!this.config.graphql?.endpoint) {
          throw new Error('GraphQL endpoint is required when using GraphQL transport');
        }

        // Dynamically import GraphQLTransport to avoid ESM issues in CJS environments
        try {
          const { GraphQLTransport } = await import('./transports/graphql-transport');
          this.transport = new GraphQLTransport(this.config);
        } catch (importError) {
          logError('ObservabilityPlugin', 'Failed to load GraphQL transport', importError as Error);
          throw new Error(
            'Failed to load GraphQL transport. This may be due to ESM/CJS compatibility issues. ' +
            'Please ensure graphql-request is properly installed and your environment supports dynamic imports.'
          );
        }
      } else {
        // Default to SQL transport
        // Validate SQL configuration
        if (!this.config.database?.connectionString && !this.config.database?.host) {
          throw new Error('Database connection configuration is required for SQL transport');
        }

        this.transport = new SQLTransport(this.config);
      }

      // Initialize the selected transport
      await this.transport.initialize();

      // Setup periodic flush
      this.flushTimer = setInterval(() => {
        this.flush().catch(error => {
          logError('ObservabilityPlugin', 'Flush error', error);
        });
      }, this.config.flushInterval);

      // Console server is not started here - it should only be started via CLI
      // The console is a developer tool, not part of normal event handling

      this.isInitialized = true;
      log('ObservabilityPlugin', `Initialized successfully with ${this.config.transport || 'sql'} transport`);
    } catch (error) {
      logError('ObservabilityPlugin', 'Failed to initialize', error as Error);
      this.config.enabled = false;
      throw error;
    }
  }

  override async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Final flush
    await this.flush();

    // Shutdown transport
    if (this.transport) {
      await this.transport.shutdown();
      this.transport = null;
    }

    // Clean up tracking maps
    this.activeInvocations.clear();
    this.completedInvocations.clear();
    this.activeEventExecutions.clear();
    this.activeJobExecutions.clear();

    log('ObservabilityPlugin', 'Shutdown complete');
  }

  /**
   * Record the start of an invocation (call to listenTo)
   */
  async recordInvocationStart(data: any): Promise<string | null> {
    if (!this.config.enabled) return null;

    const id = uuidv4();
    const record: BufferedInvocation = {
      id,
      correlation_id: data.correlationId,
      source_function: data.sourceFunction,
      source_table: data.sourceTable,
      source_operation: data.sourceOperation,
      source_system: 'hasura', // Default to hasura, can be overridden
      source_event_id: data.hasuraEventId,
      source_event_payload: this.config.captureHasuraPayload ? data.hasuraEventPayload : null,
      source_event_time: data.hasuraEventTime,
      source_user_email: data.hasuraUserEmail,
      source_user_role: data.hasuraUserRole,
      auto_load_modules: data.autoLoadModules,
      event_modules_directory: data.eventModulesDirectory,
      context_data: data.contextData,
      status: 'running',
      created_at: new Date(),
      updated_at: new Date(), // Set initial updated_at to avoid NOT NULL constraint violation
      // Will be updated on completion
      total_duration_ms: null,
      events_detected_count: 0,
      total_jobs_run: 0,
      total_jobs_succeeded: 0,
      total_jobs_failed: 0,
      error_message: null,
      error_stack: null,
    };

    this.buffer.invocations.set(id, record);
    return id;
  }

  /**
   * Update invocation with completion data
   */
  async recordInvocationEnd(invocationId: string | null, data: any): Promise<void> {
    if (!this.config.enabled || !invocationId) return;

    const record = this.buffer.invocations.get(invocationId);
    if (!record) {
      log(
        'ObservabilityPlugin.recordInvocationEnd',
        `[FLUSH TIMING] Invocation record ${invocationId} not found in buffer - this should not happen`
      );
      return;
    }

    // Update the record with completion data
    Object.assign(record, {
      total_duration_ms: data.durationMs,
      events_detected_count: data.eventsDetectedCount || 0,
      total_jobs_run: data.totalJobsRun || 0,
      total_jobs_succeeded: data.totalJobsSucceeded || 0,
      total_jobs_failed: data.totalJobsFailed || 0,
      status: data.status || 'completed',
      error_message: data.errorMessage,
      error_stack: this.config.captureErrorStacks ? data.errorStack : null,
      updated_at: new Date(),
    });

    this.buffer.invocations.set(invocationId, record);

    // Mark this invocation as completed so it can be cleared on next flush
    this.completedInvocations.add(invocationId);
  }

  /**
   * Record event execution (detector + handler)
   */
  async recordEventExecution(invocationId: string | null, data: any): Promise<string | null> {
    if (!this.config.enabled || !invocationId) return null;

    const id = uuidv4();
    const record = {
      id,
      invocation_id: invocationId,
      correlation_id: data.correlationId,
      event_name: data.eventName,
      event_module_path: data.eventModulePath,
      detected: data.detected || false,
      detection_duration_ms: data.detectionDurationMs,
      detection_error: data.detectionError,
      detection_error_stack: this.config.captureErrorStacks ? data.detectionErrorStack : null,
      handler_duration_ms: data.handlerDurationMs,
      handler_error: data.handlerError,
      handler_error_stack: this.config.captureErrorStacks ? data.handlerErrorStack : null,
      jobs_count: data.jobsCount || 0,
      jobs_succeeded: data.jobsSucceeded || 0,
      jobs_failed: data.jobsFailed || 0,
      status: data.status || (data.detected ? 'completed' : 'not_detected'),
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.buffer.eventExecutions.set(id, record);
    return id;
  }

  /**
   * Record job execution
   */
  async recordJobExecution(
    invocationId: string | null,
    eventExecutionId: string | null,
    data: any
  ): Promise<string | null> {
    if (!this.config.enabled || !invocationId || !eventExecutionId) return null;

    const id = uuidv4();
    const record = {
      id,
      invocation_id: invocationId,
      event_execution_id: eventExecutionId,
      correlation_id: data.correlationId,
      job_name: data.jobName,
      job_function_name: data.jobFunctionName,
      job_options: this.config.captureJobOptions ? data.jobOptions : null,
      duration_ms: data.durationMs,
      status: data.status || 'running',
      result: data.result,
      error_message: data.errorMessage,
      error_stack: this.config.captureErrorStacks ? data.errorStack : null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.buffer.jobExecutions.set(id, record);
    return id;
  }

  /**
   * Flush buffered data to storage backend via transport
   */
  override async flush() {
    if (!this.config.enabled || !this.transport || !this.isInitialized) return;

    const hasData =
      this.buffer.invocations.size > 0 || this.buffer.eventExecutions.size > 0 || this.buffer.jobExecutions.size > 0;

    if (!hasData) {
      log('ObservabilityPlugin.flush', '[FLUSH TIMING] No data to flush - buffer is empty');
      return;
    }

    try {
      log(
        'ObservabilityPlugin.flush',
        `[FLUSH TIMING] Starting flush - invocations: ${this.buffer.invocations.size}, eventExecutions: ${this.buffer.eventExecutions.size}, jobExecutions: ${this.buffer.jobExecutions.size}`
      );

      // Use transport to flush data
      await this.transport.flush(this.buffer);

      // After successful flush, clean up completed invocations from buffer
      // This allows us to keep incomplete invocations in buffer until they complete
      let clearedCount = 0;
      for (const invocationId of this.completedInvocations) {
        if (this.buffer.invocations.delete(invocationId)) {
          clearedCount++;
        }
      }
      this.completedInvocations.clear();

      if (clearedCount > 0) {
        log('ObservabilityPlugin.flush', `[FLUSH TIMING] Cleared ${clearedCount} completed invocations from buffer`);
      }

      log('ObservabilityPlugin.flush', '[FLUSH TIMING] Flush completed successfully - data written to database');
    } catch (error) {
      logError('ObservabilityPlugin', 'Flush failed', error as Error);
      // Don't throw on flush errors to avoid breaking execution
      // Data will remain in buffer for next attempt
    }
  }

  // Plugin Hook Implementations
  // These methods are called automatically by the listenTo function

  /**
   * Called when listenTo() starts processing
   */
  override async onInvocationStart(hasuraEvent: HasuraEventPayload, options: ListenToOptions): Promise<void> {
    if (!this.config.enabled) return;

    const { dbEvent } = parseHasuraEvent(hasuraEvent);

    const invocationData = {
      correlationId: hasuraEvent.__correlationId,
      sourceFunction: options?.context?.functionName || hasuraEvent.trigger.name || 'unknown',
      sourceTable: `${hasuraEvent?.table?.schema || 'public'}.${hasuraEvent?.table?.name || 'unknown'}`,
      sourceOperation: hasuraEvent.event?.op || 'MANUAL',
      sourceUser:
        hasuraEvent.event?.session_variables?.['x-hasura-user-id'] ||
        hasuraEvent.event?.session_variables?.['x-hasura-user-email'] ||
        hasuraEvent.event?.session_variables?.['x-hasura-role'] ||
        null,
      sourceJobId: (hasuraEvent as any).__sourceJobId || null,
      hasuraEventId: hasuraEvent.id || null,
      hasuraEventPayload: hasuraEvent,
      hasuraEventTime: new Date(hasuraEvent.created_at || Date.now()),
      hasuraUserEmail: hasuraEvent.event?.session_variables?.['x-hasura-user-email'] || null,
      hasuraUserRole: hasuraEvent.event?.session_variables?.['x-hasura-role'] || null,
      autoLoadModules: options.autoLoadEventModules !== false,
      eventModulesDirectory: options.eventModulesDirectory || './events',
      contextData: hasuraEvent?.__context || null,
    };

    const invocationId = await this.recordInvocationStart(invocationData);
    if (invocationId) {
      this.activeInvocations.set(hasuraEvent.__correlationId as CorrelationId, invocationId);
      log(
        'ObservabilityPlugin',
        `Recorded invocation start: ${invocationId} for correlation: ${hasuraEvent.__correlationId}`
      );
    }
  }

  /**
   * Called when listenTo() completes
   */
  override async onInvocationEnd(
    hasuraEvent: HasuraEventPayload,
    result: ListenToResponse,
    durationMs: number
  ): Promise<void> {
    if (!this.config.enabled) return;

    const invocationId = this.activeInvocations.get(hasuraEvent?.__correlationId as CorrelationId);
    if (!invocationId) {
      logError(
        'ObservabilityPlugin',
        `Invocation ID not found for correlation ${hasuraEvent?.__correlationId} in onInvocationEnd`,
        new Error('Missing invocation ID')
      );
      return;
    }

    // Count job results
    let totalJobsRun = 0;
    let totalJobsSucceeded = 0;
    let totalJobsFailed = 0;

    result.events.forEach(event => {
      if (event.jobs) {
        totalJobsRun += event.jobs.length;
        event.jobs.forEach(jobResult => {
          if (jobResult.completed && !jobResult.error) {
            totalJobsSucceeded++;
          } else {
            totalJobsFailed++;
          }
        });
      }
    });

    // Determine final status based on timeout and failures
    let status = 'completed';
    if (result.timedOut) {
      status = 'timeout';
    } else if (totalJobsFailed > 0) {
      status = 'failed';
    }

    const endData = {
      durationMs: result.durationMs || durationMs,
      eventsDetectedCount: result.events.filter(e => e.detected).length, // Only count events where detected = true
      totalJobsRun,
      totalJobsSucceeded,
      totalJobsFailed,
      status,
      errorMessage: result.timedOut ? 'Function execution timed out' : null,
      errorStack: null,
    };

    log(
      'ObservabilityPlugin.onInvocationEnd',
      `[FLUSH TIMING] About to record invocation end for invocationId: ${invocationId}, status: ${status}, jobs: ${totalJobsRun}, succeeded: ${totalJobsSucceeded}, failed: ${totalJobsFailed}. Current buffer sizes - invocations: ${this.buffer.invocations.size}, eventExecutions: ${this.buffer.eventExecutions.size}, jobExecutions: ${this.buffer.jobExecutions.size}`
    );

    await this.recordInvocationEnd(invocationId, endData);
    this.activeInvocations.delete(hasuraEvent?.__correlationId as CorrelationId);

    log('ObservabilityPlugin', `Recorded invocation end: ${invocationId} (${endData.status})`);
  }

  /**
   * Called before event detection starts
   */
  override async onEventDetectionStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void> {
    // Will be implemented when event detection data is ready
  }

  /**
   * Called after event detection completes
   */
  override async onEventDetectionEnd(
    eventName: EventName,
    detected: boolean,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    if (!this.config.enabled) return;

    const invocationId = this.activeInvocations.get(hasuraEvent?.__correlationId as CorrelationId);
    if (!invocationId) return;

    const eventData = {
      correlationId: hasuraEvent?.__correlationId as CorrelationId,
      eventName,
      eventModulePath: `./events/${eventName}.ts`, // Standard event module path
      detected,
      detectionDurationMs: durationMs,
      detectionError: null,
      detectionErrorStack: null,
      handlerDurationMs: null,
      handlerError: null,
      handlerErrorStack: null,
      jobsCount: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      status: detected ? 'handling' : 'not_detected',
    };

    const eventExecutionId = await this.recordEventExecution(invocationId, eventData);
    if (eventExecutionId) {
      // Store event execution ID for later job tracking
      this.activeEventExecutions.set(`${hasuraEvent?.__correlationId as CorrelationId}:${eventName}`, eventExecutionId);
    }

    log('ObservabilityPlugin', `Recorded event execution: ${eventName} (${detected ? 'detected' : 'not detected'})`);
  }

  /**
   * Called when event handler starts executing
   */
  override async onEventHandlerStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void> {
    if (!this.config.enabled) return;

    log('ObservabilityPlugin', `Event handler starting: ${eventName}`);
  }

  /**
   * Called when event handler completes
   */
  override async onEventHandlerEnd(
    eventName: EventName,
    jobResults: JobResult[],
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    if (!this.config.enabled) return;

    const eventExecutionKey = `${hasuraEvent?.__correlationId as CorrelationId}:${eventName}`;
    const eventExecutionId = this.activeEventExecutions.get(eventExecutionKey);
    if (!eventExecutionId) return;

    // Count job results
    let jobsSucceeded = 0;
    let jobsFailed = 0;

    jobResults.forEach(result => {
      if (result.completed && !result.error) {
        jobsSucceeded++;
      } else {
        jobsFailed++;
      }
    });

    // Update the event execution record with handler results
    const eventRecord = this.buffer.eventExecutions.get(eventExecutionId);
    if (eventRecord) {
      log(
        'ObservabilityPlugin.onEventHandlerEnd',
        `[FLUSH TIMING] About to update event execution buffer for event: ${eventName}, eventExecutionId: ${eventExecutionId}, jobs: ${jobResults.length}, succeeded: ${jobsSucceeded}, failed: ${jobsFailed}`
      );

      Object.assign(eventRecord, {
        handler_duration_ms: durationMs,
        jobs_count: jobResults.length,
        jobs_succeeded: jobsSucceeded,
        jobs_failed: jobsFailed,
        status: 'completed',
        updated_at: new Date(),
      });

      this.buffer.eventExecutions.set(eventExecutionId, eventRecord);

      log(
        'ObservabilityPlugin.onEventHandlerEnd',
        `[FLUSH TIMING] Updated event execution buffer. Current buffer sizes - invocations: ${this.buffer.invocations.size}, eventExecutions: ${this.buffer.eventExecutions.size}, jobExecutions: ${this.buffer.jobExecutions.size}`
      );
    }

    // Clean up the event execution tracking
    this.activeEventExecutions.delete(eventExecutionKey);

    log(
      'ObservabilityPlugin',
      `Event handler completed: ${eventName} (${jobResults.length} jobs, ${jobsSucceeded} succeeded, ${jobsFailed} failed)`
    );
  }

  /**
   * Called when individual job starts
   */
  override async onJobStart(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void> {
    if (!this.config.enabled) return;

    const invocationId = this.activeInvocations.get(hasuraEvent?.__correlationId as CorrelationId);
    const eventExecutionId = this.activeEventExecutions.get(
      `${hasuraEvent?.__correlationId as CorrelationId}:${eventName}`
    );

    if (!invocationId) {
      logError(
        'ObservabilityPlugin',
        `Invocation ID not found for correlation ${hasuraEvent?.__correlationId}`,
        new Error('Missing invocation ID')
      );
      return;
    }

    if (!eventExecutionId) {
      logError(
        'ObservabilityPlugin',
        `Event execution ID not found for ${eventName} - possible missing onEventDetectionEnd call`,
        new Error('Missing event execution ID')
      );
      return;
    }

    // Try to get the actual function name from job options or use job name
    const functionName = jobOptions?.jobName || jobName;

    const jobData = {
      correlationId: hasuraEvent?.__correlationId as CorrelationId,
      jobName,
      jobFunctionName: functionName,
      jobOptions,
      durationMs: null,
      status: 'running',
      result: null,
      errorMessage: null,
      errorStack: null,
    };

    const jobExecutionId = await this.recordJobExecution(invocationId, eventExecutionId, jobData);
    if (jobExecutionId) {
      // Store job execution ID for completion tracking
      const jobExecutionKey = `${hasuraEvent?.__correlationId as CorrelationId}:${eventName}:${jobName}`;
      this.activeJobExecutions.set(jobExecutionKey, jobExecutionId);
    }

    log('ObservabilityPlugin', `Job started: ${jobName} for event ${eventName}`);
  }

  /**
   * Called when individual job completes
   */
  override async onJobEnd(
    jobName: JobName,
    result: JobResult,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void> {
    if (!this.config.enabled) return;

    const jobExecutionKey = `${hasuraEvent?.__correlationId as CorrelationId}:${eventName}:${jobName}`;
    const jobExecutionId = this.activeJobExecutions.get(jobExecutionKey);
    if (!jobExecutionId) {
      logError(
        'ObservabilityPlugin',
        `Job execution ID not found for ${jobName} - possible race condition or missing onJobStart call`,
        new Error('Missing job execution ID')
      );
      return;
    }

    // Update the job execution record with completion data
    const jobRecord = this.buffer.jobExecutions.get(jobExecutionId);
    if (jobRecord) {
      Object.assign(jobRecord, {
        duration_ms: durationMs,
        status: result.completed && !result.error ? 'completed' : 'failed',
        result: result.result,
        error_message: result.error?.message || (!result.completed ? 'Job failed to complete' : null),
        error_stack: this.config.captureErrorStacks ? result.error?.stack : null,
        updated_at: new Date(),
      });

      this.buffer.jobExecutions.set(jobExecutionId, jobRecord);
    }

    // Clean up job tracking
    this.activeJobExecutions.delete(jobExecutionKey);

    const status = result.completed && !result.error ? 'succeeded' : 'failed';
    log('ObservabilityPlugin', `Job completed: ${jobName} (${status}, ${durationMs}ms)`);
  }

  /**
   * Called when errors occur during processing
   */
  override async onError(error: Error, context: string, correlationId: CorrelationId): Promise<void> {
    if (!this.config.enabled) return;

    const invocationId = this.activeInvocations.get(correlationId);
    if (!invocationId) return;

    // Update the invocation record with error information
    const invocationRecord = this.buffer.invocations.get(invocationId);
    if (invocationRecord) {
      Object.assign(invocationRecord, {
        status: 'failed',
        error_message: error.message,
        error_stack: this.config.captureErrorStacks ? error.stack : null,
        updated_at: new Date(),
      });

      this.buffer.invocations.set(invocationId, invocationRecord);
    }

    // Also update any active event executions with the error if it's detection/handler related
    if (context === 'event_detection' || context === 'event_handler') {
      // Find all active event executions for this correlation ID
      this.activeEventExecutions.forEach((eventExecutionId, key) => {
        if (key.startsWith(correlationId)) {
          const eventRecord = this.buffer.eventExecutions.get(eventExecutionId);
          if (eventRecord) {
            if (context === 'event_detection') {
              Object.assign(eventRecord, {
                detection_error: error.message,
                detection_error_stack: this.config.captureErrorStacks ? error.stack : null,
                status: 'detection_failed',
                updated_at: new Date(),
              });
            } else if (context === 'event_handler') {
              Object.assign(eventRecord, {
                handler_error: error.message,
                handler_error_stack: this.config.captureErrorStacks ? error.stack : null,
                status: 'handler_failed',
                updated_at: new Date(),
              });
            }
            this.buffer.eventExecutions.set(eventExecutionId, eventRecord);
          }
        }
      });
    }

    logError('ObservabilityPlugin', `Error in ${context}`, error);
  }

  /**
   * Get plugin status and statistics
   */
  override getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config,
      activeTracking: {
        invocations: this.activeInvocations.size,
        eventExecutions: this.activeEventExecutions.size,
        jobExecutions: this.activeJobExecutions.size,
      },
      bufferSizes: {
        invocations: this.buffer.invocations.size,
        eventExecutions: this.buffer.eventExecutions.size,
        jobExecutions: this.buffer.jobExecutions.size,
      },
      console: {
        enabled: this.config.console?.enabled || false,
        running: false,  // Console is started separately via CLI, not by the plugin
        url: null,  // Console URL is only available when started via CLI
      },
    };
  }
}