# Plugin System Guide

The Hasura Event Detector includes a powerful plugin system that allows you to extend and customize behavior at various points in the event processing lifecycle.

## Plugin Architecture Overview

Plugins are TypeScript/JavaScript classes that implement the `BasePluginInterface` and provide hooks that are called at specific points during event processing. They enable:

- **Observability**: Log events, track metrics, send to external systems
- **Correlation ID Extraction**: Extract correlation IDs from payloads before processing
- **Options Modification**: Modify configuration before event processing begins
- **Error Handling**: Custom error handling and reporting
- **Lifecycle Monitoring**: Track job execution, event detection, and performance

## Creating a Plugin

### Basic Plugin Structure

```typescript
import { BasePluginInterface, PluginName, PluginConfig } from '@hopdrive/hasura-event-detector';

export interface MyPluginConfig extends PluginConfig {
  enabled?: boolean;
  customOption?: string;
}

export class MyPlugin implements BasePluginInterface<MyPluginConfig> {
  readonly name = 'my-plugin' as PluginName;
  readonly config: MyPluginConfig;
  readonly enabled: boolean;

  constructor(config: Partial<MyPluginConfig> = {}) {
    this.config = {
      enabled: true,
      customOption: 'default-value',
      ...config
    };
    this.enabled = this.config.enabled ?? true;
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config
    };
  }

  // Implement plugin hooks here (see below)
}
```

## Available Plugin Hooks

### 1. `initialize()`

Called once when the plugin system initializes. Use for setup tasks.

```typescript
async initialize(): Promise<void> {
  console.log('Setting up my plugin...');
  // Initialize connections, load configuration, etc.
}
```

### 2. `onPreConfigure(hasuraEvent, options)`

Called **before** any event processing begins. Allows plugins to modify the options object, including setting correlation IDs extracted from the payload.

**Perfect for correlation ID extraction from database payloads.**

```typescript
async onPreConfigure(
  hasuraEvent: HasuraEventPayload,
  options: Partial<ListenToOptions>
): Promise<Partial<ListenToOptions>> {
  // Example: Extract correlation ID from updated_by field
  const parsedEvent = parseHasuraEvent(hasuraEvent);
  const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
  
  if (updatedBy && typeof updatedBy === 'string') {
    const match = updatedBy.match(/^user\.([0-9a-f-]{36})$/i);
    if (match) {
      console.log(`Extracted correlation ID: ${match[1]}`);
      return {
        ...options,
        correlationId: match[1] // Set correlation ID before processing
      };
    }
  }
  
  return options;
}
```

### 3. `onInvocationStart(hasuraEvent, options, context, correlationId)`

Called when event processing begins, after correlation ID has been determined.

```typescript
async onInvocationStart(
  hasuraEvent: HasuraEventPayload,
  options: ListenToOptions,
  context: Record<string, any>,
  correlationId: CorrelationId
): Promise<void> {
  console.log(`Starting event processing with correlation ID: ${correlationId}`);
  // Log start, start timers, send to external systems, etc.
}
```

### 5. `onInvocationEnd(hasuraEvent, result, correlationId)`

Called when event processing completes.

```typescript
async onInvocationEnd(
  hasuraEvent: HasuraEventPayload,
  result: ListenToResponse,
  correlationId: CorrelationId
): Promise<void> {
  console.log(`Processed ${result.events.length} events in ${result.duration}ms`);
  // Log completion, send metrics, clean up resources, etc.
}
```

### 6. `onEventDetectionStart(eventName, hasuraEvent, correlationId)`

Called before checking if a specific event is detected.

```typescript
async onEventDetectionStart(
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  console.log(`Checking if event '${eventName}' occurred`);
}
```

### 7. `onEventDetectionEnd(eventName, detected, hasuraEvent, correlationId)`

Called after event detection completes.

```typescript
async onEventDetectionEnd(
  eventName: EventName,
  detected: boolean,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  if (detected) {
    console.log(`✅ Event '${eventName}' was detected`);
  } else {
    console.log(`❌ Event '${eventName}' was not detected`);
  }
}
```

