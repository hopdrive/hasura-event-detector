#!/usr/bin/env node
/**
 * Test script to run listenTo with a real Hasura payload
 * This mimics the actual db-moves Netlify function
 */

const {
  listenTo,
  pluginManager,
  ObservabilityPlugin,
  ConsoleInterceptorPlugin,
} = require('./dist/cjs/index.js');

// Enable debug logging
process.env.DEBUG = 'true';

async function runTest(payloadFile) {
  console.log('='.repeat(80));
  console.log('Starting test with real Hasura payload');
  console.log('='.repeat(80));

  // Register ConsoleInterceptorPlugin
  pluginManager.register(
    new ConsoleInterceptorPlugin({
      levels: ['log', 'error', 'warn', 'info'],
      forwardLog: (level, args, jobContext) => {
        // Optional custom log forwarding
      },
    })
  );

  // Register ObservabilityPlugin with GraphQL transport using environment variables
  // Set these environment variables to write to the actual database:
  // - HASURA_GRAPHQL_ENDPOINT
  // - HASURA_ADMIN_SECRET (or HASURA_JWT)
  const ObservabilityPlugin = require('./dist/cjs/plugins/observability/plugin.js').ObservabilityPlugin;

  const hasGraphQLConfig = process.env.HASURA_GRAPHQL_ENDPOINT;

  if (hasGraphQLConfig) {
    console.log(`ObservabilityPlugin: Using GraphQL endpoint ${process.env.HASURA_GRAPHQL_ENDPOINT}`);
    pluginManager.register(
      new ObservabilityPlugin({
        enabled: true,
        transport: 'graphql',
        graphql: {
          endpoint: process.env.HASURA_GRAPHQL_ENDPOINT,
          headers: process.env.HASURA_ADMIN_SECRET
            ? { 'x-hasura-admin-secret': process.env.HASURA_ADMIN_SECRET }
            : process.env.HASURA_JWT
            ? { 'authorization': `Bearer ${process.env.HASURA_JWT}` }
            : {},
          timeout: 30000,
          maxRetries: 3,
          retryDelay: 1000,
        },
      })
    );
  } else {
    console.log('ObservabilityPlugin: DISABLED - No HASURA_GRAPHQL_ENDPOINT environment variable set');
    console.log('To enable database writes, set:');
    console.log('  export HASURA_GRAPHQL_ENDPOINT=https://your-hasura-endpoint.com/v1/graphql');
    console.log('  export HASURA_ADMIN_SECRET=your-admin-secret');
    pluginManager.register(
      new ObservabilityPlugin({
        enabled: false,
      })
    );
  }

  console.log('');

  let hasuraPayload;

  if (payloadFile) {
    // Load payload from file
    const fs = require('fs');
    const payloadJson = fs.readFileSync(payloadFile, 'utf-8');
    hasuraPayload = JSON.parse(payloadJson);
    console.log(`Loaded payload from ${payloadFile}`);
  } else {
    // Use a sample payload if none provided
    hasuraPayload = {
      trigger: { name: 'moves_event_trigger' },
      table: { schema: 'public', name: 'moves' },
      event: {
        op: 'UPDATE',
        session_variables: {
          'x-hasura-role': 'admin',
        },
        data: {
          old: { id: 1, status: 'pending' },
          new: { id: 1, status: 'active' },
        },
      },
      created_at: new Date().toISOString(),
      id: 'test-event-id',
    };
    console.log('Using sample payload (no file provided)');
  }

  console.log('\nPayload summary:');
  console.log(`  Table: ${hasuraPayload.table?.schema}.${hasuraPayload.table?.name}`);
  console.log(`  Operation: ${hasuraPayload.event?.op}`);
  console.log(`  Event ID: ${hasuraPayload.id}`);
  console.log('');

  try {
    const eventModulesDir = process.env.EVENT_MODULES_DIR || '/Users/robnewton/Github/event-handlers/functions/db-moves/events';

    console.log(`Looking for events in: ${eventModulesDir}`);
    console.log('');

    // Test the detector directly
    console.log('Testing move.active.change detector directly...');
    try {
      const moveActiveChange = require('/Users/robnewton/Github/event-handlers/functions/db-moves/events/move.active.change.js');
      const { parseHasuraEvent } = require('./dist/cjs/index.js');
      const { dbEvent, operation } = parseHasuraEvent(hasuraPayload);

      console.log('  Operation:', operation);
      console.log('  old.active:', dbEvent?.old?.active);
      console.log('  new.active:', dbEvent?.new?.active);

      const detectorResult = await moveActiveChange.detector('move.active.change', hasuraPayload);
      console.log('  Detector returned:', detectorResult);
      console.log('');
    } catch (error) {
      console.error('  Error testing detector:', error.message);
      console.log('');
    }

    const result = await listenTo(hasuraPayload, {
      eventModulesDirectory: eventModulesDir,
      autoLoadEventModules: true,
    });

    console.log('');
    console.log('='.repeat(80));
    console.log('Test completed successfully');
    console.log('='.repeat(80));
    console.log(`Duration: ${result.durationMs}ms`);
    console.log(`Events processed: ${result.events?.length || 0}`);

    if (result.events && result.events.length > 0) {
      const detected = result.events.filter(e => e.detected);
      console.log(`Events detected: ${detected.length}`);

      if (detected.length > 0) {
        console.log('\nDetected events:');
        detected.forEach(e => {
          const jobCount = e.jobs?.length || 0;
          console.log(`  - ${e.eventName}: ${jobCount} jobs`);
        });
      }

      const notDetected = result.events.filter(e => !e.detected);
      if (notDetected.length > 0) {
        console.log(`\nNot detected: ${notDetected.length} events`);
      }
    }

    console.log('');

    // Show plugin status
    console.log('Plugin status:');
    pluginManager.getEnabledPlugins().forEach(plugin => {
      const status = plugin.getStatus();
      console.log(`  ${status.name}: ${status.enabled ? 'enabled' : 'disabled'}`);
      if (status.bufferSizes) {
        console.log(`    Buffer: invocations=${status.bufferSizes.invocations}, events=${status.bufferSizes.eventExecutions}, jobs=${status.bufferSizes.jobExecutions}`);
      }
    });

    return result;
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('Test FAILED with error:');
    console.error('='.repeat(80));
    console.error(error);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    throw error;
  }
}

// Get payload file from args or select random one
function getPayloadFile() {
  const fs = require('fs');
  const path = require('path');

  // If file specified, use it
  if (process.argv[2]) {
    return process.argv[2];
  }

  // Otherwise, pick a random payload from test-payloads directory
  const payloadsDir = path.join(__dirname, 'test-payloads');

  if (!fs.existsSync(payloadsDir)) {
    console.error('❌ test-payloads directory not found');
    console.error('Please create test-payloads directory with JSON payload files');
    return null;
  }

  const files = fs.readdirSync(payloadsDir)
    .filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.error('❌ No JSON files found in test-payloads directory');
    return null;
  }

  const randomFile = files[Math.floor(Math.random() * files.length)];
  const fullPath = path.join(payloadsDir, randomFile);

  console.log(`🎲 Randomly selected: ${randomFile}`);
  console.log('');

  return fullPath;
}

// Run the test
const payloadFile = getPayloadFile();
if (!payloadFile) {
  process.exit(1);
}

runTest(payloadFile)
  .then(() => {
    console.log('\n✅ Test passed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed');
    console.error(error);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  });
