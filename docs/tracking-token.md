# TrackingToken System

## Overview

The TrackingToken system provides a standardized way to track execution lineage through your system. It creates hierarchical identifiers in the format `source|correlationId|jobExecutionId` that can be stored in database columns (like `updated_by`) to trace operations across multiple jobs, services, and database mutations.

## Key Concepts

### What is a TrackingToken?

A TrackingToken is a pipe-delimited string with three components:
- **source**: The system/user/service that initiated the change (e.g., `user@example.com`, `api-handler`, `system`)
- **correlationId**: A UUID linking related operations across the entire business process
- **jobExecutionId**: A UUID referencing `job_executions.id` in the observability database for parent-child job tracking

**Format**: `source|correlationId|jobExecutionId`

**Example**: `user@example.com|550e8400-e29b-41d4-a716-446655440000|abc-123-def-456`

### Why Use TrackingTokens?

1. **Execution Tracing**: Track the complete execution path through your system
2. **Parent-Child Relationships**: Link job executions to understand which job triggered which mutation
3. **Correlation**: Connect related operations across different events and services
4. **Observability**: Query the full execution tree in the observability database
5. **Audit Trail**: Know exactly who/what made each database change

## Quick Start

### Simple Usage: TrackingToken.forJob()

The easiest way to get a tracking token in your jobs:

```typescript
import { TrackingToken, parseHasuraEvent } from '@hopdrive/hasura-event-detector';
import type { JobFunction } from '@hopdrive/hasura-event-detector';

export const myJob: JobFunction = async (event, hasuraEvent, options) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);

  // ONE-LINER: Get the right tracking token automatically
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || role || 'system'  // Fallback source for new records
  );

  // Use it in your database update
  await db.query(`
    UPDATE records
    SET status = 'processed',
        updated_by = $1
    WHERE id = $2
  `, [trackingToken, recordId]);

  return { success: true };
};
```

