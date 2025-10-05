# Debugging Observability in Netlify Functions

## Problem (SOLVED ✅)
When calling the Netlify function via Insomnia/HTTP, records were not being written to the `invocations`, `event_executions`, and `job_executions` tables, even though the test script worked perfectly.

## Root Cause
When using `npm link` to symlink `@hopdrive/hasura-event-detector`, the `getCallerDirectory()` function was incorrectly identifying the event modules directory. The stack trace inspection was returning the real path of the symlinked package files instead of the actual Netlify function path, causing `listenTo()` to look for events in the wrong directory (`/Users/robnewton/Github/hasura-event-detector/dist/cjs/helpers/events` instead of `/Users/robnewton/Github/event-handlers/functions/db-moves/events`).

## Solution
Updated `src/helpers/caller-path.ts` to skip files containing `/hasura-event-detector/dist/` in their path, which handles both regular npm installs and symlinked packages. This ensures the caller directory is correctly identified as the Netlify function directory.

## Diagnostic Steps Completed

### 1. Verified Database Tables Exist ✅
Ran `diagnose-observability.mjs` which confirmed:
- Both endpoints (`hopdrive-test.hasura.app` and `gql-test.hopdrive.io`) have all observability tables
- Both endpoints can successfully write records
- No schema or permission issues

### 2. Added Debug Logging ✅
Added logging to identify what event modules directory was being resolved

## Next Steps - Run and Check Logs

1. **Restart Netlify Dev** (to pick up the updated code):
   ```bash
   cd /Users/robnewton/Github/event-handlers
   # Kill any existing netlify dev
   pkill -f "netlify dev"
   # Start fresh
   netlify dev
   ```

2. **Trigger the function via Insomnia** with your test payload

3. **Check the console logs** for these debug messages:
   ```
   [DEBUG] Registering ObservabilityPlugin with config: {...}
   [DEBUG] ObservabilityPlugin registered
   ```

## What to Look For

### If you see the debug logs:
- **Check the endpoint value**: Should be `https://gql-test.hopdrive.io/v1/graphql` (test) or `https://gql.hopdrive.io/v1/graphql` (prod)
- **Check hasSecret**: Should be `true`
- **Check for initialization errors**: Look for `[ObservabilityPlugin] Failed to initialize` or similar

### If you DON'T see the debug logs:
- The function might be using cached code
- Try: `rm -rf .netlify/functions-serve` to clear the cache
- Or: Stop and restart `netlify dev` with `--no-cache` flag

### Common Issues

1. **Plugin initialization failing silently**
   - Look for: `[ObservabilityPlugin] Failed to initialize: <error>`
   - Solution: Check that the GraphQL endpoint is reachable

2. **Wrong environment being used**
   - Look for: endpoint showing production URL when you expect test
   - Solution: Set `REACT_APP_ENV=test` environment variable

3. **Module cache issue**
   - The symlinked package might be cached
   - Solution: Restart netlify dev completely

4. **Plugin not flushing**
   - Look for: `[ObservabilityPlugin.flush]` logs
   - Solution: Check if `serverlessMode` is set correctly

## Expected Behavior

When working correctly, you should see:
```
[DEBUG] Registering ObservabilityPlugin with config: {
  endpoint: 'https://gql-test.hopdrive.io/v1/graphql',
  hasSecret: true,
  clientName: 'ObservabilityPlugin-event-handlers-test'
}
[DEBUG] ObservabilityPlugin registered
[ObservabilityPlugin] Initialized successfully with graphql transport
[ObservabilityPlugin] Recorded invocation start: <uuid> for correlation: <uuid>
...
[ObservabilityPlugin.flush] Starting flush - invocations: 1, eventExecutions: 45, jobExecutions: 2
[GraphQLTransport] Upserted 1 invocations
[GraphQLTransport] Inserted 45 event executions
[GraphQLTransport] Inserted 2 job executions
```

## If Still Not Working

Run this command to verify the endpoint configuration:
```bash
cd /Users/robnewton/Github/event-handlers
node -e "const config = require('./functions/~lib/config.backend'); console.log('Endpoint:', config.graphqlUrl); console.log('Has Secret:', !!config.graphqlSecret);"
```

This will show you exactly what endpoint and secret the Netlify function is using.
