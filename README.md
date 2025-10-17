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
- **Timeout Protection**: Built-in graceful shutdown for serverless environments
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

### 3. Verify Your Setup

```bash
npx hasura-event-detector verify-setup
```

This command validates your configuration by:
- Detecting all event modules
- Verifying TypeScript compilation and .generated.js files
- Checking job function names (detects anonymous jobs)
- Displaying a complete tree view of your setup

### 4. Test Your Event

```bash
npx hasura-event-detector test user-activation
```

### 5. Set Up Observability Console

```bash
# Initialize console with configuration
hasura-event-detector console init --add-script

# Start console for monitoring
npm run event-console
```

### 6. Use in Production

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

### 7. Pre-load Event Modules (Advanced - Optional)

For better performance and control in production, you can pre-load event modules from an index file instead of dynamically scanning the filesystem. **This is completely optional** - the default filesystem scanning works great for most use cases.

**Create an index file:**
```typescript
// events/index.ts
import type { NamedEventModule, EventName } from '@hopdrive/hasura-event-detector';
import * as userCreated from './users.created';
import * as userActivated from './users.activated';
import * as orderCreated from './orders.created';
import * as orderShipped from './orders.shipped';

export default [
  { name: 'users.created' as EventName, ...userCreated },
  { name: 'users.activated' as EventName, ...userActivated },
  { name: 'orders.created' as EventName, ...orderCreated },
  { name: 'orders.shipped' as EventName, ...orderShipped },
] as NamedEventModule[];
```

**Use in your handler:**
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';
import eventModules from './events/index';

export const handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);

  const result = await listenTo(hasuraEvent, {
    context: { environment: 'production' },
    loadModulesFromIndex: true,  // This automatically disables autoLoadEventModules
    eventModules: eventModules
  });

  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

**Benefits:**
- **Faster Cold Starts**: No filesystem scanning needed
- **Explicit Control**: You decide exactly which events to load
- **Better Tree-Shaking**: Bundlers can optimize unused modules
- **Type Safety**: Full TypeScript support for the module array
- **Simpler Deployment**: No need to worry about filesystem structure in serverless environments

**Note:** When you set `loadModulesFromIndex: true`, the framework automatically disables `autoLoadEventModules` for you.

## 🏗️ Architecture

### Core Concept: Separation of Concerns

The framework enforces a clear separation between **detection logic** and **execution logic** to maximize observability and maintainability:

1. **Detector Functions**: Pure detection logic - "Did this specific business event occur?"
2. **Handler Functions**: Job orchestration - "Which jobs should run for this event?"
3. **Job Functions**: Execution logic - "What specific action to perform?"

This separation enables the observability plugin to track:
- Which events were detected
- Which jobs ran as a result
- Execution duration and outcomes
- Dependencies between events

### Event Modules

Each event module consists of two functions:

- **Detector**: Determines if a specific business event occurred
- **Handler**: Declares which jobs to execute (no conditional logic)

#### Basic Structure
```typescript
import type {
  EventName,
  HasuraEventPayload,
  DetectorFunction,
  HandlerFunction
} from '@hopdrive/hasura-event-detector';
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

// Detector: Pure detection logic
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  // ALL conditional logic belongs here
  // Returns boolean: does this event match?
  return true; // or false
};

// Handler: Job orchestration ONLY
export const handler: HandlerFunction = async (event, hasuraEvent) => {
  // Declare jobs - NO conditional logic here
  const jobs = [
    job(sendEmail),
    job(updateRecord),
    job(notifyService),
  ];
  return await run(event, hasuraEvent, jobs) || [];
};

export default { detector, handler };
```

### ⚠️ Anti-Pattern: Conditional Job Logic

**❌ BAD - Hides complexity and breaks observability:**
```typescript
// DON'T DO THIS - conditional logic in handler
export const handler: HandlerFunction = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  const jobs = [];

  // ❌ Conditional job addition hides business logic
  if (dbEvent?.new?.amount > 1000) {
    jobs.push(job(sendManagerApproval));
  }

  if (dbEvent?.new?.country === 'US') {
    jobs.push(job(sendTaxNotification));
  }

  return await run(event, hasuraEvent, jobs);
};
```

