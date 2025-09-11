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
- `context?: Record<string, any>` - Additional context passed to handlers

**Returns:** `Promise<ListenToResponse>`

**Example:**
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  observability: {
    enabled: true,
    database: { /* DB config */ }
  }
});

console.log(`Detected ${result.events.length} events`);
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