### 8. `onEventHandlerStart(eventName, hasuraEvent, correlationId)`

Called before executing jobs for a detected event.

```typescript
async onEventHandlerStart(
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  console.log(`Starting job execution for event '${eventName}'`);
}
```

### 9. `onEventHandlerEnd(eventName, jobResults, hasuraEvent, correlationId)`

Called after all jobs for an event have completed.

```typescript
async onEventHandlerEnd(
  eventName: EventName,
  jobResults: JobResult[],
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  const completedJobs = jobResults.filter(job => job.completed).length;
  console.log(`Event '${eventName}' completed ${completedJobs}/${jobResults.length} jobs`);
}
```

### 10. `onJobStart(jobName, jobOptions, eventName, hasuraEvent, correlationId)`

Called before each individual job executes.

```typescript
async onJobStart(
  jobName: JobName,
  jobOptions: JobOptions,
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  console.log(`Starting job '${jobName}' for event '${eventName}'`);
}
```

### 11. `onJobEnd(jobName, result, eventName, hasuraEvent, correlationId)`

Called after each individual job completes.

```typescript
async onJobEnd(
  jobName: JobName,
  result: JobResult,
  eventName: EventName,
  hasuraEvent: HasuraEventPayload,
  correlationId: CorrelationId
): Promise<void> {
  const status = result.completed ? 'completed' : 'failed';
  console.log(`Job '${jobName}' ${status} in ${result.duration}ms`);
}
```

### 12. `onLog(level, message, data, jobName, correlationId)`

Called for internal log messages (integrates with logging system).

```typescript
async onLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data: any,
  jobName: JobName,
  correlationId: CorrelationId
): Promise<void> {
  // Send logs to external system, filter, or enhance
  await sendToLoggingService({ level, message, data, jobName, correlationId });
}
```

### 13. `onError(error, context, correlationId)`

Called when errors occur during processing.

```typescript
async onError(
  error: Error,
  context: string, // 'event_detection', 'event_handler', etc.
  correlationId: CorrelationId
): Promise<void> {
  console.error(`Error in ${context}:`, error);
  // Send to error tracking service, alert, etc.
  await sendToErrorTracking({ error, context, correlationId });
}
```

### 14. `shutdown()`

Called when the system shuts down. Clean up resources.

```typescript
async shutdown(): Promise<void> {
  console.log('Shutting down my plugin...');
  // Close connections, save state, etc.
}
```

## Plugin Hook Execution Order

1. **System Startup**
   - `initialize()` - called once per plugin

2. **Per Invocation**
   - `onPreConfigure()` - modify options before processing (including correlation ID extraction)
   - `onInvocationStart()` - processing begins
   
3. **Per Event**
   - `onEventDetectionStart()` - before checking event
   - `onEventDetectionEnd()` - after checking event
   - `onEventHandlerStart()` - before running jobs (if event detected)
   - `onJobStart()` - before each job
   - `onJobEnd()` - after each job  
   - `onEventHandlerEnd()` - after all jobs complete

4. **End Processing**
   - `onInvocationEnd()` - processing complete

5. **Throughout**
   - `onLog()` - for log messages
   - `onError()` - when errors occur

6. **System Shutdown**
   - `shutdown()` - cleanup

## Real-World Plugin Examples

### Observability Plugin

```typescript
export class ObservabilityPlugin implements BasePluginInterface {
  readonly name = 'observability' as PluginName;
  
  private metrics = {
    invocations: 0,
    eventsDetected: 0,
    jobsExecuted: 0,
    errors: 0
  };

  async onInvocationStart() {
    this.metrics.invocations++;
  }

  async onEventDetectionEnd(eventName, detected) {
    if (detected) this.metrics.eventsDetected++;
  }

  async onJobEnd() {
    this.metrics.jobsExecuted++;
  }

  async onError() {
    this.metrics.errors++;
  }

  async onInvocationEnd(hasuraEvent, result, correlationId) {
    // Send metrics to external service
    await sendMetrics({
      correlationId,
      duration: result.duration,
      eventsProcessed: result.events.length,
      ...this.metrics
    });
  }
}
```

