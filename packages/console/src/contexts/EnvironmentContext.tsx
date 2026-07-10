import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { AppEnvironment } from '../config';
import { activeEnvironmentRef } from '../config';

const STORAGE_KEY = 'hed-console-environment';

interface EnvironmentContextValue {
  environment: AppEnvironment;
  setEnvironment: (env: AppEnvironment) => void;
}

const EnvironmentContext = createContext<EnvironmentContextValue | undefined>(undefined);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironmentState] = useState<AppEnvironment>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'test' || saved === 'prod') return saved;
    return 'test';
  });

  const setEnvironment = useCallback((env: AppEnvironment) => {
    setEnvironmentState(env);
    localStorage.setItem(STORAGE_KEY, env);
  }, []);

  // Keep the module-level ref in sync for Apollo's custom fetch
  useEffect(() => {
    activeEnvironmentRef.current = environment;
  }, [environment]);

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment(): EnvironmentContextValue {
  const context = useContext(EnvironmentContext);
  if (!context) throw new Error('useEnvironment must be used within EnvironmentProvider');
  return context;
}
