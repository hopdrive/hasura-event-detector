# Simple Logging Plugin

A comprehensive logging plugin that provides structured, colorized, and contextual logging for your event detection system.

## Overview

The SimpleLoggingPlugin listens to log events through the plugin system's `onLog` hook and provides enhanced console logging with structured formatting, job context, and correlation ID tracking. Unlike console interceptors that monkey-patch methods, this plugin processes logs through the proper plugin architecture.

## Features

- **Structured Formats**: Choose from simple, structured, or JSON output formats
- **Colorized Output**: Color-coded log levels for better readability
- **Context Awareness**: Automatically includes job context and correlation IDs
- **Log Level Filtering**: Filter logs by severity level
- **Customizable Formatting**: Flexible prefix and timestamp options
- **Performance Optimized**: Efficient processing with minimal overhead
- **Plugin Architecture**: Uses proper plugin hooks for extensibility

## Configuration

```typescript
import { SimpleLoggingPlugin } from 'hasura-event-detector/plugins';

const simpleLogger = new SimpleLoggingPlugin({
  enabled: true,
  format: 'structured',           // 'simple' | 'structured' | 'json'
  includeTimestamp: true,         // Add timestamps to logs
  includeCorrelationId: true,     // Show correlation IDs
  includeJobContext: true,        // Include job execution context
  logLevel: 'info',              // Minimum log level to display
  colorize: true,                // Enable color output
  prefix: '[EventDetector]'      // Custom prefix for all logs
});
```

## Usage

```typescript
import { pluginManager } from '@hopdrive/hasura-event-detector';
import { SimpleLoggingPlugin } from 'hasura-event-detector/plugins';

// Register the plugin
const simpleLogger = new SimpleLoggingPlugin({
  format: 'structured',
  colorize: true
});

pluginManager.register(simpleLogger);

// Initialize the plugin system
await pluginManager.initialize();

// Now all plugin system logs will be formatted through SimpleLoggingPlugin
```

## Output Formats

### Simple Format
```
[EventDetector] 2023-09-13T10:30:45.123Z INFO: Event detected: user-activation
```

### Structured Format
```
[EventDetector] 2023-09-13T10:30:45.123Z INFO user-activation [corr-123]
  Event detected: user-activation
  Context: {"userId": "123", "action": "signup"}
```

### JSON Format
```json
{
  "timestamp": "2023-09-13T10:30:45.123Z",
  "level": "info",
  "message": "Event detected: user-activation",
  "correlationId": "corr-123",
  "jobName": "user-activation",
  "eventName": "user_signup",
  "context": {"userId": "123", "action": "signup"}
}
```

## Log Levels

The plugin supports standard log levels with built-in filtering:

| Level | Numeric Value | Color | Description |
|-------|---------------|-------|-------------|
| `debug` | 0 | Gray | Detailed debugging information |
| `info` | 1 | Blue | General information messages |
| `warn` | 2 | Yellow | Warning conditions |
| `error` | 3 | Red | Error conditions |

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `format` | `'simple' \| 'structured' \| 'json'` | `'structured'` | Output format style |
| `includeTimestamp` | `boolean` | `true` | Add timestamps to logs |
| `includeCorrelationId` | `boolean` | `true` | Show correlation IDs |
| `includeJobContext` | `boolean` | `true` | Include job execution context |
| `logLevel` | `LogLevel` | `'info'` | Minimum log level to display |
| `colorize` | `boolean` | `true` | Enable colored output |
| `prefix` | `string` | `'[EventDetector]'` | Custom prefix for logs |

## Integration

This plugin works best when combined with other logging plugins:

```typescript
// Example: Use with ConsoleInterceptorPlugin
const consoleInterceptor = new ConsoleInterceptorPlugin();
const simpleLogger = new SimpleLoggingPlugin({
  format: 'structured',
  colorize: true
});

// The console interceptor captures logs, SimpleLoggingPlugin formats them
pluginManager.register(consoleInterceptor);
pluginManager.register(simpleLogger);
```

## Use Cases

- **Development Logging**: Enhanced console output during development
- **Debug Tracing**: Structured logs with correlation ID tracking
- **Production Monitoring**: JSON format for log aggregation systems
- **Performance Analysis**: Contextual logging for performance debugging
- **Integration Testing**: Structured output for test result analysis

## Best Practices

1. **Use JSON format** for production environments and log aggregation
2. **Enable correlation IDs** for distributed system tracing
3. **Set appropriate log levels** to avoid noise in production
4. **Combine with console interceptor** for comprehensive log capture
5. **Disable colorization** when piping output to files or log systems