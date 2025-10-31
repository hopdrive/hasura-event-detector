/**
 * Database Connection Configuration for Event Detector Observability
 *
 * This module provides connection configuration for the separate observability database.
 * It supports multiple environments and connection methods for any event source system.
 */

/**
 * Default connection configuration for the observability database
 * This connects to a separate database on the same RDS server as your main application
 */
const defaultConfig = {
  // Database connection details
  host: process.env.OBSERVABILITY_DB_HOST || process.env.DATABASE_URL?.match(/postgresql:\/\/[^@]+@([^:]+)/)?.[1] || 'localhost',
  port: parseInt(process.env.OBSERVABILITY_DB_PORT || process.env.DATABASE_URL?.match(/:(\d+)\//)?.[1] || '5432'),
  database: process.env.OBSERVABILITY_DB_NAME || 'event_detector_observability',

  // User credentials - use dedicated observability user
  username: process.env.OBSERVABILITY_DB_USER || 'observability_app',
  password: process.env.OBSERVABILITY_DB_PASSWORD,

  // Connection pool settings optimized for observability writes
  pool: {
    min: parseInt(process.env.OBSERVABILITY_DB_POOL_MIN || '2'),
    max: parseInt(process.env.OBSERVABILITY_DB_POOL_MAX || '10'),
    idle: parseInt(process.env.OBSERVABILITY_DB_POOL_IDLE || '10000'), // 10 seconds
    acquire: parseInt(process.env.OBSERVABILITY_DB_ACQUIRE_TIMEOUT || '60000'), // 60 seconds
    evict: parseInt(process.env.OBSERVABILITY_DB_EVICT_TIMEOUT || '1000') // 1 second
  },

  // SSL configuration (recommended for production)
  ssl: process.env.NODE_ENV === 'production' ? {
    require: true,
    rejectUnauthorized: false // Set to true if you have proper SSL certificates
  } : false,

  // Connection options
  options: {
    dialect: 'postgres',
    dialectOptions: {
      connectTimeout: parseInt(process.env.OBSERVABILITY_DB_CONNECT_TIMEOUT || '20000'),
      requestTimeout: parseInt(process.env.OBSERVABILITY_DB_REQUEST_TIMEOUT || '15000'),
      timezone: process.env.OBSERVABILITY_DB_TIMEZONE || 'UTC'
    },

    // Logging configuration
    logging: process.env.OBSERVABILITY_DB_LOGGING === 'true' ? console.log : false,

    // Performance settings
    benchmark: process.env.NODE_ENV === 'development',
    retry: {
      max: parseInt(process.env.OBSERVABILITY_DB_RETRY_MAX || '3')
    }
  }
};

/**
 * Environment-specific configurations
 */
const environments = {
  development: {
    ...defaultConfig,
    // Development overrides
    pool: {
      ...defaultConfig.pool,
      min: 1,
      max: 5
    },
    options: {
      ...defaultConfig.options,
      logging: console.log,
      benchmark: true
    }
  },

  staging: {
    ...defaultConfig,
    // Staging overrides - moderate connection pool
    pool: {
      ...defaultConfig.pool,
      min: 2,
      max: 8
    }
  },

  production: {
    ...defaultConfig,
    // Production overrides - larger connection pool
    pool: {
      ...defaultConfig.pool,
      min: 3,
      max: 15
    },
    ssl: {
      require: true,
      rejectUnauthorized: process.env.OBSERVABILITY_DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    },
    options: {
      ...defaultConfig.options,
      logging: false, // Disable SQL logging in production
      benchmark: false
    }
  }
};

/**
 * Get connection configuration for current environment
 * @param {string} env - Environment name (development, staging, production)
 * @returns {Object} Database connection configuration
 */
function getConfig(env = process.env.NODE_ENV || 'development') {
  const config = environments[env] || environments.development;

  // Validate required configuration
  if (!config.password) {
    throw new Error(`Missing OBSERVABILITY_DB_PASSWORD environment variable for ${env} environment`);
  }

  return config;
}

/**
 * Create a connection URL from configuration
 * Useful for tools that expect a connection string
 * @param {Object} config - Database configuration object
 * @returns {string} PostgreSQL connection URL
 */
function createConnectionUrl(config = getConfig()) {
  const { username, password, host, port, database, ssl } = config;
  const sslParam = ssl ? '?sslmode=require' : '';

  return `postgresql://${username}:${encodeURIComponent(password)}@${host}:${port}/${database}${sslParam}`;
}

/**
 * Validate database connection configuration
 * @param {Object} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
function validateConfig(config) {
  const required = ['host', 'port', 'database', 'username', 'password'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(`Missing required configuration field: ${field}`);
    }
  }

  if (isNaN(config.port) || config.port <= 0) {
    throw new Error(`Invalid port number: ${config.port}`);
  }

  return true;
}

/**
 * Example environment variable configuration
 * Copy this to your .env file and update the values
 */
const exampleEnvVars = `
# Observability Database Configuration
# These variables configure the separate observability database connection

# Database connection (use your RDS endpoint)
OBSERVABILITY_DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
OBSERVABILITY_DB_PORT=5432
OBSERVABILITY_DB_NAME=event_detector_observability

# Database credentials (created by create-database.sql)
OBSERVABILITY_DB_USER=observability_app
OBSERVABILITY_DB_PASSWORD=your-secure-password-here

# Connection pool settings (optional - defaults provided)
OBSERVABILITY_DB_POOL_MIN=2
OBSERVABILITY_DB_POOL_MAX=10
OBSERVABILITY_DB_POOL_IDLE=10000

# SSL and timeout settings (optional)
OBSERVABILITY_DB_SSL_REJECT_UNAUTHORIZED=false
OBSERVABILITY_DB_CONNECT_TIMEOUT=20000
OBSERVABILITY_DB_REQUEST_TIMEOUT=15000

# Logging (optional)
OBSERVABILITY_DB_LOGGING=false
`;

module.exports = {
  getConfig,
  createConnectionUrl,
  validateConfig,
  defaultConfig,
  environments,
  exampleEnvVars
};

// For ES6 imports
module.exports.default = getConfig;