# Event Modules Guide

This guide explains how to create and use event modules with the Hasura Event Detector TypeScript system.

## Overview

Event modules are the core building blocks of the Hasura Event Detector. Each module detects a specific business event and executes a set of jobs when that event occurs.

## Event Module Structure

Every event module must export two functions:
- `detector`: Determines if an event occurred
- `handler`: Executes jobs when the event is detected

## Creating an Event Module

### 1. Basic Structure

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

### 2. Detection Patterns

#### Column Change Detection
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

#### Insert Detection
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

#### Complex Business Logic
```typescript
export const detector: DetectorFunction = async (event, hasuraEvent) => {
  const { dbEvent, operation, user } = parseHasuraEvent(hasuraEvent);
  
  // Multi-condition detection
  if (operation !== 'UPDATE') return false;
  if (!columnHasChanged('payment_status', dbEvent)) return false;
  
  const isPaymentSuccessful = dbEvent?.new?.payment_status === 'paid';
  const isFirstPayment = dbEvent?.old?.payment_status === 'pending';
  const isNotAdmin = user !== 'admin';
  
  return isPaymentSuccessful && isFirstPayment && isNotAdmin;
};
```

### 3. Job Patterns

#### Simple Notification Job
```typescript
job(async (event, hasuraEvent, options) => {
  const { dbEvent } = parseHasuraEvent(hasuraEvent);
  const record = dbEvent?.new;
  
  // Send notification
  await notificationService.send({
    to: record?.email,
    template: 'welcome',
    data: { name: record?.name }
  });
  
  return { action: 'notification_sent', email: record?.email };
}, {
  timeout: 5000,
  retries: 3
})
```

#### External API Integration
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
  
  // Update local record with CRM ID
  await db.users.update({
    where: { id: record?.id },
    data: { crmId: crmResponse.id }
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

#### Conditional Job Execution
```typescript
job(async (event, hasuraEvent, options) => {
  const { dbEvent, user } = parseHasuraEvent(hasuraEvent);
  const record = dbEvent?.new;
  
  // Skip processing for admin users
  if (user === 'admin') {
    return { action: 'skipped', reason: 'admin_user' };
  }
  
  // Different logic based on user type
  if (record?.type === 'enterprise') {
    await enterpriseOnboarding.start(record.id);
    return { action: 'enterprise_onboarding_started' };
  } else {
    await standardOnboarding.start(record.id);
    return { action: 'standard_onboarding_started' };
  }
}, {
  correlationId: options?.correlationId
})
```

## File Naming Convention

Event modules should be placed in the `events/` directory with descriptive names:

- `events/user-activation.js` - User becomes active
- `events/order-completed.js` - Order status changes to completed  
- `events/subscription-renewed.js` - Subscription renewal
- `events/payment-failed.js` - Payment processing failure

## Error Handling

The event detector system provides automatic error handling, but you can add custom error handling within jobs:

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

## Testing Event Modules

### Unit Testing
```typescript
import { detector, handler } from '../events/user-activation';
import { createMockHasuraEvent } from '../test-utils';

describe('User Activation Event', () => {
  it('should detect user activation', async () => {
    const mockEvent = createMockHasuraEvent({
      operation: 'UPDATE',
      old: { active: false },
      new: { active: true }
    });
    
    const detected = await detector('user-activation', mockEvent);
    expect(detected).toBe(true);
  });
  
  it('should execute welcome jobs', async () => {
    const mockEvent = createMockHasuraEvent({
      operation: 'UPDATE',
      new: { id: 123, email: 'test@example.com', active: true }
    });
    
    const results = await handler('user-activation', mockEvent);
    expect(results).toHaveLength(3); // Assuming 3 jobs
    expect(results[0].completed).toBe(true);
  });
});
```

### Integration Testing
```typescript
import { listenTo } from '@hopdrive/hasura-event-detector';

describe('User Activation Integration', () => {
  it('should process user activation end-to-end', async () => {
    const hasuraEvent = {
      event: {
        op: 'UPDATE',
        data: {
          old: { id: 123, active: false },
          new: { id: 123, active: true, email: 'test@example.com' }
        }
      }
    };
    
    const result = await listenTo(hasuraEvent, {
      autoLoadEventModules: true,
      eventModulesDirectory: './events'
    });
    
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe('user-activation');
    expect(result.events[0].jobs.every(job => job.completed)).toBe(true);
  });
});
```

## Best Practices

### 1. Keep Detectors Simple and Fast
- Use early returns for quick filtering
- Avoid complex database queries in detectors
- Cache expensive computations

### 2. Make Jobs Idempotent
- Jobs may be retried, so ensure they can run multiple times safely
- Use unique identifiers to prevent duplicate operations
- Check if work has already been done

### 3. Use Correlation IDs
- Always pass correlation IDs to track related operations
- Use them in logs and external API calls for debugging

### 4. Handle Failures Gracefully
- Set appropriate timeouts and retry counts
- Log errors with context
- Consider fallback mechanisms

### 5. Monitor and Observe
- Return meaningful results from jobs
- Log important milestones
- Track business metrics

## Templates

The system provides several templates to get started:

- `templates/event-module.template.ts` - Generic event module template
- `templates/user-activation-event.ts` - User activation example
- Add your own templates for common patterns

Copy these templates to the `events/` directory and customize for your needs.