**Why This Is Bad:**
- 🚫 **Hidden Logic**: Business rules buried in handler instead of detector
- 🚫 **Lost Observability**: Console can't show which events trigger which jobs
- 🚫 **Poor Maintainability**: Hard to understand what events exist in the system
- 🚫 **Reduced Clarity**: Can't see the full job list for an event at a glance

**✅ GOOD - Create separate named events:**
```typescript
// events/orders.large.approval.ts
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);

  const isOrdersTable = hasuraEvent.table?.name === 'orders';
  const isInsert = operation === 'INSERT';
  const isLargeOrder = dbEvent?.new?.amount > 1000;

  // Clear, named business rule
  return isOrdersTable && isInsert && isLargeOrder;
};

export const handler: HandlerFunction = async (event, hasuraEvent) => {
  const jobs = [
    job(sendManagerApproval),
    job(createAuditLog),
  ];
  return await run(event, hasuraEvent, jobs);
};

// events/orders.us.tax.notification.ts
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);

  const isOrdersTable = hasuraEvent.table?.name === 'orders';
  const isInsert = operation === 'INSERT';
  const isUSOrder = dbEvent?.new?.country === 'US';

  return isOrdersTable && isInsert && isUSOrder;
};

export const handler: HandlerFunction = async (event, hasuraEvent) => {
  const jobs = [
    job(sendTaxNotification),
    job(recordTaxObligation),
  ];
  return await run(event, hasuraEvent, jobs);
};
```

**Why This Is Better:**
- ✅ **Named Events**: Business rules have clear names (`orders.large.approval`, `orders.us.tax.notification`)
- ✅ **Full Observability**: Console shows exactly which events fired and why
- ✅ **Maintainable**: Easy to find and modify business rules
- ✅ **Testable**: Each event module can be tested independently
- ✅ **Self-Documenting**: Event file names describe business logic

**Rule of Thumb**: If you're tempted to add `if` statements in a handler, create a new named event module instead.

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

Event modules should be placed in the `events/` directory using **dot notation** that relates to the database table:

**Pattern**: `table.action.ts` (or `.js`)

**Examples for `db-orders` function:**
- `events/orders.created.ts` - Order INSERT operations
- `events/orders.shipped.ts` - Order status changed to 'shipped'
- `events/orders.cancelled.ts` - Order status changed to 'cancelled'
- `events/orders.delivered.ts` - Order status changed to 'delivered'

**Examples for `db-moves` function:**
- `events/moves.created.ts` - New move record created
- `events/moves.pickup.started.ts` - Pickup phase started
- `events/moves.pickup.completed.ts` - Pickup phase completed
- `events/moves.delivery.started.ts` - Delivery phase started
- `events/moves.delivery.completed.ts` - Delivery phase completed
- `events/moves.cancelled.ts` - Move cancelled

**Examples for `db-users` function:**
- `events/users.registered.ts` - User INSERT operations
- `events/users.activated.ts` - User status changed to 'active'
- `events/users.deactivated.ts` - User status changed to 'inactive'
- `events/users.email.verified.ts` - Email verification completed

**Examples for `db-payments` function:**
- `events/payments.initiated.ts` - Payment INSERT operations
- `events/payments.completed.ts` - Payment status changed to 'completed'
- `events/payments.failed.ts` - Payment status changed to 'failed'
- `events/payments.refunded.ts` - Payment refund processed

**Why This Pattern?**
- **Table-Centric**: Immediately clear which table the event monitors
- **Semantic**: Reads naturally as "orders created", "moves pickup started"
- **Scalable**: Easy to add new events without creating new functions
- **Organized**: All events for a table are in one function's events directory

#### Best Practices

