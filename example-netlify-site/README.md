# Hasura Event Detector - Comprehensive Netlify Examples

This example site demonstrates **ALL patterns** for using `@hopdrive/hasura-event-detector` with Netlify Functions, showcasing best practices for event detection, job orchestration, and separation of concerns.

## 📋 Function Types Demonstrated

### 1. CRON Functions (Scheduled)
- **`cron-daily-report`** - Scheduled task (9 AM UTC daily)
  - Does NOT use event detector (time-based, not event-based)
  - Shows how scheduled and event-driven functions coexist

### 2. WEBHOOK Functions (API Endpoints)
- **`webhook-order-webhook`** - Synchronous webhook handler
  - CAN handle both Hasura events AND generic webhooks
  - Shows flexible endpoint pattern
  - Max execution: 10-26 seconds

### 3. DATABASE Event Functions (Event-Driven)

**IMPORTANT NAMING CONVENTION**: Database functions are named after their TABLE (plural), not specific events. Each function handles ALL operations (INSERT, UPDATE, DELETE, MANUAL) for that table. This creates clear separation between:
- **Detection logic** (which event occurred) - in event modules
- **Orchestration logic** (which jobs to run) - in handler functions
- **Business logic** (specific tasks) - in job functions

#### Background Functions (Async, 15 min max)
- **`db-orders`** - NO observability (lightweight)
  - Handles ALL order events (orders.created, orders.shipped, orders.cancelled)
  - Shows plural table naming convention
- **`db-payments`** - WITH observability (audit trail)
  - Handles ALL payment events (payments.completed, payments.refunded)
  - Shows full tracking for compliance

#### Synchronous Functions (10-26 sec max)
- **`db-users`** - NO observability (simple logging)
  - Handles ALL user events (users.activated, users.deactivated)
  - Shows sync processing pattern

## 🎯 Best Practices Demonstrated

### 1. Plural Table Naming Convention

**Functions are named after TABLES (plural), not events**

✅ **CORRECT - Table-Based Naming**
```
db-orders/          // Handles ALL order operations
db-users/           // Handles ALL user operations
db-payments/        // Handles ALL payment operations
```

❌ **INCORRECT - Event-Based Naming**
```
db-order-created/           // Too specific
db-order-created-background/ // Redundant
db-order-shipped/           // Creates function explosion
```

**Why This Pattern?**
- **Single Entry Point**: One function per table handles all operations (INSERT, UPDATE, DELETE, MANUAL)
- **Clear Ownership**: Easy to find which function owns which table
- **Scalability**: Add new events without creating new functions
- **Separation of Concerns**: Forces clear distinction between detection (events) and execution (jobs)

### 2. Event Naming with Dot Notation

Events use **table.action** format to create semantic meaning:

```typescript
// events/orders.created.ts      - INSERT operations
// events/orders.shipped.ts      - UPDATE when status → 'shipped'
// events/orders.cancelled.ts    - UPDATE when status → 'cancelled'

// events/users.activated.ts     - UPDATE when status → 'active'
// events/users.deactivated.ts   - UPDATE when status → 'inactive'

// events/payments.completed.ts  - UPDATE when status → 'completed'
// events/payments.refunded.ts   - UPDATE when status → 'refunded'
```

### 3. Action-Oriented Job Naming

**CRITICAL PATTERN**: Job names must describe **specific, actionable tasks** - not vague processes. This creates intentional separation between event detection and business logic execution.

✅ **GOOD - Clear, Single-Purpose**
```
send-order-confirmation-email.ts    // Sends ONE email
create-invoice-record.ts            // Creates ONE record
update-inventory-count.ts           // Updates ONE thing
notify-warehouse-team.ts            // Notifies ONE team
```

❌ **BAD - Vague, Multi-Purpose**
```
process-order.ts                    // Too vague
handle-shipping.ts                  // Handle how?
order-workflow.ts                   // What workflow?
```

### 4. Detector Function Pattern

**Best Practice: Write detectors that read like sentences**

Use a switch statement on the operation type and descriptive variable names so your return statements read like plain English descriptions of what you're detecting.

```typescript
export const detector: DetectorFunction = async (eventName, hasuraEvent) => {
  const isOrdersTable = hasuraEvent.table?.name === 'orders';
  const operation = hasuraEvent.event?.op;

  switch (operation) {
    case 'INSERT':
      return false; // Not handling INSERTs

    case 'UPDATE':
      const oldData = hasuraEvent.event.data.old;
      const newData = hasuraEvent.event.data.new;

      const statusChanged = oldData?.status !== newData?.status;
      const isNowShipped = newData?.status === 'shipped';

      // Reads like a sentence: "orders table AND status changed AND is now shipped"
      return isOrdersTable && statusChanged && isNowShipped;

    case 'DELETE':
      return false; // Not handling DELETEs

    case 'MANUAL':
      return false; // Not handling MANUAL triggers

    default:
      return false;
  }
};
```

