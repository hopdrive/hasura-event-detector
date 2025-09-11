# TypeScript Migration Guide

This guide helps you migrate from JavaScript to TypeScript and understand the new TypeScript-first features of Hasura Event Detector.

## 🎯 Overview

Version 0.0.8+ is a complete TypeScript rewrite that provides:

- **Full Type Safety**: Comprehensive TypeScript definitions
- **Dual Module Support**: Works with both CommonJS and ES modules
- **Enhanced Developer Experience**: Better intellisense and error detection
- **Backwards Compatibility**: Existing JavaScript code continues to work

## 📦 What's New

### TypeScript-First API

All core functions now have comprehensive TypeScript definitions:

```typescript
import { 
  listenTo, 
  parseHasuraEvent, 
  columnHasChanged, 
  job, 
  run,
  type HasuraEventPayload,
  type Config,
  type JobFunction 
} from '@hopdrive/hasura-event-detector';
```

### Generic Type Support

You can now specify types for your data structures:

```typescript
interface UserData {
  id: number;
  email: string;
  active: boolean;
  profile: {
    firstName: string;
    lastName: string;
  };
}

// Type-safe event parsing
const detector = async (event, hasuraEvent: HasuraEventPayload<UserData>) => {
  const { dbEvent, operation } = parseHasuraEvent<UserData>(hasuraEvent);
  
  // TypeScript knows dbEvent.new.profile.firstName exists
  return operation === 'UPDATE' && 
         dbEvent?.new?.active === true &&
         dbEvent?.old?.active === false;
};
```

### Enhanced Job System

Jobs now have better type definitions and built-in functions:

```typescript
import { emailNotificationJob, analyticsTrackingJob } from '@hopdrive/hasura-event-detector';

const handler = async (event, hasuraEvent) => {
  const jobs = [
    // Built-in job with type-safe options
    job(emailNotificationJob, {
      to: 'user@example.com',
      template: 'welcome',
      variables: { name: 'John' }
    }),
    
    // Custom job with proper typing
    job(async (event, hasuraEvent, options) => {
      // options.correlationId is automatically typed
      return { 
        action: 'custom_action',
        correlationId: options.correlationId 
      };
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};
```

## 🔄 Migration Steps

### Step 1: Update Dependencies

```bash
npm install @hopdrive/hasura-event-detector@latest
npm install --save-dev typescript @types/node
```

### Step 2: Add TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "events/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 3: Convert Event Modules

**Before (JavaScript):**
```javascript
// events/user-activation.js
const { parseHasuraEvent, columnHasChanged, job, run } = require('@hopdrive/hasura-event-detector');

const detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);
  return operation === 'UPDATE' && columnHasChanged('active', dbEvent);
};

const handler = async (event, hasuraEvent) => {
  const jobs = [
    job(async () => ({ action: 'email_sent' }))
  ];
  return await run(event, hasuraEvent, jobs);
};

module.exports = { detector, handler };
```

**After (TypeScript):**
```typescript
// events/user-activation.ts
import { 
  parseHasuraEvent, 
  columnHasChanged, 
  job, 
  run,
  emailNotificationJob,
  type HasuraEventPayload,
  type JobFunction 
} from '@hopdrive/hasura-event-detector';

interface UserData {
  id: number;
  email: string;
  active: boolean;
}

export const detector = async (event: any, hasuraEvent: HasuraEventPayload<UserData>): Promise<boolean> => {
  const { dbEvent, operation } = parseHasuraEvent<UserData>(hasuraEvent);
  
  return operation === 'UPDATE' && 
         columnHasChanged('active', dbEvent) &&
         dbEvent?.new?.active === true &&
         dbEvent?.old?.active === false;
};

export const handler = async (event: any, hasuraEvent: HasuraEventPayload<UserData>) => {
  const { dbEvent } = parseHasuraEvent<UserData>(hasuraEvent);
  
  const jobs = [
    job(emailNotificationJob, {
      to: dbEvent?.new?.email || '',
      template: 'welcome',
      variables: { name: `User ${dbEvent?.new?.id}` }
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};
```

### Step 4: Update Your Main Handler

**Before (JavaScript):**
```javascript
// netlify/functions/hasura-events.js
const { listenTo } = require('@hopdrive/hasura-event-detector');

exports.handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);
  const result = await listenTo(hasuraEvent, { 
    autoLoadEventModules: true 
  });
  return {
    statusCode: 200,
    body: JSON.stringify(result)
  };
};
```

**After (TypeScript):**
```typescript
// netlify/functions/hasura-events.ts
import { Handler } from '@netlify/functions';
import { 
  listenTo, 
  handleSuccess, 
  handleFailure,
  type Config 
} from '@hopdrive/hasura-event-detector';

const config: Config = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events'
};

export const handler: Handler = async (event, context) => {
  try {
    const hasuraEvent = JSON.parse(event.body || '{}');
    const result = await listenTo(hasuraEvent, config);
    return handleSuccess(result);
  } catch (error) {
    return handleFailure(error);
  }
};
```

### Step 5: Update Package Scripts

Add TypeScript build scripts to `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "test:types": "tsc --noEmit"
  }
}
```