1. **No Conditional Logic in Handlers** - Create separate named event modules instead of using `if` statements in handlers. This preserves observability and makes business logic explicit.

2. **Keep Detectors Simple and Fast** - Use early returns and descriptive variable names. The detector should read like a sentence describing the business event.

3. **Make Jobs Idempotent** - Jobs may be retried, ensure they can run multiple times safely without side effects.

4. **Use Descriptive Event Names** - Event file names should clearly describe the business logic: `orders.large.approval.ts`, `moves.pickup.started.ts`, not generic names like `order-handler.ts`.

5. **Static Job Declaration** - Always declare the full job list in the handler. If you need conditional behavior, create separate event modules for each condition.

6. **Use Correlation IDs** - Always pass correlation IDs to track related operations across event chains.

7. **Handle Failures Gracefully** - Set appropriate timeouts and retry counts for each job based on its operation type.

8. **Return Meaningful Results** - Jobs should return structured data about what they accomplished for observability tracking.

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
// ✅ GOOD - Use context in detector for environment-specific detection
export const detector = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;

  // Skip detection in test mode
  if (context?.testMode && !context?.forceDetection) {
    return false;
  }

  // Environment-specific validation
  if (context?.environment === 'production') {
    // Stricter validation in production
    return hasuraEvent.table?.name === 'orders'
      && hasuraEvent.event?.op === 'INSERT'
      && hasuraEvent.event.data.new?.validated === true;
  }

  // More lenient in development
  return hasuraEvent.table?.name === 'orders'
    && hasuraEvent.event?.op === 'INSERT';
};

// ✅ GOOD - Handler declares jobs statically
export const handler = async (event, hasuraEvent) => {
  const jobs = [
    job(sendEmailJob),
    job(processOrderJob),
  ];

  return await run(event, hasuraEvent, jobs);
};

// ❌ BAD - Don't use context to conditionally add jobs
// Instead, create separate event modules:
// - events/orders.notifications.enabled.ts (when feature flag is on)
// - events/orders.notifications.disabled.ts (when feature flag is off)
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
  sourceFunction: 'netlify-function',
  logToConsole: false  // Optional: Enable console logging
};
```

### Module Loading Options

The framework supports two ways to load event modules:

#### 1. Dynamic Filesystem Loading (Default)

**This is the default behavior** - automatically scans the events directory at runtime:

```typescript
const result = await listenTo(hasuraEvent, {
  // autoLoadEventModules: true is the default, no need to specify
  eventModulesDirectory: './events'
});

// Or explicitly:
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,  // Default: true
  eventModulesDirectory: './events'
});
```

**Pros:**
- Simple setup - just drop files in the events directory
- No need to maintain an index file
- Great for rapid development
- Works out of the box

**Cons:**
- Filesystem I/O on every cold start
- Slightly slower in serverless environments
- All files must be deployed

#### 2. Pre-loaded from Index (Optional - Optimized for Production)

Load modules from a pre-defined array - **completely optional optimization**:

```typescript
import eventModules from './events/index';

