# Hasura Event Detector API Documentation

## Table of Contents

- [Core Functions](#core-functions)
- [Helper Functions](#helper-functions)
- [Job Functions](#job-functions)
- [Types](#types)
- [Configuration](#configuration)
- [CLI Commands](#cli-commands)

## Core Functions

### `listenTo(hasuraEvent, options?, context?)`

Main entry point for event detection and processing.

**Parameters:**
- `hasuraEvent: HasuraEventPayload` - The Hasura event trigger payload
- `options?: Partial<ListenToOptions>` - Configuration options
- `context?: Record<string, any>` - Additional context metadata injected into the event

**Returns:** `Promise<ListenToResponse>`

#### Understanding the Context Parameter

The `context` parameter is a powerful metadata injection mechanism that allows you to pass runtime information through the entire event processing pipeline. It gets injected into the `hasuraEvent` as `__context` and is accessible to all detectors, handlers, and jobs.

**Why Use Context?**
- Pass environment-specific information (dev/staging/prod)
- Track the original request that triggered the event
- Enable test modes and dry runs
- Provide feature flags and dynamic configuration
- Add audit and compliance information

**Basic Example:**
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,
  eventModulesDirectory: './events'
});

console.log(`Detected ${result.events.length} events`);
```

**Example with Context:**
```typescript
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,
  eventModulesDirectory: './events'
}, {
  // Context metadata
  environment: process.env.NODE_ENV,
  requestId: req.headers['x-request-id'],
  userId: req.user?.id,
  testMode: false
});
```

#### Context Use Cases

**1. Testing and Development:**
```typescript
// CLI test command usage
await listenTo(testEvent, config, {
  testMode: true,
  dryRun: true,  // Don't actually execute jobs
  mockServices: true,
  logLevel: 'debug'
});
```

**2. Lambda/Serverless Functions:**
```typescript
exports.handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);
  
  const result = await listenTo(hasuraEvent, config, {
    // AWS Lambda context
    lambdaRequestId: context.requestId,
    functionName: context.functionName,
    functionVersion: context.functionVersion,
    remainingTime: context.getRemainingTimeInMillis(),
    coldStart: !warmContainer,
    memoryLimit: context.memoryLimitInMB
  });
  
  return { statusCode: 200, body: JSON.stringify(result) };
};
```

**3. Express/HTTP Webhook:**
```typescript
app.post('/hasura-webhook', async (req, res) => {
  const result = await listenTo(req.body, config, {
    // HTTP request context
    requestId: req.id || uuid(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      xForwardedFor: req.headers['x-forwarded-for']
    },
    ip: req.ip,
    sessionId: req.session?.id,
    userId: req.user?.id,
    tenantId: req.user?.tenantId
  });
  
  res.json(result);
});
```

**4. Feature Flags and Configuration:**
```typescript
await listenTo(hasuraEvent, config, {
  featureFlags: {
    enableEmailNotifications: await getFeatureFlag('email_notifications'),
    enableSlackIntegration: await getFeatureFlag('slack_integration'),
    enableAnalytics: await getFeatureFlag('analytics'),
    useNewPaymentProcessor: await getFeatureFlag('new_payment_processor')
  },
  rateLimits: {
    emailsPerHour: 100,
    webhooksPerMinute: 10
  },
  apiKeys: {
    sendgrid: process.env.SENDGRID_KEY,
    stripe: process.env.STRIPE_KEY,
    slack: process.env.SLACK_TOKEN
  }
});
```

**5. Audit and Compliance:**
```typescript
await listenTo(hasuraEvent, config, {
  audit: {
    triggeredBy: 'webhook',
    sourceSystem: 'payment-processor',
    timestamp: new Date().toISOString(),
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  },
  compliance: {
    dataClassification: 'PII',
    retentionDays: 90,
    encryptionRequired: true,
    gdprApplies: isEuropeanUser(req.ip)
  },
  tracking: {
    correlationId: req.headers['x-correlation-id'] || uuid(),
    spanId: req.headers['x-span-id'],
    traceId: req.headers['x-trace-id']
  }
});
```

**6. Multi-Environment Deployment:**
```typescript
await listenTo(hasuraEvent, config, {
  deployment: {
    environment: process.env.ENVIRONMENT, // 'dev', 'staging', 'prod'
    region: process.env.AWS_REGION,
    instanceId: process.env.INSTANCE_ID,
    version: process.env.APP_VERSION,
    buildNumber: process.env.BUILD_NUMBER
  },
  database: {
    replica: process.env.USE_READ_REPLICA === 'true',
    connectionPool: process.env.DB_POOL_SIZE
  }
});
```

#### Accessing Context in Event Modules

**In Detector Functions:**
```typescript
export const detector = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  
  // Skip detection in test mode
  if (context?.testMode && !context?.forceDetection) {
    console.log('Skipping detection in test mode');
    return false;
  }
  
  // Different logic for different environments
  if (context?.deployment?.environment === 'production') {
    // Stricter validation in production
    return hasStrictValidation(hasuraEvent);
  }
  
  // Standard detection logic
  return true;
};
```

**In Handler Functions:**
```typescript
export const handler = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [];
  
  // Conditionally add jobs based on context
  if (context?.featureFlags?.enableEmailNotifications) {
    jobs.push(job(async function sendEmail() {
      // Use API key from context
      const apiKey = context.apiKeys?.sendgrid;
      return await sendGridClient(apiKey).send(email);
    }));
  }
  
  if (context?.audit) {
    jobs.push(job(async function auditLog() {
      return await logAuditEvent({
        ...context.audit,
        eventName: event,
        recordId: dbEvent?.new?.id
      });
    }));
  }
  
  return await run(event, hasuraEvent, jobs);
};
```

### `run(event, hasuraEvent, jobs)`

Execute a collection of jobs in parallel.

**Parameters:**
- `event: EventName` - Name of the triggering event
- `hasuraEvent: HasuraEventPayload` - The Hasura event payload
- `jobs: Job[]` - Array of job definitions to execute

**Returns:** `Promise<JobResult[]>`

**Example:**
```typescript
import { run, job } from '@hopdrive/hasura-event-detector';

