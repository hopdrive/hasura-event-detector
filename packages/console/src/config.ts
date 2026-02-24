/// <reference types="vite/client" />

const env = import.meta.env.VITE_ENV || 'test';

const config_test = {
  graphql: {
    endpoint: 'https://gql-test.hopdrive.io/v1/graphql',
  },
};

const config_prod = {
  graphql: {
    endpoint: 'https://gql.hopdrive.io/v1/graphql',
  },
};

const config = {
  appEnv: env,

  graphql: {
    endpoint: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
    ...(env === 'test' ? config_test.graphql : null),
    ...(env === 'production' ? config_prod.graphql : null),
  },

  auth: {
    enabled: import.meta.env.VITE_AUTH_ENABLED !== 'false',
  },

  logging: {
    environment: import.meta.env.VITE_GRAFANA_ENVIRONMENT || env,
    grafana: {
      host: import.meta.env.VITE_GRAFANA_HOST || '',
      lokiDatasourceUid: import.meta.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs',
      url: import.meta.env.VITE_GRAFANA_URL || '',
    },
  },
};

export default config;

// --- Sensitive config loaded at runtime after auth ---

export interface SensitiveConfig {
  hasuraAdminSecret: string;
  grafanaSecret: string;
  grafanaServiceAccountToken: string;
  grafanaUserId: string;
}

// In local mode (auth disabled), read sensitive values directly from VITE_ env vars
// so everything works without Netlify functions running.
let _sensitiveConfig: SensitiveConfig | null = !config.auth.enabled
  ? {
      hasuraAdminSecret: import.meta.env.VITE_HASURA_ADMIN_SECRET || '',
      grafanaSecret: import.meta.env.VITE_GRAFANA_SECRET || '',
      grafanaServiceAccountToken: import.meta.env.VITE_GRAFANA_SERVICE || '',
      grafanaUserId: import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID || '',
    }
  : null;

export function getSensitiveConfig(): SensitiveConfig | null {
  return _sensitiveConfig;
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
