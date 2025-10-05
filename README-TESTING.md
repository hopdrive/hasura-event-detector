# Testing the Observability Plugin Fix

## Quick Test

### Without Database Writes (dry run)
```bash
# Run with a random payload from test-payloads/ (no database writes)
node test-with-real-payload.js

# Run with a specific payload
node test-with-real-payload.js test-payloads/move-dispatched.json

# Or with your own payload file
node test-with-real-payload.js /path/to/your-payload.json
```

### With Database Writes (full integration test)
```bash
# Random payload - writes to TEST database (hopdrive-test.hasura.app)
./test-with-database.sh

# Specific payload
./test-with-database.sh test-payloads/move-active-change.json

# Or manually set environment variables (TEST ONLY):
export HASURA_GRAPHQL_ENDPOINT=https://hopdrive-test.hasura.app/v1/graphql
export HASURA_ADMIN_SECRET=your-test-secret-here
node test-with-real-payload.js test-payloads/move-created.json
```

**⚠️ IMPORTANT**: The script has safety checks to prevent running against production. It will only run against the test environment and will abort if it detects production configuration.

After running with database writes, check these tables:
- `invocations` - Should have 1 new record
- `event_executions` - Should have 45 new records (1 detected, 44 not detected)
- `job_executions` - Should have 2 new records (runAR and runDriverPay)

## What the Test Does

1. Loads a Hasura event payload (from JSON file or uses a sample)
2. Registers the ConsoleInterceptorPlugin and ObservabilityPlugin
3. Calls `listenTo()` with the payload
4. Shows you the results including:
   - How many events were processed
   - How many events were detected
   - Plugin buffer status

## Understanding the Results

- **Events processed**: Total number of event modules checked
- **Events detected**: Number of event modules that returned `true` from their detector function
- **Not detected**: Events that were checked but detector returned `false`

## The Fix

The observability plugin had a race condition where the periodic flush timer (default 5 seconds) would clear the buffer before `onEventHandlerEnd` and `onJobEnd` could update records.

The fix adds direct database updates when buffer records are missing, similar to how `recordInvocationEnd` already worked for background functions.

### Files Changed

1. `src/plugins/observability/plugin.ts` - Added buffer recovery logic to `onEventHandlerEnd` and `onJobEnd`
2. `src/plugins/observability/transports/types.ts` - Added `updateEventExecutionCompletion` and `updateJobExecutionCompletion` methods
3. `src/plugins/observability/graphql/mutations.ts` - Added GraphQL mutations for direct updates
4. `src/plugins/observability/transports/graphql-transport.ts` - Implemented the new update methods
5. `src/plugins/observability/transports/sql-transport.ts` - Implemented the new update methods

## Deployment Checklist

When deploying this fix:

1. ✅ Run `npm run build` in hasura-event-detector package
2. ✅ If using npm link, ensure symlink is correct
3. ✅ Restart Netlify dev server (kill and restart)
4. ✅ Clear any Node.js module caches
5. ✅ Verify environment variables are set:
   - `HASURA_GRAPHQL_ENDPOINT`
   - `HASURA_ADMIN_SECRET` or `HASURA_JWT`

## Verifying the Fix is Deployed

Look for this log line when the function runs:

```
[ObservabilityPlugin] [VERSION CHECK] Using observability plugin with buffer recovery fix - v2.3.1-rc044-fixed
```

If you don't see it, the new code isn't being loaded.