**Why This Pattern?**
- **Readability**: The return statement reads like documentation
- **Maintainability**: Easy to understand conditions years later
- **Explicit Handling**: Every operation type is explicitly addressed
- **Self-Documenting**: No need for comments explaining the logic

### 5. Separation of Concerns

**This is THE CORE PATTERN** - intentionally separating detection from execution.

Each event module has THREE distinct parts:

**DETECTOR** - Determines if event matches
```typescript
export const detector: DetectorFunction = async (eventName, hasuraEvent) => {
  // ONLY detection logic
  // No business logic
  // Returns boolean (using readable variable names)
  const isOrdersTable = hasuraEvent.table?.name === 'orders';
  const operation = hasuraEvent.event?.op;
  return operation === 'INSERT' && isOrdersTable;
};
```

**HANDLER** - Orchestrates which jobs to run
```typescript
export const handler: HandlerFunction = async (eventName, hasuraEvent) => {
  // ONLY job orchestration
  // No direct business logic
  const jobs = [
    job(sendEmail, { jobName: 'sendEmail' }),
    job(createRecord, { jobName: 'createRecord' }),
  ];
  return await run(eventName, hasuraEvent, jobs);
};
```

**JOBS** - Execute ONE specific action
```typescript
export const sendEmail: JobFunction = async (eventName, hasuraEvent, options) => {
  // ONLY email sending logic
  // Single purpose
  // Returns result
};
```

### 6. When to Use Observability

#### ✅ Enable Observability When:
- Production environment
- Need execution metrics & audit trails
- Debugging complex workflows
- Compliance requirements (payments, etc.)
- Performance monitoring

#### ❌ Disable Observability When:
- Development/testing
- High-volume low-value events
- Cost-sensitive scenarios
- Simple workflows with adequate logging

## 📁 Project Structure

```
example-netlify-site/
├── netlify.toml                      # Config with cron schedule
├── package.json
├── IMPLEMENTATION.md                 # Detailed implementation guide
├── public/
│   └── index.html                   # Landing page
└── functions/
    ├── cron-daily-report/           # CRON: Scheduled task
    │   └── cron-daily-report.ts
    │
    ├── webhook-order-webhook/        # WEBHOOK: API endpoint
    │   ├── webhook-order-webhook.ts
    │   └── events/                   # (Optional for Hasura events)
    │
    ├── db-orders/                    # DB: Orders table (plural!)
    │   ├── db-orders.ts             # Handles ALL operations
    │   ├── events/                   # Multiple events per table
    │   │   ├── orders.created.ts    # INSERT
    │   │   ├── orders.shipped.ts    # UPDATE (status → shipped)
    │   │   └── orders.cancelled.ts  # UPDATE (status → cancelled)
    │   └── jobs/                     # Action-oriented job names
    │       ├── send-order-confirmation-email.ts
    │       ├── create-invoice-record.ts
    │       ├── update-inventory-count.ts
    │       ├── notify-warehouse-team.ts
    │       ├── send-shipping-notification-email.ts
    │       ├── update-order-tracking-info.ts
    │       ├── notify-customer-support-team.ts
    │       ├── send-cancellation-notification-email.ts
    │       ├── restore-inventory-count.ts
    │       └── process-refund-transaction.ts
    │
    ├── db-users/                     # DB: Users table (plural!)
    │   ├── db-users.ts              # Handles ALL operations
    │   ├── events/
    │   │   ├── users.activated.ts   # UPDATE (status → active)
    │   │   └── users.deactivated.ts # UPDATE (status → inactive)
    │   └── jobs/
    │       ├── send-welcome-email.ts
    │       ├── create-user-profile.ts
    │       ├── assign-default-permissions.ts
    │       ├── send-account-closure-email.ts
    │       ├── revoke-user-permissions.ts
    │       └── archive-user-data.ts
    │
    └── db-payments/                  # DB: Payments table (plural!)
        ├── db-payments.ts           # Handles ALL operations
        ├── events/
        │   ├── payments.completed.ts # UPDATE (status → completed)
        │   └── payments.refunded.ts  # UPDATE (status → refunded)
        └── jobs/
            ├── send-payment-receipt.ts
            ├── update-order-status.ts
            ├── record-accounting-entry.ts
            ├── notify-fulfillment-team.ts
            ├── send-refund-confirmation-email.ts
            ├── reverse-accounting-entry.ts
            └── update-refund-status.ts
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd example-netlify-site
npm install
```

