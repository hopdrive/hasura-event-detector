# Hasura Event Detector

A powerful TypeScript-first framework for detecting and responding to business events from Hasura Event Triggers.

[![npm version](https://badge.fury.io/js/@hopdrive%2Fhasura-event-detector.svg)](https://badge.fury.io/js/@hopdrive%2Fhasura-event-detector)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

## 🚀 Features

- **TypeScript-First**: Full type safety with comprehensive TypeScript support
- **Plugin Architecture**: Extensible observability and logging system
- **Observability Console**: React-based dashboard for real-time monitoring and debugging
- **Parallel Job Execution**: Run multiple jobs concurrently with proper error isolation
- **CLI Tools**: Command-line interface for development and testing
- **Correlation Tracking**: Built-in correlation ID system for tracing business processes
- **Template System**: Ready-to-use templates for common event patterns
- **Dual Module Support**: Works with both CommonJS and ES modules
- **Netlify Integration**: First-class support for serverless deployment

## 📦 Installation

```bash
npm install @hopdrive/hasura-event-detector
```

## 🎯 Quick Start

### 1. Initialize Your Project

```bash
npx hasura-event-detector init --typescript
```

### 2. Create Your First Event

```bash
npx hasura-event-detector create user-activation --template user-activation
```

### 3. Test Your Event

```bash
npx hasura-event-detector test user-activation
```

### 4. Set Up Observability Console

```bash
# Initialize console with configuration
hasura-event-detector console init --add-script

# Start console for monitoring
npm run event-console
```

### 5. Use in Production

**TypeScript/ESM:**
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

export const handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);

  const result = await listenTo(hasuraEvent, {
    context: { environment: 'production' },
    autoLoadEventModules: true,
    eventModulesDirectory: './events'
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

**JavaScript/CommonJS:**
```javascript
const { listenTo } = require('@hopdrive/hasura-event-detector');

exports.handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);

  const result = await listenTo(hasuraEvent, {
    context: { environment: 'production' },
    autoLoadEventModules: true,
    eventModulesDirectory: './events'
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

## 🏗️ Architecture

### Event Modules

Each event module consists of two functions:

- **Detector**: Determines if a business event occurred
- **Handler**: Executes jobs when the event is detected

#### Basic Structure
```typescript
import type {
  EventName,
  HasuraEventPayload,
  DetectorFunction,
  HandlerFunction
} from '@hopdrive/hasura-event-detector';
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

export const detector: DetectorFunction = async (event, hasuraEvent) => {
  // Detection logic here
  return true; // or false
};

export const handler: HandlerFunction = async (event, hasuraEvent) => {
  const jobs = [
    // Define your jobs here
  ];
  return await run(event, hasuraEvent, jobs) || [];
};

export default { detector, handler };
```

#### Detection Patterns

**Column Change Detection:**
```typescript
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);

  // Only process UPDATE operations
  if (operation !== 'UPDATE') return false;

  // Check if specific column changed
  if (!columnHasChanged('status', dbEvent)) return false;

  // Check specific value transition
  const oldStatus = dbEvent?.old?.status;
  const newStatus = dbEvent?.new?.status;

  return oldStatus === 'pending' && newStatus === 'approved';
};
```

**Insert Detection:**
```typescript
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  const { operation, dbEvent } = parseHasuraEvent(hasuraEvent);

  // Detect new record insertion
  if (operation !== 'INSERT') return false;

  // Optional: Add conditions based on the inserted data
  const newRecord = dbEvent?.new;
  return newRecord?.type === 'premium_user';
};
```

#### Job Patterns

**External API Integration:**
```typescript
job(async (event, hasuraEvent, options) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  const record = dbEvent?.new;

  // Sync with external CRM
  const crmResponse = await crmApi.createContact({
    email: record?.email,
    name: record?.name,
    source: 'hasura_event'
  });

  return {
    action: 'crm_sync_completed',
    crmId: crmResponse.id,
    userId: record?.id
  };
}, {
  timeout: 10000,
  retries: 2
})
```

**Error Handling:**
```typescript
job(async (event, hasuraEvent, options) => {
  try {
    await externalService.call(data);
    return { action: 'success' };
  } catch (error) {
    console.error('External service failed:', error);

    // Optionally rethrow for retry logic
    if (error.code === 'RATE_LIMIT') {
      throw error; // Will trigger retry
    }

    // Or handle gracefully
    return {
      action: 'failed_gracefully',
      error: error.message,
      willRetry: false
    };
  }
}, {
  retries: 3,
  timeout: 8000
})
```

#### File Naming Convention

Event modules should be placed in the `events/` directory with descriptive names:
- `events/user-activation.js` - User becomes active
- `events/order-completed.js` - Order status changes to completed
- `events/subscription-renewed.js` - Subscription renewal
- `events/payment-failed.js` - Payment processing failure

#### Best Practices

1. **Keep Detectors Simple and Fast** - Use early returns for quick filtering
2. **Make Jobs Idempotent** - Jobs may be retried, ensure they can run multiple times safely
3. **Use Correlation IDs** - Always pass correlation IDs to track related operations
4. **Handle Failures Gracefully** - Set appropriate timeouts and retry counts
5. **Monitor and Observe** - Return meaningful results from jobs

### Built-in Job Functions

The framework includes production-ready job functions:

```typescript
import { emailNotificationJob, analyticsTrackingJob, webhookNotificationJob } from '@hopdrive/hasura-event-detector';