const result = await listenTo(hasuraEvent, {
  loadModulesFromIndex: true,  // Automatically disables autoLoadEventModules
  eventModules: eventModules
});
```

**Pros:**
- No filesystem scanning - faster cold starts
- Explicit module control - only load what you need
- Better tree-shaking and bundle optimization
- Works seamlessly with bundlers (webpack, esbuild, etc.)
- Type-safe module references

**Cons:**
- Requires maintaining an index file
- Must update index when adding new events
- More setup work

**When to use each:**
- Use **dynamic loading (default)** for development and most deployments - works great!
- Use **index loading** only if you need maximum performance in production serverless environments where cold start time is critical

**Important:** When you set `loadModulesFromIndex: true`, it automatically disables `autoLoadEventModules` - you don't need to set both.

### Console Logging

By default, internal logs are sent only to the plugin system (e.g., ObservabilityPlugin). You can enable console logging to also write logs to `console.log`, `console.error`, and `console.warn`:

```typescript
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  logToConsole: true  // Enable dual logging (plugin + console)
});
```

**When to use console logging:**
- **Development**: See logs in real-time without setting up plugins
- **Debugging**: Quick troubleshooting without database queries
- **Simple deployments**: When you don't need structured observability data
- **Netlify/Vercel**: View logs directly in function logs tab

**When to use plugin logging only (default):**
- **Production**: Structured logs in database for analysis
- **High volume**: Avoid console log spam
- **Observability**: Use ObservabilityPlugin for queryable telemetry data
- **Performance**: Console logging can add overhead

### Advanced Configuration with Observability

The Observability Plugin supports two transport modes for storing telemetry data:
- **GraphQL Transport** (Recommended) - Uses Hasura's GraphQL API, ideal for serverless environments
- **SQL Transport** - Direct PostgreSQL connection for traditional deployments (default for backward compatibility)

#### GraphQL Transport (Recommended for Serverless)

The GraphQL transport uses Hasura's GraphQL API to write data, avoiding connection pooling issues common in serverless environments.

```typescript
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

const plugin = new ObservabilityPlugin({
  transport: 'graphql',
  graphql: {
    endpoint: config?.graphqlUrl,
    headers: {
      'x-hasura-admin-secret': config?.graphqlSecret || '',
      'x-hasura-client-name': `ObservabilityPlugin-${config?.graphqlClientName}`,
    },
    timeout: 30000,      // Request timeout in ms (default: 30000)
    maxRetries: 3,       // Number of retries (default: 3)
    retryDelay: 1000,    // Initial retry delay in ms (default: 1000)
  },
  // Other configuration options...
  captureJobOptions: true,
  captureHasuraPayload: true,
  captureErrorStacks: true,
  batchSize: 100,
  flushInterval: 5000,
});
```

#### SQL Transport (Traditional Deployments)

The SQL transport uses a direct PostgreSQL connection pool. This remains the default for backward compatibility but is not recommended for serverless environments.

```typescript
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

const plugin = new ObservabilityPlugin({
  transport: 'sql',  // Optional, this is the default
  database: {
    connectionString: process.env.DATABASE_URL,
    // Or specify individual connection parameters:
    host: 'localhost',
    port: 5432,
    database: 'observability',
    user: 'postgres',
    password: 'password',
    ssl: { rejectUnauthorized: false }
  },
  // Other configuration options...
  captureJobOptions: true,
  captureHasuraPayload: true,
  captureErrorStacks: true,
  batchSize: 100,
  flushInterval: 5000,
});
```

#### Environment Variables

Both transports support configuration via environment variables:

**SQL Transport:**
- `OBSERVABILITY_DB_URL` - Full connection string
- `OBSERVABILITY_DB_HOST` - Database host
- `OBSERVABILITY_DB_PORT` - Database port
- `OBSERVABILITY_DB_NAME` - Database name
- `OBSERVABILITY_DB_USER` - Database user
- `OBSERVABILITY_DB_PASSWORD` - Database password

**GraphQL Transport:**
- `HASURA_GRAPHQL_ENDPOINT` - GraphQL endpoint URL
- `HASURA_ADMIN_SECRET` - Admin secret for authentication
- `HASURA_JWT` - JWT token for authentication (if not using admin secret)

#### When to Use Each Transport

**Use SQL Transport When:**
- Running in traditional server environments (EC2, containers, VMs)
- You have stable, long-running processes
- Connection pooling is beneficial
- You want minimal latency

**Use GraphQL Transport When:**
- Running in serverless environments (Lambda, Vercel, Netlify)
- Dealing with connection pool exhaustion issues
- You want to leverage Hasura's built-in features (permissions, webhooks, etc.)
- You need better isolation between write and read operations

#### Migration Example

Switching from SQL to GraphQL transport (recommended for serverless):

```typescript
// Before (SQL Transport)
const plugin = new ObservabilityPlugin({
  database: {
    connectionString: process.env.DATABASE_URL
  }
});

