import { createContext, useContext, ReactNode } from 'react';
import type { LogProvider } from '../providers';
import { GrafanaLokiProvider } from '../providers';

const LogProviderContext = createContext<LogProvider | undefined>(undefined);

export function LogProviderProvider({
  provider,
  children,
}: {
  provider?: LogProvider;
  children: ReactNode;
}) {
  const value = provider ?? new GrafanaLokiProvider();

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
