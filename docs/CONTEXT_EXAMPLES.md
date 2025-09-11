# Context System - Comprehensive Examples

The context system in Hasura Event Detector allows you to pass metadata through the entire event processing pipeline. This document provides real-world examples of how to use context effectively.

## Table of Contents

1. [What is Context?](#what-is-context)
2. [Testing and Development](#testing-and-development)
3. [Production Deployments](#production-deployments)
4. [Request Tracking](#request-tracking)
5. [Feature Flags](#feature-flags)
6. [Multi-Tenant Systems](#multi-tenant-systems)
7. [Audit and Compliance](#audit-and-compliance)
8. [Performance Monitoring](#performance-monitoring)
9. [Error Handling](#error-handling)
10. [Best Practices](#best-practices)

## What is Context?

Context is an optional third parameter to `listenTo()` that gets injected into the `hasuraEvent` object as `__context`. It's accessible throughout the entire event detection and job execution pipeline.

```typescript
// Basic usage
await listenTo(hasuraEvent, options, context);

// Access in event modules
const context = hasuraEvent.__context;
```

## Testing and Development

### CLI Testing with Dry Run

```typescript
// In CLI test command (test-event.ts)
const result = await listenTo(testEvent, testConfig, {
  testMode: true,
  dryRun: options.dryRun,
  logLevel: 'debug',
  mockExternalServices: true,
  skipNotifications: true,
  testUser: 'test@example.com'
});
```

### Unit Testing

```typescript
// In your test files
describe('User Activation Event', () => {
  it('should skip detection in test mode', async () => {
    const result = await listenTo(mockEvent, config, {
      testMode: true,
      forceDetection: false,
      mockResponses: {
        email: { sent: true, messageId: 'test-123' },
        slack: { posted: true, channel: '#test' }
      }
    });
    
    expect(result.events).toHaveLength(0);
  });
  
  it('should force detection even in test mode', async () => {
    const result = await listenTo(mockEvent, config, {
      testMode: true,
      forceDetection: true,
      validateOnly: true
    });
    
    expect(result.events).toHaveLength(1);
  });
});
```

### Local Development

```typescript
// Development server
app.post('/webhook-dev', async (req, res) => {
  const result = await listenTo(req.body, config, {
    environment: 'development',
    debugMode: true,
    logSql: true,
    slowQueryThreshold: 100,
    explainQueries: true,
    mockPaymentProcessor: true,
    sandboxMode: true
  });
  
  res.json({
    ...result,
    debug: {
      context: req.body.__context,
      correlationId: req.body.__correlationId
    }
  });
});
```

## Production Deployments

### AWS Lambda

```typescript
// Lambda function handler
import { Context as LambdaContext } from 'aws-lambda';

export const handler = async (event: any, lambdaContext: LambdaContext) => {
  const hasuraEvent = JSON.parse(event.body);
  
  const result = await listenTo(hasuraEvent, config, {
    // Lambda metadata
    deployment: {
      platform: 'aws-lambda',
      functionName: lambdaContext.functionName,
      functionVersion: lambdaContext.functionVersion,
      region: process.env.AWS_REGION,
      accountId: lambdaContext.invokedFunctionArn.split(':')[4]
    },
    
    // Request tracking
    requestId: lambdaContext.requestId,
    coldStart: !global.warmContainer,
    remainingTime: lambdaContext.getRemainingTimeInMillis(),
    memoryLimit: lambdaContext.memoryLimitInMB,
    
    // Environment
    environment: process.env.STAGE || 'production',
    
    // Feature flags from environment
    featureFlags: {
      enableNewFeature: process.env.ENABLE_NEW_FEATURE === 'true',
      betaFeatures: process.env.BETA_FEATURES?.split(',') || []
    }
  });
  
  // Mark container as warm for next invocation
  global.warmContainer = true;
  
  return {
    statusCode: 200,
    body: JSON.stringify(result),
    headers: {
      'X-Request-Id': lambdaContext.requestId,
      'X-Execution-Time': `${Date.now() - startTime}ms`
    }
  };
};
```

### Google Cloud Functions

```typescript
import { Request, Response } from '@google-cloud/functions-framework';

export const hasuraWebhook = async (req: Request, res: Response) => {
  const result = await listenTo(req.body, config, {
    deployment: {
      platform: 'gcp-functions',
      functionName: process.env.K_SERVICE,
      region: process.env.FUNCTION_REGION,
      projectId: process.env.GCP_PROJECT
    },
    
    requestId: req.headers['x-cloud-trace-context'] as string,
    environment: process.env.ENVIRONMENT,
    
    // GCP specific
    gcpTrace: {
      traceId: req.headers['x-cloud-trace-context'],
      spanId: req.headers['x-appengine-request-log-id']
    },
    
    // Service account info
    serviceAccount: process.env.FUNCTION_IDENTITY
  });
  
  res.json(result);
};
```

### Kubernetes/Docker

```typescript
// In containerized application
app.post('/webhook', async (req, res) => {
  const result = await listenTo(req.body, config, {
    deployment: {
      platform: 'kubernetes',
      cluster: process.env.CLUSTER_NAME,
      namespace: process.env.POD_NAMESPACE,
      podName: process.env.POD_NAME,
      nodeName: process.env.NODE_NAME,
      containerName: process.env.CONTAINER_NAME
    },
    
    // Resource limits
    resources: {
      cpuLimit: process.env.CPU_LIMIT,
      memoryLimit: process.env.MEMORY_LIMIT,
      ephemeralStorageLimit: process.env.STORAGE_LIMIT
    },
    
    // Service mesh info
    serviceMesh: {
      enabled: process.env.ISTIO_ENABLED === 'true',
      version: process.env.ISTIO_VERSION,
      traceId: req.headers['x-b3-traceid'],
      spanId: req.headers['x-b3-spanid']
    }
  });
  
  res.json(result);
});
```

## Request Tracking

### Express Middleware with Request Tracking

```typescript
import { v4 as uuid } from 'uuid';
import expressRequestId from 'express-request-id';

// Middleware setup
app.use(expressRequestId());

// Webhook handler with comprehensive tracking
app.post('/hasura-webhook', async (req, res) => {
  const startTime = Date.now();
  
  const result = await listenTo(req.body, config, {
    // Request identification
    requestId: req.id,
    correlationId: req.headers['x-correlation-id'] || uuid(),
    spanId: req.headers['x-span-id'] || uuid(),
    traceId: req.headers['x-trace-id'] || req.id,
    
    // Request metadata
    request: {
      method: req.method,
      path: req.path,
      query: req.query,
      protocol: req.protocol,
      secure: req.secure,
      ip: req.ip,
      ips: req.ips,
      hostname: req.hostname,
      fresh: req.fresh,
      xhr: req.xhr
    },
    
    // Headers for debugging
    headers: {
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      host: req.headers['host'],
      origin: req.headers['origin'],
      referer: req.headers['referer'],
      xForwardedFor: req.headers['x-forwarded-for'],
      xForwardedProto: req.headers['x-forwarded-proto'],
      xRealIp: req.headers['x-real-ip']
    },
    
    // User context
    user: {
      id: req.user?.id,
      email: req.user?.email,
      roles: req.user?.roles,
      tenantId: req.user?.tenantId,
      sessionId: req.session?.id
    },
    
    // Timing
    requestStartTime: startTime,
    timestamp: new Date().toISOString()
  });
  
  const duration = Date.now() - startTime;
  
  res.set({
    'X-Request-Id': req.id,
    'X-Processing-Time': `${duration}ms`,
    'X-Events-Detected': result.events.length.toString()
  });
  
  res.json(result);
});
```

## Feature Flags

### LaunchDarkly Integration

```typescript
import * as LaunchDarkly from 'launchdarkly-node-server-sdk';

const ldClient = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY!);

app.post('/webhook', async (req, res) => {
  const user = {
    key: req.user?.id || 'anonymous',
    email: req.user?.email,
    custom: {
      tenantId: req.user?.tenantId,
      plan: req.user?.plan
    }
  };
  
  // Fetch feature flags
  const flags = await ldClient.allFlagsState(user);
  
  const result = await listenTo(req.body, config, {
    featureFlags: flags.allValues(),
    
    // Specific feature configurations
    features: {
      notifications: {
        email: await ldClient.variation('enable-email-notifications', user, true),
        sms: await ldClient.variation('enable-sms-notifications', user, false),
        push: await ldClient.variation('enable-push-notifications', user, false),
        slack: await ldClient.variation('enable-slack-notifications', user, false)
      },
      
      integrations: {
        stripe: await ldClient.variation('use-stripe-integration', user, true),
        salesforce: await ldClient.variation('use-salesforce-sync', user, false),
        hubspot: await ldClient.variation('use-hubspot-sync', user, false)
      },
      
      experiments: {
        newPaymentFlow: await ldClient.variation('new-payment-flow', user, false),
        enhancedAnalytics: await ldClient.variation('enhanced-analytics', user, false)
      }
    },
    
    // A/B testing
    experiments: {
      emailTemplate: await ldClient.variation('email-template-version', user, 'v1'),
      processingAlgorithm: await ldClient.variation('processing-algorithm', user, 'standard')
    }
  });
  
  res.json(result);
});
```

### Using Feature Flags in Event Modules

```typescript
export const handler = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  const jobs = [];
  
  // Email notifications (check feature flag)
  if (context?.features?.notifications?.email) {
    jobs.push(job(async function sendEmail() {
      const template = context.experiments?.emailTemplate || 'v1';
      return await emailService.send({
        template,
        to: dbEvent.new.email,
        data: dbEvent.new
      });
    }));
  }
  
  // SMS notifications (check feature flag)
  if (context?.features?.notifications?.sms) {
    jobs.push(job(async function sendSMS() {
      return await smsService.send({
        to: dbEvent.new.phone,
        message: 'Your account has been updated'
      });
    }));
  }
  
  // Salesforce sync (check integration flag)
  if (context?.features?.integrations?.salesforce) {
    jobs.push(job(async function syncSalesforce() {
      return await salesforceClient.upsert('Contact', {
        Email: dbEvent.new.email,
        LastModified: new Date()
      });
    }));
  }
  
  // Use different processing based on experiment
  if (context?.experiments?.processingAlgorithm === 'optimized') {
    jobs.push(job(optimizedProcessingJob));
  } else {
    jobs.push(job(standardProcessingJob));
  }
  
  return await run(event, hasuraEvent, jobs);
};
```

## Multi-Tenant Systems

### Tenant Context

```typescript
// Middleware to extract tenant
app.use((req, res, next) => {
  req.tenant = {
    id: req.headers['x-tenant-id'] as string,
    subdomain: req.subdomains[0],
    plan: 'premium', // Fetch from database
    limits: {
      eventsPerMonth: 10000,
      jobsPerEvent: 50
    }
  };
  next();
});

app.post('/webhook', async (req, res) => {
  const result = await listenTo(req.body, config, {
    tenant: {
      id: req.tenant.id,
      subdomain: req.tenant.subdomain,
      plan: req.tenant.plan,
      limits: req.tenant.limits,
      
      // Tenant-specific configuration
      configuration: {
        timezone: 'America/New_York',
        locale: 'en-US',
        currency: 'USD',
        dateFormat: 'MM/DD/YYYY'
      },
      
      // Tenant feature access
      features: {
        advancedAnalytics: req.tenant.plan === 'premium',
        customIntegrations: req.tenant.plan === 'enterprise',
        priorityProcessing: req.tenant.plan !== 'free'
      }
    },
    
    // Rate limiting per tenant
    rateLimit: {
      remaining: req.tenant.limits.eventsPerMonth - req.tenant.eventsUsed,
      reset: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  
  res.json(result);
});
```

### Using Tenant Context in Events

```typescript
export const detector = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  
  // Check if tenant has access to this feature
  if (!context?.tenant?.features?.advancedAnalytics) {
    console.log('Tenant does not have access to advanced analytics');
    return false;
  }
  
  // Apply tenant-specific rules
  if (context?.tenant?.plan === 'free') {
    // Simpler detection for free tier
    return dbEvent?.new?.status === 'active';
  }
  
  // Advanced detection for paid tiers
  return complexDetectionLogic(dbEvent);
};

export const handler = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  const tenant = context?.tenant;
  
  const jobs = [];
  
  // Priority processing for premium tenants
  const jobPriority = tenant?.features?.priorityProcessing ? 'high' : 'normal';
  const jobTimeout = tenant?.features?.priorityProcessing ? 10000 : 5000;
  
  jobs.push(job(async function processEvent() {
    // Use tenant configuration
    const locale = tenant?.configuration?.locale || 'en-US';
    const timezone = tenant?.configuration?.timezone || 'UTC';
    
    return {
      processed: true,
      tenant: tenant?.id,
      locale,
      timezone,
      priority: jobPriority
    };
  }, {
    timeout: jobTimeout,
    priority: jobPriority
  }));
  
  return await run(event, hasuraEvent, jobs);
};
```

## Audit and Compliance

### Comprehensive Audit Trail

```typescript
app.post('/webhook', async (req, res) => {
  const result = await listenTo(req.body, config, {
    audit: {
      // Who triggered this?
      actor: {
        type: 'webhook',
        id: req.user?.id || 'anonymous',
        email: req.user?.email,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      },
      
      // When and where?
      timestamp: new Date().toISOString(),
      source: {
        system: 'hasura',
        trigger: req.body.trigger?.name,
        table: req.body.table?.name
      },
      
      // Request details
      request: {
        id: req.id,
        method: req.method,
        path: req.path,
        headers: req.headers
      },
      
      // Compliance metadata
      compliance: {
        dataClassification: determineDataClass(req.body),
        requiresEncryption: true,
        retentionPeriod: '7 years',
        gdprApplicable: isEUUser(req.ip),
        ccpaApplicable: isCaliforniaUser(req.ip)
      }
    },
    
    // Data governance
    governance: {
      dataOwner: getDataOwner(req.body.table?.name),
      dataProcessor: 'event-detector-system',
      purpose: 'business-event-processing',
      legalBasis: 'legitimate-interest',
      
      // PII handling
      pii: {
        present: containsPII(req.body),
        fields: identifyPIIFields(req.body),
        masking: 'required',
        encryption: 'aes-256-gcm'
      }
    }
  });
  
  res.json(result);
});
```

### Using Audit Context in Events

```typescript
export const handler = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  const audit = context?.audit;
  const governance = context?.governance;
  
  const jobs = [];
  
  // Always create audit log for compliance
  jobs.push(job(async function createAuditLog() {
    const auditEntry = {
      // Event information
      eventType: event,
      eventId: hasuraEvent.id,
      timestamp: new Date().toISOString(),
      
      // Actor information
      actor: audit?.actor,
      
      // Data changes
      operation: hasuraEvent.event.op,
      table: hasuraEvent.table,
      changes: {
        before: hasuraEvent.event.data.old,
        after: hasuraEvent.event.data.new
      },
      
      // Compliance
      compliance: audit?.compliance,
      governance: governance,
      
      // Processing metadata
      correlationId: hasuraEvent.__correlationId,
      processingTime: Date.now()
    };
    
    // Store in audit database
    await auditDB.insert('audit_logs', auditEntry);
    
    // If GDPR applicable, also log to GDPR audit trail
    if (audit?.compliance?.gdprApplicable) {
      await gdprAuditDB.insert('gdpr_processing_activities', {
        ...auditEntry,
        purpose: governance?.purpose,
        legalBasis: governance?.legalBasis,
        dataSubject: hasuraEvent.event.data.new?.user_id
      });
    }
    
    return {
      auditId: auditEntry.eventId,
      logged: true,
      gdprLogged: audit?.compliance?.gdprApplicable
    };
  }));
  
  // Mask PII if required
  if (governance?.pii?.masking === 'required') {
    jobs.push(job(async function maskPII() {
      const maskedData = maskPIIFields(
        hasuraEvent.event.data.new,
        governance.pii.fields
      );
      
      return {
        masked: true,
        fields: governance.pii.fields
      };
    }));
  }
  
  return await run(event, hasuraEvent, jobs);
};
```

## Performance Monitoring

### Performance Context

```typescript
app.post('/webhook', async (req, res) => {
  const startTime = process.hrtime.bigint();
  
  const result = await listenTo(req.body, config, {
    performance: {
      // Request timing
      timing: {
        requestStart: Date.now(),
        dnsLookup: req.timings?.dnsDuration,
        tcpConnection: req.timings?.tcpDuration,
        tlsHandshake: req.timings?.tlsDuration,
        requestSent: req.timings?.requestDuration
      },
      
      // System resources
      resources: {
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        activeHandles: process._getActiveHandles()?.length,
        activeRequests: process._getActiveRequests()?.length
      },
      
      // Thresholds for monitoring
      thresholds: {
        maxExecutionTime: 5000,
        maxMemoryUsage: 512 * 1024 * 1024, // 512MB
        maxJobDuration: 3000
      },
      
      // Monitoring metadata
      monitoring: {
        alertOnSlowExecution: true,
        captureMetrics: true,
        sampleRate: 1.0,
        tags: {
          service: 'event-detector',
          version: process.env.APP_VERSION,
          environment: process.env.NODE_ENV
        }
      }
    }
  });
  
  const endTime = process.hrtime.bigint();
  const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
  
  // Send metrics
  metrics.histogram('event_detection.duration', duration, {
    detected: result.events.length > 0,
    eventCount: result.events.length
  });
  
  res.json({
    ...result,
    performance: {
      totalDuration: duration,
      overhead: duration - result.duration
    }
  });
});
```

## Error Handling

### Error Context

```typescript
app.post('/webhook', async (req, res) => {
  try {
    const result = await listenTo(req.body, config, {
      errorHandling: {
        // Error reporting
        reportTo: {
          sentry: process.env.SENTRY_DSN,
          slack: process.env.SLACK_ERROR_WEBHOOK,
          email: 'errors@example.com'
        },
        
        // Recovery strategies
        recovery: {
          retryOnFailure: true,
          maxRetries: 3,
          backoffMultiplier: 2,
          deadLetterQueue: 'failed-events'
        },
        
        // Error context
        context: {
          user: req.user,
          request: {
            id: req.id,
            url: req.url,
            method: req.method
          },
          environment: process.env.NODE_ENV
        }
      }
    });
    
    res.json(result);
  } catch (error) {
    // Use error context for reporting
    const errorContext = {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code
      },
      context: req.body.__context,
      timestamp: new Date().toISOString()
    };
    
    // Report to various channels
    await reportToSentry(errorContext);
    await reportToSlack(errorContext);
    
    res.status(500).json({
      error: 'Event processing failed',
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  }
});
```

## Best Practices

### 1. Structure Your Context

```typescript
// Good: Organized and typed
interface AppContext {
  deployment: {
    environment: 'dev' | 'staging' | 'prod';
    region: string;
    version: string;
  };
  request: {
    id: string;
    userId?: string;
    tenantId?: string;
  };
  features: {
    [key: string]: boolean;
  };
  monitoring: {
    traceId: string;
    spanId: string;
  };
}

const context: AppContext = {
  deployment: {
    environment: 'prod',
    region: 'us-east-1',
    version: '2.1.0'
  },
  request: {
    id: uuid(),
    userId: req.user?.id
  },
  features: await getFeatureFlags(),
  monitoring: {
    traceId: req.headers['x-trace-id'],
    spanId: uuid()
  }
};
```

### 2. Don't Overload Context

```typescript
// Bad: Too much data in context
const context = {
  entireRequest: req, // Don't pass entire objects
  largeDataset: await db.query('SELECT * FROM users'), // Don't pass large datasets
  secrets: process.env // Never pass secrets
};

// Good: Only essential metadata
const context = {
  requestId: req.id,
  userId: req.user?.id,
  environment: process.env.NODE_ENV
};
```

### 3. Use Context for Conditional Logic

```typescript
export const detector = async (event, hasuraEvent) => {
  const context = hasuraEvent.__context;
  
  // Environment-specific behavior
  if (context?.deployment?.environment === 'production') {
    // Strict validation in production
    return await strictValidation(hasuraEvent);
  } else if (context?.deployment?.environment === 'staging') {
    // Moderate validation in staging
    return await moderateValidation(hasuraEvent);
  } else {
    // Relaxed validation in development
    return await relaxedValidation(hasuraEvent);
  }
};
```

### 4. Document Your Context Structure

```typescript
/**
 * Standard context structure for our application
 * 
 * @property {Object} deployment - Deployment information
 * @property {string} deployment.environment - Current environment (dev/staging/prod)
 * @property {string} deployment.region - AWS region
 * @property {Object} request - Request tracking information
 * @property {string} request.id - Unique request identifier
 * @property {string} [request.userId] - User who initiated the request
 * @property {Object} features - Feature flags
 * @property {boolean} features.enableNotifications - Whether to send notifications
 */
type StandardContext = {
  deployment: {
    environment: 'dev' | 'staging' | 'prod';
    region: string;
  };
  request: {
    id: string;
    userId?: string;
  };
  features: {
    enableNotifications: boolean;
  };
};
```

### 5. Use Context for Testing

```typescript
// Test file
describe('Event Detection', () => {
  it('should handle production context', async () => {
    const productionContext = {
      deployment: { environment: 'production' },
      features: { enableNotifications: true }
    };
    
    const result = await listenTo(event, config, productionContext);
    expect(result.events).toHaveLength(1);
  });
  
  it('should skip in test mode', async () => {
    const testContext = {
      testMode: true,
      skipDetection: true
    };
    
    const result = await listenTo(event, config, testContext);
    expect(result.events).toHaveLength(0);
  });
});
```

## Summary

The context system is a powerful feature that enables:

1. **Environment-Aware Processing** - Different behavior for dev/staging/prod
2. **Request Tracking** - Complete audit trail of event processing
3. **Feature Flags** - Dynamic feature enablement without code changes
4. **Multi-Tenancy** - Tenant-specific configuration and limits
5. **Compliance** - Audit trails and data governance
6. **Testing** - Dry runs and test modes
7. **Monitoring** - Performance tracking and alerting
8. **Error Handling** - Contextual error reporting

Use context to make your event processing system more flexible, maintainable, and observable.