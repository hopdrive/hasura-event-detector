import { gql } from '@apollo/client';

// Overview Dashboard Query
export const OVERVIEW_DASHBOARD_QUERY = gql`
  query OverviewDashboard($timeRange: timestamptz!) {
    # Recent invocations
    invocations(
      where: { created_at: { _gte: $timeRange } }
      order_by: { created_at: desc }
      limit: 20
    ) {
      id
      source_function
      created_at
      total_duration_ms
      status
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      correlation_id
    }

    # Aggregated stats
    invocations_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        avg { total_duration_ms }
        sum {
          total_jobs_run
          total_jobs_succeeded
          total_jobs_failed
        }
      }
    }

    # Top event types
    event_executions_aggregate(
      where: { detected: { _eq: true }, created_at: { _gte: $timeRange } }
    ) {
      aggregate {
        count
      }
      group_by {
        event_name
      }
    }

    # Performance trends (from materialized view)
    dashboard_stats(
      where: { hour_bucket: { _gte: $timeRange } }
      order_by: { hour_bucket: asc }
    ) {
      hour_bucket
      source_function
      total_invocations
      avg_duration_ms
      successful_invocations
      failed_invocations
      total_events_detected
      total_jobs_run
      total_jobs_succeeded
    }
  }
`;

// Invocations List Query
export const INVOCATIONS_LIST_QUERY = gql`
  query InvocationsList(
    $limit: Int = 20
    $offset: Int = 0
    $where: invocations_bool_exp = {}
    $orderBy: [invocations_order_by!] = { created_at: desc }
  ) {
    invocations(
      limit: $limit
      offset: $offset
      where: $where
      order_by: $orderBy
    ) {
      id
      created_at
      source_function
      source_table
      source_operation
      total_duration_ms
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      status
      hasura_user_email
      correlation_id
    }

    invocations_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

// Detailed Invocation Query
export const INVOCATION_DETAIL_QUERY = gql`
  query InvocationDetail($invocationId: uuid!) {
    invocations_by_pk(id: $invocationId) {
      id
      created_at
      updated_at
      source_function
      source_table
      source_operation
      hasura_event_id
      hasura_event_payload
      hasura_event_time
      hasura_user_email
      hasura_user_role
      total_duration_ms
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      status
      error_message
      error_stack
      context_data
      correlation_id
      auto_load_modules
      event_modules_directory

      # Related event executions
      event_executions(order_by: { created_at: asc }) {
        id
        event_name
        event_module_path
        detected
        detection_duration_ms
        detection_error
        detection_error_stack
        handler_duration_ms
        handler_error
        handler_error_stack
        jobs_count
        jobs_succeeded
        jobs_failed
        status
        correlation_id

        # Related job executions
        job_executions(order_by: { created_at: asc }) {
          id
          job_name
          job_function_name
          job_options
          duration_ms
          status
          result
          error_message
          error_stack
          correlation_id
        }
      }
    }
  }
`;

// Event Flow Visualization Query
export const EVENT_FLOW_QUERY = gql`
  query EventFlowData($invocationId: uuid!) {
    invocations_by_pk(id: $invocationId) {
      id
      source_function
      status
      total_duration_ms
      events_detected_count
      correlation_id

      event_executions {
        id
        event_name
        detected
        status
        detection_duration_ms
        handler_duration_ms
        jobs_count
        correlation_id

        job_executions {
          id
          job_name
          job_function_name
          status
          duration_ms
          result
          error_message
          correlation_id
        }
      }
    }
  }
