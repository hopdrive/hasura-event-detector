export interface LoginField {
  name: string;
  type: 'text' | 'password' | 'email';
  label: string;
  placeholder?: string;
  required?: boolean;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: string | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface AuthProvider {
  readonly name: string;
  readonly requiresLogin: boolean;

  initialize(): Promise<AuthState>;
  login(credentials: Record<string, string>): Promise<AuthState>;
  logout(): Promise<void>;
  getLoginFields?(): LoginField[];
}
