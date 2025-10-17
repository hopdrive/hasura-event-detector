/**
 * Grafana Loki Service
 *
 * Provides integration with Grafana Loki for fetching logs
 * from the event detector system.
 */

export interface GrafanaConfig {
  host: string;
  userId: string;
  secret: string;
}

export interface LogEntry {
  timestamp: string; // ISO timestamp
  timestampNs: string; // Nanosecond precision timestamp
  level: string; // info, warn, error, debug
  message: string;
  labels: Record<string, string>;
  raw: any; // Raw JSON data from log
}

export interface LogQueryParams {
  query: string; // LogQL query
  start?: number; // Unix timestamp in nanoseconds
  end?: number; // Unix timestamp in nanoseconds
  limit?: number; // Max number of logs to return
  direction?: 'forward' | 'backward';
}

export interface LogQueryResult {
  logs: LogEntry[];
  stats?: {
    totalBytes: number;
    totalEntries: number;
  };
}

/**
 * Build a LogQL query for an invocation node
 */
export function buildInvocationQuery(invocationId: string): string {
  return `{app="event-handlers", invocationId="${invocationId}"}`;
}

/**
 * Build a LogQL query for an event node
 */
export function buildEventQuery(
  correlationId: string,
  eventExecutionId?: string
): string {
  if (eventExecutionId) {
    return `{app="event-handlers", correlationId="${correlationId}", eventExecutionId="${eventExecutionId}"}`;
  }
  return `{app="event-handlers", correlationId="${correlationId}"}`;
}

/**
 * Build a LogQL query for a job node
 */
export function buildJobQuery(
  scopeId: string,
  jobExecutionId?: string
): string {
  if (jobExecutionId) {
    return `{app="event-handlers", scopeId="${scopeId}", jobExecutionId="${jobExecutionId}"}`;
  }
  return `{app="event-handlers", scopeId="${scopeId}"}`;
}

/**
 * Parse Loki response and extract log entries
 */
function parseLokiResponse(data: any): LogEntry[] {
  const logs: LogEntry[] = [];

  if (!data?.data?.result) {
    return logs;
  }

  for (const stream of data.data.result) {
    const labels = stream.stream || {};

    for (const [timestampNs, logLine] of stream.values || []) {
      try {
        // Try to parse as JSON
        const parsed = JSON.parse(logLine);

        logs.push({
          timestamp: new Date(parseInt(timestampNs) / 1000000).toISOString(),
          timestampNs,
          level: parsed.level || labels.level || 'info',
          message: parsed.message || logLine,
          labels: { ...labels, ...parsed },
          raw: parsed,
        });
      } catch {
        // If not JSON, treat as plain text
        logs.push({
          timestamp: new Date(parseInt(timestampNs) / 1000000).toISOString(),
          timestampNs,
          level: labels.level || 'info',
          message: logLine,
          labels,
          raw: { message: logLine },
        });
      }
    }
  }

  // Sort by timestamp ascending (oldest first)
  logs.sort((a, b) => parseInt(a.timestampNs) - parseInt(b.timestampNs));

  return logs;
}

/**
 * GrafanaService class for querying Loki
 */
export class GrafanaService {
  private config: GrafanaConfig;

  constructor(config: GrafanaConfig) {
    this.config = config;
  }

  /**
   * Query Loki for logs
   */
  async queryLogs(params: LogQueryParams): Promise<LogQueryResult> {
    const {
      query,
      start,
      end,
      limit = 1000,
      direction = 'forward',
    } = params;

    // Build query parameters
    const queryParams = new URLSearchParams({
      query: query,
      limit: limit.toString(),
      direction,
    });

    if (start) {
      queryParams.append('start', start.toString());
    }

    if (end) {
      queryParams.append('end', end.toString());
    }

    // Always use proxy endpoint to avoid CORS issues
    // The proxy forwards requests to Grafana
    const url = `/api/grafana/loki/api/v1/query_range?${queryParams.toString()}`;

    // Build Basic Auth header
    const auth = btoa(`${this.config.userId}:${this.config.secret}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Grafana API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const logs = parseLokiResponse(data);

      return {
        logs,
        stats: data.data?.stats,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch logs from Grafana: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Query logs for a specific invocation
   */
  async queryInvocationLogs(
    invocationId: string,
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const query = buildInvocationQuery(invocationId);
    const now = Date.now();
    const start = (now - timeRangeMinutes * 60 * 1000) * 1000000; // Convert to nanoseconds
    const end = (now + timeRangeMinutes * 60 * 1000) * 1000000;

    return this.queryLogs({
      query,
      start,
      end,
      limit: 1000,
      direction: 'forward',
    });
  }

  /**
   * Query logs for a specific event
   */
  async queryEventLogs(
    correlationId: string,
    eventExecutionId: string | undefined,
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const query = buildEventQuery(correlationId, eventExecutionId);
    const now = Date.now();
    const start = (now - timeRangeMinutes * 60 * 1000) * 1000000;
    const end = (now + timeRangeMinutes * 60 * 1000) * 1000000;

    return this.queryLogs({
      query,
      start,
      end,
      limit: 1000,
      direction: 'forward',
    });
  }

  /**
   * Query logs for a specific job
   */
  async queryJobLogs(
    scopeId: string,
    jobExecutionId: string | undefined,
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const query = buildJobQuery(scopeId, jobExecutionId);
    const now = Date.now();
    const start = (now - timeRangeMinutes * 60 * 1000) * 1000000;
    const end = (now + timeRangeMinutes * 60 * 1000) * 1000000;

    return this.queryLogs({
      query,
      start,
      end,
      limit: 1000,
      direction: 'forward',
    });
  }
}

/**
 * Create a GrafanaService instance from environment variables
 */
export function createGrafanaService(): GrafanaService | null {
  let host = import.meta.env.VITE_GRAFANA_HOST;
  const userId = import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID;
  const secret = import.meta.env.VITE_GRAFANA_SECRET;

  if (!host || !userId || !secret) {
    console.warn('Grafana configuration missing. Logs will not be available.');
    console.warn('  VITE_GRAFANA_HOST:', host);
    console.warn('  VITE_GRAFANA_USER:', userId);
    console.warn('  VITE_GRAFANA_SECRET:', secret ? '***' : 'missing');
    return null;
  }

  // Ensure host starts with https:// or http://
  if (!host.startsWith('http://') && !host.startsWith('https://')) {
    host = `https://${host}`;
  }

  // Remove trailing slash if present
  host = host.replace(/\/$/, '');

  return new GrafanaService({
    host,
    userId,
    secret,
  });
}
