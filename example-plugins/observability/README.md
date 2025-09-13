# Event Detector Observability System

A comprehensive observability system for tracking database events through their entire lifecycle, from initial triggers to downstream job execution. The system provides end-to-end traceability using correlation IDs and captures detailed execution metadata for monitoring and debugging.

## System Overview

The observability system provides four main capabilities:

1. **Correlation ID Tracking** - Traces events from database triggers through job execution chains
2. **Execution Monitoring** - Records detailed metrics for every invocation, event detection, and job execution
3. **Performance Analytics** - Tracks timing, success rates, bottlenecks, and trends over time
4. **Visual Flow Interface** - Interactive diagrams showing event cascades and relationships

## Features

- **Complete Execution Tracking**: Records every invocation, event detection, and job execution
- **Correlation ID Tracing**: Follows events through their entire execution chain
- **Performance Monitoring**: Tracks timing, success rates, and bottlenecks
- **Error Debugging**: Captures full error details and stack traces
- **Console Log Capture**: Records all console output from job executions
- **Buffered Writes**: Asynchronous, batched database operations for minimal performance impact
- **GraphQL API**: Query observability data with rich relationships
- **Visual Dashboard**: React-based dashboard with flow diagrams and analytics

## Architecture

### Database Design
The observability system uses a **separate database** within your existing PostgreSQL instance for:
- Complete logical isolation from application data
- Easy future migration capabilities
- Cost-effective resource sharing
- Independent backup and maintenance cycles

### Correlation ID System
Events are traced through the system using correlation IDs that follow this pattern:
- **User actions**: Email address format (preserves existing audit trails)
- **System actions**: `{system_name}.{uuid}` format for traceability
- **Event chains**: All downstream updates maintain the same correlation ID

### Performance Strategy
- **Buffered writes** prevent blocking main application flow
- **Connection pooling** manages database resources efficiently
- **Configurable capture levels** allow tuning for performance vs. detail
- **Asynchronous processing** ensures minimal latency impact

## Quick Start

### 1. Database Setup

Create a separate PostgreSQL database for observability data:

```sql
-- Create observability database
CREATE DATABASE hasura_event_detector_observability;
```

Run the schema migration:

```bash
psql -d hasura_event_detector_observability -f example-plugins/observability/schema.sql
```

### 2. Hasura Configuration

Add the observability database to your Hasura instance and apply the metadata:

```bash
# Add database to Hasura
hasura metadata apply --database-name observability

# Apply table and relationship metadata
hasura metadata apply --from-file example-plugins/observability/hasura-metadata/
```

### 3. Plugin Registration

Register the observability plugin with your event detector:

```typescript
import { pluginManager } from '@/plugins/plugin-system.js';
import { ObservabilityPlugin } from './example-plugins/observability/plugin.js';

const observabilityPlugin = new ObservabilityPlugin({
  enabled: process.env.OBSERVABILITY_ENABLED === 'true',
  database: {
    connectionString: process.env.OBSERVABILITY_DB_URL
  },
  captureJobOptions: true,
  captureHasuraPayload: true,
  captureErrorStacks: true
});

pluginManager.register(observabilityPlugin);
await pluginManager.initialize();
```

### 4. Environment Variables

Add to your `.env` file:

```env
# Observability Settings
OBSERVABILITY_ENABLED=true
OBSERVABILITY_DB_URL=postgresql://user:password@localhost:5432/observability_db
```

## Configuration Options

### Plugin Configuration

```typescript
{
  enabled: boolean,                    // Enable/disable plugin
  database: {
    connectionString?: string,         // PostgreSQL connection string
    host: string,                      // Alternative: individual params
    port: number,
    database: string,
    user: string,
    password: string,
    ssl?: object                       // SSL configuration
  },
  schema: string,                      // Database schema (default: event_detector_observability)
  captureJobOptions: boolean,          // Store job options (default: true)
  captureHasuraPayload: boolean,       // Store Hasura event payload (default: true)
  captureErrorStacks: boolean,         // Capture error stack traces (default: true)
  batchSize: number,                   // Batch size for database writes (default: 100)
  flushInterval: number,               // Flush interval in ms (default: 5000)
  retryAttempts: number,              // Retry failed writes (default: 3)
  retryDelay: number                  // Delay between retries in ms (default: 1000)
}
```

## Database Schema

The observability system uses these main tables:

- **`invocations`**: Each call to `listenTo()` with overall execution metrics and correlation tracking
- **`event_executions`**: Each event module checked, with detection results and timing
- **`job_executions`**: Each job run, with timing, results, and correlation context

### Key Relationships & Correlation Flow

```
invocations (1) -> (many) event_executions
event_executions (1) -> (many) job_executions
```

**Correlation ID Flow**:
1. Initial database event generates or extracts correlation ID
2. All event detections maintain the same correlation ID
3. All job executions inherit and propagate correlation ID
4. Downstream database updates continue the correlation chain

## GraphQL Queries

### Correlation ID Tracing

```graphql
query TraceCorrelationId($correlationId: String!) {
  invocations(where: { correlation_id: { _eq: $correlationId } }) {
    id
    source_function
    correlation_id
    created_at
    total_duration_ms

    event_executions {
      event_name
      detected
      correlation_id
      job_executions {
        job_name
        status
        duration_ms
        correlation_id
      }
    }
  }
}
```

### Recent Invocations with Flow

```graphql
query RecentInvocations {
  invocations(
    limit: 10
    order_by: { created_at: desc }
  ) {
    id
    source_function
    correlation_id
    created_at
    total_duration_ms
    events_detected_count

    event_executions {
      event_name
      detected
      correlation_id
      job_executions {
        job_name
        status
        duration_ms
        correlation_id
      }
    }
  }
}
```

