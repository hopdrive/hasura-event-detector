/**
 * GraphQL mutations for bulk operations
 */

export const BULK_UPSERT_INVOCATIONS = `
  mutation BulkUpsertInvocations($objects: [invocations_insert_input!]!) {
    insert_invocations(
      objects: $objects
      on_conflict: {
        constraint: invocations_pkey
        update_columns: [
          correlation_id,
          source_function,
          source_table,
          source_operation,
          source_system,
          source_event_id,
          source_event_payload,
          source_event_time,
          source_user_email,
          source_user_role,
          source_job_id,
          total_duration_ms,
          events_detected_count,
          total_jobs_run,
          total_jobs_succeeded,
          total_jobs_failed,
          auto_load_modules,
          event_modules_directory,
          status,
          error_message,
          error_stack,
          context_data,
          updated_at
        ]
      }
    ) {
      affected_rows
      returning {
        id
      }
    }
  }
`;

export const BULK_INSERT_EVENT_EXECUTIONS = `
  mutation BulkInsertEventExecutions($objects: [event_executions_insert_input!]!) {
    insert_event_executions(
      objects: $objects
      on_conflict: {
        constraint: event_executions_pkey
        update_columns: [
          invocation_id,
          correlation_id,
          event_name,
          event_module_path,
          detected,
          detection_duration_ms,
          detection_error,
          detection_error_stack,
          handler_duration_ms,
          handler_error,
          handler_error_stack,
          jobs_count,
          jobs_succeeded,
          jobs_failed,
          status,
          updated_at
        ]
      }
    ) {
      affected_rows
      returning {
        id
      }
    }
  }
`;

export const BULK_INSERT_JOB_EXECUTIONS = `
  mutation BulkInsertJobExecutions($objects: [job_executions_insert_input!]!) {
    insert_job_executions(
      objects: $objects
      on_conflict: {
        constraint: job_executions_pkey
        update_columns: [
          invocation_id,
          event_execution_id,
          correlation_id,
          job_name,
          job_function_name,
          job_options,
          duration_ms,
          status,
          result,
          error_message,
          error_stack,
          updated_at
        ]
      }
    ) {
      affected_rows
      returning {
        id
      }
    }
  }
`;

/**
 * Update invocation completion fields only
 * Used for background functions where buffer may not be available
 */
export const UPDATE_INVOCATION_COMPLETION = `
  mutation UpdateInvocationCompletion(
    $id: uuid!
    $total_duration_ms: Int
    $events_detected_count: Int!
    $total_jobs_run: Int!
    $total_jobs_succeeded: Int!
    $total_jobs_failed: Int!
    $status: String!
    $error_message: String
    $error_stack: String
    $updated_at: timestamptz!
  ) {
    update_invocations_by_pk(
      pk_columns: { id: $id }
      _set: {
        total_duration_ms: $total_duration_ms
        events_detected_count: $events_detected_count
        total_jobs_run: $total_jobs_run
        total_jobs_succeeded: $total_jobs_succeeded
        total_jobs_failed: $total_jobs_failed
        status: $status
        error_message: $error_message
        error_stack: $error_stack
        updated_at: $updated_at
      }
    ) {
      id
    }
  }
`;

/**
 * Update event execution completion fields only
 * Used when periodic flush clears buffer before handler completes
 */
export const UPDATE_EVENT_EXECUTION_COMPLETION = `
  mutation UpdateEventExecutionCompletion(
    $id: uuid!
    $handler_duration_ms: Int!
    $jobs_count: Int!
    $jobs_succeeded: Int!
    $jobs_failed: Int!
    $status: String!
    $updated_at: timestamptz!
  ) {
    update_event_executions_by_pk(
      pk_columns: { id: $id }
      _set: {
        handler_duration_ms: $handler_duration_ms
        jobs_count: $jobs_count
        jobs_succeeded: $jobs_succeeded
        jobs_failed: $jobs_failed
        status: $status
        updated_at: $updated_at
      }
    ) {
      id
    }
  }
`;

/**
 * Update job execution completion fields only
 * Used when periodic flush clears buffer before job completes
 */
export const UPDATE_JOB_EXECUTION_COMPLETION = `
  mutation UpdateJobExecutionCompletion(
    $id: uuid!
    $duration_ms: Int!
    $status: String!
    $result: jsonb
    $error_message: String
    $error_stack: String
    $updated_at: timestamptz!
  ) {
    update_job_executions_by_pk(
      pk_columns: { id: $id }
      _set: {
        duration_ms: $duration_ms
        status: $status
        result: $result
        error_message: $error_message
        error_stack: $error_stack
        updated_at: $updated_at
      }
    ) {
      id
    }
  }
`;

/**
 * Health check query
 */
export const HEALTH_CHECK_QUERY = `
  query HealthCheck {
    invocations(limit: 1) {
      id
    }
  }
`;