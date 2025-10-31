import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useSearchParams } from 'react-router-dom';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client';
import {
  HomeIcon,
  TableCellsIcon,
  ShareIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import OverviewDashboard from './components/OverviewDashboard';
import InvocationsTable from './components/InvocationsTable';
import FlowDiagram, { calculateFlowSummary } from './components/FlowDiagram';
import Analytics from './components/Analytics';
import Settings from './components/Settings';
import CorrelationSearch from './components/CorrelationSearch';
import FlowHeader from './components/FlowHeader';
import './styles/globals.css';

// Apollo Client configuration
const httpLink = createHttpLink({
  uri: import.meta.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql',
  headers: {
    ...(import.meta.env.VITE_HASURA_ADMIN_SECRET && {
      'x-hasura-admin-secret': import.meta.env.VITE_HASURA_ADMIN_SECRET,
    }),
  },
});

const client = new ApolloClient({
  link: httpLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          invocations: {
            merge(existing = [], incoming) {
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

const navigation = [
  { name: 'Overview', href: '/', icon: HomeIcon },
  { name: 'Invocations', href: '/invocations', icon: TableCellsIcon },
  { name: 'Flow Diagram', href: '/flow', icon: ShareIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon }
];

function NavItem({ item, isActive }: { item: any; isActive: boolean }) {
  return (
    <Link
      to={item.href}
      className={`
        group flex items-center px-3 py-2 text-sm font-medium rounded-lg
        transition-all duration-200 relative
        ${isActive
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800'
        }
      `}
    >
      {isActive && (
        <motion.div
          layoutId="activeNav"
          className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
          initial={false}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
      <item.icon
        className={`
          relative mr-3 h-5 w-5 flex-shrink-0
          ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 group-hover:text-gray-500'}
        `}
      />
      <span className="relative">{item.name}</span>
    </Link>
  );
}

function Layout({ children, correlationSearch, setCorrelationSearch }: { children: React.ReactNode; correlationSearch: string; setCorrelationSearch: (value: string) => void }) {
  const location = useLocation();
  const [isPolling, setIsPolling] = useState(false);
  const isFlowPage = location.pathname === '/flow';

  // Simulate polling indicator
  React.useEffect(() => {
    const interval = setInterval(() => {
      setIsPolling(true);
      setTimeout(() => setIsPolling(false), 1000);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">ED</span>
              </div>
              <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">
                Event Detector
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navigation.map((item) => (
              <NavItem
                key={item.name}
                item={item}
                isActive={location.pathname === item.href}
              />
            ))}
          </nav>

          {/* System Status */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">System Status</span>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2" />
                <span className="text-green-600 dark:text-green-400">Healthy</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="px-6 py-4">
            {isFlowPage ? (
              /* Flow Page Header - Show Summary */
              <FlowHeader />
            ) : (
              /* Other Pages Header - Show Search and Time Range */
              <div className="flex items-center justify-between">
                {/* Search */}
                <div className="flex-1 max-w-2xl">
                  <CorrelationSearch
                    value={correlationSearch}
                    onChange={setCorrelationSearch}
                  />
                </div>

                {/* Time Range & Sync Indicator */}
                <div className="flex items-center space-x-4 ml-6">
                  <select className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100">
                    <option>Last 1 hour</option>
                    <option>Last 6 hours</option>
                    <option>Last 24 hours</option>
                    <option>Last 7 days</option>
                    <option>Custom range</option>
                  </select>

                  <div className="flex items-center">
                    <ArrowPathIcon
                      className={`h-5 w-5 ${isPolling ? 'animate-spin text-blue-600' : 'text-gray-400'}`}
                    />
                    <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      {isPolling ? 'Syncing...' : 'Auto-refresh'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
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

  return (
    <ApolloProvider client={client}>
      <Router
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Layout correlationSearch={correlationSearch} setCorrelationSearch={setCorrelationSearch}>
          <Routes>
            <Route path="/" element={<OverviewDashboard correlationSearch={correlationSearch} />} />
            <Route path="/invocations" element={<InvocationsTable correlationSearch={correlationSearch} />} />
            <Route path="/flow" element={<FlowDiagram />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Layout>
      </Router>
    </ApolloProvider>
  );
}

export default App;
