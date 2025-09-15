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
  HasuraOperation
} from "./types";