`;

// Performance Analytics Query
export const PERFORMANCE_ANALYTICS_QUERY = gql`
  query PerformanceAnalytics($timeRange: timestamptz!) {
    # Performance trends by function (from materialized view)
    dashboard_stats(
      where: { hour_bucket: { _gte: $timeRange } }
      order_by: { hour_bucket: asc }
    ) {
      hour_bucket
      source_function
      total_invocations
      successful_invocations
      failed_invocations
      avg_duration_ms
      total_events_detected
      total_jobs_run
      total_jobs_succeeded
    }

    # Job failure analysis
    job_executions(
      where: {
        created_at: { _gte: $timeRange }
        status: { _eq: "failed" }
      }
      order_by: { created_at: desc }
      limit: 100
    ) {
      id
      job_name
      error_message
      created_at
      duration_ms
      correlation_id
      invocation {
        source_function
      }
      event_execution {
        event_name
      }
    }

    # Event success rates
    event_executions_aggregate(
      where: { created_at: { _gte: $timeRange } }
    ) {
      aggregate {
        count
      }
      group_by {
        event_name
        detected
      }
    }

    # System health metrics
    invocations_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        avg { total_duration_ms }
      }
      nodes {
        status
      }
    }

    job_executions_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        avg { duration_ms }
      }
      nodes {
        status
      }
    }
  }
`;

// Real-time Monitoring Query (use as subscription in production)
export const REALTIME_MONITOR_QUERY = gql`
  query RealtimeMonitor {
    # Recently completed/running invocations
    invocations(
      limit: 10
      order_by: { created_at: desc }
      where: { status: { _in: ["running", "completed", "failed"] } }
    ) {
      id
      created_at
      source_function
      status
      total_duration_ms
      events_detected_count
      total_jobs_run
      correlation_id
    }

    # Currently running jobs
    job_executions(
      where: { status: { _eq: "running" } }
      order_by: { created_at: desc }
    ) {
      id
      job_name
      created_at
      correlation_id
      invocation {
        source_function
      }
      event_execution {
        event_name
      }
    }
  }
`;

// System Health Query
export const SYSTEM_HEALTH_QUERY = gql`
  query SystemHealth($timeRange: timestamptz!) {
    # Overall system stats
    invocations_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        avg { total_duration_ms }
      }
      group_by {
        status
      }
    }

    # Jobs stats
    job_executions_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        avg { duration_ms }
      }
      group_by {
        status
      }
    }

    # Recent errors
    job_executions(
      where: {
        created_at: { _gte: $timeRange }
        status: { _eq: "failed" }
      }
      limit: 10
      order_by: { created_at: desc }
    ) {
      job_name
      error_message
      created_at
      correlation_id
      invocation {
        source_function
      }
    }

    # Performance by function (from materialized view)
    dashboard_stats(
      where: { hour_bucket: { _gte: $timeRange } }
    ) {
      source_function
      total_invocations
      successful_invocations
      failed_invocations
      avg_duration_ms
    }
  }
`;

// Search/Filter Queries
export const SEARCH_INVOCATIONS_QUERY = gql`
  query SearchInvocations($searchTerm: String!, $limit: Int = 20) {
    invocations(
      where: {
        _or: [
          { source_function: { _ilike: $searchTerm } }
          { source_table: { _ilike: $searchTerm } }
          { hasura_user_email: { _ilike: $searchTerm } }
          { correlation_id: { _ilike: $searchTerm } }
        ]
      }
      limit: $limit
      order_by: { created_at: desc }
    ) {
      id
      source_function
      source_table
      created_at
      status
      events_detected_count
      total_jobs_run
      correlation_id
    }
  }
`;

export const GET_FUNCTIONS_LIST_QUERY = gql`
  query GetFunctionsList {
    invocations(
      distinct_on: source_function
      order_by: [{ source_function: asc }, { created_at: desc }]
    ) {
      source_function
    }
  }
