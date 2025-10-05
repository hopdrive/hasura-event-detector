// =============================================================================
// CORE HASURA EVENT TYPES
// =============================================================================

export type HasuraOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'MANUAL';

export interface HasuraSessionVariables {
  'x-hasura-role': string;
  'x-hasura-user-id'?: string;
  'x-hasura-user-email'?: string;
  [key: string]: string | undefined;
}

export interface HasuraEventData<T = Record<string, any>> {
  old?: T | null;
  new?: T | null;
}

export interface HasuraDeliveryInfo {
  max_retries: number;
  current_retry: number;
}

export interface HasuraTrigger {
  name: string;
}

export interface HasuraTable {
  schema: string;
  name: string;
}

// Main Hasura Event Payload interface (matches JSDoc HasuraEventPayload)
export interface HasuraEventPayload<T = Record<string, any>> {
  event: HasuraEvent;
  created_at: string;
  id: string;
  delivery_info: HasuraDeliveryInfo;
  trigger: HasuraTrigger;
  table: HasuraTable;
  // Context and correlation tracking (added by our system)
  __context?: Record<string, any>; // User-provided context data
  __correlationId: CorrelationId;
  // Internal fields for timeout handling (not part of user context)
  __abortSignal?: AbortSignal;
  __maxJobExecutionTime?: number;
}

// Nested event structure (matches JSDoc HasuraEvent)
export interface HasuraEvent<T = Record<string, any>> {
  session_variables: HasuraSessionVariables;
  op: HasuraOperation;
  data: HasuraEventData<T>;
  trace_context?: {
    trace_id?: string;
    span_id?: string;
  };
}

// Parsed event structure (matches the actual return from parseHasuraEvent function)
export interface ParsedHasuraEvent<T = Record<string, any>> {
  hasuraEventTime?: string;
  hasuraEventId?: string;
  dbEvent?: HasuraEventData<T>;
  sessionVariables?: HasuraSessionVariables;
  role?: string;
  user?: string | null;
  operation?: HasuraOperation;
}

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type EventName = string & { readonly __eventName: unique symbol };
export type CorrelationId = string & { readonly __correlationId: unique symbol };
export type JobName = string & { readonly __jobName: unique symbol };
export type PluginName = string & { readonly __pluginName: unique symbol };
export type TrackingToken = string & { readonly __trackingToken: unique symbol };

// =============================================================================
// TRACKING AND CORRELATION TYPES
// =============================================================================

// Correlation ID is a simple UUID string
// TrackingToken provides hierarchical tracking: source.correlationId.jobId

// =============================================================================
// JOB EXECUTION TYPES
// =============================================================================

export interface JobOptions {
  correlationId?: CorrelationId;
  jobName?: JobName;
  jobExecutionId?: string;
  timeout?: number;
  retries?: number;
  abortSignal?: AbortSignal;
  [key: string]: any;
}

export interface JobResult<T = any> {
  name: JobName;
  durationMs: number;
  result: T;
  completed: boolean;
  error?: Error;
  startTime: Date;
  endTime?: Date;
}

export interface JobFunction<T = any> {
  (event: EventName, hasuraEvent: HasuraEventPayload, options?: JobOptions): Promise<T>;
}

export interface Job<T = any> {
  func: JobFunction<T>;
  options?: JobOptions;
}

export interface JobExecution<T = any> {
  job: Job<T>;
  result: JobResult<T>;
  event: EventName;
  correlationId: CorrelationId;
}

// Logging types used by multiple plugins
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  correlationId?: CorrelationId;
  jobName?: JobName;
  source: string;
  data?: Record<string, any>;
}

// Error handling types
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

export interface AsyncResult<T, E = Error> extends Promise<Result<T, E>> {}

// =============================================================================
// PLUGIN SYSTEM TYPES
// =============================================================================

export interface PluginConfig {
  enabled?: boolean;
  [key: string]: any;
}

export interface PluginHookContext {
  correlationId: CorrelationId;
  timestamp: Date;
  pluginName: PluginName;
}

// Plugin hook types with proper generic constraints
export interface PluginLifecycleHooks<TConfig extends PluginConfig = PluginConfig> {
  initialize?(): Promise<void>;

