import { logError, log } from '../../../helpers/log';
import { BaseTransport } from './base';
import type { ObservabilityTransport, BufferData, BufferedInvocation, BufferedEventExecution, BufferedJobExecution } from './types';
import type { ObservabilityConfig } from '../plugin';
import {
  BULK_UPSERT_INVOCATIONS,
  BULK_INSERT_EVENT_EXECUTIONS,
  BULK_INSERT_JOB_EXECUTIONS,
  UPDATE_INVOCATION_COMPLETION,
  HEALTH_CHECK_QUERY,
} from '../graphql/mutations';
import { loadGraphQLClient } from './graphql-loader';

// GraphQLClient type (will be loaded dynamically)
type GraphQLClientType = any;

/**
 * GraphQL configuration for the transport
 */
export interface GraphQLConfig {
  endpoint?: string;
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Extended configuration for GraphQL transport
 */
export interface GraphQLObservabilityConfig extends ObservabilityConfig {
  graphql?: GraphQLConfig;
}

/**
 * GraphQL transport for observability data using Hasura
 */
export class GraphQLTransport extends BaseTransport implements ObservabilityTransport {
  private client: GraphQLClientType | null = null;
  private GraphQLClient: any = null;
  protected override config: GraphQLObservabilityConfig;

  constructor(config: GraphQLObservabilityConfig) {
    super(config);
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Validate configuration
      if (!this.config.graphql?.endpoint) {
        throw new Error('GraphQL endpoint is required for GraphQL transport');
      }

      // Dynamically load GraphQLClient to support both ESM and CJS
      try {
        this.GraphQLClient = await loadGraphQLClient();
      } catch (error) {
        logError('GraphQLTransport', 'Failed to load graphql-request', error as Error);
        throw error;
      }

      // Initialize GraphQL client
      this.client = new this.GraphQLClient(this.config.graphql.endpoint, {
        headers: this.config.graphql.headers || {},
        // Note: timeout is handled at the request level with AbortController in retryWithBackoff
      });

      // Test connection with health check query
      await this.client.request(HEALTH_CHECK_QUERY);

      log('GraphQLTransport', 'Initialized successfully');
    } catch (error) {
      logError('GraphQLTransport', 'Failed to initialize', error as Error);
      throw error;
    }
  }

  async flush(buffer: BufferData): Promise<void> {
    if (!this.client) {
      throw new Error('GraphQL transport not initialized');
    }

    // Execute mutations sequentially to respect foreign key constraints
    // Invocations must be inserted first, then event_executions and job_executions

    // 1. First, flush invocations (parent records)
    if (buffer.invocations.size > 0) {
      await this.flushInvocations(buffer.invocations);
    }

    // 2. Then flush event executions (which reference invocation_id)
    if (buffer.eventExecutions.size > 0) {
      await this.flushEventExecutions(buffer.eventExecutions);
    }

    // 3. Finally flush job executions (which also reference invocation_id)
    if (buffer.jobExecutions.size > 0) {
      await this.flushJobExecutions(buffer.jobExecutions);
    }
  }

  async shutdown(): Promise<void> {
    // GraphQL client doesn't need explicit cleanup
    this.client = null;
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.request(HEALTH_CHECK_QUERY);
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
    if (!this.client) throw new Error('GraphQL transport not initialized');

    try {
      const variables = {
        id: invocationId,
        total_duration_ms: data.total_duration_ms,
        events_detected_count: data.events_detected_count,
        total_jobs_run: data.total_jobs_run,
        total_jobs_succeeded: data.total_jobs_succeeded,
        total_jobs_failed: data.total_jobs_failed,
        status: data.status,
        error_message: data.error_message,
        error_stack: data.error_stack,
        updated_at: data.updated_at.toISOString(),
      };

      const result = await this.retryWithBackoff(async () => {
        return await this.client!.request(UPDATE_INVOCATION_COMPLETION, variables);
      });

      if (result.update_invocations_by_pk) {
        log('GraphQLTransport', `Updated invocation completion for ${invocationId}`);
      } else {
        logError('GraphQLTransport', `Failed to update invocation ${invocationId} - record may not exist`, new Error('Update returned null'));
      }
    } catch (error) {
      logError('GraphQLTransport', `Failed to update invocation completion for ${invocationId}`, error as Error);
      throw error;
    }
  }

  /**
   * Flush invocations to Hasura
   */
  private async flushInvocations(records: Map<string, BufferedInvocation>): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');
    if (records.size === 0) return;