`;

// Correlation Chain Queries
export const CORRELATION_CHAINS_LIST_QUERY = gql`
  query CorrelationChainsList($limit: Int = 50) {
    invocations(
      where: { correlation_id: { _is_null: false } }
      distinct_on: correlation_id
      order_by: [{ correlation_id: asc }, { created_at: desc }]
      limit: $limit
    ) {
      correlation_id
      created_at
      source_function
    }

    # Get aggregated chain stats
    invocations_aggregate(
      where: { correlation_id: { _is_null: false } }
    ) {
      group_by {
        correlation_id
      }
      aggregate {
        count
        min { created_at }
        max { created_at }
        sum {
          events_detected_count
          total_jobs_run
          total_jobs_succeeded
          total_jobs_failed
        }
      }
    }
  }
`;

export const CORRELATION_CHAIN_FLOW_QUERY = gql`
  query CorrelationChainFlow($correlationId: String!) {
    invocations(
      where: { correlation_id: { _eq: $correlationId } }
      order_by: { created_at: asc }
    ) {
      id
      created_at
      source_function
      source_table
      source_operation
      status
      total_duration_ms
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      correlation_id

      event_executions {
        id
        event_name
        detected
        status
        detection_duration_ms
        handler_duration_ms
        jobs_count
        correlation_id

        job_executions {
          id
          job_name
          job_function_name
          status
          duration_ms
          result
          error_message
          correlation_id
        }
      }
    }
  }
`;

export const CORRELATION_CHAIN_DETAIL_QUERY = gql`
  query CorrelationChainDetail($correlationId: String!) {
    invocations(
      where: { correlation_id: { _eq: $correlationId } }
      order_by: { created_at: asc }
    ) {
      id
      created_at
      updated_at
      source_function
      source_table
      source_operation
      total_duration_ms
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      status
      error_message
      correlation_id

      event_executions(order_by: { created_at: asc }) {
        id
        event_name
        detected
        status
        detection_duration_ms
        handler_duration_ms
        jobs_count
        jobs_succeeded
        jobs_failed
        correlation_id

        job_executions(order_by: { created_at: asc }) {
          id
          job_name
          job_function_name
          duration_ms
          status
          result
          error_message
          correlation_id
        }
      }
    }

    # Chain statistics
    chain_stats: invocations_aggregate(
      where: { correlation_id: { _eq: $correlationId } }
    ) {
      aggregate {
        count
        min { created_at }
        max { created_at }
        sum {
          total_duration_ms
          events_detected_count
          total_jobs_run
          total_jobs_succeeded
          total_jobs_failed
        }
        avg { total_duration_ms }
      }
    }
  }
`;

// Hourly Metrics Query (for detailed analytics)
export const HOURLY_METRICS_QUERY = gql`
  query HourlyMetrics($timeRange: timestamptz!, $sourceFunction: String) {
    metrics_hourly(
      where: {
        hour_bucket: { _gte: $timeRange }
        source_function: { _eq: $sourceFunction }
      }
      order_by: { hour_bucket: asc }
    ) {
      id
      hour_bucket
      source_function
      total_invocations
      total_events_detected
      total_jobs_run
      successful_invocations
      failed_invocations
      avg_duration_ms
      min_duration_ms
      max_duration_ms
      p95_duration_ms
      top_detected_events
      most_failed_jobs
    }
  }
`;

// Subscription for real-time invocation updates
export const INVOCATION_SUBSCRIPTION = gql`
  subscription InvocationUpdates($invocationId: uuid!) {
    invocations_by_pk(id: $invocationId) {
      id
      status
      total_duration_ms
      events_detected_count
      total_jobs_run
      total_jobs_succeeded
      total_jobs_failed
      error_message

      event_executions {
        id
        status
        jobs_count
        jobs_succeeded
        jobs_failed

        job_executions {
          id
          status
          duration_ms
          error_message
        }
      }
    }
  }
`;

// Subscription for new invocations
export const NEW_INVOCATIONS_SUBSCRIPTION = gql`
  subscription NewInvocations($sourceFunction: String) {
    invocations(
      where: { source_function: { _eq: $sourceFunction } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      created_at
      source_function
      status
      correlation_id
    }
  }
`;