const jobs = [
  job(async (event, hasuraEvent, options) => {
    // Job logic here
    return { action: 'completed' };
  }, { timeout: 5000, retries: 3 })
];

const results = await run('user-activation', hasuraEvent, jobs);
```

### `job(func, options?)`

Create a job definition with optional configuration.

**Parameters:**
- `func: JobFunction` - The job function to execute
- `options?: JobOptions` - Job execution options

**Returns:** `Job`

**Example:**
```typescript
const myJob = job(async (event, hasuraEvent, options) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  // Process the event
  await sendEmail(dbEvent.new.email);
  
  return { action: 'email_sent', recipient: dbEvent.new.email };
}, {
  timeout: 8000,
  retries: 2,
  correlationId: options?.correlationId
});
```

## Helper Functions

### `parseHasuraEvent(hasuraEvent)`

Parse a Hasura event payload for easier access to common data.

**Parameters:**
- `hasuraEvent: HasuraEventPayload` - The raw Hasura event

**Returns:** `ParsedHasuraEvent`

**Example:**
```typescript
import { parseHasuraEvent } from '@hopdrive/hasura-event-detector';

const { dbEvent, operation, user, role } = parseHasuraEvent(hasuraEvent);

console.log(`Operation: ${operation}`);
console.log(`User: ${user}`);
console.log(`New record:`, dbEvent?.new);
console.log(`Old record:`, dbEvent?.old);
```

### `columnHasChanged(column, hasuraData)`

Check if a specific column changed between old and new records.

**Parameters:**
- `column: string` - Name of the column to check
- `hasuraData: HasuraEventData` - The data from the Hasura event

**Returns:** `boolean`

**Example:**
```typescript
import { columnHasChanged } from '@hopdrive/hasura-event-detector';

