import type { LogProvider, LogContext, LogQueryDescriptor } from './log-provider.types';
import {
  GrafanaService,
  buildEventQuery,
  buildInvocationQuery,
  buildJobQuery,
  buildGrafanaExploreUrl,
} from '../services/GrafanaService';
import config, { getSharedConfig } from '../config';

export class GrafanaLokiProvider implements LogProvider {
  readonly name = 'Grafana Loki';
  readonly queryLanguageLabel = 'LogQL';
  private service: GrafanaService | null;
  private environment: string;
  private grafanaUrl: string;
  private lokiDatasourceUid: string;

  constructor(environmentOverride?: string) {
    const { grafana } = config.logging;
    const shared = getSharedConfig();
    const serviceAccountToken = shared?.grafanaServiceAccountToken || '';
    const userId = shared?.grafanaUserId || '';
    const secret = shared?.grafanaSecret || '';

    this.environment = environmentOverride || config.logging.environment;
    this.grafanaUrl = grafana.url;
    this.lokiDatasourceUid = grafana.lokiDatasourceUid;

    // Priority 1: Use server-side proxy when console auth token is available (production)
    const consoleAuthToken = localStorage.getItem('hed-console-token');
    if (consoleAuthToken) {
      this.service = new GrafanaService({
        host: '',
        userId: '',
        secret: '',
        consoleAuthToken,
        environment: this.environment,
      });
    } else if (serviceAccountToken) {
      // Priority 2: Direct Grafana service account token (local dev with credentials)
      this.service = new GrafanaService({
        host: grafana.host,
        userId,
        secret,
        serviceAccountToken,
        lokiDatasourceUid: grafana.lokiDatasourceUid,
        environment: this.environment,
        grafanaUrl: grafana.url,
      });
    } else if (grafana.host && userId && secret) {
      // Priority 3: Direct Loki basic auth (local dev fallback)
      let host = grafana.host;
      if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = `https://${host}`;
      }
      host = host.replace(/\/$/, '');

      this.service = new GrafanaService({
        host,
        userId,
        secret,
        environment: this.environment,
      });
    } else {
      this.service = null;
    }
  }

  isConfigured(): boolean {
    return this.service !== null;
  }

  getConfigurationHint(): string {
    return 'Configure Grafana credentials as server-side env vars (GRAFANA_SERVICE or GRAFANA_LOKI_HOST + GRAFANA_ID + GRAFANA_SECRET). These are loaded after login.';
  }

  getService(): GrafanaService | null {
    return this.service;
  }

  getLogQuery(context: LogContext): LogQueryDescriptor {
    switch (context.type) {
      case 'event': {
        const query = buildEventQuery(context.invocationId, this.environment, context.eventName);
        return {
          queryFn: () => this.service!.queryEventLogs(context.invocationId, 15, context.eventName, context.createdAt),
          queryDisplay: query,
          exploreUrl: buildGrafanaExploreUrl(query, context.createdAt, this.grafanaUrl, this.lokiDatasourceUid),
          exploreLinkLabel: 'Open in Grafana',
        };
      }
      case 'invocation': {
        const query = buildInvocationQuery(context.invocationId, this.environment);
        return {
          queryFn: () => this.service!.queryInvocationLogs(context.invocationId, 15, context.createdAt),
          queryDisplay: query,
          exploreUrl: buildGrafanaExploreUrl(query, context.createdAt, this.grafanaUrl, this.lokiDatasourceUid),
          exploreLinkLabel: 'Open in Grafana',
        };
      }
      case 'job': {
        const query = buildJobQuery(context.scopeId, this.environment);
        return {
          queryFn: () => this.service!.queryJobLogs(context.scopeId, 15, context.createdAt),
          queryDisplay: query,
          exploreUrl: buildGrafanaExploreUrl(query, context.createdAt, this.grafanaUrl, this.lokiDatasourceUid),
          exploreLinkLabel: 'Open in Grafana',
        };
      }
    }
  }
}
