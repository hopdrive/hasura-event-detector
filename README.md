# Hasura Event Detector

A powerful TypeScript-first framework for detecting and responding to business events from Hasura Event Triggers.

[![npm version](https://badge.fury.io/js/@hopdrive%2Fhasura-event-detector.svg)](https://badge.fury.io/js/@hopdrive%2Fhasura-event-detector)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow.svg)](https://opensource.org/licenses/ISC)

## 🚀 Features

- **TypeScript-First**: Full type safety with comprehensive TypeScript support
- **Plugin Architecture**: Extensible observability and logging system
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

### 4. Use in Production

**TypeScript/ESM:**
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

export const handler = async (event, context) => {
  const hasuraEvent = JSON.parse(event.body);
  
  const result = await listenTo(hasuraEvent, {
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

```typescript
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

// Detect user activation
export const detector = async (event, hasuraEvent) => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);
  
  return operation === 'UPDATE' && 
         columnHasChanged('active', dbEvent) &&
         dbEvent?.new?.active === true;
};

// Handle user activation
export const handler = async (event, hasuraEvent) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [
    job(async () => {
      await sendWelcomeEmail(dbEvent.new.email);
      return { action: 'welcome_email_sent' };
    }),
    
    job(async () => {
      await trackAnalytics('User Activated', { userId: dbEvent.new.id });
      return { action: 'analytics_tracked' };
    })
  ];
  
  return await run(event, hasuraEvent, jobs);
};
```

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

## 📚 Documentation

- [API Reference](./docs/API.md) - Complete API documentation
- [Event Modules Guide](./docs/EVENT_MODULES.md) - How to create event modules
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

The framework includes a comprehensive observability system:

### Features

- **Correlation ID Tracking**: Trace business processes across multiple events
- **Performance Monitoring**: Track job execution times and success rates
- **Error Tracking**: Comprehensive error logging with context
- **Database Integration**: Store metrics in PostgreSQL for analysis

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

### Vercel

```typescript
// api/hasura-events.ts
import { listenTo, handleSuccess, handleFailure } from '@hopdrive/hasura-event-detector';

export default async function handler(req, res) {
  try {
    const result = await listenTo(req.body, config);
    const response = handleSuccess(result);
    res.status(response.statusCode).json(JSON.parse(response.body));
  } catch (error) {
    const response = handleFailure(error);
    res.status(response.statusCode).json(JSON.parse(response.body));
  }
}
```

### AWS Lambda

```typescript
// lambda/hasura-events.ts
import { APIGatewayProxyHandler } from 'aws-lambda';
import { listenTo, handleSuccess, handleFailure } from '@hopdrive/hasura-event-detector';

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const hasuraEvent = JSON.parse(event.body || '{}');
    const result = await listenTo(hasuraEvent, config);
    return handleSuccess(result);
  } catch (error) {
    return handleFailure(error);
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
