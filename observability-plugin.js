const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

/**
 * ObservabilityPlugin for Hasura Event Detector
 * 
 * This plugin captures detailed execution metadata for event detection and job processing
 * to provide comprehensive observability and debugging capabilities. It uses buffered
 * writes to minimize performance impact while providing rich monitoring data.
 */
class ObservabilityPlugin {
  constructor(config = {}) {
    this.config = {
      enabled: false,
      database: {
        connectionString: process.env.OBSERVABILITY_DB_URL,
        host: process.env.OBSERVABILITY_DB_HOST,
        port: process.env.OBSERVABILITY_DB_PORT,
        database: process.env.OBSERVABILITY_DB_NAME,
        user: process.env.OBSERVABILITY_DB_USER,
        password: process.env.OBSERVABILITY_DB_PASSWORD,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      },
      schema: 'event_detector_observability',
      captureConsoleLog: true,
      captureJobOptions: true,
      captureHasuraPayload: true,
      captureErrorStacks: true,
      batchSize: 100,
      flushInterval: 5000, // ms
      retryAttempts: 3,
      retryDelay: 1000, // ms
      ...config
    };
    
    this.pool = null;
    this.buffer = {
      invocations: new Map(),
      eventExecutions: new Map(), 
      jobExecutions: new Map(),
      jobLogs: []
    };
    
    this.flushTimer = null;
    this.isInitialized = false;
    
    // Auto-initialize if enabled
    if (this.config.enabled) {
      this.initialize().catch(error => {
        console.error('[ObservabilityPlugin] Auto-initialization failed:', error.message);
      });
    }
  }

  async initialize() {
    if (!this.config.enabled || this.isInitialized) return;
    
    try {
      // Validate configuration
      if (!this.config.database.connectionString && 
          !this.config.database.host) {
        throw new Error('Database connection configuration is required');
      }
      
      // Initialize connection pool
      this.pool = new Pool(this.config.database);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      
      // Setup periodic flush
      this.flushTimer = setInterval(() => {
        this.flush().catch(error => {
          console.error('[ObservabilityPlugin] Flush error:', error.message);
        });
      }, this.config.flushInterval);
      
      // Setup graceful shutdown
      process.on('SIGINT', () => this.shutdown());
      process.on('SIGTERM', () => this.shutdown());
      
      this.isInitialized = true;
      console.log('[ObservabilityPlugin] Initialized successfully');
    } catch (error) {
      console.error('[ObservabilityPlugin] Failed to initialize:', error.message);
      this.config.enabled = false;
      throw error;
    }
  }

  async shutdown() {
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
    
    console.log('[ObservabilityPlugin] Shutdown complete');
  }

  /**
   * Record the start of an invocation (call to listenTo)
   */
  async recordInvocationStart(data) {
    if (!this.config.enabled) return null;
    
    const id = uuidv4();
    const record = {
      id,
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
      error_stack: null
    };
    
    this.buffer.invocations.set(id, record);
    return id;
  }

  /**
   * Update invocation with completion data
   */
  async recordInvocationEnd(invocationId, data) {
    if (!this.config.enabled || !invocationId) return;
    
    const record = this.buffer.invocations.get(invocationId);
    if (!record) return;
    
    Object.assign(record, {
      total_duration_ms: data.duration,
      events_detected_count: data.eventsDetectedCount || 0,
      total_jobs_run: data.totalJobsRun || 0,
      total_jobs_succeeded: data.totalJobsSucceeded || 0,
      total_jobs_failed: data.totalJobsFailed || 0,
      status: data.status || 'completed',
      error_message: data.errorMessage,
      error_stack: this.config.captureErrorStacks ? data.errorStack : null,
      updated_at: new Date()
    });
    
    this.buffer.invocations.set(invocationId, record);
  }

  /**
   * Record event execution (detector + handler)
   */
  async recordEventExecution(invocationId, data) {
    if (!this.config.enabled || !invocationId) return null;
    
    const id = uuidv4();
    const record = {
      id,
      invocation_id: invocationId,
      event_name: data.eventName,
      event_module_path: data.eventModulePath,
      detected: data.detected || false,
      detection_duration_ms: data.detectionDuration,
      detection_error: data.detectionError,
      detection_error_stack: this.config.captureErrorStacks ? data.detectionErrorStack : null,
      handler_duration_ms: data.handlerDuration,
      handler_error: data.handlerError,
      handler_error_stack: this.config.captureErrorStacks ? data.handlerErrorStack : null,
      jobs_count: data.jobsCount || 0,
      jobs_succeeded: data.jobsSucceeded || 0,
      jobs_failed: data.jobsFailed || 0,
      status: data.status || (data.detected ? 'completed' : 'not_detected'),
      created_at: new Date(),
      updated_at: new Date()
    };
    
    this.buffer.eventExecutions.set(id, record);
    return id;
  }

  /**
   * Record job execution
   */
  async recordJobExecution(invocationId, eventExecutionId, data) {
    if (!this.config.enabled || !invocationId || !eventExecutionId) return null;
    
    const id = uuidv4();
    const record = {
      id,
      invocation_id: invocationId,
      event_execution_id: eventExecutionId,
      job_name: data.jobName,
      job_function_name: data.jobFunctionName,
      job_options: this.config.captureJobOptions ? data.jobOptions : null,
      duration_ms: data.duration,
      status: data.status || 'running',
      result: data.result,
      error_message: data.errorMessage,
      error_stack: this.config.captureErrorStacks ? data.errorStack : null,
      console_logs: data.consoleLogs || [],
      created_at: new Date(),
      updated_at: new Date()
    };
    
    this.buffer.jobExecutions.set(id, record);
    return id;
  }

