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
    adminSecret: import.meta.env.VITE_HASURA_ADMIN_SECRET || '',
    ...(env === 'test' ? config_test.graphql : null),
    ...(env === 'production' ? config_prod.graphql : null),
  },

  logging: {
    environment: import.meta.env.VITE_GRAFANA_ENVIRONMENT || env,
    grafana: {
      host: import.meta.env.VITE_GRAFANA_HOST || '',
      userId: import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID || '',
      secret: import.meta.env.VITE_GRAFANA_SECRET || '',
      serviceAccountToken: import.meta.env.VITE_GRAFANA_SERVICE || '',
      lokiDatasourceUid: import.meta.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs',
      url: import.meta.env.VITE_GRAFANA_URL || '',
    },
  },
};

export default config;
