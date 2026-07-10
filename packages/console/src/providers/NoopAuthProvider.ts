import type { AuthProvider, AuthState } from './auth-provider.types';

const AUTHENTICATED_STATE: AuthState = {
  isAuthenticated: true,
  user: null,
  token: null,
  loading: false,
  error: null,
};

export class NoopAuthProvider implements AuthProvider {
  readonly name = 'noop';
  readonly requiresLogin = false;

  async initialize(): Promise<AuthState> {
    return AUTHENTICATED_STATE;
  }

  async login(): Promise<AuthState> {
    return AUTHENTICATED_STATE;
  }

  async logout(): Promise<void> {}
}
