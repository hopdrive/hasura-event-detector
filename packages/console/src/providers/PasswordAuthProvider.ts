import type { AuthProvider, AuthState, LoginField } from './auth-provider.types';

const SESSION_KEY = 'hed-console-auth';

export class PasswordAuthProvider implements AuthProvider {
  readonly name = 'password';
  readonly requiresLogin = true;

  private password: string;

  constructor(password: string) {
    this.password = password;
  }

  async initialize(): Promise<AuthState> {
    const session = localStorage.getItem(SESSION_KEY);
    if (session === 'authenticated') {
      return {
        isAuthenticated: true,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
    }
    return {
      isAuthenticated: false,
      user: null,
      token: null,
      loading: false,
      error: null,
    };
  }

  async login(credentials: Record<string, string>): Promise<AuthState> {
    if (credentials.password === this.password) {
      localStorage.setItem(SESSION_KEY, 'authenticated');
      return {
        isAuthenticated: true,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
    }

    return {
      isAuthenticated: false,
      user: null,
      token: null,
      loading: false,
      error: 'Invalid password',
    };
  }

  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEY);
  }

  getLoginFields(): LoginField[] {
    return [
      {
        name: 'password',
        type: 'password',
        label: 'Password',
        placeholder: 'Enter console password',
        required: true,
      },
    ];
  }
}
