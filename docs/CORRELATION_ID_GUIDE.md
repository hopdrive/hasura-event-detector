# Correlation ID Guide

## What are Correlation IDs?

Correlation IDs are unique identifiers that allow you to trace business processes across multiple events, jobs, and systems. They provide a way to link related activities together, making it easier to debug issues, track business flows, and maintain audit trails.

## How Correlation IDs Work

The Hasura Event Detector provides a flexible correlation ID system:

1. **Manual Injection**: Pass correlation IDs via context for full control
2. **Plugin-Based Extraction**: Use plugins to automatically extract from Hasura event payloads
3. **Automatic Generation**: System generates new correlation IDs when none found
4. **Job Access**: All jobs receive correlation IDs through their options parameter

## Basic Usage

### 1. Manual Correlation ID Injection (Simplest)

Pass correlation IDs directly in the options object:

```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

// Extract correlation ID yourself and pass in options  
const correlationId = hasuraEvent.event.data.new?.process_id || generateNewId();

const result = await listenTo(hasuraEvent, {
  context: { environment: 'prod' },
  correlationId: correlationId,
  autoLoadEventModules: true
});
```

### 2. Accessing Correlation ID in Jobs

Every job receives a correlation ID through the context:

```typescript
export const handler: HandlerFunction = async (event, hasuraEvent) => {
  const jobs = [
    job(async function sendEmail(event, hasuraEvent, options) {
      // Access correlation ID from options
      const correlationId = options?.correlationId;
      console.log(`Processing job with correlation ID: ${correlationId}`);
      
      return { success: true, correlationId };
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};
```

### 3. Storing Correlation ID in Database Records

Use correlation IDs to link database records to business processes:

```typescript
job(async function createOrder(event, hasuraEvent, options) {
  const correlationId = options?.correlationId;
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  // Create order record with correlation ID
  const orderRecord = {
    id: generateId(),
    user_id: dbEvent?.new?.id,
    correlation_id: correlationId, // Link to business process
    status: 'pending',
    created_at: new Date()
  };
  
  // Save to database
  await db.orders.create(orderRecord);
  
  return { orderId: orderRecord.id, correlationId };
})
```

## Plugin-Based Automatic Extraction

For automatic extraction from Hasura event payloads, use the updated_by correlation plugin:

### Basic Plugin Usage

```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';
import { UpdatedByCorrelationPlugin } from '@hopdrive/hasura-event-detector/plugins';

// Create plugin to extract from updated_by field
const correlationPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^user\.([0-9a-f-]{36})$/i, // Extract UUID from "user.uuid"
  validateUuidFormat: true
});

// Plugin automatically extracts correlation IDs from updated_by field
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true
});
```

### Custom Plugin Configuration

```typescript
// Custom extraction configuration for different updated_by patterns
const customPlugin = new UpdatedByCorrelationPlugin({
  // Extract from "system.workflow.uuid" format
  extractionPattern: /^system\.workflow\.([0-9a-f-]{36})$/i,
  validateUuidFormat: true,
  updateOperationsOnly: true
});

// Plugin will extract using your custom pattern
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true
});
```

### Plugin Extraction Process

The UpdatedByCorrelationPlugin follows this process:

1. **Check Operation**: Only processes UPDATE operations (if configured)
2. **Read updated_by Field**: Extracts the `updated_by` value from the database event
3. **Apply Pattern**: Uses regex pattern to extract correlation ID portion
4. **Validate Format**: Optionally validates extracted ID as UUID format
5. **Set in Options**: Places the correlation ID in `options.correlationId`

### Example: Extract from Different Patterns

```typescript
// For updated_by values like "api-gateway.request-123.correlation-abc"
const apiGatewayPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^api-gateway\.[^.]+\.(.+)$/i, // Extract "correlation-abc"
  validateUuidFormat: false, // Allow non-UUID formats
  updateOperationsOnly: true
});
```

## Real-World Use Cases

### 1. E-commerce Order Processing

Track an order from creation through fulfillment:

```typescript
// Method 1: Manual extraction and injection
const extractOrderCorrelationId = (hasuraEvent) => {
  const orderData = hasuraEvent.event.data.new;
  return orderData?.cart_session_id || orderData?.checkout_id || generateNewId();
};

const correlationId = extractOrderCorrelationId(hasuraEvent);
await listenTo(hasuraEvent, { 
  context: { environment: 'prod' },
  correlationId: correlationId
});

// Method 2: Plugin-based automatic extraction
const orderPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^checkout\.([0-9a-f-]{36})$/i, // "checkout.session-id"
  validateUuidFormat: true
});
```

