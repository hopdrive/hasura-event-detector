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
  serviceAccountToken?: string;
  lokiDatasourceUid?: string;
  environment?: string;
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
export function buildInvocationQuery(invocationId: string, environment: string): string {
  return `{environment="${environment}"} | json | invocationId=\`${invocationId}\` | line_format "{{.message}}"`;
}

/**
 * Build a LogQL query for an event node
 */
export function buildEventQuery(correlationId: string, environment: string): string {
  return `{environment="${environment}"} | json | correlationId=\`${correlationId}\` | line_format "{{.message}}"`;
}

/**
 * Build a LogQL query for a job node
 */
export function buildJobQuery(scopeId: string, environment: string): string {
  return `{environment="${environment}"} | json | scopeId=\`${scopeId}\` | line_format "{{.message}}"`;
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

  private buildFetchArgs(lokiPath: string, params: LogQueryParams): { url: string; headers: Record<string, string> } {
    const {
      query,
      start,
      end,
      limit = 1000,
      direction = 'forward',
    } = params;

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

    // Use Grafana datasource proxy with service account Bearer auth when available
    if (this.config.serviceAccountToken && this.config.lokiDatasourceUid) {
      return {
        url: `/api/grafana/api/datasources/proxy/uid/${this.config.lokiDatasourceUid}/${lokiPath}?${queryParams.toString()}`,
        headers: {
          'Authorization': `Bearer ${this.config.serviceAccountToken}`,
        },
      };
    }

    // Fallback: direct Loki endpoint with Basic Auth
    const auth = btoa(`${this.config.userId}:${this.config.secret}`);
    return {
      url: `/api/grafana/${lokiPath}?${queryParams.toString()}`,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
    };
  }

  /**
   * Query Loki for logs
   */
  async queryLogs(params: LogQueryParams): Promise<LogQueryResult> {
    const { url, headers } = this.buildFetchArgs('loki/api/v1/query_range', params);

    try {
      const response = await fetch(url, { method: 'GET', headers });

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
   * Query logs and return both parsed results and raw Loki response JSON
   */
  async queryLogsWithRaw(params: LogQueryParams): Promise<{ parsed: LogQueryResult; raw: any }> {
    const { url, headers } = this.buildFetchArgs('loki/api/v1/query_range', params);

    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grafana API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const logs = parseLokiResponse(data);

    return {
      parsed: { logs, stats: data.data?.stats },
      raw: data,
    };
  }

  /**
   * Query logs for a specific invocation
   */
  async queryInvocationLogs(
    invocationId: string,
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildInvocationQuery(invocationId, env);
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
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildEventQuery(correlationId, env);
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
    timeRangeMinutes: number = 30
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildJobQuery(scopeId, env);
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
 * Create a GrafanaService instance from environment variables.
 * Prefers service account token auth (datasource proxy) over direct Loki Basic auth.
 */
export function createGrafanaService(): GrafanaService | null {
  const serviceAccountToken = import.meta.env.VITE_GRAFANA_SERVICE;
  const lokiDatasourceUid = import.meta.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs';
  const environment = import.meta.env.VITE_GRAFANA_ENVIRONMENT || 'test';

  let host = import.meta.env.VITE_GRAFANA_HOST;
  const userId = import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID;
  const secret = import.meta.env.VITE_GRAFANA_SECRET;

  // Service account token is sufficient — no need for Loki direct credentials
  if (serviceAccountToken) {
    return new GrafanaService({
      host: host || '',
      userId: userId || '',
      secret: secret || '',
      serviceAccountToken,
      lokiDatasourceUid,
      environment,
    });
  }

  if (!host || !userId || !secret) {
    console.warn('Grafana configuration missing. Logs will not be available.');
    console.warn('  VITE_GRAFANA_SERVICE:', serviceAccountToken ? '***' : 'missing');
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
    environment,
  });
}
