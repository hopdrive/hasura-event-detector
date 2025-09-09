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
      success_rate
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
      group_by: event_name
    ) {
      aggregate {
        count
      }
      nodes {
        event_name
      }
    }
    
    # Performance trends
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
      success_rate
      hasura_user_email
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
      success_rate
      avg_job_duration
      context_data
      
      # Related event executions
      event_executions(order_by: { created_at: asc }) {
        id
        event_name
        event_module_path
        detected
        detection_duration_ms
        detection_error
        handler_duration_ms
        handler_error
        jobs_count
        jobs_succeeded
        jobs_failed
        status
        job_success_rate
        
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
          console_logs
          
          # Job logs
          logs(order_by: { created_at: asc }) {
            id
            created_at
            level
            message
            data
            source
          }
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
      
      event_executions {
        id
        event_name
        detected
        status
        detection_duration_ms
        handler_duration_ms
        jobs_count
        
        job_executions {
          id
          job_name
          job_function_name
          status
          duration_ms
          result
          error_message
        }
      }
    }
  }
`;

// Performance Analytics Query
export const PERFORMANCE_ANALYTICS_QUERY = gql`
  query PerformanceAnalytics($timeRange: timestamptz!) {
    # Performance trends by function
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
      min_duration_ms
      max_duration_ms
      p95_duration_ms
    }
    
    # Job failure analysis
    job_executions(
      where: { 
        created_at: { _gte: $timeRange }
        status: { _eq: "failed" }
      }
      order_by: { created_at: desc }
    ) {
      id
      job_name
      error_message
      created_at
      duration_ms
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
      group_by: event_name
    ) {
      aggregate {
        count
        count(where: { detected: { _eq: true } })
      }
      nodes {
        event_name
      }
    }
    
    # System health metrics
    invocations_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        count(where: { status: { _eq: "completed" } })
        count(where: { status: { _eq: "failed" } })
        avg { total_duration_ms }
      }
    }
    
    job_executions_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        count(where: { status: { _eq: "completed" } })
        count(where: { status: { _eq: "failed" } })
        avg { duration_ms }
      }
    }
  }
`;

// Real-time Monitoring Query (use as subscription in production)
export const REALTIME_MONITOR_QUERY = gql`
  query RealtimeMonitor {
    # Currently running invocations
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
      success_rate
    }
    
    # Currently running jobs
    job_executions(
      where: { status: { _eq: "running" } }
      order_by: { created_at: desc }
    ) {
      id
      job_name
      created_at
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
        count(where: { status: { _eq: "completed" } })
        count(where: { status: { _eq: "failed" } })
        avg { total_duration_ms }
      }
    }
    
    # Jobs stats
    job_executions_aggregate(where: { created_at: { _gte: $timeRange } }) {
      aggregate {
        count
        count(where: { status: { _eq: "completed" } })
        count(where: { status: { _eq: "failed" } })
        avg { duration_ms }
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
      invocation {
        source_function
      }
    }
    
    # Performance by function
    dashboard_stats(
      where: { hour_bucket: { _gte: $timeRange } }
      group_by: source_function
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
      success_rate
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