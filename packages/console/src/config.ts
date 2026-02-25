/// <reference types="vite/client" />

export type AppEnvironment = 'test' | 'prod';

const env = import.meta.env.VITE_ENV || 'test';

const config = {
  appEnv: env,

  graphql: {
    // Fallback for local dev; overridden at runtime by sensitive config
    endpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
  },

  auth: {
    enabled: import.meta.env.VITE_AUTH_ENABLED !== 'false',
  },

  logging: {
    environment: import.meta.env.VITE_GRAFANA_ENVIRONMENT || env,
    grafana: {
      host: import.meta.env.VITE_GRAFANA_LOKI_HOST || '',
      lokiDatasourceUid: import.meta.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs',
      url: import.meta.env.VITE_GRAFANA_URL || '',
    },
  },
};

export default config;

// --- Module-level ref for the active environment, read by Apollo outside React ---

export const activeEnvironmentRef: { current: AppEnvironment } = { current: 'test' };

// --- Sensitive config loaded at runtime after auth ---

export interface EnvironmentConfig {
  hasuraAdminSecret: string;
  graphqlEndpoint: string;
}

export interface SensitiveConfig {
  environments: Record<AppEnvironment, EnvironmentConfig>;
  shared: {
    grafanaSecret: string;
    grafanaServiceAccountToken: string;
    grafanaUserId: string;
  };
}

// In local mode (auth disabled), populate from VITE_ env vars
let _sensitiveConfig: SensitiveConfig | null = !config.auth.enabled
  ? {
      environments: {
        test: {
          hasuraAdminSecret: import.meta.env.VITE_HASURA_ADMIN_SECRET || '',
          graphqlEndpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
        },
        prod: {
          hasuraAdminSecret: import.meta.env.VITE_HASURA_ADMIN_SECRET || '',
          graphqlEndpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
        },
      },
      shared: {
        grafanaSecret: import.meta.env.VITE_GRAFANA_SECRET || '',
        grafanaServiceAccountToken: import.meta.env.VITE_GRAFANA_SERVICE || '',
        grafanaUserId: import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID || '',
      },
    }
  : null;

export function getSensitiveConfig(): SensitiveConfig | null {
  return _sensitiveConfig;
}

export function getEnvConfig(environment: AppEnvironment): EnvironmentConfig | null {
  return _sensitiveConfig?.environments[environment] ?? null;
}

export function getSharedConfig() {
  return _sensitiveConfig?.shared ?? null;
}

export async function loadSensitiveConfig(token: string): Promise<SensitiveConfig> {
  const res = await fetch('/api/config', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load config');
  }
  _sensitiveConfig = await res.json();
  return _sensitiveConfig!;
}

export function clearSensitiveConfig(): void {
  _sensitiveConfig = null;
}
