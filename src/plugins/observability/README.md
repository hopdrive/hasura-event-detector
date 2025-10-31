# Observability Plugin

Comprehensive monitoring and debugging for Hasura Event Detector.

## Quick Start

### 1. Basic Setup (No UI)

```typescript
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

const observability = new ObservabilityPlugin({
  enabled: true,
  database: {
    connectionString: 'postgresql://localhost:5432/observability'
  }
});

// Use with listenTo
await listenTo(hasuraEvent, {
  plugins: [observability]
});
```

### 2. With Console UI

**Install the console package:**
```bash
npm install @hopdrive/hasura-event-detector-console --save-dev
```

**Enable console in plugin:**
```typescript
const observability = new ObservabilityPlugin({
  enabled: true,
  console: {
    enabled: true,
    port: 3001
  },
  database: {
    connectionString: 'postgresql://localhost:5432/observability'
  }
});

await observability.initialize();
// Console available at http://localhost:3001/console
```

**Or run console standalone:**
```bash
cd node_modules/@hopdrive/hasura-event-detector-console
npm install && npm run start
# Open http://localhost:3000
```

## What Gets Tracked?

- **Invocations**: Every call to `listenTo()`
- **Event Detections**: Which events were detected
- **Event Handlers**: Handler execution and duration
- **Job Executions**: Individual job runs, results, and errors
- **Correlation IDs**: Full tracing across your system
- **Performance Metrics**: Timing for all operations
- **Errors**: Complete error tracking with stack traces

## Database Schema

The plugin creates these tables:

- `invocations` - Top-level listenTo calls
- `event_executions` - Event detection and handling
- `job_executions` - Individual job runs

## Configuration Options

```typescript
{
  enabled: boolean;              // Enable/disable plugin
  database: {                    // Database connection
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
  };
  schema: string;                // Database schema (default: 'public')
  captureJobOptions: boolean;    // Store job options (default: true)
  captureHasuraPayload: boolean; // Store Hasura payloads (default: true)
  captureErrorStacks: boolean;   // Store error stack traces (default: true)
  batchSize: number;             // Batch size for writes (default: 100)
  flushInterval: number;         // Flush interval in ms (default: 5000)
  console?: {                    // Optional console UI
    enabled: boolean;
    port: number;
    host?: string;
    serveInProduction?: boolean;
  };
}
```

## Production Tips

- Set `captureErrorStacks: false` in production to reduce data size
- Set `console.serveInProduction: false` to disable UI in production
- Use connection pooling for better performance
- Consider data retention policies for the observability tables

## Console UI

The optional console UI provides:
- Real-time monitoring dashboard
- Event flow visualizations
- Performance analytics
- Error debugging interface
- Correlation ID search

Install separately to keep production bundles small:
```bash
npm install @hopdrive/hasura-event-detector-console --save-dev
```