// After (GraphQL Transport - Recommended)
const plugin = new ObservabilityPlugin({
  transport: 'graphql',
  graphql: {
    endpoint: config?.graphqlUrl,
    headers: {
      'x-hasura-admin-secret': config?.graphqlSecret || '',
      'x-hasura-client-name': `ObservabilityPlugin-${config?.graphqlClientName}`,
    }
  }
});
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

# Build commands
hasura-event-detector build-events [--functions-dir functions]
hasura-event-detector build-events --fix-imports  # Automatically fix ESM imports
hasura-event-detector fix-imports [directory]     # Fix imports standalone

# Console commands
hasura-event-detector console init [--add-script]
hasura-event-detector console start [--port 3000]
hasura-event-detector console build [--output-dir ./dist]
hasura-event-detector console check
```

### Setup Verification

```bash
# Verify your event detection setup
hasura-event-detector verify-setup

# Verify with custom functions directory
hasura-event-detector verify-setup --functions-dir path/to/functions
```

The `verify-setup` command is essential for validating your configuration. It:

- **Detects all event modules** across all function directories
- **Verifies TypeScript compilation** - ensures .generated.js files exist and are up-to-date
- **Checks job function names** - identifies anonymous jobs that won't appear in observability logs
- **Validates imports** - confirms job functions are properly imported and accessible
- **Displays a tree view** - shows all events and their associated jobs

**Example output:**
```
================================================================================
Hasura Event Detector - Setup Verification
================================================================================

Functions directory: /project/functions

Found 2 function(s) with event directories:

📁 db-ridehails-background
   Path: /project/functions/db-ridehails-background/events

   Detected 4 event module(s):

   ✓ ridehail.completed
     Loaded from: .generated.js
     Jobs imported: 1
         [1] handleRidehailAccessorials → "handleRidehailAccessorials"

   ✓ ridehail.pending
     Loaded from: .generated.js
     Jobs imported: 2
         [1] handleRidehailSubmission → "handleRidehailSubmission"
       ⚠️ [2] processMetrics → "anonymous"
     ⚠️  WARNING: Some jobs will have anonymous names at runtime

================================================================================
Summary
================================================================================
Total event modules: 4
Total jobs imported: 3
⚠️  Jobs with anonymous names: 1

To fix anonymous job names:
1. Ensure job functions are named functions (not arrow functions)
2. OR pass explicit jobName in options when calling job():
   job(myFunction, { ...options, jobName: "myJobName" })
3. Check that wrapper functions (like scopedJob) preserve function names
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

### TypeScript & ESM Support

When using TypeScript with Node.js ES Modules, you need to fix import paths after compilation because TypeScript doesn't automatically add `.js` extensions.

**Automatic (recommended):**
```bash
# Add to your package.json build script
"build": "tsc && hasura-event-detector build-events --fix-imports"
```

**Manual:**
```bash
# Fix imports in all compiled files
hasura-event-detector fix-imports

# Fix specific directory
hasura-event-detector fix-imports path/to/functions
```

**What it fixes:**
- `from '../lib/utils'` → `from '../lib/utils.js'`
- `from '../jobs'` → `from '../jobs/index.js'` (for directories)
- Preserves `.js`, `.mjs`, `.json` extensions
- Only affects relative imports (not npm packages)

**Why this is needed:**

Node.js ESM requires explicit file extensions in import statements, but TypeScript outputs the imports exactly as written in your `.ts` files. Without fixing these paths, you'll get `ERR_MODULE_NOT_FOUND` errors at runtime.

This is automatically handled for `.generated.js` files created by `build-events`, but you may need to run `fix-imports` for other compiled TypeScript files in your project.

## 🖥️ Observability Console (Optional)

The observability console is an optional UI for monitoring your event detection system. It's a separate package to keep production bundles small.

### Quick Start - Get Console Running Locally

**Option 1: Run Console Standalone (Easiest)**