    const objects = Array.from(records.values()).map(record =>
      this.transformForGraphQL(record)
    );

    try {
      const result = await this.retryWithBackoff(async () => {
        return await this.client!.request(
          BULK_UPSERT_INVOCATIONS,
          { objects }
        );
      });

      log('GraphQLTransport', `Upserted ${result.insert_invocations.affected_rows} invocations`);
      records.clear();
    } catch (error) {
      this.handleGraphQLError(error, 'invocations', objects);
      throw error;
    }
  }

  /**
   * Flush event executions to Hasura
   */
  private async flushEventExecutions(records: Map<string, BufferedEventExecution>): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const objects = Array.from(records.values()).map(record =>
      this.transformForGraphQL(record)
    );

    try {
      const result = await this.retryWithBackoff(async () => {
        return await this.client!.request(
          BULK_INSERT_EVENT_EXECUTIONS,
          { objects }
        );
      });

      log('GraphQLTransport', `Inserted ${result.insert_event_executions.affected_rows} event executions`);
      records.clear();
    } catch (error) {
      this.handleGraphQLError(error, 'event_executions', objects);
      throw error;
    }
  }

  /**
   * Flush job executions to Hasura
   */
  private async flushJobExecutions(records: Map<string, BufferedJobExecution>): Promise<void> {
    if (!this.client) throw new Error('Client not initialized');

    const objects = Array.from(records.values()).map(record =>
      this.transformForGraphQL(record)
    );

    try {
      const result = await this.retryWithBackoff(async () => {
        return await this.client!.request(
          BULK_INSERT_JOB_EXECUTIONS,
          { objects }
        );
      });

      log('GraphQLTransport', `Inserted ${result.insert_job_executions.affected_rows} job executions`);
      records.clear();
    } catch (error) {
      this.handleGraphQLError(error, 'job_executions', objects);
      throw error;
    }
  }

  /**
   * Transform record for GraphQL mutation
   * Dates stay as ISO strings, JSON fields stay as objects (Hasura handles serialization)
   */
  private transformForGraphQL(record: any): any {
    const transformed: any = {};

    for (const [key, value] of Object.entries(record)) {
      if (value === null || value === undefined) {
        transformed[key] = null;
      } else if (value instanceof Date) {
        // Convert dates to ISO strings
        transformed[key] = value.toISOString();
      } else if (key === 'updated_at' && !value) {
        // Skip undefined updated_at
        continue;
      } else if (this.isJsonColumn(key)) {
        // For JSON columns, ensure the value is properly serialized
        if (typeof value === 'string') {
          try {
            // If it's already a JSON string, parse and re-use the object
            transformed[key] = JSON.parse(value);
          } catch {
            // If parsing fails, wrap in an object
            transformed[key] = { _raw: value };
          }
        } else {
          // Use the object directly (Hasura will handle serialization)
          transformed[key] = this.prepareJsonForGraphQL(value);
        }
      } else {
        transformed[key] = value;
      }
    }

    return transformed;
  }

  /**
   * Check if a column should be treated as JSON
   */
  private isJsonColumn(columnName: string): boolean {
    const jsonColumns = [
      'source_event_payload',
      'context_data',
      'job_options',
      'result',
    ];
    return jsonColumns.includes(columnName);
  }

  /**
   * Prepare JSON value for GraphQL
   */
  private prepareJsonForGraphQL(value: any): any {
    if (value === null || value === undefined) return null;

    // Handle Error objects
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    // Clean circular references
    return this.replaceCircularReferences(value);
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retries: number = this.config.graphql?.maxRetries || 3,
    delay: number = this.config.graphql?.retryDelay || 1000
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (retries <= 0) {
        throw error;
      }

      logError(
        'GraphQLTransport',
        `Operation failed, retrying in ${delay}ms (${retries} retries left)`,
        error as Error
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }

  /**
   * Handle GraphQL errors with detailed logging
   */
  private handleGraphQLError(error: any, tableName: string, objects: any[]): void {
    logError('GraphQLTransport', `GraphQL mutation failed for ${tableName}`, error);

    // Log sample data for debugging
    console.log(`Failed ${tableName} sample:`, objects.slice(0, 1));

    // Check for specific GraphQL errors
    if (error.response?.errors) {
      console.log('GraphQL errors:', error.response.errors);
    }

    // Check for network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.log('Network error - unable to reach GraphQL endpoint');
    }
  }
}