const jobs = [
  job(emailNotificationJob, {
    to: user.email,
    template: 'welcome',
    variables: { name: user.name }
  }),

  job(analyticsTrackingJob, {
    eventName: 'User Activated',
    userId: user.id,
    properties: { plan: user.plan }
  }),

  job(webhookNotificationJob, {
    url: 'https://api.external.com/webhooks',
    secret: process.env.WEBHOOK_SECRET
  })
];
```

## 🎯 Context System

The context system allows you to pass metadata through the entire event processing pipeline:

### Basic Usage

```typescript
const result = await listenTo(hasuraEvent, config, {
  // Environment information
  environment: process.env.NODE_ENV,
  requestId: req.headers['x-request-id'],

  // Feature flags
  featureFlags: {
    enableNotifications: true,
    useNewAlgorithm: false
  },

  // Testing
  testMode: false,
  dryRun: false
});
```

### Accessing Context in Event Modules

```typescript
export const detector = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;

  // Skip detection in test mode
  if (context?.testMode && !context?.forceDetection) {
    return false;
  }

  // Environment-specific logic
  if (context?.environment === 'production') {
    // Stricter validation in production
  }

  return true;
};

export const handler = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;

  const jobs = [];

  // Conditionally add jobs based on context
  if (context?.featureFlags?.enableNotifications) {
    jobs.push(job(sendEmailJob));
  }

  return await run(event, hasuraEvent, jobs);
};
```

### Common Context Patterns

- **Testing**: `testMode`, `dryRun`, `mockServices`
- **Request Tracking**: `requestId`, `correlationId`, `traceId`
- **Environment**: `environment`, `region`, `version`
- **Feature Flags**: `featureFlags`, `experiments`
- **Audit**: `userId`, `tenantId`, `auditTrail`

See the [Context System Guide](./docs/CONTEXT_EXAMPLES.md) for comprehensive examples.

## 🔗 Correlation IDs

Track business processes across multiple events and systems with two simple approaches:

### Manual Injection (Simplest)
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

// Extract correlation ID and pass in options
const correlationId = hasuraEvent.event.data.new?.process_id || generateNewId();

const result = await listenTo(hasuraEvent, {
  context: { environment: 'prod' },
  correlationId: correlationId,
  autoLoadEventModules: true
});
```

### Plugin-Based Extraction (Automatic)
```typescript
import { TrackingTokenExtractionPlugin } from 'hasura-event-detector/example-plugins';

// Create plugin to extract from various sources
const correlationPlugin = new TrackingTokenExtractionPlugin({
  extractFromUpdatedBy: true,  // Extract from updated_by field
  extractFromMetadata: true,   // Extract from metadata fields
  extractFromSession: true     // Extract from session variables
});

// Register the plugin
pluginManager.register(correlationPlugin);

// Plugin automatically extracts correlation IDs from payload
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true
});
```

### Using Correlation IDs in Jobs

```typescript
job(async function trackAnalytics(event, hasuraEvent, options) {
  const correlationId = options?.correlationId;

  // Create database record with correlation ID
  await db.analytics.create({
    correlation_id: correlationId,
    event_name: event,
    user_id: hasuraEvent.event.data.new?.id,
    timestamp: new Date()
  });

  return { correlationId, tracked: true };
})
```

See the [Correlation ID Guide](./docs/CORRELATION_ID_GUIDE.md) for advanced patterns and examples.

## 🔌 Plugin System

Extend functionality with a powerful plugin system:

### Payload Enrichment Plugin

