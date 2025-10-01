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