import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink, useApolloClient } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import {
  HomeIcon,
  TableCellsIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import OverviewDashboard from './components/OverviewDashboard';
import InvocationsTable from './components/InvocationsTable';
import FlowDiagram from './components/FlowDiagram';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import CorrelationSearch from './components/CorrelationSearch';
import FlowHeader from './components/FlowHeader';
import TimeRangeSelector from './components/TimeRangeSelector';
import LoginPage from './components/LoginPage';
import ProtectedRoute from './components/ProtectedRoute';
import EnvironmentSwitcher from './components/EnvironmentSwitcher';
import { PollingProvider, usePolling } from './contexts/PollingContext';
import { LogProviderProvider } from './contexts/LogProviderContext';
import { AuthProviderWrapper } from './contexts/AuthContext';
import { EnvironmentProvider, useEnvironment } from './contexts/EnvironmentContext';
import { NoopAuthProvider, PasswordAuthProvider } from './providers';
import { useSystemStatus } from './hooks/useSystemStatus';
import config, { getEnvConfig, activeEnvironmentRef } from './config';
import './styles/globals.css';

const authProvider = config.auth.enabled
  ? new PasswordAuthProvider()
  : new NoopAuthProvider();

// Apollo Client — custom fetch reads the active env's endpoint at request time
const httpLink = createHttpLink({
  uri: config.graphql.endpoint,
  fetch: (_uri, options) => {
    const envConfig = getEnvConfig(activeEnvironmentRef.current);
    const actualUri = envConfig?.graphqlEndpoint || config.graphql.endpoint;
    return fetch(actualUri, options);
  },
});

const authLink = setContext((_, { headers }) => {
  const envConfig = getEnvConfig(activeEnvironmentRef.current);
  return {
    headers: {
      ...headers,
      ...(envConfig?.hasuraAdminSecret && {
        'x-hasura-admin-secret': envConfig.hasuraAdminSecret,
      }),
    },
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          invocations: {
            merge(_existing = [], incoming) {
              return incoming;
            },
          },
        },
      },
    },
  }),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'cache-first',
      errorPolicy: 'all',
    },
  },
});

// Syncs environment changes → clears Apollo cache so queries re-fetch from new endpoint
function EnvironmentSync() {
  const { environment } = useEnvironment();
  const apolloClient = useApolloClient();

  useEffect(() => {
    apolloClient.resetStore();
  }, [environment, apolloClient]);

  return null;
}

