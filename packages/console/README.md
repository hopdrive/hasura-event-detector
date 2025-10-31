# @hopdrive/hasura-event-detector-console

Observability Console UI for Hasura Event Detector

## Quick Start - View Console in Browser

```bash
# 1. If you haven't installed dependencies yet
npm install

# 2. Start the console
npm run start

# 3. Open in browser
# Navigate to http://localhost:3000
```

That's it! The console UI is now running.

## What is this?

This is the web UI for monitoring your Hasura Event Detector system. It shows:
- Real-time event processing
- Performance metrics
- Error logs
- Event flow visualizations
- Job execution tracking

## Installation (When Using as Dependency)

```bash
# Install in your project
npm install @hopdrive/hasura-event-detector-console --save-dev
```

## Two Ways to Use

### 1. Standalone (Recommended for Development)

Run the console directly:

```bash
cd node_modules/@hopdrive/hasura-event-detector-console
npm install  # First time only
npm run start
# Open http://localhost:3000
```

### 2. Via ObservabilityPlugin

Let your app serve the console:

```typescript
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

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
// Console at http://localhost:3001/console
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Configuration

The console connects to your database and Hasura instance. Configure via `console.config.js`:

```javascript
module.exports = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/observability',
  },
  hasura: {
    endpoint: process.env.HASURA_ENDPOINT || 'http://localhost:8080/v1/graphql',
    adminSecret: process.env.HASURA_ADMIN_SECRET
  }
};
```

### Grafana Logs Integration

To enable Grafana Loki log viewing in the console UI, set these environment variables:

```bash
# Grafana Cloud configuration
VITE_GRAFANA_HOST=https://your-org.grafana.net
VITE_GRAFANA_ID=your-grafana-user-id
VITE_GRAFANA_SECRET=your-grafana-api-key
```

**Example for Grafana Cloud:**
```bash
VITE_GRAFANA_HOST=https://hopdrive.grafana.net
VITE_GRAFANA_ID=123456
VITE_GRAFANA_SECRET=glsa_xxxxxxxxxxxxxxxxxxxx
```

Once configured, each node detail drawer (Invocation, Event, Job) will have a "Logs" tab that displays relevant logs from Grafana Loki:

- **Invocation Logs**: All logs for the entire invocation (filtered by `invocationId`)
- **Event Logs**: Logs for a specific event execution and its jobs (filtered by `correlationId` and `eventExecutionId`)
- **Job Logs**: Logs for a specific job execution (filtered by `scopeId` and `jobExecutionId`)

The logs viewer features:
- **Live refresh** for running jobs
- **Multiple view modes**: Text, JSON, and Table
- **Search/filter** within logs
- **Copy to clipboard** in any format
- **Auto-scroll** for streaming logs

## Why Separate Package?

- **Small Production Bundles**: Main package only 78KB (vs hundreds of MB with UI)
- **Optional**: Only install when you need the monitoring UI
- **No Deployment Issues**: Avoids Netlify function size limits

## Requirements

- Node.js >= 16
- PostgreSQL database for observability data
- @hopdrive/hasura-event-detector >= 2.0.0 (peer dependency)

## License

ISC