### 2. Run Locally
```bash
netlify dev
```

### 3. Test Functions
```bash
# Test all function types
./test-functions.sh

# Test specific function
curl -X POST http://localhost:8888/.netlify/functions/db-order-created-background \
  -H "Content-Type: application/json" \
  -d @test-payloads/order-created.json
```

## 🧪 Testing

See `test-functions.sh` for comprehensive curl examples covering:
- CRON functions (manual trigger)
- WEBHOOK functions (both Hasura & generic)
- Database events (all function types)

## 🌐 Deployment

### Option 1: Git Integration
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-repo>
git push -u origin main
```
Connect repository in Netlify UI → Auto-deploy on push

### Option 2: Netlify CLI
```bash
netlify login
netlify init
netlify deploy --prod
```

### Build Process
When deployed, Netlify automatically:
1. Runs `npm run build` which compiles TypeScript events:
   - `events/*.ts` → `events/*.generated.js`
2. Functions bundled and deployed

## ⚙️ Configuration

### Environment Variables

Set in Netlify UI or `.env`:

```bash
# Observability (optional)
OBSERVABILITY_ENABLED=true
DATABASE_URL=postgresql://...
HASURA_GRAPHQL_ENDPOINT=https://...
HASURA_ADMIN_SECRET=...
```

### netlify.toml

The configuration includes:
- Build command
- CRON schedule
- Functions directory
- Included files

## 📖 Learning Path

1. **Understand Naming**: Review the plural table naming convention (`db-orders` not `db-order-created`)
2. **Start Simple**: Look at `db-users` (sync, no observability, clear separation of concerns)
3. **See Multiple Events**: Study `db-orders` with its 3 events (created, shipped, cancelled)
4. **Add Observability**: Examine `db-payments` (background + observability for audit trail)
5. **Job Naming**: Notice how ALL jobs are action-oriented (send-, create-, update-, notify-)
6. **Other Types**: Check `webhook` and `cron` examples

## 🎓 Key Concepts

### Event Detection Flow
```
Hasura Database Change
  ↓
Trigger fires → HTTP POST to Netlify Function
  ↓
listenTo() called with HasuraEventPayload
  ↓
Event Detector: Does this event match? (detector function)
  ↓
Event Handler: Which jobs should run? (handler function)
  ↓
Jobs: Execute specific actions (job functions)
  ↓
Results returned & optionally tracked (observability)
```

### Job Design Principles

1. **Single Responsibility**: Each job does ONE thing
2. **Action-Oriented**: Name describes the action (send, create, update, notify)
3. **Idempotent**: Safe to run multiple times
4. **Independent**: Can run in parallel with other jobs
5. **Focused**: Narrow scope, clear purpose

### Event Module Design

1. **Detector**: Pure function, uses switch statement on operation, descriptive variables, reads like a sentence
2. **Handler**: Orchestration only, no business logic
3. **Jobs**: Single-purpose functions with action-oriented names
4. **Clear Separation**: Detection logic separate from execution logic

## 🔍 Examples by Use Case

### Send Email When Order Created
**Function**: `db-orders` (handles ALL order operations)
**Event**: `orders.created` (detects INSERT)
**Job**: `send-order-confirmation-email` (action-oriented name)

### Update Tracking When Shipped
**Function**: `db-orders` (same function, different event!)
**Event**: `orders.shipped` (detects UPDATE where status → 'shipped')
**Job**: `update-order-tracking-info` (specific task)

### Welcome New Users
**Function**: `db-users` (handles ALL user operations)
**Event**: `users.activated` (detects UPDATE where status → 'active')
**Jobs**: `send-welcome-email`, `create-user-profile`

### Process Payment Completion
**Function**: `db-payments` (handles ALL payment operations)
**Event**: `payments.completed` (detects UPDATE where status → 'completed')
**Jobs**: `send-payment-receipt`, `record-accounting-entry`

### Cancel Order and Refund
**Function**: `db-orders` (same function handles cancellations!)
**Event**: `orders.cancelled` (detects UPDATE where status → 'cancelled')
**Jobs**: `send-cancellation-notification-email`, `restore-inventory-count`, `process-refund-transaction`

**Notice the pattern**: ONE function per table, MULTIPLE events per function, SPECIFIC jobs per event.

## 📚 Additional Resources

- [Hasura Event Detector Package](https://github.com/hopdrive/hasura-event-detector)
- [Netlify Functions Docs](https://docs.netlify.com/functions/overview/)
- [Netlify Background Functions](https://docs.netlify.com/functions/background-functions/)
- [Hasura Event Triggers](https://hasura.io/docs/latest/graphql/core/event-triggers/)
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Detailed patterns & conventions

## 📄 License

ISC
