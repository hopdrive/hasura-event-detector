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
  maxJsonSize: number;
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
      enabled: true,
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

    const values = records.map((record: any) => {
      const serializedValues = columns.map((col: string) => {
        const value = record[col];
        let serialized = this.serializeValue(value, col);

        // Debug problematic JSON values
        if (col.includes('payload') || col.includes('context') || col.includes('data')) {
          if (typeof serialized === 'string' && serialized.startsWith('{')) {
            try {
              JSON.parse(serialized);
            } catch (error) {
              logError('ObservabilityPlugin', `Invalid JSON in column ${col}`, error as Error);
              console.log('Problematic value:', { column: col, value, serialized });

              // Replace with safe fallback
              serialized = JSON.stringify({
                _json_error: 'Invalid JSON detected during database insertion',
                _column: col,
                _error: (error as Error).message,
                _timestamp: new Date().toISOString(),
              });
            }
          }
        }

        return serialized;
      });

      return serializedValues;
    });

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

    try {
      // Validate all JSON values before sending to database
      this.validateJsonValues(values, 'invocations');

      const res = await client.query(query, values.flat());
      console.log('Bulk upsert invocations result:', res);
    } catch (error) {
      logError('ObservabilityPlugin', 'Database query failed for invocations', error as Error);
      console.log('Query values sample:', values.slice(0, 1)); // Log first record for debugging

      // Log the actual query and values for debugging
      console.log('Query:', query);
      console.log('Values length:', values.flat().length);
      console.log('First few values:', values.flat().slice(0, 10));

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'invocations');

      throw error;
    }
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

    const values = records.map((record: any) => {
      const serializedValues = columns.map((col: string) => {
        const value = record[col];
        let serialized = this.serializeValue(value, col);

        // Debug problematic JSON values
        if (col.includes('error') || col.includes('stack')) {
          if (typeof serialized === 'string' && serialized.startsWith('{')) {
            try {
              JSON.parse(serialized);
            } catch (error) {
              logError('ObservabilityPlugin', `Invalid JSON in column ${col}`, error as Error);
              console.log('Problematic value:', { column: col, value, serialized });

              // Replace with safe fallback
              serialized = JSON.stringify({
                _json_error: 'Invalid JSON detected during database insertion',
                _column: col,
                _error: (error as Error).message,
                _timestamp: new Date().toISOString(),
              });
            }
          }
        }

        return serialized;
      });

      return serializedValues;
    });

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
      INSERT INTO event_executions (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    try {
      // Validate all JSON values before sending to database
      this.validateJsonValues(values, 'event_executions');

      await client.query(query, values.flat());
    } catch (error) {
      logError('ObservabilityPlugin', 'Database query failed for event executions', error as Error);
      console.log('Query values sample:', values.slice(0, 1)); // Log first record for debugging

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'event_executions');

      throw error;
    }
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

    const values = records.map((record: any) => {
      const serializedValues = columns.map((col: string) => {
        const value = record[col];
        let serialized = this.serializeValue(value, col);

        // Debug problematic JSON values
        if (col.includes('options') || col.includes('result') || col.includes('error')) {
          if (typeof serialized === 'string' && serialized.startsWith('{')) {
            try {
              JSON.parse(serialized);
            } catch (error) {
              logError('ObservabilityPlugin', `Invalid JSON in column ${col}`, error as Error);
              console.log('Problematic value:', { column: col, value, serialized });

              // Replace with safe fallback
              serialized = JSON.stringify({
                _json_error: 'Invalid JSON detected during database insertion',
                _column: col,
                _error: (error as Error).message,
                _timestamp: new Date().toISOString(),
              });
            }
          }
        }

        return serialized;
      });

      return serializedValues;
    });

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
      INSERT INTO job_executions (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    try {
      // Validate all JSON values before sending to database
      this.validateJsonValues(values, 'job_executions');

      await client.query(query, values.flat());
    } catch (error) {
      logError('ObservabilityPlugin', 'Database query failed for job executions', error as Error);
      console.log('Query values sample:', values.slice(0, 1)); // Log first record for debugging

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'job_executions');

      throw error;
    }
  }

  /**
   * Replace circular references in objects to prevent JSON serialization errors
   */
  replaceCircularReferences(obj: any, path = new Set(), currentPath = ''): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (path.has(obj)) {
      return {
        json_error: '[Circular Reference Removed]',
        path: currentPath,
      };
    }

    path.add(obj);

    if (Array.isArray(obj)) {
      const newArray = obj.map((item, index) =>
        this.replaceCircularReferences(item, new Set(path), currentPath ? `${currentPath}[${index}]` : `[${index}]`)
      );
      path.delete(obj);
      return newArray;
    }

    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = this.replaceCircularReferences(value, new Set(path), currentPath ? `${currentPath}.${key}` : key);
    }
    path.delete(obj);
    return newObj;
  }

  /**
   * Serialize values for database insertion
   */
  serializeValue(value: any, columnName?: string): any {
    if (value === undefined || value === null) return null;

    // Special handling for JSON columns that expect JSON but might receive strings
    const jsonColumns = [
      'result',
      'job_options',
      'source_event_payload',
      'context_data',
      'error_stack',
      'detection_error_stack',
      'handler_error_stack',
    ];
    if (columnName && jsonColumns.includes(columnName)) {
      return this.serializeJsonColumn(value, columnName);
    }

    // Handle primitive types
    if (typeof value !== 'object') {
      return value;
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value;
    }

    // Handle Buffer objects
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    // Handle Error objects specially
    if (value instanceof Error) {
      const errorObj: any = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };

      // Check if cause property exists (ES2022+ feature)
      if ('cause' in value && value.cause) {
        errorObj.cause = this.serializeValue((value as any).cause);
      }

      return errorObj;
    }

    // Handle other objects
    try {
      // Special handling for Apollo Client cache objects (they're often huge)
      if (this.isApolloClientCache(value)) {
        return this.serializeApolloClientCache(value);
      }

      // Clean circular references before JSON stringification
      const cleanedValue = this.replaceCircularReferences(value);

      // Validate that the cleaned value can be stringified
      const jsonString = JSON.stringify(cleanedValue);

      // Check if JSON string is too large (PostgreSQL has limits)
      if (jsonString.length > this.config.maxJsonSize) {
        logError(
          'ObservabilityPlugin',
          `JSON object too large (${jsonString.length} chars), truncating`,
          new Error('JSON size limit exceeded')
        );

        // Try to create a truncated version with key information
        const truncatedValue = this.createTruncatedObject(value, this.config.maxJsonSize);
        const truncatedJson = this.sanitizeJsonString(JSON.stringify(truncatedValue));

        // Validate truncated JSON
        JSON.parse(truncatedJson);
        return truncatedJson;
      }

      // Sanitize and validate the JSON string
      const sanitizedJson = this.sanitizeJsonString(jsonString);

      // Validate that the JSON string is valid by parsing it back
      JSON.parse(sanitizedJson);

      return sanitizedJson;
    } catch (error) {
      // If JSON serialization fails, return a safe fallback
      logError('ObservabilityPlugin', 'JSON serialization failed', error as Error);
      return JSON.stringify({
        serialization_error: 'Failed to serialize object',
        error_message: (error as Error).message,
        object_type: value.constructor?.name || 'Unknown',
        object_keys: Object.keys(value).slice(0, 10), // First 10 keys for debugging
      });
    }
  }

  /**
   * Create a truncated version of an object for large JSON objects
   */
  createTruncatedObject(obj: any, maxSize: number): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const truncated: any = {
      _truncated: true,
      _original_type: obj.constructor?.name || 'Object',
      _original_keys: Object.keys(obj).length,
      _truncated_at: new Date().toISOString(),
    };

    let currentSize = JSON.stringify(truncated).length;
    const maxPropertySize = Math.floor((maxSize - currentSize) / 10); // Reserve space for 10 properties

    for (const [key, value] of Object.entries(obj)) {
      if (currentSize >= maxSize * 0.8) break; // Stop at 80% of max size

      let serializedValue: any;
      try {
        if (typeof value === 'object' && value !== null) {
          // For nested objects, create a summary
          if (Array.isArray(value)) {
            serializedValue = {
              _type: 'array',
              _length: value.length,
              _sample: value.slice(0, 3), // First 3 items
            };
          } else {
            serializedValue = {
              _type: 'object',
              _keys: Object.keys(value).slice(0, 5), // First 5 keys
              _sample: this.sampleObject(value, 2), // Sample 2 key-value pairs
            };
          }
        } else {
          serializedValue = value;
        }

        const propertyJson = `"${key}":${JSON.stringify(serializedValue)}`;
        if (currentSize + propertyJson.length < maxSize) {
          truncated[key] = serializedValue;
          currentSize += propertyJson.length;
        }
      } catch (error) {
        truncated[key] = {
          _error: 'Failed to serialize property',
          _type: typeof value,
        };
      }
    }

    return truncated;
  }

  /**
   * Sample an object to get a few key-value pairs
   */
  sampleObject(obj: any, count: number): Record<string, any> {
    const sample: Record<string, any> = {};
    const keys = Object.keys(obj);
    const sampleKeys = keys.slice(0, count);

    for (const key of sampleKeys) {
      try {
        const value = obj[key];
        if (typeof value === 'object' && value !== null) {
          sample[key] = {
            _type: Array.isArray(value) ? 'array' : 'object',
            _size: Array.isArray(value) ? value.length : Object.keys(value).length,
          };
        } else {
          sample[key] = value;
        }
      } catch (error) {
        sample[key] = { _error: 'Failed to sample property' };
      }
    }

    return sample;
  }

  /**
   * Check if an object is an Apollo Client cache
   */
  isApolloClientCache(obj: any): boolean {
    if (typeof obj !== 'object' || obj === null) return false;

    // Check for Apollo Client cache characteristics
    return (
      obj.data &&
      typeof obj.data === 'object' &&
      obj.cache &&
      typeof obj.cache === 'object' &&
      (obj.sdk || obj.version || obj.config)
    );
  }

  /**
   * Serialize Apollo Client cache objects with special handling
   */
  serializeApolloClientCache(obj: any): string {
    try {
      const summary = {
        _type: 'ApolloClientCache',
        _truncated: true,
        _truncated_at: new Date().toISOString(),
        sdk: obj.sdk
          ? {
              version: obj.sdk.version,
              config: obj.sdk.config
                ? {
                    server: obj.sdk.config.server,
                    secret: obj.sdk.config.secret ? '[REDACTED]' : undefined,
                    apollo_client: obj.sdk.config.apollo_client ? '[ApolloClient Config]' : undefined,
                  }
                : undefined,
            }
          : undefined,
        cache: obj.cache
          ? {
              _type: 'ApolloCache',
              _keys: Object.keys(obj.cache).slice(0, 10),
              _data_size: obj.cache.data ? Object.keys(obj.cache.data).length : 0,
              _sample_data: obj.cache.data ? this.sampleApolloData(obj.cache.data, 3) : undefined,
            }
          : undefined,
        data: obj.data
          ? {
              _type: 'ApolloData',
              _keys: Object.keys(obj.data).slice(0, 10),
              _size: Object.keys(obj.data).length,
              _sample: this.sampleApolloData(obj.data, 2),
            }
          : undefined,
        _original_size_estimate: JSON.stringify(obj).length,
      };

      return JSON.stringify(summary);
    } catch (error) {
      return JSON.stringify({
        _type: 'ApolloClientCache',
        _error: 'Failed to serialize Apollo Client cache',
        _error_message: (error as Error).message,
        _truncated_at: new Date().toISOString(),
      });
    }
  }

  /**
   * Sample Apollo Client data object
   */
  sampleApolloData(data: any, count: number): Record<string, any> {
    const sample: Record<string, any> = {};
    const keys = Object.keys(data);
    const sampleKeys = keys.slice(0, count);

    for (const key of sampleKeys) {
      try {
        const value = data[key];
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            sample[key] = {
              _type: 'array',
              _length: value.length,
              _sample: value.slice(0, 2),
            };
          } else {
            sample[key] = {
              _type: 'object',
              _keys: Object.keys(value).slice(0, 3),
              _sample: this.sampleObject(value, 1),
            };
          }
        } else {
          sample[key] = value;
        }
      } catch (error) {
        sample[key] = { _error: 'Failed to sample Apollo data' };
      }
    }

    return sample;
  }

  /**
   * Sanitize JSON string to ensure it's valid for PostgreSQL
   */
  sanitizeJsonString(jsonString: string): string {
    try {
      // First, try to parse and re-stringify to ensure it's valid JSON
      const parsed = JSON.parse(jsonString);
      const reStringified = JSON.stringify(parsed);

      // Check for common PostgreSQL JSON issues
      if (reStringified.includes('\u0000')) {
        // Remove null bytes which PostgreSQL doesn't like
        return reStringified.replace(/\u0000/g, '');
      }

      return reStringified;
    } catch (error) {
      // If JSON is invalid, create a safe fallback
      logError('ObservabilityPlugin', 'Invalid JSON detected, creating safe fallback', error as Error);

      // Try to create a minimal valid JSON object
      try {
        const safeObject = {
          _json_error: 'Invalid JSON structure detected',
          _error_message: (error as Error).message,
          _original_length: jsonString.length,
          _sanitized_at: new Date().toISOString(),
          _sample: jsonString.substring(0, 100) + (jsonString.length > 100 ? '...' : ''),
        };

        return JSON.stringify(safeObject);
      } catch (fallbackError) {
        // Ultimate fallback - return a simple string
        return JSON.stringify({
          _error: 'Failed to create valid JSON',
          _timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Validate JSON values before database insertion
   */
  validateJsonValues(values: any[][], tableName: string): void {
    const jsonColumns = [
      'source_event_payload',
      'context_data',
      'job_options',
      'result',
      'error_stack',
      'detection_error_stack',
      'handler_error_stack',
    ];

    for (let i = 0; i < values.length; i++) {
      const record = values[i];
      if (!record) continue;

      for (let j = 0; j < record.length; j++) {
        const value = record[j];

        if (typeof value === 'string' && value.startsWith('{')) {
          try {
            // Test if it's valid JSON
            JSON.parse(value);

            // Additional PostgreSQL-specific checks
            if (this.hasPostgreSQLJsonIssues(value)) {
              logError(
                'ObservabilityPlugin',
                `PostgreSQL JSON issues detected in ${tableName} record ${i}`,
                new Error('PostgreSQL JSON issues')
              );
              record[j] = this.createSafeJsonFallback(value, tableName, i, j);
            }
          } catch (error) {
            logError('ObservabilityPlugin', `Invalid JSON in ${tableName} record ${i}, column ${j}`, error as Error);
            console.log('Invalid JSON value:', value);

            // Replace with safe fallback
            record[j] = this.createSafeJsonFallback(value, tableName, i, j, error as Error);
          }
        }
      }
    }
  }

  /**
   * Check for PostgreSQL-specific JSON issues
   */
  hasPostgreSQLJsonIssues(jsonString: string): boolean {
    // Check for null bytes
    if (jsonString.includes('\u0000')) return true;

    // Check for other problematic characters
    if (jsonString.includes('\uFFFF')) return true;

    // Check for extremely long strings that might cause issues
    if (jsonString.length > 100000) return true;

    // Check for deeply nested structures
    let depth = 0;
    let maxDepth = 0;
    for (const char of jsonString) {
      if (char === '{' || char === '[') {
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (char === '}' || char === ']') {
        depth--;
      }
    }

    if (maxDepth > 100) return true;

    return false;
  }

  /**
   * Serialize values for JSON columns, ensuring they're always valid JSON
   */
  serializeJsonColumn(value: any, columnName: string): string {
    try {
      // If it's already a string, check if it's valid JSON
      if (typeof value === 'string') {
        try {
          // Try to parse it as JSON first
          const parsed = JSON.parse(value);
          // If successful, re-stringify to ensure it's clean
          return JSON.stringify(parsed);
        } catch (parseError) {
          // If it's not valid JSON, wrap it in a JSON object
          return JSON.stringify({
            _type: 'string_result',
            _value: value,
            _column: columnName,
            _wrapped_at: new Date().toISOString(),
          });
        }
      }

      // If it's an object, array, etc., serialize normally
      if (typeof value === 'object' && value !== null) {
        // Clean circular references before JSON stringification
        const cleanedValue = this.replaceCircularReferences(value);
        const jsonString = JSON.stringify(cleanedValue);

        // Check size limits
        if (jsonString.length > this.config.maxJsonSize) {
          logError(
            'ObservabilityPlugin',
            `JSON column ${columnName} too large (${jsonString.length} chars), truncating`,
            new Error('JSON size limit exceeded')
          );
          const truncatedValue = this.createTruncatedObject(value, this.config.maxJsonSize);
          return JSON.stringify(truncatedValue);
        }

        return jsonString;
      }

      // For primitive types (number, boolean), wrap in JSON
      return JSON.stringify({
        _type: 'primitive_result',
        _value: value,
        _column: columnName,
        _wrapped_at: new Date().toISOString(),
      });
    } catch (error) {
      logError('ObservabilityPlugin', `Failed to serialize JSON column ${columnName}`, error as Error);
      return JSON.stringify({
        _json_error: 'Failed to serialize JSON column',
        _column: columnName,
        _error_message: (error as Error).message,
        _original_type: typeof value,
        _sanitized_at: new Date().toISOString(),
      });
    }
  }

  /**
   * Create a safe JSON fallback
   */
  createSafeJsonFallback(
    originalValue: string,
    tableName: string,
    recordIndex: number,
    columnIndex: number,
    error?: Error
  ): string {
    return JSON.stringify({
      _json_error: 'JSON sanitized for PostgreSQL compatibility',
      _error_message: error?.message || 'PostgreSQL JSON issues detected',
      _table: tableName,
      _record_index: recordIndex,
      _column_index: columnIndex,
      _original_length: originalValue.length,
      _sanitized_at: new Date().toISOString(),
      _sample: originalValue.substring(0, 200) + (originalValue.length > 200 ? '...' : ''),
    });
  }

  /**
   * Log complete query with substituted values for manual testing
   */
  logCompleteQuery(query: string, values: any[], tableName: string): void {
    console.log('\n=== COMPLETE QUERY FOR MANUAL TESTING ===');
    console.log(`Table: ${tableName}`);
    console.log(`Total values: ${values.length}`);
    console.log('\n--- Query with substituted values ---');

    try {
      // Replace $1, $2, etc. with actual values
      let substitutedQuery = query;
      let paramIndex = 1;

      for (const value of values) {
        const placeholder = `$${paramIndex}`;
        let substitutedValue: string;

        if (value === null) {
          substitutedValue = 'NULL';
        } else if (typeof value === 'string') {
          // Escape single quotes and wrap in quotes
          const escapedValue = value.replace(/'/g, "''");
          substitutedValue = `'${escapedValue}'`;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          substitutedValue = String(value);
        } else if (value instanceof Date) {
          substitutedValue = `'${value.toISOString()}'`;
        } else {
          // For objects, arrays, etc., stringify and escape
          const stringified = JSON.stringify(value);
          const escapedValue = stringified.replace(/'/g, "''");
          substitutedValue = `'${escapedValue}'`;
        }

        substitutedQuery = substitutedQuery.replace(placeholder, substitutedValue);
        paramIndex++;
      }

      console.log(substitutedQuery);

      // Also log just the first record for easier testing
      console.log('\n--- First record only (for easier testing) ---');
      const firstRecordQuery = this.createSingleRecordQuery(query, values, tableName);
      console.log(firstRecordQuery);
    } catch (error) {
      console.log('Error creating substituted query:', error);
      console.log('Original query:', query);
      console.log('Values:', values);
    }

    console.log('\n=== END COMPLETE QUERY ===\n');
  }

  /**
   * Create a query for just the first record for easier testing
   */
  createSingleRecordQuery(query: string, values: any[], tableName: string): string {
    try {
      // Extract the column names from the INSERT statement
      const insertMatch = query.match(/INSERT INTO \w+ \(([^)]+)\)/);
      if (!insertMatch || !insertMatch[1]) return query;

      const columns = insertMatch[1].split(',').map(col => col.trim());
      const columnCount = columns.length;

      // Get the first record's values
      const firstRecordValues = values.slice(0, columnCount);

      // Create a single-record query
      let singleRecordQuery = query.replace(/VALUES\s*\([^)]+\).*/, 'VALUES (');

      // Add the first record's placeholders
      const placeholders = firstRecordValues.map((_, index) => `$${index + 1}`).join(', ');
      singleRecordQuery += placeholders + ')';

      // Remove any ON CONFLICT clauses for simplicity
      singleRecordQuery = singleRecordQuery.replace(/\s+ON CONFLICT.*$/, '');

      // Now substitute the values
      for (let i = 0; i < firstRecordValues.length; i++) {
        const value = firstRecordValues[i];
        const placeholder = `$${i + 1}`;
        let substitutedValue: string;

        if (value === null) {
          substitutedValue = 'NULL';
        } else if (typeof value === 'string') {
          const escapedValue = value.replace(/'/g, "''");
          substitutedValue = `'${escapedValue}'`;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          substitutedValue = String(value);
        } else if (value instanceof Date) {
          substitutedValue = `'${value.toISOString()}'`;
        } else {
          const stringified = JSON.stringify(value);
          const escapedValue = stringified.replace(/'/g, "''");
          substitutedValue = `'${escapedValue}'`;
        }

        singleRecordQuery = singleRecordQuery.replace(placeholder, substitutedValue);
      }

      return singleRecordQuery;
    } catch (error) {
      console.log('Error creating single record query:', error);
      return query;
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

    const endData = {
      durationMs: result.durationMs || durationMs,
      eventsDetectedCount: result.events.filter(e => e.detected).length, // Only count events where detected = true
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