```typescript
import { BasePluginInterface } from '@hopdrive/hasura-event-detector';

class OrderEnrichmentPlugin implements BasePluginInterface {
  readonly name = 'order-enrichment' as PluginName;

  // Called before processing starts - perfect for payload enrichment and correlation ID extraction
  async onPreConfigure(hasuraEvent, options) {
    // Step 1: Enrich payload with related data (by reference)
    if (hasuraEvent.table?.name === 'orders') {
      const orderId = hasuraEvent.event.data.new?.id;
      const relatedData = await this.fetchOrderRelatedData(orderId);

      // Modify payload directly - all event detectors and jobs will see enriched data
      hasuraEvent.event.data.new = {
        ...hasuraEvent.event.data.new,
        lanes: relatedData.lanes,     // Child lanes
        driver: relatedData.driver,   // Assigned driver
        vehicle: relatedData.vehicle, // Vehicle details
        customer: relatedData.customer // Customer info
      };
    }

    // Step 2: Extract correlation ID from enriched payload
    const updatedBy = parseHasuraEvent(hasuraEvent).dbEvent?.new?.updated_by;
    const match = updatedBy?.match(/^user\.([0-9a-f-]{36})$/i);

    return match ? { ...options, correlationId: match[1] } : options;
  }

  private async fetchOrderRelatedData(orderId) {
    // Single optimized database query to prevent N+1 queries later
    return await db.query(`
      SELECT
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
      GROUP BY d.id, v.id, c.id
    `, [orderId]);
  }
}
```

### Observability Plugin

```typescript
class MyObservabilityPlugin implements BasePluginInterface {
  readonly name = 'my-observability' as PluginName;

  // Called when jobs complete
  async onJobEnd(jobName, result, eventName, hasuraEvent, correlationId) {
    await sendMetrics({ jobName, result, correlationId });
  }
}
```

**Available Hooks:**
- `onPreConfigure` - Enrich payloads and extract correlation IDs before processing
- `onInvocationStart/End` - Track processing lifecycle
- `onEventDetectionStart/End` - Monitor event detection
- `onJobStart/End` - Track individual job execution
- `onError` - Handle errors and send to tracking services
- `onLog` - Integrate with logging systems

See the [Plugin System Guide](./docs/PLUGIN_SYSTEM.md) for complete documentation.

## 🔧 Configuration

### Basic Configuration

```typescript
const config = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  sourceFunction: 'netlify-function'
};
```

### Advanced Configuration with Observability

```typescript
const config = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',

  observability: {
    enabled: process.env.NODE_ENV === 'production',
    database: {
      host: process.env.DB_HOST,
      port: 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    },
    schema: 'event_detector',
    batchSize: 25,
    flushInterval: 10000
  }
};
```

## 🛠️ CLI Commands

### Project Management

```bash
# Initialize new project
hasura-event-detector init [--typescript]

# Create new event module
hasura-event-detector create <eventName> [--template <template>]

# List all events
hasura-event-detector list [--detailed]

# Validate configuration
hasura-event-detector validate [--config <file>]

# Console commands
hasura-event-detector console init [--add-script]
hasura-event-detector console start [--port 3000]
hasura-event-detector console build [--output-dir ./dist]
hasura-event-detector console check
```

### Testing

```bash
# Test event with generated data
hasura-event-detector test user-activation

# Test with custom data
hasura-event-detector test user-activation --file test-data.json

# Dry run (detection only)
hasura-event-detector test user-activation --dry-run
```

## 🖥️ Observability Console

The framework includes a powerful React-based console for monitoring and debugging your event detection system in real-time.

### Features

- **Real-time Event Monitoring**: Watch events as they're detected and processed
- **Correlation Tracking**: Visualize business process flows across multiple events
- **Performance Analytics**: Track job execution times and success rates
- **Error Debugging**: Detailed error logs with context and stack traces
- **Flow Diagrams**: Interactive visualizations of event processing flows
- **Data Export**: Export event data for analysis

### Quick Start

```bash
# Initialize console in your project
hasura-event-detector console init --add-script

# Start the console
npm run event-console
# OR
hasura-event-detector console start
```

### Console Commands

```bash
# Initialize console configuration
hasura-event-detector console init [options]

# Start development server
hasura-event-detector console start [options]

# Build for production
hasura-event-detector console build [options]

# Add npm script to package.json
hasura-event-detector console add-script

# Check configuration
hasura-event-detector console check
```

### Configuration

The console uses a `console.config.js` file for configuration:

