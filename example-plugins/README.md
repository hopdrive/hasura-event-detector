# Example Plugins

This directory contains example plugins that demonstrate how to extend the Hasura Event Detector with custom functionality. Each plugin showcases different aspects of the plugin architecture and provides real-world use cases.

## Plugin Architecture Overview

The Hasura Event Detector uses a plugin system that allows you to hook into various points of the event processing lifecycle:

- **`onPreConfigure`**: Modify options before event processing starts
- **`onInvocationStart`**: React when event processing begins
- **`onEventDetectionStart/End`**: Hook into individual event detection phases
- **`onEventHandlerStart/End`**: Hook into job execution phases
- **`onJobStart/End`**: Hook into individual job execution
- **`onError`**: Handle errors during processing
- **`onInvocationEnd`**: React when event processing completes

## Available Example Plugins

### 🔍 [Observability Plugin](./observability/)
**Purpose**: Comprehensive monitoring and debugging for your event detector system.

**Features**:
- Complete execution tracking (invocations, events, jobs)
- Performance monitoring and metrics
- Error debugging with stack traces
- Database persistence for historical analysis
- Console log capture
- Visual dashboard integration

**Use Cases**: Production monitoring, performance optimization, debugging, audit trails

---

### 📋 [Console Interceptor Plugin](./console-interceptor/)
**Purpose**: Captures all console logs during job execution for comprehensive logging.

**Features**:
- Universal log capture from any source
- Job context awareness
- Configurable log levels
- Plugin system integration

**Use Cases**: Debug visibility, log centralization, third-party library logging

---

### 📝 [Simple Logging Plugin](./simple-logging/)
**Purpose**: Enhanced console logging with structured formatting and context.

**Features**:
- Multiple output formats (simple, structured, JSON)
- Colorized output with log levels
- Correlation ID tracking
- Job context inclusion
- Performance optimized

**Use Cases**: Development logging, structured output, log aggregation preparation

---

### 🔗 [Correlation ID Extraction Plugin](./correlation-id-extraction/)
**Purpose**: Extracts correlation IDs from various sources in Hasura event payloads.

**Features**:
- Multiple extraction strategies
- Pattern matching with regex
- Session variable support
- Metadata parsing
- Custom field extraction

**Use Cases**: Distributed tracing, request correlation, audit logging, debug assistance

---

### 👤 [Updated By Correlation Plugin](./updated-by-correlation/)
**Purpose**: Specialized extraction of correlation IDs from `updated_by` database fields.

**Features**:
- Pattern-based extraction from `updated_by` fields
- UUID format validation
- Operation filtering (UPDATE only)
- Flexible format support

**Use Cases**: User action tracking, API request correlation, workflow tracing

---

### 📦 [Order Enrichment Plugin](./order-enrichment/)
**Purpose**: Enriches event payloads with related database records to prevent N+1 queries.

**Features**:
- Automatic foreign key relationship following
- Reverse relationship fetching
- Built-in caching for performance
- Configurable record limits
- Custom enrichment queries

**Use Cases**: Performance optimization, reducing database queries, providing complete context

## Getting Started

### 1. Basic Plugin Usage

```typescript
import { pluginManager } from '@/plugins/plugin-system.js';
import { SimpleLoggingPlugin } from './example-plugins/simple-logging/plugin.js';

// Create and configure plugin
const logger = new SimpleLoggingPlugin({
  format: 'structured',
  colorize: true
});

// Register with plugin manager
pluginManager.register(logger);

// Initialize (usually done once at startup)
await pluginManager.initialize();

// Now use the event detector as normal - plugins will automatically hook in
await listenTo(hasuraEvent, options);
```

### 2. Multiple Plugin Usage

```typescript
import {
  SimpleLoggingPlugin,
  ConsoleInterceptorPlugin,
  CorrelationIdExtractionPlugin
} from './example-plugins/index.js';

// Create plugins
const consoleInterceptor = new ConsoleInterceptorPlugin();
const logger = new SimpleLoggingPlugin({ format: 'json' });
const correlationExtractor = new CorrelationIdExtractionPlugin({
  extractFromSession: true
});

// Register all plugins
pluginManager.register(consoleInterceptor);
pluginManager.register(logger);
pluginManager.register(correlationExtractor);

await pluginManager.initialize();
```

### 3. Production Monitoring Setup