### 2. User Onboarding Flow

```typescript
// Plugin for user onboarding correlation IDs from updated_by
const onboardingPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^onboarding\.([0-9a-f-]{36})$/i, // "onboarding.flow-id"
  validateUuidFormat: true,
  updateOperationsOnly: true
});

// Jobs will automatically receive the onboarding correlation ID
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true
});
```

### 3. Audit Trail Creation

```typescript
job(async function createAuditLog(event, hasuraEvent, options) {
  const correlationId = options?.correlationId;
  const { dbEvent, operation, user } = parseHasuraEvent(hasuraEvent);
  
  await db.audit_logs.create({
    correlation_id: correlationId,  // Link all related changes
    event_name: event,
    operation,
    table_name: hasuraEvent.table.name,
    record_id: dbEvent?.new?.id || dbEvent?.old?.id,
    user_id: user,
    changes: operation === 'UPDATE' ? {
      before: dbEvent?.old,
      after: dbEvent?.new
    } : null,
    timestamp: new Date()
  });
})
```

## Database Schema Examples

### Audit Table with Correlation ID
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  user_id UUID,
  operation TEXT NOT NULL,
  changes JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient correlation ID queries
CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);
```

### Business Process Tracking Table
```sql
CREATE TABLE business_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id TEXT UNIQUE NOT NULL,
  process_type TEXT NOT NULL,
  status TEXT DEFAULT 'in_progress',
  started_by UUID,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB
);
```

## Querying with Correlation IDs

### Find All Related Records
```sql
-- Find all activities for a business process
SELECT 
  'audit_logs' as table_name,
  event_name,
  created_at
FROM audit_logs 
WHERE correlation_id = 'listenTo:a1b2c3d4-e5f6-7890-abcd-ef1234567890'

UNION ALL

SELECT 
  'notifications' as table_name,
  notification_type as event_name,
  created_at
FROM notifications 
WHERE correlation_id = 'listenTo:a1b2c3d4-e5f6-7890-abcd-ef1234567890'

ORDER BY created_at;
```

## Best Practices

### 1. Choose the Right Approach

- **Manual Injection**: Use when you need full control or complex extraction logic
- **Plugin-Based**: Use for consistent, reusable extraction patterns
- **Hybrid**: Combine both - plugin for automatic, manual for special cases

### 2. Always Include Correlation ID in Database Records

```typescript
// Good: Include correlation ID for traceability
await db.notifications.create({
  correlation_id: options?.correlationId,
  user_id: userId,
  message: 'Welcome!'
});
```

### 3. Design for Correlation ID Queries

- Always index correlation_id columns
- Use consistent naming across tables
- Include correlation_id in all related records

### 4. Handle Missing Correlation IDs Gracefully

```typescript
job(async function robustJob(event, hasuraEvent, options) {
  const correlationId = options?.correlationId || 'unknown';
  
  // Your job logic here...
  
  return { 
    success: true, 
    correlationId,
    fallbackUsed: !options?.correlationId 
  };
})
```

### 5. Log Correlation ID for Debugging

```typescript
job(async function processData(event, hasuraEvent, options) {
  const correlationId = options?.correlationId;
  
  console.log(`[${correlationId}] Starting data processing`);
  
  try {
    // Process data
    console.log(`[${correlationId}] Processing completed successfully`);
  } catch (error) {
    console.error(`[${correlationId}] Processing failed:`, error);
    throw error;
  }
})
```

## Creating Custom Extraction Plugins

You can create your own correlation ID extraction plugins:

```typescript
import { BasePluginInterface, PluginName } from '@hopdrive/hasura-event-detector';

class MyCustomExtractionPlugin implements BasePluginInterface {
  readonly name = 'my-custom-extractor' as PluginName;
  readonly config = { enabled: true };
  readonly enabled = true;

  getStatus() {
    return { name: this.name, enabled: this.enabled, config: this.config };
  }

  async onCorrelationIdExtraction(hasuraEvent, parsedEvent, context) {
    // Your custom extraction logic here
    const customId = parsedEvent.dbEvent?.new?.my_custom_field;
    
    if (customId && typeof customId === 'string') {
      return customId;
    }
    
    return null; // Let system generate new one
  }
}
```

The correlation ID system provides powerful traceability while remaining simple and flexible for your specific needs!