import React, { createContext, useContext, useState, ReactNode } from 'react';

interface PollingContextType {
  isPolling: boolean;
  setIsPolling: (value: boolean) => void;
}

const PollingContext = createContext<PollingContextType | undefined>(undefined);

export function PollingProvider({ children }: { children: ReactNode }) {
  const [isPolling, setIsPolling] = useState(false);

  return (
    <PollingContext.Provider value={{ isPolling, setIsPolling }}>
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

