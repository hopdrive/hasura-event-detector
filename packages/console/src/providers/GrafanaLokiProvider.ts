import type { LogProvider, LogContext, LogQueryDescriptor } from './log-provider.types';
import {
  GrafanaService,
  buildEventQuery,
  buildInvocationQuery,
  buildJobQuery,
  buildGrafanaExploreUrl,
} from '../services/GrafanaService';
import config from '../config';

export class GrafanaLokiProvider implements LogProvider {
  readonly name = 'Grafana Loki';
  readonly queryLanguageLabel = 'LogQL';
  private service: GrafanaService | null;
  private environment: string;
  private grafanaUrl: string;
  private lokiDatasourceUid: string;

  constructor() {
    const { grafana, environment } = config.logging;
    this.environment = environment;
    this.grafanaUrl = grafana.url;
    this.lokiDatasourceUid = grafana.lokiDatasourceUid;

    if (grafana.serviceAccountToken) {
      this.service = new GrafanaService({
        host: grafana.host,
        userId: grafana.userId,
        secret: grafana.secret,
        serviceAccountToken: grafana.serviceAccountToken,
        lokiDatasourceUid: grafana.lokiDatasourceUid,
        environment,
      });
    } else if (grafana.host && grafana.userId && grafana.secret) {
      let host = grafana.host;
      if (!host.startsWith('http://') && !host.startsWith('https://')) {
        host = `https://${host}`;
      }
      host = host.replace(/\/$/, '');

      this.service = new GrafanaService({
        host,
        userId: grafana.userId,
        secret: grafana.secret,
        environment,
      });
    } else {
      this.service = null;
    }
  }

  isConfigured(): boolean {
    return this.service !== null;
  }

  getConfigurationHint(): string {
    return 'Configure Grafana credentials in your .env file (VITE_GRAFANA_SERVICE or VITE_GRAFANA_HOST + VITE_GRAFANA_ID + VITE_GRAFANA_SECRET).';
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
