import { useMemo } from 'react';
import { useQuery, gql } from '@apollo/client';
import config, { getEnvConfig } from '../config';
import { useEnvironment } from '../contexts/EnvironmentContext';

const HEALTH_CHECK_QUERY = gql`
  query HealthCheck {
    invocations(limit: 1) {
      id
    }
  }
`;

interface SystemStatus {
  isHealthy: boolean;
  isLoading: boolean;
  error: Error | null;
  databaseInfo: {
    endpoint: string;
    databaseName: string | null;
    host: string | null;
  };
}

function extractDatabaseInfo(endpoint: string): {
  databaseName: string | null;
  host: string | null;
} {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;

    let databaseName: string | null = null;

    const hostParts = host.split('.');
    if (hostParts.length > 0 && hostParts[0].includes('-')) {
      databaseName = hostParts[0];
    }

    if (!databaseName) {
      databaseName = host.replace(/\./g, '-');
    }

    return { databaseName, host };
  } catch {
    return { databaseName: null, host: null };
  }
}

export function useSystemStatus(): SystemStatus {
  const { environment } = useEnvironment();
  const envConfig = getEnvConfig(environment);
  const graphqlEndpoint = envConfig?.graphqlEndpoint || config.graphql.endpoint;

  const { data, loading, error } = useQuery(HEALTH_CHECK_QUERY, {
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    pollInterval: 30000,
    notifyOnNetworkStatusChange: true,
  });

  const databaseInfo = useMemo(() => ({
    endpoint: graphqlEndpoint,
    ...extractDatabaseInfo(graphqlEndpoint),
  }), [graphqlEndpoint]);

  return {
    isHealthy: !error && !loading && data !== undefined,
    isLoading: loading,
    error: error || null,
    databaseInfo,
  };
}