### Correlation ID Extraction Plugin

```typescript
export class UpdatedByCorrelationPlugin implements BasePluginInterface {
  readonly name = 'updated-by-correlation' as PluginName;

  async onPreConfigure(hasuraEvent, options) {
    const parsedEvent = parseHasuraEvent(hasuraEvent);
    const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
    
    if (updatedBy && typeof updatedBy === 'string') {
      // Extract UUID from "prefix.uuid" format
      const match = updatedBy.match(/^.+\.([0-9a-f-]{36})$/i);
      if (match) {
        return {
          ...options,
          correlationId: match[1]
        };
      }
    }
    
    return options;
  }
}
```

### Error Tracking Plugin

```typescript
export class ErrorTrackingPlugin implements BasePluginInterface {
  readonly name = 'error-tracking' as PluginName;

  async onError(error, context, correlationId) {
    await sendToSentry({
      error,
      context,
      correlationId,
      timestamp: new Date().toISOString()
    });
  }

  async onJobEnd(jobName, result, eventName, hasuraEvent, correlationId) {
    if (!result.completed && result.error) {
      await sendToSentry({
        error: result.error,
        context: `job_failure_${jobName}`,
        correlationId,
        eventName,
        jobName
      });
    }
  }
}
```

## Plugin Registration

Plugins are typically registered with the plugin manager (implementation may vary):

```typescript
import { pluginManager } from '@hopdrive/hasura-event-detector';
import { MyPlugin } from './plugins/my-plugin';

// Register plugin
const myPlugin = new MyPlugin({
  enabled: true,
  customOption: 'production-value'
});

pluginManager.register(myPlugin);
```

## Best Practices

### 1. Keep Plugins Focused
Each plugin should have a single responsibility (observability, correlation ID extraction, error handling, etc.).

### 2. Handle Errors Gracefully
Plugin errors shouldn't break event processing:

```typescript
async onJobEnd(jobName, result) {
  try {
    await sendMetrics(result);
  } catch (error) {
    console.warn('Failed to send metrics:', error);
    // Don't throw - let processing continue
  }
}
```

### 3. Use Correlation IDs
Always include correlation IDs in external calls for traceability:

```typescript
async onInvocationEnd(hasuraEvent, result, correlationId) {
  await sendToAnalytics({
    ...analyticsData,
    correlationId // Include for tracing
  });
}
```

### 4. Implement Configuration
Make plugins configurable:

```typescript
export interface MyPluginConfig extends PluginConfig {
  apiUrl?: string;
  timeout?: number;
  retries?: number;
}
```

### 5. Clean Up Resources
Always implement `shutdown()` for proper cleanup:

```typescript
async shutdown() {
  if (this.connection) {
    await this.connection.close();
  }
}
```

## Plugin Development Tips

### TypeScript Support
Plugins have full TypeScript support with proper type checking:

```typescript
import type { 
  BasePluginInterface, 
  HasuraEventPayload, 
  CorrelationId,
  JobResult 
} from '@hopdrive/hasura-event-detector';
```

### Testing Plugins
Create unit tests for plugin hooks:

```typescript
describe('MyPlugin', () => {
  let plugin: MyPlugin;

  beforeEach(() => {
    plugin = new MyPlugin();
  });

  test('onPreConfigure extracts correlation ID', async () => {
    const hasuraEvent = createMockEvent({ updated_by: 'user.abc-123' });
    const options = {};
    
    const result = await plugin.onPreConfigure(hasuraEvent, options);
    
    expect(result.correlationId).toBe('abc-123');
  });
});
```

### Debugging Plugins
Add logging to understand plugin execution:

```typescript
async onJobStart(jobName) {
  console.log(`[${this.name}] Job starting: ${jobName}`);
}
```

The plugin system provides powerful extensibility while maintaining clean separation of concerns. Use plugins to add observability, customize behavior, and integrate with external systems without modifying core event processing logic.