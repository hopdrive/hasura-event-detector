/**
 * Console Configuration
 *
 * This file contains the default configuration for the observability console.
 * Users can override these settings by creating their own console.config.js file
 * in their project root or by using command line arguments.
 */

module.exports = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/hasura_event_detector_observability',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },

  // Hasura configuration
  hasura: {
    endpoint: process.env.HASURA_ENDPOINT || 'http://localhost:8080/v1/graphql',
    adminSecret: process.env.HASURA_ADMIN_SECRET || 'myadminsecretkey'
  },

  // Console server configuration
  console: {
    port: parseInt(process.env.CONSOLE_PORT) || 3000,
    host: process.env.CONSOLE_HOST || 'localhost',
    publicUrl: process.env.CONSOLE_PUBLIC_URL || 'http://localhost:3000',
    autoOpen: process.env.CONSOLE_AUTO_OPEN !== 'false',
    watchMode: process.env.NODE_ENV !== 'production'
  },

  // Console features
  features: {
    realTimeUpdates: true,
    darkMode: true,
    exportData: true,
    correlationSearch: true,
    flowDiagram: true,
    analytics: true
  },

  // Development settings
  development: {
    hotReload: true,
    sourceMaps: true,
    verboseLogging: process.env.NODE_ENV === 'development'
  }
};
