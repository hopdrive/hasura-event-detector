import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, provider } = useAuth();

  if (!provider.requiresLogin) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className='h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900'>
        <div className='w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin' />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to='/login' replace />;
  }

  return <>{children}</>;
}
