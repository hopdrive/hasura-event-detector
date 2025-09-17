// Core event detection functionality
export { listenTo } from './detector';

// Plugin system for extensibility
export {
  BasePlugin,
  PluginManager,
  pluginManager,
  CorrelationIdUtils
} from './plugin';

// Utility functions for event processing and job handling
export { parseHasuraEvent, columnHasChanged, log, logError, logWarn, handleSuccess, handleFailure, getObjectSafely, type NetlifyResponse } from './helpers/index';
export { run, job } from './handler';

// Tracking token utilities for execution chain tracing
export { TrackingToken, type TrackingTokenComponents, type TrackingTokenSource } from './helpers/tracking-token';

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