```typescript
import {
  ObservabilityPlugin,
  SimpleLoggingPlugin,
  ConsoleInterceptorPlugin
} from './example-plugins/index.js';

// Production-ready monitoring stack
const observability = new ObservabilityPlugin({
  enabled: process.env.NODE_ENV === 'production',
  database: {
    connectionString: process.env.OBSERVABILITY_DB_URL
  },
  captureErrorStacks: true,
  captureHasuraPayload: false // Don't store sensitive data
});

const logger = new SimpleLoggingPlugin({
  format: 'json',
  logLevel: 'info',
  colorize: false
});

const consoleInterceptor = new ConsoleInterceptorPlugin({
  levels: ['error', 'warn'] // Only capture important logs in production
});

pluginManager.register(observability);
pluginManager.register(logger);
pluginManager.register(consoleInterceptor);

await pluginManager.initialize();
```

## Creating Custom Plugins

### 1. Basic Plugin Structure

```typescript
import { BasePlugin } from '@/plugins/plugin-system.js';
import type { PluginConfig, HasuraEventPayload, ListenToOptions } from '@/types/index.js';

interface MyPluginConfig extends PluginConfig {
  // Your custom config options
  customOption: string;
}

export class MyPlugin extends BasePlugin<MyPluginConfig> {
  constructor(config: Partial<MyPluginConfig> = {}) {
    const defaultConfig: MyPluginConfig = {
      enabled: true,
      customOption: 'default-value',
      ...config
    };
    super(defaultConfig);
  }

  // Override lifecycle hooks you need
  async onInvocationStart(hasuraEvent, options, context, correlationId) {
    // Your custom logic here
    console.log('Invocation started with correlation ID:', correlationId);
  }

  async onEventDetectionStart(eventName, hasuraEvent, correlationId) {
    // React to event detection start
    console.log('Detecting event:', eventName);
  }

  // ... implement other hooks as needed
}
```

### 2. Plugin with State

```typescript
export class StatefulPlugin extends BasePlugin<MyPluginConfig> {
  private metrics = new Map();

  async onInvocationStart(hasuraEvent, options, context, correlationId) {
    // Track metrics
    const key = `${hasuraEvent.table.name}:${hasuraEvent.event.op}`;
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
  }

  async onInvocationEnd(hasuraEvent, result, correlationId) {
    // Log metrics
    console.log('Current metrics:', Object.fromEntries(this.metrics));
  }
}
```

## Plugin Development Best Practices

### 1. Configuration
- Provide sensible defaults
- Use TypeScript interfaces for config
- Allow runtime enable/disable
- Validate configuration on initialization

### 2. Error Handling
- Never let plugin errors crash the main system
- Use try/catch blocks in all hooks
- Log errors appropriately
- Provide graceful degradation

### 3. Performance
- Minimize overhead in hot paths
- Use async operations appropriately
- Implement caching where beneficial
- Consider plugin ordering and dependencies

### 4. Testing
- Unit test individual plugin functionality
- Integration test with the plugin system
- Test error conditions and edge cases
- Performance test under load

## Plugin Hooks Reference

| Hook | Parameters | Purpose |
|------|------------|---------|
| `initialize()` | none | Plugin initialization |
| `onPreConfigure(hasuraEvent, options)` | event, options | Modify options before processing |
| `onInvocationStart(hasuraEvent, options, context, correlationId)` | event, options, context, id | React to processing start |
| `onEventDetectionStart(eventName, hasuraEvent, correlationId)` | name, event, id | React to event detection start |
| `onEventDetectionEnd(eventName, detected, hasuraEvent, correlationId, duration)` | name, detected, event, id, time | React to event detection end |
| `onEventHandlerStart(eventName, hasuraEvent, correlationId)` | name, event, id | React to job execution start |
| `onEventHandlerEnd(eventName, results, hasuraEvent, correlationId)` | name, results, event, id | React to job execution end |
| `onJobStart(jobName, jobOptions, eventName, hasuraEvent, correlationId)` | job, options, event, id | React to individual job start |
| `onJobEnd(jobName, result, eventName, hasuraEvent, correlationId, duration)` | job, result, event, id, time | React to individual job end |
| `onError(error, context, correlationId)` | error, context, id | Handle errors |
| `onInvocationEnd(hasuraEvent, result, correlationId)` | event, result, id | React to processing end |

## Contributing

When contributing new example plugins:

1. **Create a folder** for your plugin in this directory
2. **Include a plugin.ts** file with the plugin implementation
3. **Add a comprehensive README.md** explaining usage and configuration
4. **Update this main README** with your plugin description
5. **Add unit tests** if the plugin is complex
6. **Follow naming conventions**: `kebab-case` for folders, `PascalCase` for classes

## Need Help?

- Review existing plugins for patterns and best practices
- Check the main project documentation for plugin architecture details
- Look at the core plugin system implementation in `src/plugins/plugin-system.ts`
- Consider the plugin interfaces defined in `src/types/index.ts`