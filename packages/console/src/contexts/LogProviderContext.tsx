import { createContext, useContext, useMemo, ReactNode } from 'react';
import type { LogProvider } from '../providers';
import { GrafanaLokiProvider } from '../providers';
import { useEnvironment } from './EnvironmentContext';

const LogProviderContext = createContext<LogProvider | undefined>(undefined);

export function LogProviderProvider({
  provider,
  children,
}: {
  provider?: LogProvider;
  children: ReactNode;
}) {
  const { environment } = useEnvironment();

  const value = useMemo(() => {
    return provider ?? new GrafanaLokiProvider(environment);
  }, [provider, environment]);

  return (
    <LogProviderContext.Provider value={value}>
      {children}
    </LogProviderContext.Provider>
  );
}

export function useLogProvider(): LogProvider {
  const context = useContext(LogProviderContext);
  if (context === undefined) {
    throw new Error('useLogProvider must be used within a LogProviderProvider');
  }
  return context;
}