**What `forJob()` does:**
1. Checks if `options.sourceTrackingToken` exists (from a previous update's `updated_by` field)
2. If yes: Reuses the existing token's source and correlationId, updates only the jobExecutionId
3. If no: Creates a new token with the fallback source and current correlationId
4. Always includes `options.jobExecutionId` for observability tracking

### How Data Flows

#### New Record (No Previous Token)
```typescript
// First job creates a new record
const token = TrackingToken.forJob(hasuraEvent, options, 'api-handler');
// Result: 'api-handler|550e8400-...|job-abc-123'

await db.query(`INSERT INTO orders (status, updated_by) VALUES ($1, $2)`,
  ['pending', token]);
```

#### Updated Record (Token Exists)
```typescript
// Second job updates the record - TrackingTokenExtractionPlugin
// automatically extracts the previous token and passes it via options.sourceTrackingToken

const token = TrackingToken.forJob(hasuraEvent, options, 'fallback-unused');
// Result: 'api-handler|550e8400-...|job-def-456'
// Note: Reused 'api-handler' and correlationId, new jobExecutionId

await db.query(`UPDATE orders SET status = $1, updated_by = $2 WHERE id = $3`,
  ['shipped', token, orderId]);
```

## Plugin Integration

### TrackingTokenExtractionPlugin

This plugin automatically extracts previous tracking tokens from `updated_by` columns and makes them available to jobs:

```typescript
import { TrackingTokenExtractionPlugin } from '@hopdrive/hasura-event-detector/plugins';

const plugin = new TrackingTokenExtractionPlugin({
  enabled: true,
  extractFromUpdatedBy: true,  // Primary extraction method
  extractFromSession: true,    // Fallback to session variables
  extractFromMetadata: true,   // Fallback to metadata
});

pluginManager.register(plugin);
```

**What it does:**
1. During `onPreConfigure` hook, reads the `updated_by` field from `hasuraEvent.event.data.old`
2. Parses the tracking token format (`source|correlationId|jobExecutionId`)
3. Injects `sourceTrackingToken` into options for jobs to use
4. Extracts correlationId and passes it separately if needed

### ObservabilityPlugin Integration

The ObservabilityPlugin automatically injects `jobExecutionId` into job options:

```typescript
// When a job runs, ObservabilityPlugin:
// 1. Creates a job_executions record with a new UUID
// 2. Injects that UUID as options.jobExecutionId
// 3. Your job uses it via TrackingToken.forJob()
// 4. The tracking token now references that job_executions.id
// 5. When the record triggers another event, the chain continues
```

This creates a traceable parent-child relationship tree in the observability database.

## API Reference

### TrackingToken.forJob()

**Signature:**
```typescript
TrackingToken.forJob(
  hasuraEvent: HasuraEventPayload,
  options: JobOptions,
  fallbackSource?: string
): TrackingToken
```

**Parameters:**
- `hasuraEvent`: The Hasura event payload
- `options`: Job options (contains `sourceTrackingToken` and `jobExecutionId`)
- `fallbackSource`: Source to use when creating a new token (for new records)

**Returns:** A tracking token ready to use in `updated_by` columns

**Example:**
```typescript
const token = TrackingToken.forJob(hasuraEvent, options, user || role || 'system');
```

### Advanced Methods

Most jobs should use `forJob()`, but these are available for advanced use cases:

#### TrackingToken.create()
```typescript
TrackingToken.create(
  source: string,
  correlationId: CorrelationId,
  jobExecutionId?: string
): TrackingToken
```

Creates a new tracking token from scratch.

#### TrackingToken.withJobExecutionId()
```typescript
TrackingToken.withJobExecutionId(
  token: TrackingToken,
  jobExecutionId: string
): TrackingToken
```

Updates an existing token with a new job execution ID while preserving source and correlationId.

#### TrackingToken.parse()
```typescript
TrackingToken.parse(token: string): {
  source: string;
  correlationId: string;
  jobExecutionId?: string;
}
```

Parses a tracking token into its components.

#### TrackingToken.isValid()
```typescript
TrackingToken.isValid(value: unknown): value is TrackingToken
```

Checks if a value is a valid tracking token format.

#### TrackingToken.getCorrelationId()
```typescript
TrackingToken.getCorrelationId(token: TrackingToken): CorrelationId
```

Extracts just the correlation ID from a token.

#### TrackingToken.getSource()
```typescript
TrackingToken.getSource(token: TrackingToken): string
```

Extracts the source identifier.

#### TrackingToken.getJobExecutionId()
```typescript
TrackingToken.getJobExecutionId(token: TrackingToken): string | null
```

Extracts the job execution ID.

## Complete Example

```typescript
import {
  TrackingToken,
  parseHasuraEvent,
  type JobFunction
} from '@hopdrive/hasura-event-detector';

/**
 * Job that processes an order and updates status
 */
export const processOrder: JobFunction = async (event, hasuraEvent, options) => {
  const { user, role } = parseHasuraEvent(hasuraEvent);
  const orderId = hasuraEvent.event.data.new?.id;

  // Get tracking token (reuses existing or creates new)
  const trackingToken = TrackingToken.forJob(
    hasuraEvent,
    options,
    user || role || 'order-processor'
  );

  // Update order status with tracking
  await db.query(`
    UPDATE orders
    SET
      status = 'processing',
      updated_by = $1,
      updated_at = NOW()
    WHERE id = $2
  `, [trackingToken, orderId]);

  // The next event trigger will have this token in updated_by
  // TrackingTokenExtractionPlugin will extract it
  // Next job will reuse the source and correlationId
  // But get a new jobExecutionId for its execution

  return {
    success: true,
    orderId,
    trackingToken
  };
};
```

## Best Practices

### 1. Always Use TrackingToken.forJob()

```typescript
// ✅ GOOD - Simple and automatic
const token = TrackingToken.forJob(hasuraEvent, options, fallbackSource);

// ❌ BAD - Too much manual work
const sourceToken = options?.sourceTrackingToken;
let token;
if (sourceToken && TrackingToken.isValid(sourceToken)) {
  token = TrackingToken.withJobExecutionId(sourceToken, options?.jobExecutionId);
} else {
  token = TrackingToken.create(source, correlationId, jobExecutionId);
}
```

### 2. Use Meaningful Fallback Sources

```typescript
// ✅ GOOD - Descriptive sources
const { user, role } = parseHasuraEvent(hasuraEvent);
const token = TrackingToken.forJob(
  hasuraEvent,
  options,
  user || role || 'payment-processor'  // Clear source hierarchy
);

// ❌ BAD - Generic source
const token = TrackingToken.forJob(hasuraEvent, options, 'system');
```

### 3. Always Update updated_by

```typescript
// ✅ GOOD - Track all mutations
await db.query(`
  UPDATE records
  SET status = $1, updated_by = $2, updated_at = NOW()
  WHERE id = $3
`, [newStatus, trackingToken, id]);

// ❌ BAD - Missing tracking
await db.query(`
  UPDATE records SET status = $1 WHERE id = $2
`, [newStatus, id]);
```

### 4. Enable Both Plugins

```typescript
// Required for full tracking functionality
import {
  TrackingTokenExtractionPlugin,
  ObservabilityPlugin
} from '@hopdrive/hasura-event-detector/plugins';

// Extracts previous tokens from updated_by
const extractionPlugin = new TrackingTokenExtractionPlugin({
  extractFromUpdatedBy: true
});

// Provides jobExecutionId and tracks execution tree
const observabilityPlugin = new ObservabilityPlugin({
  enabled: true,
  database: { connectionString: process.env.DATABASE_URL }
});

pluginManager.register(extractionPlugin);
pluginManager.register(observabilityPlugin);
```

## Database Schema

### updated_by Column

```sql
-- Add to your tables for tracking
ALTER TABLE your_table
ADD COLUMN updated_by TEXT,
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Example data
-- updated_by: 'user@example.com|550e8400-e29b-41d4-a716-446655440000|abc-123-def'
```

### Observability Tables

The ObservabilityPlugin creates tables to track the execution tree:

```sql
-- job_executions: Each job execution gets a record
CREATE TABLE job_executions (
  id UUID PRIMARY KEY,
  job_name TEXT,
  correlation_id UUID,
  parent_job_id UUID REFERENCES job_executions(id),
  -- ... other fields
);
```

When you use `TrackingToken.forJob()`, the `jobExecutionId` component references `job_executions.id`, creating a traceable parent-child tree.

## Troubleshooting

### Token Not Being Reused

**Problem:** Every update creates a new token with a different source.

**Solution:** Ensure TrackingTokenExtractionPlugin is registered and `extractFromUpdatedBy: true`:

```typescript
const plugin = new TrackingTokenExtractionPlugin({
  extractFromUpdatedBy: true  // Must be enabled
});
pluginManager.register(plugin);
```

### Missing jobExecutionId

**Problem:** Tracking tokens have `'unknown'` as jobExecutionId.

**Solution:** Ensure ObservabilityPlugin is registered and initialized:

```typescript
const observability = new ObservabilityPlugin({ enabled: true });
pluginManager.register(observability);
await pluginManager.initialize();
```

### Can't Parse Token

**Problem:** `TrackingToken.parse()` throws an error.

**Solution:** Validate before parsing:

```typescript
if (TrackingToken.isValid(value)) {
  const parsed = TrackingToken.parse(value);
}
```

## Migration from Old Format

If you have existing tokens in the old format (`source.correlationId.jobId`), they will continue to work. The TrackingTokenExtractionPlugin handles both formats:

- **New format** (pipe-delimited): `source|correlationId|jobExecutionId`
- **Old format** (dot-delimited): `source.correlationId.jobId`

The extraction plugin pattern supports both, but all new tokens should use the pipe format.

## See Also

- [TrackingTokenExtractionPlugin README](../src/plugins/tracking-token-extraction/README.md)
- [ObservabilityPlugin README](../src/plugins/observability/README.md)
- [TrackingToken Examples](../examples/tracking-token-usage.ts)