### Performance Analytics

```graphql
query PerformanceAnalytics($timeRange: timestamptz!) {
  dashboard_stats(
    where: { hour_bucket: { _gte: $timeRange } }
    order_by: { hour_bucket: asc }
  ) {
    hour_bucket
    source_function
    total_invocations
    avg_duration_ms
    successful_invocations
    failed_invocations
  }
}
```

## Visual Flow Interface

The React dashboard provides interactive event flow visualization:

### React Flow Features
- **Node-based diagrams** showing event cascades and job sequences
- **Connected arrows** indicating flow direction and correlation relationships
- **Interactive nodes** for drilling into execution details
- **Correlation highlighting** to trace related events across the system

### Flow Structure
- **Root node**: Original database event trigger with correlation ID
- **Child nodes**: Subsequent jobs and updates triggered by correlation ID
- **Visual representation**: Complete event lifecycle and downstream impacts

### Setup

```bash
cd dashboard
npm install
npm start
```

Configure the GraphQL endpoint:

```javascript
// dashboard/src/config.js
export const config = {
  graphqlEndpoint: 'http://localhost:8080/v1/graphql',
  headers: {
    'x-hasura-admin-secret': 'your-admin-secret'
  }
};
```

## Correlation ID Implementation

### Extraction Strategies
The observability plugin works with correlation ID extraction plugins to identify and track event relationships:

1. **Updated By Field**: Extract from `updated_by` audit columns (e.g., `user.correlation-id`)
2. **Session Variables**: Pull from Hasura session variables (`x-correlation-id`)
3. **Event Metadata**: Extract from event payload metadata fields
4. **Custom Fields**: Configure extraction from any custom database field

### Tracing Flow
```
Database Event → Correlation ID Extraction → Event Detection → Job Execution
                                     ↓
All subsequent database writes include correlation ID in updated_by field
                                     ↓
Creates traceable chain of related events and updates
```

## Performance Impact

The observability plugin is designed for minimal performance impact:

- **Buffered Writes**: Database writes are batched and asynchronous
- **Non-blocking**: Plugin failures don't affect event processing
- **Configurable**: Disable expensive features as needed
- **Connection Pooling**: Efficient database connection management

### Typical Overhead

- **Memory**: ~1-2MB per 1000 executions (before flush)
- **Latency**: <5ms additional per job execution
- **Database**: ~50KB per complete invocation with 5 jobs
- **Expected Volume**: 3-5x multiplier of current Hasura events

### Scaling Strategy

1. **Phase 1**: Monitor performance on shared RDS instance
2. **Phase 2**: Scale up RDS instance if resource contention occurs
3. **Phase 3**: Migrate to separate RDS instance as final scaling option

## Production Deployment

### Database Sizing

For high-volume applications:
- **Storage**: ~100MB per million job executions
- **IOPS**: ~1000 writes/minute for typical workloads
- **Connections**: 5-10 concurrent connections recommended

### Monitoring

Monitor these key metrics:
- Plugin initialization success rate
- Database write failure rate
- Buffer flush frequency
- Query response times
- Correlation ID extraction success rate

### Performance Optimization

```typescript
// Production-optimized configuration
const observabilityPlugin = new ObservabilityPlugin({
  enabled: process.env.NODE_ENV === 'production',
  database: {
    connectionString: process.env.OBSERVABILITY_DB_URL,
    ssl: { rejectUnauthorized: false }
  },
  captureJobOptions: false,        // Reduce data volume
  captureHasuraPayload: false,     // Don't store sensitive data
  captureErrorStacks: true,        // Keep for debugging
  batchSize: 200,                  // Larger batches
  flushInterval: 10000,            // Less frequent flushes
  retryAttempts: 5
});
```

## Troubleshooting

### Plugin Not Initializing

1. Check database connection string format
2. Verify database exists and schema is applied
3. Ensure network connectivity to database
4. Review initialization logs for specific errors

### Missing Correlation Data

1. Verify correlation ID extraction plugins are registered
2. Check that extraction patterns match your data format
3. Ensure database triggers are generating correlation IDs
4. Validate correlation ID propagation in job updates

### Performance Issues

1. Increase `flushInterval` to batch more writes
2. Disable `captureJobOptions` if not needed
3. Reduce `batchSize` if memory constrained
4. Monitor database connection pool usage

## Security Considerations

- **Separate Database**: Keeps observability data isolated from business data
- **Access Control**: Use Hasura permissions to restrict observability data access
- **Sensitive Data**: Disable `captureHasuraPayload` for GDPR compliance
- **Retention Policies**: Implement automated cleanup of old observability data
- **Correlation Privacy**: Consider correlation ID formats that don't expose sensitive information

## Maintenance

Set up automated maintenance tasks:

```sql
-- Delete old data (older than 30 days)
DELETE FROM event_detector_observability.invocations
WHERE created_at < NOW() - INTERVAL '30 days';

-- Refresh materialized views for dashboard performance
SELECT event_detector_observability.refresh_dashboard_stats();

-- Analyze correlation ID coverage
SELECT
  COUNT(*) as total_invocations,
  COUNT(correlation_id) as with_correlation_id,
  ROUND(COUNT(correlation_id)::numeric / COUNT(*)::numeric * 100, 2) as coverage_percent
FROM event_detector_observability.invocations
WHERE created_at > NOW() - INTERVAL '24 hours';
```

## Success Metrics

### Observability Coverage
- 100% of database events trackable via correlation IDs
- End-to-end visibility for all event chains
- Sub-second response times for UI queries

### System Performance
- No degradation in main application performance
- Observability system response times < 2 seconds
- 99.9% uptime for critical observability functions

### User Adoption
- Development team actively using observability UI
- Reduced time to debug event-related issues
- Improved incident response times