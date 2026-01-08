import { useState, useEffect } from 'react';
import { useQuery, gql } from '@apollo/client';

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

/**
 * Extract database information from GraphQL endpoint URL
 */
function extractDatabaseInfo(endpoint: string): {
  databaseName: string | null;
  host: string | null;
} {
  try {
    const url = new URL(endpoint);
    const host = url.hostname;
    
    // Try to extract database name from path or hostname
    // Common patterns:
    // - /v1/graphql (no db name in path)
    // - hostname might contain db info
    let databaseName: string | null = null;
    
    // Check if hostname contains database info (e.g., db-name.host.com)
    const hostParts = host.split('.');
    if (hostParts.length > 0 && hostParts[0].includes('-')) {
      // Might be a database-specific hostname
      databaseName = hostParts[0];
    }
    
    // If we can't extract from hostname, use a generic identifier
    if (!databaseName) {
      // Use the hostname as identifier
      databaseName = host.replace(/\./g, '-');
    }
    
    return {
      databaseName,
      host,
    };
  } catch {
    return {
      databaseName: null,
      host: null,
    };
  }
}

export function useSystemStatus(): SystemStatus {
  const graphqlEndpoint = import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql';
  
  const { data, loading, error } = useQuery(HEALTH_CHECK_QUERY, {
    fetchPolicy: 'network-only',
    errorPolicy: 'all',
    pollInterval: 30000, // Check every 30 seconds
    notifyOnNetworkStatusChange: true,
  });

  const [databaseInfo] = useState(() => {
    return {
      endpoint: graphqlEndpoint,
      ...extractDatabaseInfo(graphqlEndpoint),
    };
  });

  const isHealthy = !error && !loading && data !== undefined;
  const isLoading = loading;

  return {
    isHealthy,
    isLoading,
    error: error || null,
    databaseInfo,
  };
}
