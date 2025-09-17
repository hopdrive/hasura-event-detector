// Base Types
export interface Invocation {
  id: string;
  source_function: string;
  source_table?: string;
  source_operation?: string;
  correlation_id?: string;
  user_email?: string;
  user_role?: string;
  created_at: string;
  total_duration_ms: number;
  events_detected_count: number;
  total_jobs_run: number;
  total_jobs_succeeded: number;
  status: 'completed' | 'failed' | 'running';
  success_rate?: number;
  hasura_event_payload?: any;
  old_payload?: any;
  new_payload?: any;
  event_executions?: EventExecution[];
}

export interface EventExecution {
  id: string;
  event_name: string;
  detected: boolean;
  detection_duration_ms?: number;
  handler_duration_ms?: number;
  status: string;
  correlation_id?: string;
  jobs_count?: number;
  job_executions?: JobExecution[];
}

export interface JobExecution {
  id: string;
  job_name: string;
  status: 'completed' | 'failed' | 'running';
  duration_ms: number;
  result?: any;
  error_message?: string;
  error_stack?: string;
  correlation_id?: string;
  created_at: string;
  invocation?: Invocation;
}

export interface DashboardStats {
  hour_bucket: string;
  source_function: string;
  total_invocations: number;
  avg_duration_ms: number;
  successful_invocations: number;
  failed_invocations: number;
}

// Query Response Types
export interface OverviewDashboardResponse {
  invocations_aggregate: {
    aggregate: {
      count: number;
      avg: {
        total_duration_ms: number;
      };
      sum: {
        total_jobs_run: number;
        total_jobs_succeeded: number;
      };
    };
  };
  dashboard_stats: DashboardStats[];
  invocations: Invocation[];
  event_executions_aggregate: {
    aggregate: {
      count: number;
    };
    nodes: {
      event_name: string;
    }[];
  }[];
}

export interface InvocationsListResponse {
  invocations: Invocation[];
  invocations_aggregate: {
    aggregate: {
      count: number;
    };
  };
}

export interface InvocationDetailResponse {
  invocations_by_pk: Invocation;
}

export interface EventFlowResponse {
  invocations_by_pk: Invocation;
}

export interface CorrelationChainsListResponse {
  invocations: Array<{
    correlation_id: string;
    created_at: string;
    correlation_chain_stats: {
      aggregate: {
        count: number;
        sum: {
          total_jobs_run: number;
          total_jobs_succeeded: number;
          total_duration_ms: number;
        };
        max: {
          created_at: string;
        };
        min: {
          created_at: string;
        };
      };
    };
  }>;
}

export interface CorrelationChainFlowResponse {
  invocations: Invocation[];
}

export interface CorrelationSearchResponse {
  invocations: Invocation[];
}

export interface AnalyticsResponse {
  dashboard_stats: DashboardStats[];
  job_executions: JobExecution[];
  invocations_aggregate: {
    nodes: {
      source_function: string;
      total_jobs_run: number;
      total_jobs_succeeded: number;
    }[];
  };
}

// Subscription Types
export interface InvocationsSubscriptionResponse {
  invocations: Invocation[];
}

export interface SystemHealthSubscriptionResponse {
  invocations_aggregate: {
    aggregate: {
      count: number;
    };
  };
  job_executions_aggregate: {
    aggregate: {
      count: number;
    };
  };
}

// Query Variables Types
export interface OverviewDashboardVariables {
  timeRange: string;
}

export interface InvocationsListVariables {
  limit: number;
  offset: number;
  where?: any;
  order_by?: any;
}

export interface InvocationDetailVariables {
  id: string;
}

export interface EventFlowVariables {
  invocationId: string;
}

export interface CorrelationChainsListVariables {
  limit: number;
}

export interface CorrelationChainFlowVariables {
  correlationId: string;
}

export interface CorrelationSearchVariables {
  searchTerm: string;
}

export interface AnalyticsVariables {
  timeRange: string;
}