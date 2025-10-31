# Test Payloads

This directory contains sample Hasura event payloads for testing the event detector.

## Available Payloads

1. **move-active-change.json** - Tests the `move.active.change` event
   - Changes `active` from 1 to 0
   - Triggers: `runAR`, `runDriverPay` jobs

2. **move-dispatched.json** - Tests the `move.dispatched` event
   - Changes status from "planned" to "dispatched"
   - Assigns a driver

3. **move-created.json** - Tests the `move.created` event
   - INSERT operation (old is null)
   - Creates a new move

## Adding New Payloads

To add a new test payload:

1. Create a new `.json` file in this directory
2. Use one of the existing files as a template
3. Modify the `event.data.old` and `event.data.new` fields to trigger your desired event
4. Update the `id` field to be unique
5. The test script will automatically discover it

## Customizing Payloads

Feel free to edit these files to test different scenarios:
- Change field values to test edge cases
- Modify session variables to test different user roles
- Add/remove fields to test validation logic

## Usage

```bash
# Use a specific payload
./test-with-database.sh test-payloads/move-dispatched.json

# Use a random payload
./test-with-database.sh

# Without database writes
node test-with-real-payload.js test-payloads/move-created.json
```