```bash
# 1. Install the console package
npm install @hopdrive/hasura-event-detector-console --save-dev

# 2. Navigate to the console package
cd packages/console
# OR if installed as dependency:
cd node_modules/@hopdrive/hasura-event-detector-console

# 3. Install console dependencies (first time only)
npm install

# 4. Start the console
npm run start

# 5. Open http://localhost:3000 in your browser
```

**Option 2: Serve Console via ObservabilityPlugin**

```typescript
// In your application code
import { ObservabilityPlugin } from '@hopdrive/hasura-event-detector/plugins';

const observability = new ObservabilityPlugin({
  enabled: true,
  console: {
    enabled: true,
    port: 3001,
    serveInProduction: false
  },
  database: {
    connectionString: 'postgresql://localhost:5432/observability'
  }
});

// Initialize the plugin
await observability.initialize();

// Console available at http://localhost:3001/console
```

### Features

- **Real-time Event Monitoring**: Watch events as they're detected and processed
- **Correlation Tracking**: Visualize business process flows across multiple events
- **Performance Analytics**: Track job execution times and success rates
- **Error Debugging**: Detailed error logs with context and stack traces
- **Flow Diagrams**: Interactive visualizations of event processing flows

### Why a Separate Package?

- **Small Production Bundles**: Main package only 78KB (vs hundreds of MB with UI)
- **No Netlify Issues**: Avoids function size deployment failures
- **Optional**: Only install when you need the UI for development/debugging

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

## ⏱️ Timeout Protection for Serverless

The event detector includes built-in timeout protection for serverless environments like Netlify Functions and AWS Lambda. This prevents function timeouts and ensures data is saved even when execution time limits are approached.

### Configuration

```typescript
const result = await listenTo(hasuraEvent, {
  // Your existing configuration
  context: userContext, // Your custom context data

  // Timeout configuration
  timeoutConfig: {
    enabled: true,
    getRemainingTimeInMillis: context.getRemainingTimeInMillis, // From Lambda/Netlify context
    safetyMargin: 2000, // Stop 2 seconds before timeout (default)
    maxExecutionTime: 10000, // Fallback for 10-second limit (Netlify)
    serverlessMode: true, // Optimize for serverless
    maxJobExecutionTime: 3000, // Max time per individual job
  },
});
```

### Features

- **Graceful Shutdown**: Detects approaching timeout and saves partial results
- **Job Cancellation**: Jobs receive abort signals to stop work cleanly
- **Data Preservation**: Plugins flush buffered data before timeout
- **Partial Results**: Returns completed work even on timeout
- **Automatic Detection**: Works with Lambda/Netlify runtime context

### Plugin Support

Plugins that buffer data implement the `flush()` method for timeout scenarios:

```typescript
class MyObservabilityPlugin extends BasePlugin {
  override async flush() {
    // Save buffered data immediately without closing connections
    await this.saveBufferedData();
  }

  override async shutdown() {
    await this.flush(); // Flush first
    await this.closeConnections(); // Then cleanup
  }
}
```

## 🚀 Deployment

### Netlify Functions

#### TypeScript Event Modules

If you're writing event modules in TypeScript, you need to compile them to JavaScript before deployment.

Add a build script to your `package.json`:

```json
{
  "scripts": {
    "build": "hasura-event-detector build-events --functions-dir functions"
  }
}
```

Then run before deployment:

```bash
npm run build
```

**CLI Options:**
```bash
# Build all event modules
hasura-event-detector build-events

# Specify functions directory
hasura-event-detector build-events --functions-dir ./netlify/functions

# Clean generated files
hasura-event-detector build-events --clean

# Verbose output
hasura-event-detector build-events --verbose
```

#### Using in Netlify Functions

Use the provided templates for easy deployment with timeout protection:

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

**Complete Example:**
See the [example-netlify-site](./example-netlify-site) directory for a full working example with:
- TypeScript event modules
- Background and synchronous functions
- Multiple event patterns
- Job orchestration examples

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
