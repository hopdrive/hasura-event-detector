import { Pool, PoolClient } from 'pg';
import { logError, log } from '../../../helpers/log';
import { BaseTransport } from './base';
import type { ObservabilityTransport, BufferData, BufferedInvocation, BufferedEventExecution, BufferedJobExecution } from './types';
import type { ObservabilityConfig } from '../plugin';

/**
 * SQL transport for observability data using PostgreSQL
 */
export class SQLTransport extends BaseTransport implements ObservabilityTransport {
  private pool: Pool | null = null;

  constructor(config: ObservabilityConfig) {
    super(config);
  }

  async initialize(): Promise<void> {
    try {
      // Validate configuration
      if (!this.config.database?.connectionString && !this.config.database?.host) {
        throw new Error('Database connection configuration is required for SQL transport');
      }

      // Initialize connection pool
      this.pool = new Pool(this.config.database);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      log('SQLTransport', 'Initialized successfully');
    } catch (error) {
      logError('SQLTransport', 'Failed to initialize', error as Error);
      throw error;
    }
  }

  async flush(buffer: BufferData): Promise<void> {
    if (!this.pool) {
      throw new Error('SQL transport not initialized');
    }

    const hasData =
      buffer.invocations.size > 0 ||
      buffer.eventExecutions.size > 0 ||
      buffer.jobExecutions.size > 0;

    if (!hasData) return;

    let client: PoolClient | undefined;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');

      // Insert/update invocations
      if (buffer.invocations.size > 0) {
        await this.bulkUpsertInvocations(client, Array.from(buffer.invocations.values()));
        buffer.invocations.clear();
      }

      // Insert event executions
      if (buffer.eventExecutions.size > 0) {
        await this.bulkInsertEventExecutions(client, Array.from(buffer.eventExecutions.values()));
        buffer.eventExecutions.clear();
      }

      // Insert job executions
      if (buffer.jobExecutions.size > 0) {
        await this.bulkInsertJobExecutions(client, Array.from(buffer.jobExecutions.values()));
        buffer.jobExecutions.clear();
      }

      await client.query('COMMIT');
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      logError('SQLTransport', 'Flush failed', error as Error);
      throw error;
    } finally {
      if (client) client.release();
    }
  }

  async shutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.pool) return false;

    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Update invocation completion fields directly in the database
   * Used for background functions where the buffer may not be available
   */
  async updateInvocationCompletion(invocationId: string, data: {
    total_duration_ms: number | null;
    events_detected_count: number;
    total_jobs_run: number;
    total_jobs_succeeded: number;
    total_jobs_failed: number;
    status: string;
    error_message: string | null;
    error_stack: string | null;
    updated_at: Date;
  }): Promise<void> {
    if (!this.pool) throw new Error('SQL transport not initialized');

    const client = await this.pool.connect();
    try {
      const query = `
        UPDATE invocations
        SET
          total_duration_ms = $2,
          events_detected_count = $3,
          total_jobs_run = $4,
          total_jobs_succeeded = $5,
          total_jobs_failed = $6,
          status = $7,
          error_message = $8,
          error_stack = $9,
          updated_at = $10
        WHERE id = $1
      `;

      const values = [
        invocationId,
        data.total_duration_ms,
        data.events_detected_count,
        data.total_jobs_run,
        data.total_jobs_succeeded,
        data.total_jobs_failed,
        data.status,
        data.error_message,
        data.error_stack,
        data.updated_at,
      ];

      const result = await client.query(query, values);

      if (result.rowCount === 0) {
        logError('SQLTransport', `Failed to update invocation ${invocationId} - record may not exist`, new Error('No rows updated'));
      } else {
        log('SQLTransport', `Updated invocation completion for ${invocationId}`);
      }
    } catch (error) {
      logError('SQLTransport', `Failed to update invocation completion for ${invocationId}`, error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get the pool for console server access
   */
  getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Bulk insert/update invocations
   */
  private async bulkUpsertInvocations(client: PoolClient, records: BufferedInvocation[]): Promise<void> {
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
              logError('SQLTransport', `Invalid JSON in column ${col}`, error as Error);
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
        (_: any, i: number) =>
          `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
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
      log('SQLTransport', `Upserted ${res.rowCount} invocations`);
    } catch (error) {
      logError('SQLTransport', 'Database query failed for invocations', error as Error);
      console.log('Query values sample:', values.slice(0, 1));

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'invocations');

      throw error;
    }
  }

  /**
   * Bulk insert event executions
   */
  private async bulkInsertEventExecutions(client: PoolClient, records: BufferedEventExecution[]): Promise<void> {
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
              logError('SQLTransport', `Invalid JSON in column ${col}`, error as Error);
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
        (_: any, i: number) =>
          `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
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
      logError('SQLTransport', 'Database query failed for event executions', error as Error);
      console.log('Query values sample:', values.slice(0, 1));

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'event_executions');

      throw error;
    }
  }

  /**
   * Bulk insert job executions
   */
  private async bulkInsertJobExecutions(client: PoolClient, records: BufferedJobExecution[]): Promise<void> {
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
              logError('SQLTransport', `Invalid JSON in column ${col}`, error as Error);
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
        (_: any, i: number) =>
          `(${columns.map((_: string, j: number) => `$${i * columns.length + j + 1}`).join(', ')})`
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
      logError('SQLTransport', 'Database query failed for job executions', error as Error);
      console.log('Query values sample:', values.slice(0, 1));

      // Log the complete query with substituted values for manual testing
      this.logCompleteQuery(query, values.flat(), 'job_executions');

      throw error;
    }
  }
}