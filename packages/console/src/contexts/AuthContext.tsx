import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { AuthProvider, AuthState } from '../providers/auth-provider.types';
import { NoopAuthProvider } from '../providers/NoopAuthProvider';

interface AuthContextValue extends AuthState {
  provider: AuthProvider;
  login: (credentials: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProviderWrapper({
  provider,
  children,
}: {
  provider?: AuthProvider;
  children: ReactNode;
}) {
  const authProvider = provider ?? new NoopAuthProvider();

  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    authProvider.initialize().then(setState);
  }, []);

  const login = useCallback(async (credentials: Record<string, string>) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const result = await authProvider.login(credentials);
    setState(result);
  }, []);

  const logout = useCallback(async () => {
    await authProvider.logout();
    setState({
      isAuthenticated: false,
      user: null,
      token: null,
      loading: false,
      error: null,
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, provider: authProvider, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProviderWrapper');
  }
  return context;
}
