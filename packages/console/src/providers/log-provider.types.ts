export type { LogEntry, LogQueryResult } from '../services/GrafanaService';

export interface EventLogContext {
  type: 'event';
  invocationId: string;
  eventName?: string;
  createdAt?: string;
}

export interface InvocationLogContext {
  type: 'invocation';
  invocationId: string;
  createdAt?: string;
}

export interface JobLogContext {
  type: 'job';
  scopeId: string;
  createdAt?: string;
  isRunning?: boolean;
}

export type LogContext = EventLogContext | InvocationLogContext | JobLogContext;

export interface LogQueryDescriptor {
  queryFn: () => Promise<import('../services/GrafanaService').LogQueryResult>;
  queryDisplay?: string;
  exploreUrl?: string | null;
  exploreLinkLabel?: string;
}

export interface LogProvider {
  readonly name: string;
  readonly queryLanguageLabel: string;
  isConfigured(): boolean;
  getLogQuery(context: LogContext): LogQueryDescriptor;
  getConfigurationHint?(): string;
}