if (columnHasChanged('status', dbEvent)) {
  console.log('Status changed!');
  console.log(`From: ${dbEvent.old.status}`);
  console.log(`To: ${dbEvent.new.status}`);
}
```

### `log(prefix, message, ...args)`

Internal logging function that integrates with the plugin system.

**Parameters:**
- `prefix: string` - Log prefix for categorization
- `message: string` - Main log message
- `...args: any[]` - Additional arguments

**Example:**
```typescript
import { log } from '@hopdrive/hasura-event-detector';

log('MyEvent', 'Processing user activation', { userId: 123 });
```

### Netlify Helpers

#### `handleSuccess(result)`

Format successful responses for Netlify functions.

**Parameters:**
- `result: ListenToResponse` - The event detection result

**Returns:** `NetlifyResponse`

#### `handleFailure(error)`

Format error responses for Netlify functions.

**Parameters:**
- `error: Error` - The error that occurred

**Returns:** `NetlifyResponse`

**Example:**
```typescript
import { handleSuccess, handleFailure } from '@hopdrive/hasura-event-detector';

try {
  const result = await listenTo(hasuraEvent);
  return handleSuccess(result);
} catch (error) {
  return handleFailure(error);
}
```

## Job Functions

### Built-in Job Functions

#### `emailNotificationJob(event, hasuraEvent, options)`

Send email notifications using templates.

**Options:**
- `to: string` - Recipient email address
- `template: string` - Email template name
- `variables: Record<string, any>` - Template variables
- `priority: 'low' | 'normal' | 'high'` - Email priority

**Example:**
```typescript
import { emailNotificationJob, job } from '@hopdrive/hasura-event-detector';

const emailJob = job(emailNotificationJob, {
  to: 'user@example.com',
  template: 'welcome',
  variables: { name: 'John Doe', plan: 'premium' }
});
```

#### `analyticsTrackingJob(event, hasuraEvent, options)`

Track business events in analytics platforms.

**Options:**
- `eventName: string` - Analytics event name
- `userId: string` - User identifier
- `properties: Record<string, any>` - Event properties
- `source: string` - Event source

**Example:**
```typescript
import { analyticsTrackingJob, job } from '@hopdrive/hasura-event-detector';

const trackingJob = job(analyticsTrackingJob, {
  eventName: 'User Activated',
  userId: '123',
  properties: {
    plan: 'premium',
    source: 'hasura_trigger'
  }
});
```

#### `webhookNotificationJob(event, hasuraEvent, options)`

Send webhook notifications to external services.

**Options:**
- `url: string` - Webhook URL
- `method: 'POST' | 'PUT' | 'PATCH'` - HTTP method
- `headers: Record<string, string>` - Custom headers
- `secret: string` - Secret for HMAC signature
- `filterFields: string[]` - Fields to include in payload

**Example:**
```typescript
import { webhookNotificationJob, job } from '@hopdrive/hasura-event-detector';

const webhookJob = job(webhookNotificationJob, {
  url: 'https://api.example.com/webhooks/user-events',
  method: 'POST',
  secret: process.env.WEBHOOK_SECRET,
  filterFields: ['id', 'email', 'plan']
});
```

## Types

### Core Types

```typescript
// Main event payload from Hasura
interface HasuraEventPayload<T = Record<string, any>> {
  id: string;
  created_at: string;
  table: {
    name: string;
    schema: string;
  };
  event: HasuraEvent<T>;
}

// Parsed event data for convenience
interface ParsedHasuraEvent<T = Record<string, any>> {
  hasuraEventTime?: string;
  hasuraEventId?: string;
  dbEvent?: HasuraEventData<T>;
  sessionVariables?: any;
  role?: string;
  user?: string | null;
  operation?: HasuraOperation;
}

// Job definition
interface Job<T = any> {
  func: JobFunction<T>;
  options?: JobOptions;
}

// Job execution result
interface JobResult<T = any> {
  name: JobName;
  duration: number;
  result: T;
  completed: boolean;
  error?: Error;
  startTime: Date;
  endTime?: Date;
}

