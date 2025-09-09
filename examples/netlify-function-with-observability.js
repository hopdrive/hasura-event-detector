// Example Netlify Function with Observability Plugin Enabled
// This demonstrates how to configure and use the observability plugin
// in a production Netlify function for event detection

const auth = require('../lib/functionAuth');
const { listenTo, handleSuccess, handleFailure } = require('@hopdrive/hasura-event-detector');

// Import shared and local jobs
const sharedJobs = require('../lib/jobs');
const localJobs = require('./jobs');
const events = require('./events');

exports.handler = async (event, context) => {
  try {
    // Validate authentication
    if (!auth.hasValidPassphrase(event)) return { statusCode: 401, body: `Unauthorized!` };

    const res = await listenTo(JSON.parse(event.body), {
      autoLoadEventModules: true,
      eventModulesDirectory: `${__dirname}/events`,
      sourceFunction: 'event-detector-moves', // Required for observability tracking
      
      // Observability plugin configuration
      observability: {
        enabled: process.env.OBSERVABILITY_ENABLED === 'true',
        
        // Database connection
        database: {
          connectionString: process.env.OBSERVABILITY_DB_URL,
          // Alternative: individual connection parameters
          // host: process.env.OBSERVABILITY_DB_HOST,
          // port: process.env.OBSERVABILITY_DB_PORT,
          // database: process.env.OBSERVABILITY_DB_NAME,
          // user: process.env.OBSERVABILITY_DB_USER,
          // password: process.env.OBSERVABILITY_DB_PASSWORD,
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        },
        
        // Data capture settings
        captureConsoleLog: true,        // Capture console.log/error/warn during job execution
        captureJobOptions: true,        // Store job options/parameters for debugging
        captureHasuraPayload: true,     // Store full Hasura event payload (disable for GDPR compliance)
        captureErrorStacks: true,       // Capture full error stack traces
        
        // Performance settings
        batchSize: 100,                 // Batch database writes for efficiency
        flushInterval: 5000,            // Flush to database every 5 seconds
        retryAttempts: 3,              // Retry failed database writes
        retryDelay: 1000,              // Delay between retries (ms)
        
        // Schema configuration
        schema: 'event_detector_observability'
      }
    });

    return handleSuccess(res);
  } catch (e) {
    // The plugin will automatically record this failure
    return handleFailure(e);
  }
};

// Example environment variables for .env file:
/*
# Observability Settings
OBSERVABILITY_ENABLED=true
OBSERVABILITY_DB_URL=postgresql://user:password@localhost:5432/observability_db

# Alternative database connection
# OBSERVABILITY_DB_HOST=localhost
# OBSERVABILITY_DB_PORT=5432
# OBSERVABILITY_DB_NAME=observability_db
# OBSERVABILITY_DB_USER=observability_user
# OBSERVABILITY_DB_PASSWORD=secure_password
*/