# Event Detector Observability System

This observability system provides comprehensive monitoring and debugging capabilities for the Hasura Event Detector library. It captures detailed execution metadata and provides rich visualization through a React dashboard.

## Features

- **Complete Execution Tracking**: Records every invocation, event detection, and job execution
- **Performance Monitoring**: Tracks timing, success rates, and bottlenecks
- **Error Debugging**: Captures full error details and stack traces
- **Console Log Capture**: Records all console output from job executions
- **Visual Dashboard**: React-based dashboard with flow diagrams and analytics
- **GraphQL API**: Query observability data alongside business data

## Quick Start

### 1. Database Setup

Create a separate PostgreSQL database for observability data:

```sql
-- Create observability database
CREATE DATABASE hasura_event_detector_observability;
```

Run the schema migration:

```bash
psql -d hasura_event_detector_observability -f observability/schema.sql
```

### 2. Hasura Configuration

Add the observability database to your Hasura instance and apply the metadata:

```bash
# Add database to Hasura
hasura metadata apply --database-name observability

# Apply table and relationship metadata
hasura metadata apply --from-file observability/hasura-metadata/
```

### 3. Enable in Your Netlify Functions

Update your event detector Netlify functions:

```javascript
const { listenTo, handleSuccess, handleFailure } = require('@hopdrive/hasura-event-detector');

exports.handler = async (event, context) => {
  const res = await listenTo(JSON.parse(event.body), {
    autoLoadEventModules: true,
    eventModulesDirectory: `${__dirname}/events`,
    sourceFunction: 'event-detector-moves', // Important: specify function name
    
    // Enable observability
    observability: {
      enabled: process.env.OBSERVABILITY_ENABLED === 'true',
      database: {
        connectionString: process.env.OBSERVABILITY_DB_URL
      },
      captureConsoleLog: true,
      captureJobOptions: true,
      captureHasuraPayload: true
    }
  });

  return handleSuccess(res);
};
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

```javascript
observability: {
  enabled: boolean,                    // Enable/disable plugin
  database: {
    connectionString: string,          // PostgreSQL connection string
    host: string,                      // Alternative: individual params
    port: number,
    database: string,
    user: string,
    password: string,
    ssl: object                        // SSL configuration
  },
  schema: string,                      // Database schema (default: event_detector_observability)
  captureConsoleLog: boolean,          // Capture console.log during jobs (default: true)
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

- **`invocations`**: Each call to `listenTo()` with overall execution metrics
- **`event_executions`**: Each event module checked, with detection results
- **`job_executions`**: Each job run, with timing and results
- **`job_logs`**: Console logs captured during job execution
- **`metrics_hourly`**: Pre-aggregated hourly metrics for dashboard performance

### Key Relationships

```
invocations (1) -> (many) event_executions
event_executions (1) -> (many) job_executions  
job_executions (1) -> (many) job_logs
```

## GraphQL Queries

### Recent Invocations

```graphql
query RecentInvocations {
  invocations(
    limit: 10
    order_by: { created_at: desc }
  ) {
    id
    source_function
    created_at
    total_duration_ms
    events_detected_count
    success_rate
    
    event_executions {
      event_name
      detected
      job_executions {
        job_name
        status
        duration_ms
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

### Job Execution Details

```graphql
query JobExecutionDetails($jobExecutionId: uuid!) {
  job_executions_by_pk(id: $jobExecutionId) {
    job_name
    status
    duration_ms
    result
    error_message
    
    logs {
      level
      message
      created_at
    }
  }
}
```

## React Dashboard

The React dashboard provides:

- **Overview**: Real-time metrics and system health
- **Event Flow**: Interactive flow diagrams showing event → job execution
- **Analytics**: Performance trends and failure analysis
- **Drill-down**: Click through from invocation → events → jobs → logs

### Dashboard Setup

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

## Performance Impact

The observability plugin is designed for minimal performance impact:

- **Buffered Writes**: Database writes are batched and asynchronous
- **Non-blocking**: Plugin failures don't affect event processing
- **Configurable**: Disable expensive features like console log capture
- **Connection Pooling**: Efficient database connection management

### Typical Overhead

- **Memory**: ~1-2MB per 1000 executions (before flush)
- **Latency**: <5ms additional per job execution
- **Database**: ~50KB per complete invocation with 5 jobs

## Troubleshooting

### Plugin Not Initializing

1. Check database connection string
2. Verify database exists and schema is applied
3. Check network connectivity to database
4. Review console logs for initialization errors

### Missing Data

1. Ensure `sourceFunction` is specified in listenTo options
2. Check if `observability.enabled` is true
3. Verify database permissions
4. Check flush interval isn't too high

### Performance Issues

1. Increase `flushInterval` to batch more writes
2. Disable `captureConsoleLog` if not needed
3. Reduce `batchSize` if memory constrained
4. Use database connection pooling

## Security Considerations

- **Separate Database**: Keep observability data isolated from business data
- **Access Control**: Use Hasura permissions to restrict access
- **Sensitive Data**: Disable `captureHasuraPayload` for GDPR compliance
- **Retention**: Implement data retention policies for old observability data

## Production Deployment

### Database Sizing

For high-volume applications:
- **Storage**: ~100MB per million job executions
- **IOPS**: ~1000 writes/minute for typical workloads
- **Connections**: 5-10 concurrent connections recommended

### Monitoring

Monitor these metrics:
- Plugin initialization success rate
- Database write failure rate
- Buffer flush frequency
- Query response times

### Maintenance

Set up automated maintenance:

```sql
-- Delete old data (older than 30 days)
DELETE FROM event_detector_observability.invocations 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Refresh materialized views
SELECT event_detector_observability.refresh_dashboard_stats();
```