```javascript
module.exports = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/hasura_event_detector_observability',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },

  // Hasura configuration
  hasura: {
    endpoint: process.env.HASURA_ENDPOINT || 'http://localhost:8080/v1/graphql',
    adminSecret: process.env.HASURA_ADMIN_SECRET || 'myadminsecretkey'
  },

  // Console server configuration
  console: {
    port: 3000,
    host: 'localhost',
    publicUrl: 'http://localhost:3000',
    autoOpen: true,
    watchMode: true
  }
};
```

### Production Deployment

```bash
# Build console for production
hasura-event-detector console build --output-dir ./dist

# Deploy to your hosting platform
# The console is a standard React app that can be deployed anywhere
```

### Integration with Netlify Functions

```bash
# In your Netlify project
npm install @hopdrive/hasura-event-detector

# Initialize console
hasura-event-detector console init --add-script

# Start console for development
npm run event-console
```

## 📚 Documentation

- [Plugin System Guide](./src/example-plugins/README.md) - Create plugins for observability and customization
- [Templates](./templates/) - Ready-to-use templates

## 🎨 Templates

### Available Templates

- **Basic Event** (`basic`) - Simple event detection template
- **User Activation** (`user-activation`) - Complete user onboarding workflow
- **Netlify Function** (`netlify-function`) - Serverless function integration

### Using Templates

```bash
# Create from basic template
hasura-event-detector create my-event --template basic

# Create from user activation template
hasura-event-detector create user-signup --template user-activation
```

## 🔍 Observability

The framework includes a comprehensive observability system with both programmatic APIs and a visual console:

### Features

- **Observability Console**: React-based dashboard for real-time monitoring
- **Correlation ID Tracking**: Trace business processes across multiple events
- **Performance Monitoring**: Track job execution times and success rates
- **Error Tracking**: Comprehensive error logging with context
- **Database Integration**: Store metrics in PostgreSQL for analysis
- **Flow Visualization**: Interactive diagrams of event processing flows

### Plugin System

```typescript
import { ObservabilityPlugin, SimpleLoggingPlugin } from '@hopdrive/hasura-event-detector';

// Built-in plugins
const observabilityPlugin = new ObservabilityPlugin(config);
const loggingPlugin = new SimpleLoggingPlugin({
  enabled: true,
  logLevel: 'info',
  format: 'json'
});
```

## 🚀 Deployment

### Netlify Functions

Use the provided templates for easy deployment:

```typescript
// netlify/functions/hasura-events.ts
import { handler } from '../../templates/netlify-function';
export { handler };
```

**Import Netlify utilities:**
```typescript
import { handleSuccess, handleFailure } from '@hopdrive/hasura-event-detector/netlify';
```

**With Console:**
```bash
# Initialize console in your Netlify project
hasura-event-detector console init --add-script

# Start console for development
npm run event-console

# Build console for production
hasura-event-detector console build --output-dir ./public/console
```

### Vercel

```typescript
// api/hasura-events.ts
import { listenTo } from '@hopdrive/hasura-event-detector';

export default async function handler(req, res) {
  try {
    const result = await listenTo(req.body, config);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ errors: [error] });
  }
}
```

### AWS Lambda

```typescript
// lambda/hasura-events.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { listenTo } from '@hopdrive/hasura-event-detector';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const hasuraEvent = JSON.parse(event.body || '{}');
    const result = await listenTo(hasuraEvent, config);
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ errors: [error] })
    };
  }
};
```

## 🔒 Security

### Best Practices

- **Input Validation**: All Hasura events are validated at runtime
- **Webhook Security**: HMAC signature support for webhook notifications
- **Secret Management**: Proper handling of sensitive configuration
- **Error Isolation**: Job failures don't affect other jobs

### Example Secure Configuration

```typescript
const config = {
  eventModulesDirectory: './events',
  observability: {
    enabled: true,
    database: {
      connectionString: process.env.DATABASE_URL // Use connection string
    }
  }
};

// Webhook with signature
job(webhookNotificationJob, {
  url: process.env.WEBHOOK_URL,
  secret: process.env.WEBHOOK_SECRET, // HMAC signature
  filterFields: ['id', 'email'] // Only include safe fields
});
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built for [Hasura](https://hasura.io/) Event Triggers
- TypeScript-first design inspired by modern development practices
- Plugin architecture inspired by build tools like Vite and Rollup

## 📞 Support

- 📚 [Documentation](./docs/)
- 🐛 [Issue Tracker](https://github.com/hopdrive/hasura-event-detector/issues)
- 💬 [Discussions](https://github.com/hopdrive/hasura-event-detector/discussions)

---

**Built with ❤️ by the HopDrive team**
