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

Called **before** any event processing begins. This powerful hook allows plugins to:

1. **Enrich/modify the Hasura payload** (by reference) - Add related records, inject data, etc.
2. **Configure options** (by return value) - Set correlation IDs, modify configuration

**Perfect for payload enrichment and correlation ID extraction.**

#### **Basic Correlation ID Extraction:**
```typescript
async onPreConfigure(
  hasuraEvent: HasuraEventPayload,
  options: Partial<ListenToOptions>
): Promise<Partial<ListenToOptions>> {
  // Extract correlation ID from updated_by field
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

#### **Payload Enrichment Example:**
```typescript
async onPreConfigure(
  hasuraEvent: HasuraEventPayload,
  options: Partial<ListenToOptions>
): Promise<Partial<ListenToOptions>> {
  // 1. ENRICH PAYLOAD FIRST - Modify hasuraEvent directly (by reference)
  if (hasuraEvent.table.name === 'orders' && hasuraEvent.event.op === 'UPDATE') {
    await this.enrichOrderWithRelatedData(hasuraEvent);
  }
  
  // 2. THEN CONFIGURE OPTIONS - Extract correlation ID from enriched data
  const correlationId = this.extractCorrelationId(hasuraEvent);
  
  return correlationId ? { ...options, correlationId } : options;
}

private async enrichOrderWithRelatedData(hasuraEvent: HasuraEventPayload) {
  const orderId = hasuraEvent.event.data.new?.id;
  if (!orderId) return;

  // Fetch all related data in one optimized database query
  const relatedData = await this.fetchOrderRelatedData(orderId);
  
  // Modify the payload directly - all event detectors and jobs will see this enriched data
  hasuraEvent.event.data.new = {
    ...hasuraEvent.event.data.new,
    // Inject related records to prevent N+1 queries later
    lanes: relatedData.lanes,           // Child lanes for this order  
    driver: relatedData.driver,         // Assigned driver details
    vehicle: relatedData.vehicle,       // Vehicle information
    customer: relatedData.customer,     // Customer details
    metadata: {
      ...hasuraEvent.event.data.new.metadata,
      enriched_at: new Date().toISOString(),
      enriched_by: this.name
    }
  };
  
  console.log(`✅ Enriched order ${orderId} with ${relatedData.lanes.length} lanes and related data`);
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

### Order Enrichment Plugin

```typescript
export class OrderEnrichmentPlugin implements BasePluginInterface {
  readonly name = 'order-enrichment' as PluginName;
  
  async onPreConfigure(hasuraEvent, options) {
    const tableName = hasuraEvent.table?.name;
    
    // Only enrich order-related tables
    if (!['orders', 'shipments', 'bookings'].includes(tableName)) {
      return options;
    }

    const recordId = hasuraEvent.event.data.new?.id;
    if (!recordId) return options;

    try {
      // Fetch all related data in one optimized database query
      const relatedData = await this.fetchOrderRelatedData(recordId);
      
      // Modify the payload directly by reference
      // All event detectors and jobs will see this enriched data
      hasuraEvent.event.data.new = {
        ...hasuraEvent.event.data.new,
        // Inject related records to prevent N+1 queries later
        lanes: relatedData.lanes,           // Child lanes for this order  
        driver: relatedData.driver,         // Assigned driver details
        vehicle: relatedData.vehicle,       // Vehicle information
        customer: relatedData.customer,     // Customer details
        __enriched: {
          enriched_at: new Date().toISOString(),
          enriched_by: this.name
        }
      };
      
      console.log(`✅ Enriched order ${recordId} with ${relatedData.lanes.length} lanes and related data`);
      
      // Extract correlation ID from enriched data
      const correlationId = this.extractCorrelationId(hasuraEvent);
      
      return correlationId ? { ...options, correlationId } : options;
      
    } catch (error) {
      console.warn('Failed to enrich payload:', error);
      return options; // Continue processing even if enrichment fails
    }
  }

  private async fetchOrderRelatedData(orderId) {
    // Single database query joining multiple tables
    // Returns: { lanes: [], driver: {}, vehicle: {}, customer: {} }
    return await db.query(`
      SELECT 
        o.*,
        json_agg(DISTINCT l.*) as lanes,
        row_to_json(d.*) as driver,
        row_to_json(v.*) as vehicle,
        row_to_json(c.*) as customer
      FROM orders o
      LEFT JOIN lanes l ON l.order_id = o.id
      LEFT JOIN drivers d ON d.id = o.driver_id
      LEFT JOIN vehicles v ON v.id = o.vehicle_id
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.id = $1
      GROUP BY o.id, d.id, v.id, c.id
    `, [orderId]);
  }
}
```

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
Each plugin should have a single responsibility (observability, correlation ID extraction, payload enrichment, error handling, etc.).

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

### 5. Payload Enrichment Best Practices
When enriching payloads in `onPreConfigure`:

```typescript
async onPreConfigure(hasuraEvent, options) {
  // 1. Check if enrichment is needed first
  if (!this.shouldEnrich(hasuraEvent.table?.name)) {
    return options;
  }
  
  // 2. Enrich payload by reference BEFORE extracting correlation ID
  try {
    await this.enrichPayload(hasuraEvent);
  } catch (error) {
    console.warn('Enrichment failed, continuing without it:', error);
    // Don't throw - let processing continue
  }
  
  // 3. Extract correlation ID from enriched data
  const correlationId = this.extractCorrelationId(hasuraEvent);
  
  return correlationId ? { ...options, correlationId } : options;
}
```

### 6. Clean Up Resources
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

## 📊 System Architecture Diagrams

### Plugin System Sequence Flow
The complete lifecycle showing how plugins interact during event processing:

👉 **[View Plugin System Sequence Diagram](./diagrams/plugin-system-sequence.md)**

Key highlights:
- **Pre-Configure Phase**: Payload enrichment and correlation ID extraction
- **Event Detection**: Business event detection with plugin observability  
- **Job Execution**: Parallel job execution with enriched data access
- **Error Handling**: Centralized error tracking across all plugins

### Payload Enrichment Data Flow  
How payload enrichment prevents N+1 database queries:

👉 **[View Payload Enrichment Flow Diagram](./diagrams/payload-enrichment-flow.md)**

Key benefits:
- **Single Query**: Replace N×M queries with 1 optimized query
- **Shared Data**: Enriched payload available to all jobs
- **Performance**: 89% query reduction in typical scenarios

### Plugin Hook Execution Order
Detailed timing and order of all 14 plugin hooks:

👉 **[View Plugin Hook Execution Order](./diagrams/plugin-hook-execution-order.md)**

Hook categories:
- **System Lifecycle**: `initialize()`, `shutdown()`
- **Configuration**: `onPreConfigure()` (most critical)
- **Processing**: `onInvocationStart/End()`, event detection, job execution
- **Cross-Cutting**: `onError()`, `onLog()`

## Summary

The plugin system provides powerful extensibility while maintaining clean separation of concerns. Use plugins to add observability, customize behavior, and integrate with external systems without modifying core event processing logic.