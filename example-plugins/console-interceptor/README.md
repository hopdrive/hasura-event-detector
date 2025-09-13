# Console Interceptor Plugin

A plugin that monkey-patches console methods to intercept ALL console logs during job execution, ensuring comprehensive logging across your event detection system.

## Overview

The ConsoleInterceptorPlugin captures console logs from ANY source within job execution context, including direct `console.log` calls from jobs that don't use the hasura event detector logger. This provides complete visibility into all logging activity during event processing.

## Features

- **Universal Log Capture**: Intercepts all console methods (`log`, `error`, `warn`, `info`)
- **Job Context Awareness**: Automatically associates logs with the current job execution
- **Plugin System Integration**: Forwards captured logs through the plugin system's `onLog` hook
- **Configurable Levels**: Choose which console methods to intercept
- **Timestamp Support**: Optional timestamps for all intercepted logs
- **Minimal Overhead**: Efficient interception that doesn't impact performance

## Configuration

```typescript
import { ConsoleInterceptorPlugin } from './example-plugins/console-interceptor/plugin.js';

const consoleInterceptor = new ConsoleInterceptorPlugin({
  enabled: true,
  levels: ['log', 'error', 'warn', 'info'],  // Which console methods to intercept
  includeTimestamp: true,                     // Add timestamps to logs
  includeJobContext: true                     // Include job execution context
});
```

## Usage

```typescript
import { pluginManager } from '@/plugins/plugin-system.js';
import { ConsoleInterceptorPlugin } from './example-plugins/console-interceptor/plugin.js';

// Register the plugin
const consoleInterceptor = new ConsoleInterceptorPlugin();
pluginManager.register(consoleInterceptor);

// Initialize the plugin system
await pluginManager.initialize();

// Now all console logs during job execution will be intercepted
```

## How It Works

1. **Initialization**: The plugin saves original console methods and replaces them with intercepted versions
2. **Job Context Tracking**: During job execution, the plugin maintains context about the current job
3. **Log Interception**: All console calls are captured and enriched with job context
4. **Plugin Integration**: Captured logs are forwarded to other plugins via the `onLog` hook
5. **Cleanup**: Original console methods are restored when the plugin shuts down

## Use Cases

- **Comprehensive Logging**: Capture logs from third-party libraries used in jobs
- **Debug Visibility**: See all output during job execution, regardless of logging method
- **Log Centralization**: Route all console output through your logging infrastructure
- **Performance Monitoring**: Track all logging activity for performance analysis

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `levels` | `string[]` | `['log', 'error', 'warn', 'info']` | Console methods to intercept |
| `includeTimestamp` | `boolean` | `true` | Add timestamps to intercepted logs |
| `includeJobContext` | `boolean` | `true` | Include job execution context in logs |

## Integration

This plugin works seamlessly with other logging plugins like SimpleLoggingPlugin. The console interceptor captures the logs, while other plugins handle formatting and output.

```typescript
// Example: Use with SimpleLoggingPlugin for formatted output
const consoleInterceptor = new ConsoleInterceptorPlugin();
const simpleLogger = new SimpleLoggingPlugin({
  outputFormat: 'structured'
});

pluginManager.register(consoleInterceptor);
pluginManager.register(simpleLogger);
```