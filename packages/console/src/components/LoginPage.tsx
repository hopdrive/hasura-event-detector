import { useState, FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { isAuthenticated, loading, error, provider, login } = useAuth();
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!provider.requiresLogin || isAuthenticated) {
    return <Navigate to='/' replace />;
  }

  const fields = provider.getLoginFields?.() ?? [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    await login(credentials);
    setSubmitting(false);
  };

  return (
    <div className='min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4'>
      <div className='w-full max-w-sm'>
        {/* Logo */}
        <div className='flex flex-col items-center mb-8'>
          <div className='w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mb-4'>
            <span className='text-white font-bold text-lg'>ED</span>
          </div>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-white'>Event Detector</h1>
          <p className='mt-1 text-sm text-gray-500 dark:text-gray-400'>Sign in to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className='space-y-4'>
          {fields.map(field => (
            <div key={field.name}>
              <label
                htmlFor={field.name}
                className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'
              >
                {field.label}
              </label>
              <input
                id={field.name}
                type={field.type}
                placeholder={field.placeholder}
                required={field.required}
                value={credentials[field.name] ?? ''}
                onChange={e =>
                  setCredentials(prev => ({ ...prev, [field.name]: e.target.value }))
                }
                className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
            </div>
          ))}

          {error && (
            <div className='text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg'>
              {error}
            </div>
          )}

          <button
            type='submit'
            disabled={submitting || loading}
            className='w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors'
          >
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
