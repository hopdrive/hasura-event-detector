/**
 * Example showing how to use the logging plugins with Hasura Event Detector
 * 
 * This demonstrates two logging approaches:
 * 1. ConsoleInterceptorPlugin - Monkey-patches console methods to capture ALL console logs
 * 2. SimpleLoggingPlugin - Listens to onLog events and provides structured logging
 * 
 * You can use either plugin individually or both together for comprehensive logging.
 */

const { listenTo } = require('@hopdrive/hasura-event-detector');
const { ObservabilityPlugin } = require('../observability-plugin');
const { ConsoleInterceptorPlugin } = require('../console-interceptor-plugin');
const { SimpleLoggingPlugin } = require('../simple-logging-plugin');
const { pluginManager } = require('../plugin-system');

// Configure logging plugins
const consoleInterceptor = new ConsoleInterceptorPlugin({
  enabled: true,
  levels: ['log', 'error', 'warn', 'info'], // Intercept all console methods
  includeTimestamp: true,
  includeJobContext: true
});

const simpleLogger = new SimpleLoggingPlugin({
  enabled: true,
  format: 'structured', // 'simple', 'structured', or 'json'
  includeTimestamp: true,
  includeCorrelationId: true,
  includeJobContext: true,
  logLevel: 'info', // Minimum log level
  colorize: true,
  prefix: '[EventDetector]'
});

// Optional: Also use observability plugin for metrics
const observabilityPlugin = new ObservabilityPlugin({
  enabled: true,
  database: {
    connectionString: process.env.OBSERVABILITY_DB_URL
  }
});

// Register plugins
pluginManager
  .register(consoleInterceptor)    // Intercepts console logs
  .register(simpleLogger)          // Provides structured logging
  .register(observabilityPlugin);  // Tracks metrics

exports.handler = async (event, context) => {
  try {
    const res = await listenTo(JSON.parse(event.body), {
      autoLoadEventModules: true,
      eventModulesDirectory: `${__dirname}/events`,
    });

    return { statusCode: 200, body: JSON.stringify(res) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

/**
 * Example job that demonstrates different logging scenarios
 * This job would be called from an event handler
 */
const exampleJob = async (event, hasuraEvent, options) => {
  const { correlationId } = options;
  
  // These console logs will be intercepted by ConsoleInterceptorPlugin
  // and forwarded to SimpleLoggingPlugin for structured output
  console.log('Processing order fulfillment');
  console.info('Order ID:', options.orderId);
  
  try {
    // Simulate some work
    const result = await processOrder(options.orderId);
    
    console.log('Order processed successfully:', result);
    return { success: true, orderId: options.orderId, result };
    
  } catch (error) {
    // Error logs will also be intercepted and structured
    console.error('Failed to process order:', error.message);
    throw error;
  }
};

/**
 * Example with different logging plugin configurations
 */

// Configuration 1: Console interception only (captures all console logs)
const interceptorOnly = new ConsoleInterceptorPlugin({
  enabled: true,
  levels: ['log', 'error', 'warn', 'info']
});

// Configuration 2: Simple logging only (only logs from plugin hooks)
const loggerOnly = new SimpleLoggingPlugin({
  enabled: true,
  format: 'json', // JSON format for log aggregation systems
  logLevel: 'debug',
  colorize: false // Disable colors for production
});

// Configuration 3: Both plugins for comprehensive logging
// - ConsoleInterceptorPlugin captures ALL console calls (even from jobs)
// - SimpleLoggingPlugin provides structured output and lifecycle logging

/**
 * Logging output examples:
 * 
 * With ConsoleInterceptorPlugin + SimpleLoggingPlugin:
 * 
 * [10:30:15] [EventDetector] [INFO] {job: exampleJob, correlation: orderService.123abc} Processing order fulfillment
 * [10:30:15] [EventDetector] [INFO] {job: exampleJob, correlation: orderService.123abc} Order ID: 12345
 * [10:30:16] [EventDetector] [INFO] {job: exampleJob, correlation: orderService.123abc} Order processed successfully: {...}
 * 
 * With SimpleLoggingPlugin only (structured lifecycle logs):
 * 
 * [10:30:14] [EventDetector] [INFO] {correlation: orderService.123abc} Starting invocation: orderService
 * [10:30:14] [EventDetector] [DEBUG] {job: exampleJob, correlation: orderService.123abc} Starting job: exampleJob
 * [10:30:16] [EventDetector] [INFO] {job: exampleJob, correlation: orderService.123abc} Completed job: exampleJob in 1250ms
 * [10:30:16] [EventDetector] [INFO] {correlation: orderService.123abc} Completed invocation in 1300ms: 1 events, 3 jobs
 * 
 * With JSON format:
 * 
 * {"timestamp":"2025-01-11T15:30:15.123Z","level":"info","message":"Processing order fulfillment","correlationId":"orderService.123abc","jobName":"exampleJob","source":"console_interceptor"}
 */

module.exports = { exampleJob };