  onPreConfigure?(
    hasuraEvent: HasuraEventPayload,
    options: Partial<ListenToOptions>
  ): Promise<Partial<ListenToOptions>>;

  onInvocationStart?(
    hasuraEvent: HasuraEventPayload,
    options: ListenToOptions
  ): Promise<void>;

  onInvocationEnd?(
    hasuraEvent: HasuraEventPayload,
    result: ListenToResponse,
    durationMs: number
  ): Promise<void>;

  onEventDetectionStart?(
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void>;

  onEventDetectionEnd?(
    eventName: EventName,
    detected: boolean,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void>;

  onEventHandlerStart?(
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void>;

  onEventHandlerEnd?(
    eventName: EventName,
    jobResults: JobResult[],
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void>;

  onJobStart?(
    jobName: JobName,
    jobOptions: JobOptions,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload
  ): Promise<void>;

  onJobEnd?(
    jobName: JobName,
    result: JobResult,
    eventName: EventName,
    hasuraEvent: HasuraEventPayload,
    durationMs: number
  ): Promise<void>;

  onLog?(
    level: LogEntry['level'],
    message: string,
    data: any,
    jobName: JobName,
    correlationId: CorrelationId
  ): Promise<void>;

  onError?(error: Error, context: string, correlationId: CorrelationId): Promise<void>;

  /**
   * Flush any buffered data without full shutdown.
   * Used for timeout scenarios where we need to save data quickly.
   * Not all plugins need to implement this - only those that buffer data.
   */
  flush?(): Promise<void>;

  shutdown?(): Promise<void>;
}

export interface BasePluginInterface<TConfig extends PluginConfig = PluginConfig>
  extends PluginLifecycleHooks<TConfig> {
  readonly name: PluginName;
  readonly config: TConfig;
  readonly enabled: boolean;

  getStatus(): {
    name: PluginName;
    enabled: boolean;
    config: TConfig;
  };
}

export interface PluginManagerInterface {
  readonly initialized: boolean;

  register<T extends BasePluginInterface>(plugin: T): this;
  initialize(): Promise<void>;
  callHook(hookName: keyof PluginLifecycleHooks, ...args: any[]): Promise<void>;

  // Typed wrapper methods for plugin hooks - provide type safety
  callOnInvocationStart(hasuraEvent: HasuraEventPayload, options: ListenToOptions): Promise<void>;
  callOnInvocationEnd(hasuraEvent: HasuraEventPayload, result: ListenToResponse, durationMs: number): Promise<void>;
  callOnEventDetectionStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void>;
  callOnEventDetectionEnd(eventName: EventName, detected: boolean, hasuraEvent: HasuraEventPayload, durationMs: number): Promise<void>;
  callOnEventHandlerStart(eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void>;
  callOnEventHandlerEnd(eventName: EventName, jobResults: JobResult[], hasuraEvent: HasuraEventPayload, durationMs: number): Promise<void>;
  callOnJobStart(jobName: JobName, jobOptions: JobOptions, eventName: EventName, hasuraEvent: HasuraEventPayload): Promise<void>;
  callOnJobEnd(jobName: JobName, result: JobResult, eventName: EventName, hasuraEvent: HasuraEventPayload, durationMs: number): Promise<void>;
  callOnLog(level: LogEntry['level'], message: string, data: any, jobName: JobName, correlationId: CorrelationId): Promise<void>;
  callOnError(error: Error, context: string, correlationId: CorrelationId): Promise<void>;

  getPlugin<T extends BasePluginInterface = BasePluginInterface>(name: PluginName): T | null;
  getEnabledPlugins<T extends BasePluginInterface = BasePluginInterface>(): T[];
  shutdown(): Promise<void>;
  getStatus(): {
    initialized: boolean;
    pluginCount: number;
    enabledCount: number;
    plugins: Record<string, ReturnType<BasePluginInterface['getStatus']>>;
  };
}

// =============================================================================
// EVENT DETECTION AND HANDLING TYPES
// =============================================================================

export interface DetectorFunction<T = Record<string, any>> {
  (event: EventName, hasuraEvent: HasuraEventPayload<T>): Promise<boolean>;
}

export interface HandlerFunction<T = Record<string, any>> {
  (event: EventName, hasuraEvent: HasuraEventPayload<T>): Promise<JobResult[]>;
}

export interface EventModule<T = Record<string, any>> {
  detector: DetectorFunction<T>;
  handler: HandlerFunction<T>;
}

// =============================================================================
// OPTIONS AND CONFIGURATION TYPES
// =============================================================================

export interface ListenToOptions {
  autoLoadEventModules?: boolean;
  eventModulesDirectory?: string;
  listenedEvents?: EventName[];
  sourceFunction?: string;
  context?: Record<string, any>; // User-provided context data
  correlationId?: string;
  // Timeout configuration for serverless environments
  timeoutConfig?: {
    enabled?: boolean;
    getRemainingTimeInMillis?: () => number; // Lambda/Netlify runtime function
    safetyMargin?: number; // ms before timeout to start shutdown (default: 2000)
    maxExecutionTime?: number; // max execution time when no runtime context available (default: 10000)
    serverlessMode?: boolean; // optimize for serverless execution
    maxJobExecutionTime?: number; // max time for individual jobs
  };
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export interface EventResponse {
  name: EventName;
  detected: boolean;
  jobs: JobResult[];
}

export interface EventProcessingResult {
  eventName: EventName;
  detected: boolean;
  jobs: JobResult[];
}

export interface ListenToResponse {
  events: EventResponse[];
  durationMs: number;
  timedOut?: boolean;
  error?: string;
}

// =============================================================================
// DATABASE SCHEMA AND QUERY TYPES
// =============================================================================

// Database connection configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | Record<string, any>;
  pool?: {
    min?: number;
    max?: number;
    idleTimeoutMillis?: number;
  };
}


// =============================================================================
// GRAPHQL QUERY TYPES
// =============================================================================

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: Array<string | number>;
    extensions?: Record<string, any>;
  }>;
}


// =============================================================================
// UTILITY TYPES
// =============================================================================

// Type helpers for extracting types from arrays
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

// Type helpers for making properties optional
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Type helpers for deep readonly
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Type helpers for extracting function parameters
export type Parameters<T> = T extends (...args: infer P) => any ? P : never;

// Type helpers for extracting return types
export type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never;

// Type helpers for creating branded type constructors
export type BrandedType<T, Brand> = T & { readonly __brand: Brand };

// Column change detection utility type
export type ColumnChangeResult<T = Record<string, any>> = {
  changed: boolean;
  oldValue?: T[keyof T];
  newValue?: T[keyof T];
  columnName: keyof T;
};

// =============================================================================
// TYPE GUARDS AND VALIDATION TYPES
// =============================================================================

export interface TypeGuard<T> {
  (value: unknown): value is T;
}

export interface Validator<T> {
  (value: T): boolean;
}

export interface TypeGuards {
  isHasuraEvent: TypeGuard<HasuraEvent>;
  isCorrelationId: TypeGuard<CorrelationId>;
  isEventName: TypeGuard<EventName>;
  isJobName: TypeGuard<JobName>;
  isPluginName: TypeGuard<PluginName>;
}

// =============================================================================
// HELPER FUNCTION TYPES
// =============================================================================

export interface ObjectHelpers {
  getObjectSafely(obj: unknown): string;
  parseHasuraEvent<T = Record<string, any>>(hasuraEvent: HasuraEventPayload<T>): ParsedHasuraEvent<T>;
  // Note: columnHasChanged signature matches existing implementation
  columnHasChanged(column: string, hasuraData: HasuraEventData): boolean;
}

export interface NetlifyHelpers {
  handleSuccess(response: any): {
    statusCode: number;
    body: string;
  };
  handleFailure(error: Error): {
    statusCode: number;
    body: string;
  };
}

// =============================================================================
// TYPE ALIASES
// =============================================================================

// JSDoc type aliases
export type HasuraData<T = Record<string, any>> = HasuraEventData<T>;
export type UUID = string; // Simple string type as used in JSDoc

// =============================================================================
// EXPORT ALL TYPES FOR EASY ACCESS
// =============================================================================

// Re-export commonly used types with modern names
export type {
  HasuraEventPayload as Event,
  HasuraOperation as Operation,
  JobFunction as AsyncJob,
  DetectorFunction as Detector,
  HandlerFunction as Handler,
  PluginLifecycleHooks as PluginHooks,
  BasePluginInterface as Plugin
};

// Note: Types are already exported above, no need to re-export