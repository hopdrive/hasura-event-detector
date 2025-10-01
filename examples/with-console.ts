/**
 * Example: Using Hasura Event Detector with Optional Console
 *
 * This example shows how to use the observability plugin with the optional console UI.
 * The console package is only loaded if installed, keeping production bundles small.
 */

import { listenTo } from '@hopdrive/hasura-event-detector';
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

// Initialize observability plugin
const observability = new ObservabilityPlugin({
  enabled: true,

  // Database configuration for storing observability data
  database: {
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/observability',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },

  // Console configuration (optional)
  // The console will only be served if @hopdrive/hasura-event-detector-console is installed
  console: {
    enabled: process.env.NODE_ENV !== 'production', // Only in dev/staging
    port: 3001,
    host: 'localhost',
    serveInProduction: false, // Never serve in production
    cors: {
      enabled: true,
      origins: ['http://localhost:3000'] // Allow your app origin
    }
  },

  // Observability settings
  captureJobOptions: true,
  captureHasuraPayload: true,
  captureErrorStacks: process.env.NODE_ENV !== 'production',
  batchSize: 100,
  flushInterval: 5000
});

// Netlify function handler
export const handler = async (event: any, context: any) => {
  const hasuraEvent = JSON.parse(event.body);

  const result = await listenTo(hasuraEvent, {
    plugins: [observability],
    context: {
      environment: process.env.NODE_ENV || 'development',
      functionName: context.functionName
    },
    autoLoadEventModules: true,
    eventModulesDirectory: './events'
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};

// Express/Node.js endpoint
export const expressHandler = async (req: any, res: any) => {
  const hasuraEvent = req.body;

  const result = await listenTo(hasuraEvent, {
    plugins: [observability],
    context: {
      environment: process.env.NODE_ENV || 'development',
      endpoint: req.path
    },
    autoLoadEventModules: true,
    eventModulesDirectory: './events'
  });

  res.json(result);
};

// Development server with console
if (require.main === module) {
  console.log('Starting development server with observability console...');

  // Initialize the observability plugin
  observability.initialize().then(() => {
    console.log('Observability plugin initialized');

    // Check console status
    const status = observability.getStatus();

    if (status.console.running) {
      console.log(`✅ Console available at: ${status.console.url}`);
      console.log('   Note: Install @hopdrive/hasura-event-detector-console if not already installed');
    } else {
      console.log('⚠️  Console not running. Install @hopdrive/hasura-event-detector-console to enable UI');
      console.log('   npm install @hopdrive/hasura-event-detector-console --save-dev');
    }
  }).catch(error => {
    console.error('Failed to initialize:', error);
  });

  // Keep process running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await observability.shutdown();
    process.exit(0);
  });
}