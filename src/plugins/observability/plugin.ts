import { Pool, PoolClient } from 'pg';
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
  database: DatabaseConfig & {
    connectionString?: string | undefined;
  };
  schema: string;
  captureJobOptions: boolean;
  captureHasuraPayload: boolean;
  captureErrorStacks: boolean;
  batchSize: number;
  flushInterval: number;
  retryAttempts: number;
  retryDelay: number;
}

interface BufferedInvocation {
  id: string;
  correlation_id: CorrelationId;
  source_function: string;
  source_table: string;
  source_operation: string;
  source_system: string;
  source_event_id: string | null;
  source_event_payload: Record<string, any> | null;
  source_event_time: Date;
  source_user_email: string | null;
  source_user_role: string | null;
  auto_load_modules: boolean;
  event_modules_directory: string;
  context_data: Record<string, any> | null;
  status: string;
  created_at: Date;
  updated_at?: Date;
  total_duration_ms: number | null;
  events_detected_count: number;
  total_jobs_run: number;
  total_jobs_succeeded: number;
  total_jobs_failed: number;
  error_message: string | null;
  error_stack: string | null;
}

interface BufferedEventExecution {
  id: string;
  invocation_id: string;
  correlation_id: CorrelationId;
  event_name: EventName;
  event_module_path: string | null;
  detected: boolean;
  detection_duration_ms: number | null;
  detection_error: string | null;
  detection_error_stack: string | null;
  handler_duration_ms: number | null;
  handler_error: string | null;
  handler_error_stack: string | null;
  jobs_count: number;
  jobs_succeeded: number;
  jobs_failed: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface BufferedJobExecution {
  id: string;
  invocation_id: string;
  event_execution_id: string;
  correlation_id: CorrelationId;
  job_name: JobName;
  job_function_name: string | null;
  job_options: Record<string, any> | null;
  duration_ms: number | null;
  status: string;
  result: Record<string, any> | null;
  error_message: string | null;
  error_stack: string | null;
  created_at: Date;
  updated_at: Date;
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
  private pool: Pool | null = null;
  private buffer: {
    invocations: Map<string, BufferedInvocation>;
    eventExecutions: Map<string, BufferedEventExecution>;
    jobExecutions: Map<string, BufferedJobExecution>;
  };
  private flushTimer: NodeJS.Timeout | null = null;
  private isInitialized: boolean = false;
  private activeInvocations: Map<CorrelationId, string> = new Map(); // Track correlation ID -> invocation ID mapping
  private activeEventExecutions: Map<string, string> = new Map(); // Track "${correlationId}:${eventName}" -> event execution ID
  private activeJobExecutions: Map<string, string> = new Map(); // Track "${correlationId}:${eventName}:${jobName}" -> job execution ID

  constructor(config: Partial<ObservabilityConfig> = {}) {
    const defaultConfig: ObservabilityConfig = {
      enabled: false,
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
      ...config,
    };

    super(defaultConfig);

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
      // Validate configuration
      if (!this.config.database.connectionString && !this.config.database.host) {
        throw new Error('Database connection configuration is required');
      }

      // Initialize connection pool
      this.pool = new Pool(this.config.database);

      // Test connection
      const client: PoolClient = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      // Setup periodic flush
      this.flushTimer = setInterval(() => {
        this.flush().catch(error => {
          logError('ObservabilityPlugin', 'Flush error', error);
        });
      }, this.config.flushInterval);

      // Setup graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());

      this.isInitialized = true;
      log('ObservabilityPlugin', 'Initialized successfully');
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

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    // Clean up tracking maps
    this.activeInvocations.clear();
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
    const record = {
      id,
      correlation_id: data.correlationId,
      source_function: data.sourceFunction,
      source_table: data.sourceTable,
      source_operation: data.sourceOperation,
      source_system: 'hasura', // Default to hasura, can be overridden
      source_user: data.sourceUser,
      source_job_id: data.sourceJobId || null, // From tracking token extraction
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
    if (!record) return;

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
   * Flush buffered data to database
   */
  async flush() {
    if (!this.config.enabled || !this.pool || !this.isInitialized) return;

    const hasData =
      this.buffer.invocations.size > 0 || this.buffer.eventExecutions.size > 0 || this.buffer.jobExecutions.size > 0;

    if (!hasData) return;

    let client;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');

      // Insert/update invocations
      if (this.buffer.invocations.size > 0) {
        const res = await this.bulkUpsertInvocations(client, Array.from(this.buffer.invocations.values()));
        this.buffer.invocations.clear();
      }

      // Insert event executions
      if (this.buffer.eventExecutions.size > 0) {
        await this.bulkInsertEventExecutions(client, Array.from(this.buffer.eventExecutions.values()));
        this.buffer.eventExecutions.clear();
      }

      // Insert job executions
      if (this.buffer.jobExecutions.size > 0) {
        await this.bulkInsertJobExecutions(client, Array.from(this.buffer.jobExecutions.values()));
        this.buffer.jobExecutions.clear();
      }

      await client.query('COMMIT');
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      logError('ObservabilityPlugin', 'Flush failed', error as Error);

      // Retry logic could be added here
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Bulk insert/update invocations
   */
  async bulkUpsertInvocations(client: PoolClient, records: BufferedInvocation[]): Promise<void> {
    if (records.length === 0) return;

    const columns = [
      'id',
      'correlation_id',
      'source_function',
      'source_table',
      'source_operation',
      'source_system',
      'source_event_id',
      'source_event_payload',
      'source_event_time',
      'source_user_email',
      'source_user_role',
      'total_duration_ms',
      'events_detected_count',
      'total_jobs_run',
      'total_jobs_succeeded',
      'total_jobs_failed',
      'auto_load_modules',
      'event_modules_directory',
      'status',
      'error_message',
      'error_stack',
      'context_data',
      'created_at',
      'updated_at',
    ];

    const values = records.map((record: any) => columns.map((col: string) => this.serializeValue(record[col])));

    const placeholders = values
      .map(
        (_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
      )
      .join(', ');

    const updateSet = columns
      .filter((col: string) => col !== 'id' && col !== 'created_at')
      .map((col: string) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const query = `
      INSERT INTO invocations (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    const res = await client.query(query, values.flat());
    console.log('Bulk upsert invocations result:', res);
  }

  /**
   * Bulk insert event executions
   */
  async bulkInsertEventExecutions(client: PoolClient, records: BufferedEventExecution[]): Promise<void> {
    if (records.length === 0) return;

    const columns = [
      'id',
      'invocation_id',
      'correlation_id',
      'event_name',
      'event_module_path',
      'detected',
      'detection_duration_ms',
      'detection_error',
      'detection_error_stack',
      'handler_duration_ms',
      'handler_error',
      'handler_error_stack',
      'jobs_count',
      'jobs_succeeded',
      'jobs_failed',
      'status',
      'created_at',
      'updated_at',
    ];

    const values = records.map((record: any) => columns.map((col: string) => this.serializeValue(record[col])));

    const placeholders = values
      .map(
        (_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
      )
      .join(', ');

    const query = `
      INSERT INTO event_executions (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO NOTHING
    `;

    await client.query(query, values.flat());
  }

  /**
   * Bulk insert job executions
   */
  async bulkInsertJobExecutions(client: PoolClient, records: BufferedJobExecution[]): Promise<void> {
    if (records.length === 0) return;

    const columns = [
      'id',
      'invocation_id',
      'event_execution_id',
      'correlation_id',
      'job_name',
      'job_function_name',
      'job_options',
      'duration_ms',
      'status',
      'result',
      'error_message',
      'error_stack',
      'created_at',
      'updated_at',
    ];

    const values = records.map((record: any) => columns.map((col: string) => this.serializeValue(record[col])));

    const placeholders = values
      .map(
        (_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
      )
      .join(', ');

    const query = `
      INSERT INTO job_executions (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO NOTHING
    `;

    await client.query(query, values.flat());
  }

  /**
   * Serialize values for database insertion
   */
  serializeValue(value: any): any {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object' && !(value instanceof Date)) {
      return JSON.stringify(value);
    }
    return value;
  }

  // Plugin Hook Implementations
  // These methods are called automatically by the listenTo function

  /**
   * Called when listenTo() starts processing
   */
  override async onInvocationStart(
    hasuraEvent: HasuraEventPayload,
    options: ListenToOptions
  ): Promise<void> {
    if (!this.config.enabled) return;

    const { dbEvent } = parseHasuraEvent(hasuraEvent);

    const invocationData = {
      correlationId: hasuraEvent.__correlationId,
      sourceFunction: options.sourceFunction || 'unknown',
      sourceTable: `${hasuraEvent?.table?.schema || 'public'}.${hasuraEvent?.table?.name || 'unknown'}`,
      sourceOperation: hasuraEvent.event?.op || 'MANUAL',
      sourceUser:
        hasuraEvent.event?.session_variables?.['x-hasura-user-id'] ||
        hasuraEvent.event?.session_variables?.['x-hasura-user-email'] ||
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
      log('ObservabilityPlugin', `Recorded invocation start: ${invocationId} for correlation: ${hasuraEvent.__correlationId}`);
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

    const endData = {
      durationMs: result.durationMs || durationMs,
      eventsDetectedCount: result.events.length, // All events that were processed
      totalJobsRun,
      totalJobsSucceeded,
      totalJobsFailed,
      status: totalJobsFailed > 0 ? 'failed' : 'completed',
      errorMessage: null,
      errorStack: null,
    };

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
      Object.assign(eventRecord, {
        handler_duration_ms: durationMs,
        jobs_count: jobResults.length,
        jobs_succeeded: jobsSucceeded,
        jobs_failed: jobsFailed,
        status: 'completed',
        updated_at: new Date(),
      });

      this.buffer.eventExecutions.set(eventExecutionId, eventRecord);
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
    };
  }
}