  /**
   * Record a log entry for a specific job execution
   */
  async recordJobLog(jobExecutionId, level, message, data = null, source = null) {
    if (!this.config.enabled || !this.config.captureConsoleLog || !jobExecutionId) return;
    
    const record = {
      job_execution_id: jobExecutionId,
      level,
      message,
      data,
      source,
      created_at: new Date()
    };
    
    this.buffer.jobLogs.push(record);
  }

  /**
   * Console log interceptor for capturing job logs
   */
  createLogInterceptor(jobExecutionId) {
    if (!this.config.enabled || !this.config.captureConsoleLog) {
      return {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console)
      };
    }

    return {
      log: (...args) => {
        console.log(...args);
        this.recordJobLog(jobExecutionId, 'info', args.join(' '), args.length > 1 ? args : null);
      },
      error: (...args) => {
        console.error(...args);
        this.recordJobLog(jobExecutionId, 'error', args.join(' '), args.length > 1 ? args : null);
      },
      warn: (...args) => {
        console.warn(...args);
        this.recordJobLog(jobExecutionId, 'warn', args.join(' '), args.length > 1 ? args : null);
      },
      info: (...args) => {
        console.info(...args);
        this.recordJobLog(jobExecutionId, 'info', args.join(' '), args.length > 1 ? args : null);
      }
    };
  }

  /**
   * Flush buffered data to database
   */
  async flush() {
    if (!this.config.enabled || !this.pool || !this.isInitialized) return;
    
    const hasData = this.buffer.invocations.size > 0 || 
                   this.buffer.eventExecutions.size > 0 || 
                   this.buffer.jobExecutions.size > 0 || 
                   this.buffer.jobLogs.length > 0;
    
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
      
      // Insert job logs
      if (this.buffer.jobLogs.length > 0) {
        await this.bulkInsertJobLogs(client, this.buffer.jobLogs);
        this.buffer.jobLogs = [];
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      console.error('[ObservabilityPlugin] Flush failed:', error.message);
      
      // Retry logic could be added here
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  /**
   * Bulk insert/update invocations
   */
  async bulkUpsertInvocations(client, records) {
    if (records.length === 0) return;

    const columns = [
      'id', 'source_function', 'source_table', 'source_operation',
      'hasura_event_id', 'hasura_event_payload', 'hasura_event_time',
      'hasura_user_email', 'hasura_user_role', 'total_duration_ms',
      'events_detected_count', 'total_jobs_run', 'total_jobs_succeeded',
      'total_jobs_failed', 'auto_load_modules', 'event_modules_directory',
      'status', 'error_message', 'error_stack', 'context_data',
      'created_at', 'updated_at'
    ];
    
    const values = records.map(record => 
      columns.map(col => this.serializeValue(record[col]))
    );
    
    const placeholders = values.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
    const updateSet = columns
      .filter(col => col !== 'id' && col !== 'created_at')
      .map(col => `${col} = EXCLUDED.${col}`)
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
  async bulkInsertEventExecutions(client, records) {
    if (records.length === 0) return;

    const columns = [
      'id', 'invocation_id', 'event_name', 'event_module_path',
      'detected', 'detection_duration_ms', 'detection_error', 'detection_error_stack',
      'handler_duration_ms', 'handler_error', 'handler_error_stack',
      'jobs_count', 'jobs_succeeded', 'jobs_failed', 'status',
      'created_at', 'updated_at'
    ];
    
    const values = records.map(record => 
      columns.map(col => this.serializeValue(record[col]))
    );
    
    const placeholders = values.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
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
  async bulkInsertJobExecutions(client, records) {
    if (records.length === 0) return;

    const columns = [
      'id', 'invocation_id', 'event_execution_id', 'job_name',
      'job_function_name', 'job_options', 'duration_ms', 'status',
      'result', 'error_message', 'error_stack', 'console_logs',
      'created_at', 'updated_at'
    ];
    
    const values = records.map(record => 
      columns.map(col => this.serializeValue(record[col]))
    );
    
    const placeholders = values.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
    const query = `
      INSERT INTO ${this.config.schema}.job_executions (${columns.join(', ')})
      VALUES ${placeholders}
      ON CONFLICT (id) DO NOTHING
    `;
    
    await client.query(query, values.flat());
  }

  /**
   * Bulk insert job logs
   */
  async bulkInsertJobLogs(client, records) {
    if (records.length === 0) return;

    const columns = [
      'job_execution_id', 'level', 'message', 'data', 'source', 'created_at'
    ];
    
    const values = records.map(record => 
      columns.map(col => this.serializeValue(record[col]))
    );
    
    const placeholders = values.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
    const query = `
      INSERT INTO ${this.config.schema}.job_logs (${columns.join(', ')})
      VALUES ${placeholders}
    `;
    
    await client.query(query, values.flat());
  }

  /**
   * Serialize values for database insertion
   */
  serializeValue(value) {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object' && !(value instanceof Date)) {
      return JSON.stringify(value);
    }
    return value;
  }

  /**
   * Get plugin status and statistics
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      initialized: this.isInitialized,
      buffered: {
        invocations: this.buffer.invocations.size,
        eventExecutions: this.buffer.eventExecutions.size,
        jobExecutions: this.buffer.jobExecutions.size,
        jobLogs: this.buffer.jobLogs.length
      },
      config: {
        schema: this.config.schema,
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval,
        captureConsoleLog: this.config.captureConsoleLog,
        captureJobOptions: this.config.captureJobOptions,
        captureHasuraPayload: this.config.captureHasuraPayload
      }
    };
  }
}

module.exports = { ObservabilityPlugin };