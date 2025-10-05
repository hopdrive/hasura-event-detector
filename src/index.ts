// Core event detection functionality
export { listenTo, detectEventModules, loadEventModule } from './detector';

// Plugin system for extensibility
export {
  BasePlugin,
  PluginManager,
  pluginManager,
  CorrelationIdUtils
} from './plugin';

// Job handling
export { run, job, extractJobName } from './handler';

// Utility functions (optional imports)
// Import from 'hasura-event-detector/utils' for utility functions
// Note: Netlify-specific utilities are available at 'hasura-event-detector/netlify'
export * from './utils';

// Netlify utilities (for backward compatibility with v0.0.8)
export { handleSuccess, handleFailure } from './netlify';

// Example jobs (for reference and testing)
export {
  jobSimulator,
  failedJobSimulator,
  emailNotificationJob,
  analyticsTrackingJob,
  webhookNotificationJob
} from './jobs/index';

// Export types for external consumption
export type {
  // Core event detection types
  HasuraEventPayload,
  ParsedHasuraEvent,
  HasuraEventData,
  ListenToOptions,
  ListenToResponse,
  EventResponse,
  EventName,
  JobName,
  JobFunction,
  JobOptions,
  JobResult,
  Job,
  CorrelationId,
  DetectorFunction,
  HandlerFunction,
  EventModule,

  // Plugin system types
  PluginConfig,
  PluginName,
  PluginLifecycleHooks,
  BasePluginInterface,
  PluginManagerInterface,

  // Additional types used by plugins
  DatabaseConfig,
  LogEntry,
  HasuraOperation,

  // Tracking token type (re-export for convenience)
  TrackingToken as TrackingTokenType
} from "./types";

// Example plugins (optional imports)
// Import from 'hasura-event-detector/plugins' for example plugins
export * from './plugins';
