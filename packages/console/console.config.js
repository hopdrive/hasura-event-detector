/**
 * Hasura Event Detector Console Configuration
 *
 * This file contains the configuration for the observability console.
 * You can override these settings using environment variables or command line arguments.
 */

module.exports = {
  // Database configuration
  database: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://observability_app:CHANGE_THIS_PASSWORD_IN_PRODUCTION@test-hopdrive-admin-graphql.comzqgkf8brl.us-east-1.rds.amazonaws.com:5432/event_detector_observability',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },

  // Hasura configuration
  hasura: {
    endpoint: process.env.HASURA_ENDPOINT || 'https://gql-test.hopdrive.io/v1/graphql',
    adminSecret: process.env.HASURA_ADMIN_SECRET || 'F5RT9adRXMeYaQ9Dh85o2L2rYibNj4Rka36nZ9pFCt2UBpYLiNfg74kWiZz3',
  },

  // Console server configuration
  console: {
    port: parseInt(process.env.CONSOLE_PORT) || 3000,
    host: process.env.CONSOLE_HOST || 'localhost',
    publicUrl: process.env.CONSOLE_PUBLIC_URL || 'http://localhost:3000',
    autoOpen: process.env.CONSOLE_AUTO_OPEN !== 'false',
    watchMode: process.env.NODE_ENV !== 'production',
  },

  // Console features
  features: {
    realTimeUpdates: true,
    darkMode: true,
    exportData: true,
    correlationSearch: true,
    flowDiagram: true,
    analytics: true,
  },

  // Development settings
  development: {
    hotReload: true,
    sourceMaps: true,
    verboseLogging: process.env.NODE_ENV === 'development',
  },
};
