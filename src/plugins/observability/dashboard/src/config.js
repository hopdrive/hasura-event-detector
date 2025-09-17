// Dashboard Configuration
// This configuration file centralizes all settings for the observability dashboard

export const config = {
  // GraphQL endpoint configuration
  graphql: {
    // Default to localhost during development
    endpoint: process.env.REACT_APP_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',

    // Hasura admin secret or JWT token
    headers: {
      'x-hasura-admin-secret': process.env.REACT_APP_HASURA_ADMIN_SECRET || 'your-admin-secret',
      // Alternative: use JWT tokens
      // 'Authorization': `Bearer ${process.env.REACT_APP_JWT_TOKEN}`
    },

    // WebSocket endpoint for subscriptions (real-time updates)
    wsEndpoint: process.env.REACT_APP_GRAPHQL_WS_ENDPOINT || 'ws://localhost:8080/v1/graphql'
  },

  // Dashboard refresh and polling settings
  polling: {
    // Default polling interval for overview dashboard (30 seconds)
    overviewInterval: parseInt(process.env.REACT_APP_OVERVIEW_POLLING) || 30000,

    // Real-time monitoring polling interval (5 seconds)
    realtimeInterval: parseInt(process.env.REACT_APP_REALTIME_POLLING) || 5000,

    // Performance analytics polling interval (60 seconds)
    analyticsInterval: parseInt(process.env.REACT_APP_ANALYTICS_POLLING) || 60000,

    // Enable subscriptions for real-time updates (requires WebSocket support)
    enableSubscriptions: process.env.REACT_APP_ENABLE_SUBSCRIPTIONS === 'true'
  },

  // Data display and pagination settings
  display: {
    // Number of invocations to show per page
    invocationsPerPage: parseInt(process.env.REACT_APP_INVOCATIONS_PER_PAGE) || 20,

    // Number of correlation chains to show
    correlationChainsLimit: parseInt(process.env.REACT_APP_CORRELATION_CHAINS_LIMIT) || 50,

    // Default time range for analytics (hours)
    defaultTimeRangeHours: parseInt(process.env.REACT_APP_DEFAULT_TIME_RANGE) || 24,

    // Maximum number of nodes in flow visualization
    maxFlowNodes: parseInt(process.env.REACT_APP_MAX_FLOW_NODES) || 100
  },

  // Feature flags for enabling/disabling dashboard sections
  features: {
    // Show correlation chain visualization
    correlationChains: process.env.REACT_APP_SHOW_CORRELATION_CHAINS !== 'false',

    // Show detailed execution flow diagrams
    executionFlows: process.env.REACT_APP_SHOW_EXECUTION_FLOWS !== 'false',

    // Show performance analytics charts
    performanceAnalytics: process.env.REACT_APP_SHOW_ANALYTICS !== 'false',

    // Show real-time monitoring section
    realtimeMonitoring: process.env.REACT_APP_SHOW_REALTIME !== 'false',

    // Enable search functionality
    searchEnabled: process.env.REACT_APP_ENABLE_SEARCH !== 'false',

    // Show raw Hasura payloads (disable for security/privacy)
    showRawPayloads: process.env.REACT_APP_SHOW_RAW_PAYLOADS === 'true'
  },

  // UI theme and appearance settings
  theme: {
    // Primary color for charts and UI elements
    primaryColor: process.env.REACT_APP_PRIMARY_COLOR || '#1890ff',

    // Success color for completed states
    successColor: process.env.REACT_APP_SUCCESS_COLOR || '#52c41a',

    // Error color for failed states
    errorColor: process.env.REACT_APP_ERROR_COLOR || '#ff4d4f',

    // Warning color for pending/running states
    warningColor: process.env.REACT_APP_WARNING_COLOR || '#faad14',

    // Chart animation duration
    animationDuration: parseInt(process.env.REACT_APP_ANIMATION_DURATION) || 1000
  },

  // Database schema configuration
  schema: {
    // Observability database schema name
    name: process.env.REACT_APP_OBSERVABILITY_SCHEMA || 'event_detector_observability',

    // Table names (if customized)
    tables: {
      invocations: 'invocations',
      eventExecutions: 'event_executions',
      jobExecutions: 'job_executions',
      metricsHourly: 'metrics_hourly',
      dashboardStats: 'dashboard_stats' // materialized view
    }
  },

  // Error handling and logging
  errorHandling: {
    // Show detailed error messages in development
    showDetailedErrors: process.env.NODE_ENV === 'development',

    // Retry failed GraphQL queries
    enableRetry: process.env.REACT_APP_ENABLE_RETRY !== 'false',

    // Maximum retry attempts
    maxRetries: parseInt(process.env.REACT_APP_MAX_RETRIES) || 3,

    // Retry delay in milliseconds
    retryDelay: parseInt(process.env.REACT_APP_RETRY_DELAY) || 1000
  },

  // Development and debugging settings
  development: {
    // Enable debug logging
    enableDebugLogs: process.env.REACT_APP_DEBUG === 'true',

    // Mock data for development (when GraphQL endpoint is unavailable)
    useMockData: process.env.REACT_APP_USE_MOCK_DATA === 'true',

    // Show GraphQL query performance metrics
    showQueryMetrics: process.env.REACT_APP_SHOW_QUERY_METRICS === 'true'
  }
};

// Validation helpers
export const validateConfig = () => {
  const errors = [];

  if (!config.graphql.endpoint) {
    errors.push('GraphQL endpoint is required');
  }

  if (!config.graphql.headers['x-hasura-admin-secret'] && !config.graphql.headers['Authorization']) {
    errors.push('Either Hasura admin secret or JWT authorization is required');
  }

  if (config.polling.overviewInterval < 1000) {
    errors.push('Overview polling interval must be at least 1 second');
  }

  return errors;
};

// Helper functions for common operations
export const getTimeRangeDate = (hours = config.display.defaultTimeRangeHours) => {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
};

export const getStatusColor = (status) => {
  switch (status) {
    case 'completed':
      return config.theme.successColor;
    case 'failed':
      return config.theme.errorColor;
    case 'running':
      return config.theme.warningColor;
    default:
      return '#d9d9d9';
  }
};

export const formatDuration = (ms) => {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

export const calculateSuccessRate = (succeeded, total) => {
  if (!total || total === 0) return 100;
  return Math.round((succeeded / total) * 100);
};

// Export default configuration
export default config;