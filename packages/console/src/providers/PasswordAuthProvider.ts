import type { AuthProvider, AuthState, LoginField } from './auth-provider.types';
import { loadSensitiveConfig, clearSensitiveConfig } from '../config';

const TOKEN_KEY = 'hed-console-token';

export class PasswordAuthProvider implements AuthProvider {
  readonly name = 'password';
  readonly requiresLogin = true;

  async initialize(): Promise<AuthState> {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      try {
        await loadSensitiveConfig(token);
        return {
          isAuthenticated: true,
          user: null,
          token,
          loading: false,
          error: null,
        };
      } catch {
        // Token expired or invalid — clear and require re-login
        localStorage.removeItem(TOKEN_KEY);
        clearSensitiveConfig();
      }
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
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: credentials.password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return {
          isAuthenticated: false,
          user: null,
          token: null,
          loading: false,
          error: data.error || 'Invalid password',
        };
      }

      const { token } = await res.json();
      localStorage.setItem(TOKEN_KEY, token);
      await loadSensitiveConfig(token);

      return {
        isAuthenticated: true,
        user: null,
        token,
        loading: false,
        error: null,
      };
    } catch (err: any) {
      return {
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: err.message || 'Login failed',
      };
    }
  }

  async logout(): Promise<void> {
    localStorage.removeItem(TOKEN_KEY);
    clearSensitiveConfig();
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