// Event detection response
interface ListenToResponse {
  events: EventResponse[];
  duration: number;
}
```

### Event Module Types

```typescript
// Event detector function
type DetectorFunction = (
  event: EventName,
  hasuraEvent: HasuraEventPayload
) => Promise<boolean>;

// Event handler function
type HandlerFunction = (
  event: EventName,
  hasuraEvent: HasuraEventPayload
) => Promise<JobResult[]>;

// Complete event module
interface EventModule {
  detector: DetectorFunction;
  handler: HandlerFunction;
}
```

### Configuration Types

```typescript
interface ListenToOptions {
  autoLoadEventModules: boolean;
  eventModulesDirectory: string;
  listenedEvents: EventName[];
  sourceFunction?: string;
  observability?: ObservabilityConfig;
}

interface ObservabilityConfig {
  enabled: boolean;
  database: DatabaseConfig;
  schema: string;
  batchSize: number;
  flushInterval: number;
  captureJobOptions: boolean;
  captureHasuraPayload: boolean;
}
```

## Configuration

### Basic Configuration

```typescript
const config: Partial<ListenToOptions> = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  sourceFunction: 'netlify-function'
};
```

### Advanced Configuration with Observability

```typescript
const config: Partial<ListenToOptions> = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  sourceFunction: 'api-handler',
  
  observability: {
    enabled: process.env.NODE_ENV === 'production',
    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
    },
    schema: 'event_detector',
    batchSize: 25,
    flushInterval: 10000,
    captureJobOptions: true,
    captureHasuraPayload: false
  }
};
```

## CLI Commands

### Installation

```bash
npm install -g @hopdrive/hasura-event-detector
```

### Commands

#### `init`

Initialize a new Hasura Event Detector project.

```bash
hasura-event-detector init [--typescript]
```

#### `create <eventName>`

Create a new event module from a template.

```bash
hasura-event-detector create user-activation --template user-activation
hasura-event-detector create order-completed --template basic
```

#### `test <eventName>`

Test an event module with sample data.

```bash
hasura-event-detector test user-activation
hasura-event-detector test user-activation --file test-data.json --dry-run
```

#### `list`

List all available event modules.

```bash
hasura-event-detector list --detailed
```

#### `validate`

Validate event detector configuration.

```bash
hasura-event-detector validate --config ./config.js
```

### CLI Options

- `--directory <dir>`: Specify events directory (default: ./events)
- `--config <file>`: Specify configuration file
- `--dry-run`: Run detection only, skip job execution
- `--detailed`: Show detailed information
- `--typescript`: Initialize with TypeScript support

## Error Handling

### Job Error Handling

```typescript
const job = job(async (event, hasuraEvent, options) => {
  try {
    await externalService.call();
    return { action: 'success' };
  } catch (error) {
    if (error.code === 'RATE_LIMIT') {
      throw error; // Will trigger retry
    }
    
    // Handle gracefully
    return { 
      action: 'failed_gracefully', 
      error: error.message 
    };
  }
}, {
  retries: 3,
  timeout: 8000
});
```

### System Error Handling

The system provides automatic error handling with:
- Job isolation (one job failure doesn't affect others)
- Automatic retries with exponential backoff
- Timeout protection
- Correlation ID tracking
- Comprehensive logging

## Best Practices

### 1. Event Detection

- Keep detector functions fast and simple
- Use early returns for quick filtering
- Avoid complex database queries in detectors

### 2. Job Design

- Make jobs idempotent (safe to run multiple times)
- Use correlation IDs for tracing
- Set appropriate timeouts and retry counts
- Return meaningful results

### 3. Error Handling

- Log errors with context
- Use graceful degradation
- Implement circuit breakers for external services

### 4. Performance

- Process events in parallel when possible
- Use batching for external API calls
- Monitor job execution times
- Implement proper observability

### 5. Security

- Validate input data
- Use secrets for sensitive configuration
- Implement HMAC signatures for webhooks
- Never log sensitive information