import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type PollingInterval = 5000 | 30000 | 300000;

export const POLLING_INTERVALS: { value: PollingInterval; label: string }[] = [
  { value: 5000, label: '5s' },
  { value: 30000, label: '30s' },
  { value: 300000, label: '5min' },
];

const STORAGE_KEY = 'hasura-event-detector-polling';

function loadPersistedState(): { enabled: boolean; interval: PollingInterval } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        interval: POLLING_INTERVALS.some(p => p.value === parsed.interval) ? parsed.interval : 5000,
      };
    }
  } catch {}
  return { enabled: true, interval: 5000 };
}

function persistState(enabled: boolean, interval: PollingInterval) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, interval }));
  } catch {}
}

interface PollingContextType {
  isPolling: boolean;
  setIsPolling: (value: boolean) => void;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  interval: PollingInterval;
  setInterval: (value: PollingInterval) => void;
  getEffectivePollInterval: (isCustomRange: boolean) => number;
}

const PollingContext = createContext<PollingContextType | undefined>(undefined);

export function PollingProvider({ children }: { children: ReactNode }) {
  const [isPolling, setIsPolling] = useState(false);
  const [enabled, setEnabledState] = useState<boolean>(() => loadPersistedState().enabled);
  const [interval, setIntervalState] = useState<PollingInterval>(() => loadPersistedState().interval);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    persistState(value, interval);
  }, [interval]);

  const setInterval = useCallback((value: PollingInterval) => {
    setIntervalState(value);
    persistState(enabled, value);
  }, [enabled]);

  const getEffectivePollInterval = useCallback(
    (isCustomRange: boolean): number => {
      if (!enabled || isCustomRange) return 0;
      return interval;
    },
    [enabled, interval],
  );

  return (
    <PollingContext.Provider
      value={{ isPolling, setIsPolling, enabled, setEnabled, interval, setInterval, getEffectivePollInterval }}
    >
      {children}
    </PollingContext.Provider>
  );
}

export function usePolling() {
  const context = useContext(PollingContext);
  if (context === undefined) {
    throw new Error('usePolling must be used within a PollingProvider');
  }
  return context;
}
