import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { BasePlugin } from '../../src/plugin.js';
import { log, logError } from '@/helpers/log.js';
import type {
  PluginConfig,
  CorrelationId,
  EventName,
  JobName,
  JobResult,
  JobOptions,
  HasuraEventPayload,
  ListenToOptions,
  ListenToResponse,
  DatabaseConfig,
  HasuraOperation
} from '@/types/index.js';

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

interface ObservabilityConfig extends PluginConfig {
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
  hasura_event_id: string | null;
  hasura_event_payload: Record<string, any> | null;
  hasura_event_time: Date;
  hasura_user_email: string | null;
  hasura_user_role: string | null;
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
      schema: 'event_detector_observability',
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
      hasura_event_id: data.hasuraEventId,
      hasura_event_payload: this.config.captureHasuraPayload ? data.hasuraEventPayload : null,
      hasura_event_time: data.hasuraEventTime,
      hasura_user_email: data.hasuraUserEmail,
      hasura_user_role: data.hasuraUserRole,
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
  async recordJobExecution(invocationId: string | null, eventExecutionId: string | null, data: any): Promise<string | null> {
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
        await this.bulkUpsertInvocations(client, Array.from(this.buffer.invocations.values()));
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
      'hasura_event_id',
      'hasura_event_payload',
      'hasura_event_time',
      'hasura_user_email',
      'hasura_user_role',
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
      .map((_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`)
      .join(', ');

    const updateSet = columns
      .filter((col: string) => col !== 'id' && col !== 'created_at')
      .map((col: string) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const query = `
      INSERT INTO ${this.config.schema}.invocations (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    await client.query(query, values.flat());
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
      .map((_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`)
      .join(', ');

    const query = `
      INSERT INTO ${this.config.schema}.event_executions (${columns.join(', ')})
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
      .map((_: any, i: number) => `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`)
      .join(', ');

    const query = `
      INSERT INTO ${this.config.schema}.job_executions (${columns.join(', ')})
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

  /**
   * Get plugin status and statistics
   */
  override getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config,
    };
  }
}

// Export the plugin class