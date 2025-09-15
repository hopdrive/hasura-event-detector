# TrackingToken Documentation

## Overview

`TrackingToken` is a core library utility that provides a standardized way to track execution lineage through your system. It creates hierarchical identifiers in the format `source.correlationId.jobId` that can be used to trace operations across multiple jobs, services, and database mutations.

## Why Use TrackingToken?

- **Execution Tracing**: Track the complete execution path through your system
- **Correlation**: Link related operations across different jobs and services
- **Transport Agnostic**: Can be used in database columns, HTTP headers, logs, etc.
- **Type Safe**: Branded types prevent mixing with regular strings
- **Standardized Format**: Consistent format across your entire system

## Basic Usage

### Creating a Tracking Token

```typescript
import { TrackingToken } from '@hopdrive/hasura-event-detector';

// In your job function
const token = TrackingToken.create(
  'api-handler',     // Source identifier
  correlationId,     // Correlation ID linking related operations
  'job-123'         // Optional job identifier
);
// Result: "api-handler.550e8400-e29b-41d4-a716-446655440000.job-123"
```

### Using in Database Mutations

The most common use case is storing the tracking token in an `updated_by` column:

```typescript
const trackingToken = TrackingToken.create('my-job', correlationId, jobId);

await db.query(`
  UPDATE records
  SET status = 'processed',
      updated_by = $1
  WHERE id = $2
`, [trackingToken, recordId]);
```

### Parsing Tracking Tokens

When reading tracking tokens from database records or other sources:

```typescript
const updatedBy = hasuraEvent.event.data.new?.updated_by;

if (TrackingToken.isValid(updatedBy)) {
  const components = TrackingToken.parse(updatedBy);
  console.log({
    source: components.source,         // 'my-job'
    correlationId: components.correlationId,  // '550e8400-...'
    jobId: components.jobId            // 'job-123'
  });
}
```

### Extracting Specific Components

```typescript
const token = 'webhook.550e8400-e29b-41d4-a716-446655440000.job-456';

const correlationId = TrackingToken.getCorrelationId(token);
// '550e8400-e29b-41d4-a716-446655440000'

const jobId = TrackingToken.getJobId(token);
// 'job-456'

const source = TrackingToken.getSource(token);
// 'webhook'
```

### Chaining Jobs

Continue a tracking chain with a new job:

```typescript
// Read previous token
const previousToken = hasuraEvent.event.data.new?.updated_by;

// Create new token with same correlation but different job
const newToken = TrackingToken.withJobId(previousToken, 'next-job');

// Or change the source while maintaining correlation
const apiToken = TrackingToken.withSource(previousToken, 'api-handler');
```

## Integration with Correlation Extraction Plugin

The Correlation ID Extraction plugin automatically extracts correlation IDs from tracking tokens in `updated_by` columns:

```typescript
// In your job
const token = TrackingToken.create('my-source', correlationId, jobId);
await updateRecord({ updated_by: token });

// The correlation extraction plugin will automatically:
// 1. Detect the tracking token in updated_by
// 2. Extract the correlation ID
// 3. Pass it to subsequent jobs
```

## Advanced Examples

### Distributed Tracing with Webhooks

```typescript
const trackingToken = TrackingToken.create(
  'webhook-sender',
  correlationId,
  'notification-job'
);

// Include in webhook headers for distributed tracing
await fetch('https://api.example.com/webhook', {
  headers: {
    'X-Tracking-Token': trackingToken,
    'X-Correlation-Id': TrackingToken.getCorrelationId(trackingToken),
    'X-Source-System': TrackingToken.getSource(trackingToken)
  },
  body: JSON.stringify({
    // ... payload
  })
});
```

### Audit Trail

```typescript
// Create audit records with full tracking information
const token = TrackingToken.create('audit-system', correlationId, jobId);
const components = TrackingToken.parse(token);

await createAuditLog({
  action: 'record_updated',
  tracking_token: token,
  source_system: components.source,
  correlation_id: components.correlationId,
  job_id: components.jobId,
  timestamp: new Date()
});
```

## API Reference

### Methods

| Method | Description | Example |
|--------|-------------|---------|
| `create(source, correlationId, jobId?)` | Create a new tracking token | `TrackingToken.create('api', correlationId, 'job-1')` |
| `parse(token)` | Parse token into components | `TrackingToken.parse(token)` |
| `isValid(value)` | Check if value is valid token format | `TrackingToken.isValid(value)` |
| `getCorrelationId(token)` | Extract correlation ID | `TrackingToken.getCorrelationId(token)` |
| `getJobId(token)` | Extract job ID | `TrackingToken.getJobId(token)` |
| `getSource(token)` | Extract source identifier | `TrackingToken.getSource(token)` |
| `withJobId(token, newJobId)` | Create new token with different job | `TrackingToken.withJobId(token, 'new-job')` |
| `withSource(token, newSource)` | Create new token with different source | `TrackingToken.withSource(token, 'api')` |

### Type Definitions

```typescript
// Branded type for type safety
type TrackingToken = string & { readonly __trackingToken: unique symbol };

// Components of a parsed token
interface TrackingTokenComponents {
  source: string;
  correlationId: string;
  jobId?: string;
}
```

## Best Practices

1. **Consistent Source Names**: Use consistent source identifiers across your system (e.g., 'api', 'webhook', 'scheduler')

2. **Always Validate**: Check tokens are valid before parsing:
   ```typescript
   if (TrackingToken.isValid(value)) {
     const components = TrackingToken.parse(value);
   }
   ```

3. **Preserve Correlation**: When chaining jobs, maintain the correlation ID:
   ```typescript
   const nextToken = TrackingToken.withJobId(previousToken, 'next-job');
   ```

4. **Include in Logs**: Add tracking tokens to your log entries for complete observability:
   ```typescript
   log('Processing record', { trackingToken, correlationId });
   ```