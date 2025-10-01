import { CorrelationId, EventName, JobName } from '../../../types';

/**
 * Buffered invocation record for temporary storage before database insertion
 */
export interface BufferedInvocation {
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

/**
 * Buffered event execution record for temporary storage before database insertion
 */
export interface BufferedEventExecution {
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

/**
 * Buffered job execution record for temporary storage before database insertion
 */
export interface BufferedJobExecution {
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
 * Buffer data containing all records to be flushed
 */
export interface BufferData {
  invocations: Map<string, BufferedInvocation>;
  eventExecutions: Map<string, BufferedEventExecution>;
  jobExecutions: Map<string, BufferedJobExecution>;
}

/**
 * Abstract interface for observability data transport
 */
export interface ObservabilityTransport {
  /**
   * Initialize the transport (connect to database, setup clients, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Flush buffered data to the storage backend
   */
  flush(buffer: BufferData): Promise<void>;

  /**
   * Shutdown the transport and cleanup resources
   */
  shutdown(): Promise<void>;

  /**
   * Check if the transport is healthy and can accept data
   */
  isHealthy(): Promise<boolean>;
}