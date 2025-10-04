# Example Site Implementation Details

## Function Types & Patterns

### 1. CRON Function (Scheduled)
- **Name**: `cron-daily-report`
- **Pattern**: Time-based, NOT event-driven
- **Observability**: N/A (not using event detector)
- **Purpose**: Shows non-event-driven functions can coexist

### 2. WEBHOOK Function (Synchronous)
- **Name**: `webhook-order-webhook`
- **Pattern**: Can handle both Hasura events AND generic webhooks
- **Observability**: Optional (enabled for Hasura events)
- **Purpose**: Shows flexible webhook endpoint

### 3. DB Functions (Event-Driven)

#### Background Functions (Async, 15 min max)
- `db-order-created-background` - NO observability (lightweight)
- `db-payment-processed-background` - WITH observability (full tracking)

#### Synchronous Functions (10-26 sec max)
- `db-order-shipped` - WITH observability
- `db-user-activated` - NO observability

## Job Naming Conventions

### ✅ GOOD - Action-Oriented, Single Purpose
```
send-shipping-notification.ts  // Sends ONE notification
update-inventory-count.ts      // Updates ONE thing
create-invoice-record.ts       // Creates ONE record
notify-warehouse-team.ts       // Notifies ONE team
```

### ❌ BAD - Vague, Multi-Purpose
```
process-order.ts              // Too vague, does what?
handle-shipping.ts            // Handle how?
order-updates.ts              // Updates what specifically?
```

## Event Detection Best Practices

### Separation of Concerns

**Detector**: ONLY determines if event matches
- Check table name
- Check operation type
- Check field values
- Return boolean

**Handler**: ONLY orchestrates which jobs to run
- Map event to appropriate jobs
- Pass context to jobs
- Return job results

**Jobs**: ONLY perform ONE specific action
- Send notification
- Update record
- Create invoice
- etc.

### Example Structure

```typescript
// ✅ GOOD - Clear separation
export const detector: DetectorFunction = async (eventName, hasuraEvent) => {
  // ONLY detection logic
  return hasuraEvent.table?.name === 'orders'
    && hasuraEvent.event?.op === 'UPDATE'
    && hasuraEvent.event.data.new?.status === 'shipped';
};

export const handler: HandlerFunction = async (eventName, hasuraEvent) => {
  // ONLY orchestration
  const jobs = [
    job(sendShippingNotification, { jobName: 'sendShippingNotification' }),
    job(updateInventoryCount, { jobName: 'updateInventoryCount' }),
    job(notifyWarehouseTeam, { jobName: 'notifyWarehouseTeam' }),
  ];

  return await run(eventName, hasuraEvent, jobs);
};
```

## When to Use Observability

### Enable When:
- ✅ Production environment
- ✅ Need to track execution metrics
- ✅ Debugging complex workflows
- ✅ Compliance/audit requirements
- ✅ Performance monitoring

### Disable When:
- ❌ Development/testing
- ❌ High-volume low-value events
- ❌ Cost-sensitive scenarios
- ❌ Simple workflows that log adequately
- ❌ Need absolute minimal overhead

## File Organization

```
function-name/
├── function-name.ts         # Entry point with listenTo()
├── README.md                # Function-specific docs
├── events/                  # Event detection modules
│   ├── event.name.ts       # detector + handler
│   └── another.event.ts
└── jobs/                    # Single-purpose jobs
    ├── send-notification.ts
    ├── update-record.ts
    └── create-invoice.ts
```

Each job file exports ONE function that does ONE thing.
Each event file exports detector (detection) + handler (orchestration).
