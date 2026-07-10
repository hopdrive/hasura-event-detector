/**
 * Grafana Loki Service
 *
 * Provides integration with Grafana Loki for fetching logs
 * from the event detector system.
 */
import config from '../config';

export interface GrafanaConfig {
  host: string;
  userId: string;
  secret: string;
  serviceAccountToken?: string;
  lokiDatasourceUid?: string;
  environment?: string;
  grafanaUrl?: string;
  consoleAuthToken?: string;
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
 * Build a Grafana Explore URL for a given LogQL query and time range
 */
export function buildGrafanaExploreUrl(query: string, timestamp?: string, grafanaUrl?: string, datasourceUid?: string): string | null {
  const url = grafanaUrl || config.logging.grafana.url;
  const uid = datasourceUid || config.logging.grafana.lokiDatasourceUid;

  if (!url) return null;

  const normalizedUrl = url.replace(/\/$/, '');
  const center = timestamp ? new Date(timestamp).getTime() : Date.now();
  const from = new Date(center - 15 * 60 * 1000).toISOString();
  const to = new Date(center + 15 * 60 * 1000).toISOString();

  const panes = JSON.stringify({
    '0': {
      datasource: uid,
      queries: [{ refId: 'A', expr: query }],
      range: { from, to },
    },
  });

  return `${normalizedUrl}/explore?schemaVersion=1&panes=${encodeURIComponent(panes)}&orgId=1`;
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
export function buildEventQuery(invocationId: string, environment: string, eventName?: string): string {
  let query = `{environment="${environment}"} | json | invocationId=\`${invocationId}\``;
  if (eventName) {
    query += ` | logType=\`detector\` | eventName=\`${eventName}\``;
  }
  query += ` | line_format "{{.message}}"`;
  return query;
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

  private normalizeUrl(url: string): string {
    if (!url) return '';
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url.replace(/\/$/, '');
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

    // Priority 1: Server-side proxy (production) — browser sends console auth token,
    // Netlify function forwards to Grafana with server-side credentials
    if (this.config.consoleAuthToken) {
      return {
        url: `/api/grafana-proxy?${queryParams.toString()}`,
        headers: {
          'Authorization': `Bearer ${this.config.consoleAuthToken}`,
        },
      };
    }

    // Priority 2: Grafana datasource proxy with service account Bearer auth (local dev)
    if (this.config.serviceAccountToken && this.config.lokiDatasourceUid) {
      const grafanaBase = this.normalizeUrl(this.config.grafanaUrl || '');
      const path = `api/datasources/proxy/uid/${this.config.lokiDatasourceUid}/${lokiPath}`;
      return {
        url: grafanaBase ? `${grafanaBase}/${path}?${queryParams.toString()}` : `/api/grafana/${path}?${queryParams.toString()}`,
        headers: {
          'Authorization': `Bearer ${this.config.serviceAccountToken}`,
        },
      };
    }

    // Fallback: direct Loki endpoint with Basic Auth
    const lokiBase = this.normalizeUrl(this.config.host);
    const auth = btoa(`${this.config.userId}:${this.config.secret}`);
    return {
      url: lokiBase ? `${lokiBase}/${lokiPath}?${queryParams.toString()}` : `/api/grafana/${lokiPath}?${queryParams.toString()}`,
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
   * Query logs for a specific invocation
   */
  async queryInvocationLogs(
    invocationId: string,
    timeRangeMinutes: number = 30,
    timestamp?: string
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildInvocationQuery(invocationId, env);
    const center = timestamp ? new Date(timestamp).getTime() : Date.now();
    const start = (center - timeRangeMinutes * 60 * 1000) * 1000000; // Convert to nanoseconds
    const end = (center + timeRangeMinutes * 60 * 1000) * 1000000;

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
    invocationId: string,
    timeRangeMinutes: number = 30,
    eventName?: string,
    timestamp?: string
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildEventQuery(invocationId, env, eventName);
    const center = timestamp ? new Date(timestamp).getTime() : Date.now();
    const start = (center - timeRangeMinutes * 60 * 1000) * 1000000;
    const end = (center + timeRangeMinutes * 60 * 1000) * 1000000;

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
    timeRangeMinutes: number = 30,
    timestamp?: string
  ): Promise<LogQueryResult> {
    const env = this.config.environment || 'test';
    const query = buildJobQuery(scopeId, env);
    const center = timestamp ? new Date(timestamp).getTime() : Date.now();
    const start = (center - timeRangeMinutes * 60 * 1000) * 1000000;
    const end = (center + timeRangeMinutes * 60 * 1000) * 1000000;

    return this.queryLogs({
      query,
      start,
      end,
      limit: 1000,
      direction: 'forward',
    });
  }
}

