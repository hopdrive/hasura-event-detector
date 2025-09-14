# Observability Plugin Usage Example

This guide shows how to integrate the ObservabilityPlugin with your Event Detector to start recording invocations in the observability database.

## Quick Setup

### 1. Install the Plugin

```javascript
// In your Netlify function or event detector setup
import { listenTo } from '@/src/detector';
import { pluginManager } from '@/src/plugin';
import { ObservabilityPlugin } from './example-plugins/observability/plugin';

// Initialize the plugin
const observabilityPlugin = new ObservabilityPlugin({
  enabled: true,
  database: {
    host: process.env.OBSERVABILITY_DB_HOST,
    port: parseInt(process.env.OBSERVABILITY_DB_PORT || '5432'),
    database: process.env.OBSERVABILITY_DB_NAME || 'event_detector_observability',
    user: process.env.OBSERVABILITY_DB_USER || 'observability_app',
    password: process.env.OBSERVABILITY_DB_PASSWORD,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  },
  captureJobOptions: true,
  captureHasuraPayload: true,
  captureErrorStacks: true,
  flushInterval: 5000, // Flush every 5 seconds
});

// Register the plugin
pluginManager.registerPlugin(observabilityPlugin);
```

### 2. Environment Variables

Add these to your `.env` or Netlify environment variables:

```bash
# Observability Database Connection
OBSERVABILITY_DB_HOST=your-rds-endpoint.region.rds.amazonaws.com
OBSERVABILITY_DB_PORT=5432
OBSERVABILITY_DB_NAME=event_detector_observability
OBSERVABILITY_DB_USER=observability_app
OBSERVABILITY_DB_PASSWORD=your-secure-password

# Optional: Connection string format
OBSERVABILITY_DB_URL=postgresql://observability_app:password@your-rds-endpoint:5432/event_detector_observability
```

### 3. Use in Your Function

```javascript
// netlify/functions/event-detector-moves.js
const { listenTo } = require('@/src/detector');

exports.handler = async (event, context) => {
  try {
    const hasuraEvent = JSON.parse(event.body);

    // The plugin will automatically record this invocation
    const result = await listenTo(hasuraEvent, {
      sourceFunction: 'event-detector-moves',
      context: {
        // Any additional context you want to track
        userId: hasuraEvent.event?.session_variables?.['x-hasura-user-id'],
        environment: process.env.NODE_ENV,
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Event detector error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
```

## What Gets Recorded

When you use this setup, the plugin will automatically record:

### Invocation Level
- Source function name
- Hasura event payload (if enabled)
- User information from session variables
- Execution duration and status
- Number of events detected and jobs run
- Success/failure counts

### Event Level
- Each event module checked
- Whether event was detected
- Detection duration
- Handler execution results

### Job Level
- Individual job executions
- Job options and results
- Execution duration and status
- Error messages and stack traces

## Verify It's Working

1. **Check Plugin Status**:
```javascript
console.log(pluginManager.getPlugin('ObservabilityPlugin').getStatus());
```

2. **Query the Database**:
```sql
-- Check recent invocations
SELECT * FROM invocations ORDER BY created_at DESC LIMIT 10;

-- Check plugin is recording data
SELECT
  source_function,
  COUNT(*) as invocations,
  AVG(total_duration_ms) as avg_duration
FROM invocations
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY source_function;
```

3. **Use the Dashboard**:
Open the HTML dashboard or set up Grafana to visualize the data.

## Troubleshooting

### Plugin Not Recording Data

1. **Check Plugin is Enabled**:
```javascript
const plugin = pluginManager.getPlugin('ObservabilityPlugin');
console.log('Enabled:', plugin.enabled);
console.log('Config:', plugin.config);
```

2. **Check Database Connection**:
- Verify environment variables are set
- Test connection manually with psql
- Check network security groups allow connections

3. **Check Plugin Registration**:
```javascript
console.log('Registered plugins:', pluginManager.getEnabledPlugins().map(p => p.name));
```

4. **Monitor Plugin Logs**:
The plugin logs when it records data:
- "Recorded invocation start: [id] for correlation: [correlation-id]"
- "Recorded invocation end: [id] (status)"

### Database Connection Issues

If you see connection errors:

1. **Check Credentials**:
```javascript
// Test with readonly user first
const testConfig = {
  host: process.env.OBSERVABILITY_DB_HOST,
  port: parseInt(process.env.OBSERVABILITY_DB_PORT || '5432'),
  database: 'event_detector_observability',
  user: 'observability_readonly', // Use readonly first to test connection
  password: process.env.OBSERVABILITY_DB_PASSWORD,
};
```

2. **Check SSL Settings**:
```javascript
// For RDS, usually need SSL
ssl: { rejectUnauthorized: false }
```

3. **Test Connection**:
```sql
-- Connect manually
psql -h your-rds-endpoint -U observability_app -d event_detector_observability -c "SELECT 1;"
```

## Advanced Configuration

### Custom Source System

```javascript
// For non-Hasura events
const observabilityPlugin = new ObservabilityPlugin({
  enabled: true,
  // ... database config ...

  // Custom configuration
  captureJobOptions: false,      // Don't capture job parameters (for privacy)
  captureHasuraPayload: false,   // Don't capture full event payload
  captureErrorStacks: true,      // Capture error stack traces
  flushInterval: 10000,         // Flush every 10 seconds
  batchSize: 50,                // Smaller batch size
});
```

### Multiple Environments

```javascript
const config = {
  development: {
    enabled: true,
    flushInterval: 1000, // Faster flush for development
    captureHasuraPayload: true,
  },
  production: {
    enabled: true,
    flushInterval: 5000,
    captureHasuraPayload: false, // Privacy in production
    captureJobOptions: false,
  }
};

const observabilityPlugin = new ObservabilityPlugin({
  ...config[process.env.NODE_ENV || 'development'],
  database: { /* ... */ }
});
```

## Performance Impact

The observability plugin is designed to have minimal performance impact:

- **Buffered Writes**: Data is buffered and written in batches
- **Non-blocking**: Database writes don't slow down event processing
- **Configurable**: Can disable expensive operations like payload capture
- **Connection Pooling**: Reuses database connections efficiently

Expected overhead: < 5ms per invocation in most cases.

## Next Steps

1. **Set Up Dashboards**: Use the provided Grafana dashboard or HTML dashboard
2. **Create Alerts**: Set up monitoring for error rates and slow operations
3. **Analyze Patterns**: Use the correlation ID to trace event chains
4. **Optimize Performance**: Monitor the dashboard for bottlenecks

Your event detector is now fully observable!