## 🔧 Configuration Updates

### Enhanced Type Safety

Configuration now has comprehensive typing:

```typescript
import { type Config, type ObservabilityConfig } from '@hopdrive/hasura-event-detector';

const config: Config = {
  autoLoadEventModules: true,
  eventModulesDirectory: './events',
  sourceFunction: 'netlify-function',
  
  observability: {
    enabled: true,
    database: {
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!
    },
    schema: 'event_detector',
    batchSize: 25,
    flushInterval: 10000
  } satisfies ObservabilityConfig
};
```

### Plugin System

Plugins now have proper TypeScript interfaces:

```typescript
import { 
  ObservabilityPlugin, 
  SimpleLoggingPlugin,
  type Plugin 
} from '@hopdrive/hasura-event-detector';

const plugins: Plugin[] = [
  new ObservabilityPlugin(config.observability!),
  new SimpleLoggingPlugin({
    enabled: true,
    logLevel: 'info',
    format: 'json'
  })
];
```

## 🚀 New Features Available

### Built-in Job Functions

```typescript
import { 
  emailNotificationJob,
  analyticsTrackingJob,
  webhookNotificationJob 
} from '@hopdrive/hasura-event-detector';

// Email notifications with templates
job(emailNotificationJob, {
  to: user.email,
  template: 'welcome',
  variables: { name: user.name, plan: user.plan }
});

// Analytics tracking
job(analyticsTrackingJob, {
  eventName: 'User Activated',
  userId: user.id.toString(),
  properties: { plan: user.plan, source: 'hasura' }
});

// Webhook notifications
job(webhookNotificationJob, {
  url: 'https://api.external.com/webhook',
  secret: process.env.WEBHOOK_SECRET,
  filterFields: ['id', 'email', 'plan']
});
```

### CLI Enhancements

```bash
# Initialize with TypeScript
npx hasura-event-detector init --typescript

# Create TypeScript event modules
npx hasura-event-detector create user-signup --template user-activation

# Test with better error reporting
npx hasura-event-detector test user-activation --detailed
```

### Enhanced Testing

```typescript
// tests/user-activation.test.ts
import { describe, it, expect } from '@jest/globals';
import { detector, handler } from '../events/user-activation';
import { createMockHasuraEvent } from '@hopdrive/hasura-event-detector/test-utils';

describe('User Activation Event', () => {
  it('should detect user activation', async () => {
    const hasuraEvent = createMockHasuraEvent({
      operation: 'UPDATE',
      old: { id: 1, active: false },
      new: { id: 1, active: true }
    });
    
    const result = await detector({}, hasuraEvent);
    expect(result).toBe(true);
  });
});
```

## 🔄 Backwards Compatibility

### JavaScript Support

All existing JavaScript code continues to work:

```javascript
// This still works!
const { listenTo } = require('@hopdrive/hasura-event-detector');
```

### Gradual Migration

You can migrate incrementally:

1. Keep existing JavaScript event modules
2. Add new event modules in TypeScript
3. Convert existing modules one by one
4. Update main handler last

### CommonJS Support

The package exports both CommonJS and ES modules:

```javascript
// CommonJS
const { listenTo } = require('@hopdrive/hasura-event-detector');

// ES Modules
import { listenTo } from '@hopdrive/hasura-event-detector';
```

## 🛠️ Development Tools

### Enhanced IDE Support

With TypeScript, you get:

- **IntelliSense**: Auto-completion for all API methods
- **Type Checking**: Catch errors before runtime
- **Refactoring**: Safe renaming and restructuring
- **Documentation**: Inline documentation in your IDE

### Testing Tools

```typescript
import { 
  createMockHasuraEvent,
  createTestConfig,
  createMockJob 
} from '@hopdrive/hasura-event-detector/test-utils';

// Type-safe test utilities
const hasuraEvent = createMockHasuraEvent<UserData>({
  operation: 'UPDATE',
  old: { id: 1, email: 'old@example.com', active: false },
  new: { id: 1, email: 'new@example.com', active: true }
});
```

## 🔍 Troubleshooting

### Common Migration Issues

1. **Import/Export Syntax**
   ```typescript
   // ❌ Wrong
   const { detector } = require('./events/user-activation.js');
   
   // ✅ Correct
   import { detector } from './events/user-activation.js';
   ```

2. **Type Errors**
   ```typescript
   // ❌ Wrong - implicit any
   const detector = async (event, hasuraEvent) => {
   
   // ✅ Correct - explicit types
   const detector = async (event: any, hasuraEvent: HasuraEventPayload) => {
   ```

3. **Module Resolution**
   ```json
   // tsconfig.json
   {
     "compilerOptions": {
       "moduleResolution": "node",
       "esModuleInterop": true
     }
   }
   ```

### Getting Help

- 📚 [API Documentation](./API.md)
- 🐛 [GitHub Issues](https://github.com/hopdrive/hasura-event-detector/issues)
- 💬 [Discussions](https://github.com/hopdrive/hasura-event-detector/discussions)

---

**Ready to migrate? Start with `npx hasura-event-detector init --typescript`**