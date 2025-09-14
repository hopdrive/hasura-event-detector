import React from 'react';
import { motion } from 'framer-motion';
import {
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

interface DatabaseConnectionStatusProps {
  error?: Error;
  loading?: boolean;
  hasData?: boolean;
}

const DatabaseConnectionStatus: React.FC<DatabaseConnectionStatusProps> = ({
  error,
  loading,
  hasData
}) => {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6"
      >
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
          <div>
            <h3 className="text-sm font-medium text-blue-800 dark:text-blue-400">
              Connecting to Observability Database
            </h3>
            <p className="text-sm text-blue-600 dark:text-blue-300">
              Please wait while we establish connection...
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6"
      >
        <div className="flex">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-400">
              Observability Database Not Connected
            </h3>
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>The dashboard is running, but the observability database is not accessible.</p>
              <details className="mt-2">
                <summary className="cursor-pointer font-medium">Setup Instructions</summary>
                <div className="mt-2 space-y-2 text-xs">
                  <p><strong>1. Set up the observability database:</strong></p>
                  <pre className="bg-yellow-100 dark:bg-yellow-900/50 p-2 rounded text-xs font-mono">
{`cd ../model
psql -h your-rds-host -U postgres -f create-database.sql
psql -h your-rds-host -U observability_admin -d event_detector_observability -f schema.sql`}
                  </pre>
                  <p><strong>2. Configure environment variables:</strong></p>
                  <pre className="bg-yellow-100 dark:bg-yellow-900/50 p-2 rounded text-xs font-mono">
{`VITE_GRAPHQL_ENDPOINT=http://localhost:8080/v1/graphql
VITE_HASURA_ADMIN_SECRET=your_admin_secret`}
                  </pre>
                  <p><strong>3. Track tables in Hasura Console</strong></p>
                </div>
              </details>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                Error: {error.message}
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (hasData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-6"
      >
        <div className="flex items-center">
          <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
          <p className="text-xs text-green-700 dark:text-green-400">
            Connected to observability database
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6"
    >
      <div className="flex">
        <InformationCircleIcon className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-200">
            No Observability Data Available
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            The dashboard is connected but no events have been recorded yet.
            Start using your event detector to see data appear here.
          </p>
        </div>
      </div>
    </motion.div>
  );
};

export default DatabaseConnectionStatus;