const navigation = [
  { name: 'Overview', href: '/', icon: HomeIcon },
  { name: 'Invocations', href: '/invocations', icon: TableCellsIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

function NavItem({ item, isActive }: { item: any; isActive: boolean }) {
  return (
    <Link
      to={item.href}
      className={`
        group flex items-center px-3 py-2 text-sm font-medium rounded-lg
        transition-all duration-200 relative
        ${
          isActive
            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
            : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
        }
      `}
    >
      {isActive && (
        <motion.div
          layoutId='activeNav'
          className='absolute inset-0 bg-blue-50 dark:bg-blue-900/20 rounded-lg'
          initial={false}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
      <item.icon
        className={`
          relative mr-3 h-5 w-5 flex-shrink-0
          ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500'}
        `}
      />
      <span className='relative'>{item.name}</span>
    </Link>
  );
}

function Layout({
  children,
  correlationSearch,
  setCorrelationSearch,
  timeRange,
  setTimeRange,
}: {
  children: React.ReactNode;
  correlationSearch: string;
  setCorrelationSearch: (value: string) => void;
  timeRange: string;
  setTimeRange: (value: string) => void;
}) {
  const location = useLocation();
  const { isPolling } = usePolling();
  const systemStatus = useSystemStatus();
  const isFlowPage = location.pathname === '/flow';
  const { environment } = useEnvironment();

  return (
    <div className='h-screen flex bg-gray-50 dark:bg-gray-900'>
      {/* Sidebar */}
      <div className={`w-64 bg-white dark:bg-gray-800 border-r ${
        environment === 'prod'
          ? 'border-red-300 dark:border-red-800'
          : 'border-gray-200 dark:border-gray-700'
      }`}>
        <div className='flex flex-col h-full'>
          {/* Logo */}
          <div className='flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700'>
            <div className='flex items-center'>
              <div className='w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center'>
                <span className='text-white font-bold text-sm'>ED</span>
              </div>
              <span className='ml-3 text-lg font-semibold text-gray-900 dark:text-white'>Event Detector</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className='flex-1 space-y-1 px-3 py-4'>
            {navigation.map(item => (
              <NavItem key={item.name} item={item} isActive={location.pathname === item.href} />
            ))}
          </nav>

          {/* Environment & Database Info */}
          <div className='p-4 border-t border-gray-200 dark:border-gray-700'>
            <div className='space-y-3'>
              {/* Environment Switcher */}
              <div>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Environment
                </span>
                <div className='mt-1'>
                  <EnvironmentSwitcher />
                </div>
              </div>

              {/* Database */}
              <div>
                <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Database
                </span>
                <div className='mt-1'>
                  {systemStatus.databaseInfo.host ? (
                    <div className='text-sm'>
                      <div
                        className='text-gray-900 dark:text-gray-100 font-medium truncate'
                        title={systemStatus.databaseInfo.host}
                      >
                        {systemStatus.databaseInfo.host}
                      </div>
                      {systemStatus.databaseInfo.databaseName && (
                        <div
                          className='text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate'
                          title={systemStatus.databaseInfo.databaseName}
                        >
                          {systemStatus.databaseInfo.databaseName}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className='text-sm text-gray-600 dark:text-gray-400 truncate'
                      title={systemStatus.databaseInfo.endpoint}
                    >
                      {systemStatus.databaseInfo.endpoint.replace(/^https?:\/\//, '').replace(/\/v1\/graphql$/, '')}
                    </div>
                  )}
                </div>
              </div>

              {/* System Status */}
              <div>
                <div className='flex items-center justify-between text-sm'>
                  <span className='text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                    System Status
                  </span>
                  <div className='flex items-center'>
                    {systemStatus.isLoading ? (
                      <>
                        <div className='w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2' />
                        <span className='text-yellow-600 dark:text-yellow-400'>Checking...</span>
                      </>
                    ) : systemStatus.isHealthy ? (
                      <>
                        <div className='w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2' />
                        <span className='text-green-600 dark:text-green-400'>Healthy</span>
                      </>
                    ) : (
                      <>
                        <div className='w-2 h-2 bg-red-500 rounded-full mr-2' />
                        <span className='text-red-600 dark:text-red-400'>Unhealthy</span>
                      </>
                    )}
                  </div>
                </div>
                {systemStatus.error && (
                  <div
                    className='mt-1 text-xs text-red-600 dark:text-red-400 truncate'
                    title={systemStatus.error.message}
                  >
                    {systemStatus.error.message}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className='flex-1 flex flex-col overflow-hidden'>
        {/* Header */}
        <header className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
          <div className='px-6 py-4'>
            {isFlowPage ? (
              <FlowHeader />
            ) : (
              <div className='flex items-center justify-between'>
                <div className='flex-1 max-w-2xl'>
                  <CorrelationSearch value={correlationSearch} onChange={setCorrelationSearch} />
                </div>
                <div className='flex items-center space-x-4 ml-6'>
                  <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                  <div className='flex items-center'>
                    <ArrowPathIcon
                      className={`h-5 w-5 ${isPolling ? 'animate-spin text-blue-600' : 'text-gray-400'}`}
                    />
                    <span className='ml-2 text-sm text-gray-600 dark:text-gray-400'>
                      {isPolling ? 'Syncing...' : 'Auto-refresh'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className='flex-1 overflow-auto bg-gray-50 dark:bg-gray-900'>
          <AnimatePresence mode='wait'>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className='h-full'
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function App() {
  const [correlationSearch, setCorrelationSearch] = useState('');

  const [timeRange, setTimeRange] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hasura-event-detector-timeRange');
      return saved || '24h';
    }
    return '24h';
  });

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasura-event-detector-timeRange', timeRange);
    }
  }, [timeRange]);

  return (
    <ApolloProvider client={client}>
      <AuthProviderWrapper provider={authProvider}>
      <PollingProvider>
        <Router
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path='/login' element={<LoginPage />} />
            <Route
              path='*'
              element={
                <ProtectedRoute>
                  <EnvironmentProvider>
                  <EnvironmentSync />
                  <LogProviderProvider>
                  <Layout
                    correlationSearch={correlationSearch}
                    setCorrelationSearch={setCorrelationSearch}
                    timeRange={timeRange}
                    setTimeRange={setTimeRange}
                  >
                    <Routes>
                      <Route
                        path='/'
                        element={<OverviewDashboard correlationSearch={correlationSearch} timeRange={timeRange} />}
                      />
                      <Route path='/invocations' element={<InvocationsTable correlationSearch={correlationSearch} timeRange={timeRange} />} />
                      <Route path='/flow' element={<FlowDiagram />} />
                      <Route path='/analytics' element={<Analytics timeRange={timeRange} />} />
                      <Route path='/settings' element={<Settings />} />
                    </Routes>
                  </Layout>
                  </LogProviderProvider>
                  </EnvironmentProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </PollingProvider>
      </AuthProviderWrapper>
    </ApolloProvider>
  );
}

export default App;
