# Grafana Logs Integration Implementation

This document describes the implementation of Grafana Loki log viewing directly in the Hasura Event Detector console UI.

## Overview

Users can now view logs from Grafana Cloud directly in the flow diagram screen when a node is selected. Logs appear in a new "Logs" tab in the side modal for each node type.

## Architecture

### 1. GrafanaService (`src/services/GrafanaService.ts`)

A service layer that handles all Grafana Loki API interactions:

**Key Features:**
- LogQL query building for different node types
- Loki API authentication using Basic Auth
- Response parsing with JSON log extraction
- Time-range filtering (±15 minutes from event time by default)
- Error handling for API failures

**Query Strategy by Node Type:**

```typescript
// Invocation Node - All logs for entire invocation
{app="event-handlers", invocationId="<invocationId>"}

// Event Node - Logs for specific event + its jobs
{app="event-handlers", correlationId="<correlationId>", eventExecutionId="<eventExecutionId>"}

// Job Node - Logs for specific job execution
{app="event-handlers", scopeId="<scopeId>", jobExecutionId="<jobExecutionId>"}
```

**Log Label Structure** (from @hopdrive/logger):
- `app`: Application name
- `environment`: Environment (production, test, local)
- `function`: Function name
- `invocationId`: Unique per-request ID
- `scopeId`: Unique per-job scope (from `withLogScope`)
- `correlationId`: Correlation ID for tracing
- `eventExecutionId`: Event execution ID (coming soon)
- `jobExecutionId`: Job execution ID (coming soon)

### 2. LogsViewer Component (`src/components/LogsViewer.tsx`)

A reusable React component for displaying logs with multiple view modes:

**Features:**
- **Three view modes**: Text (default), JSON, Table
- **Search/filter**: Real-time filtering of logs by content
- **Live refresh**: Auto-refresh every 5 seconds for running jobs
- **Auto-scroll**: Automatic scrolling for streaming logs (disable on user scroll)
- **Copy to clipboard**: Export logs in any view format
- **Pagination**: Load 100 logs initially, with "Load More" button
- **Color-coded log levels**: Info (blue), Warn (yellow), Error (red), Debug (gray)
- **Skeleton loading**: Loading state while fetching logs
- **Error handling**: Clear error messages with retry button

**View Modes:**

1. **Text View** (default):
   - Timestamp + Level + Message
   - Color-coded by log level
   - Monospace font for readability

2. **JSON View**:
   - Full JSON tree view of log entries
   - Expandable/collapsible nodes
   - Syntax highlighted

3. **Table View**:
   - Structured table with columns: Timestamp, Level, Message
   - Sortable and scrollable
   - Good for comparing multiple logs

### 3. Drawer Integration

Added "Logs" tab to all three detail drawers:

#### JobDetailDrawer (`src/components/JobDetailDrawer.tsx`)
- Shows logs filtered by `scopeId` and `jobExecutionId`
- Auto-refreshes when job status is "running"
- Ideal for debugging individual job executions

#### EventDetailDrawer (`src/components/EventDetailDrawer.tsx`)
- Shows logs for event detection + all associated jobs
- Filtered by `correlationId` and `eventExecutionId`
- Helps trace event processing flow

#### InvocationDetailDrawer (`src/components/InvocationDetailDrawer.tsx`)
- Shows all logs for the entire invocation
- Filtered by `invocationId`
- Complete view of the entire event processing pipeline

## Configuration

### Environment Variables

Set these in your `.env` file:

```bash
VITE_GRAFANA_HOST=https://hopdrive.grafana.net
VITE_GRAFANA_ID=123456
VITE_GRAFANA_SECRET=glsa_xxxxxxxxxxxxxxxxxxxx
```

### Authentication

Uses Basic Auth with Grafana Cloud API:
```
Authorization: Basic base64(userId:apiSecret)
```

### Time Range

Default: ±15 minutes from event time
- Configurable per query
- Prevents fetching excessive log data

## Usage

1. **Set up environment variables** with your Grafana Cloud credentials
2. **Start the console**: `npm run start`
3. **Click any node** in the flow diagram
4. **Switch to "Logs" tab** in the detail drawer
5. **View, search, and export logs** as needed

### For Running Jobs

Logs auto-refresh every 5 seconds when a job is running, providing a tail-like CLI experience.

### Searching Logs

Use the search box to filter logs by:
- Message content
- Log level
- Label values

### Exporting Logs

Click the clipboard icon to copy all logs in the current view format:
- **Text**: One line per log entry
- **JSON**: Full JSON array
- **Table**: CSV format

## Error Handling

### Graceful Degradation

If Grafana is not configured or unavailable:
1. The "Logs" tab still appears
2. Shows a helpful message about missing configuration
3. Console UI continues to work normally
4. No impact on other features

### Error States

- **No configuration**: Shows setup instructions
- **API error**: Displays error message with retry button
- **No logs found**: Clear "No logs found" message
- **Network timeout**: Automatic retry with exponential backoff

## Performance Considerations

### No Caching
- Logs are fetched fresh on each request
- Ensures up-to-date information
- Can add caching later if needed

### Lazy Loading
- Initial load: 100 logs
- "Load More" button for additional logs
- Prevents overwhelming the UI with large log volumes

### Auto-scroll Behavior
- Automatically scrolls to bottom for new logs
- Disables when user scrolls manually
- Re-enables when user scrolls back to bottom

## Future Enhancements

### Potential Improvements

1. **Log Level Filtering**: Add buttons to filter by level (info, warn, error)
2. **Time Range Selector**: Allow users to adjust time range
3. **Advanced LogQL Editor**: For power users to write custom queries
4. **Log Context**: Click a log to see surrounding logs
5. **Syntax Highlighting**: Chrome DevTools-style console log coloring
6. **Download Logs**: Download as file instead of clipboard only
7. **Log Streaming**: WebSocket connection for true real-time logs
8. **Metrics Integration**: Show log rate and error rate charts

### Label Updates

The implementation assumes the following labels will be added to @hopdrive/logger:
- `correlationId`: Already being added
- `eventExecutionId`: Coming soon
- `jobExecutionId`: Coming soon

Once these are available, the log queries will be more precise and performant.

## Testing

To test the implementation:

1. **Set up Grafana credentials** in `.env`
2. **Run an event handler** that generates logs
3. **Open the console** and navigate to the flow diagram
4. **Click a job node** and switch to "Logs" tab
5. **Verify logs appear** with correct filtering
6. **Test search** by entering keywords
7. **Test view modes** by switching between Text/JSON/Table
8. **Test copy** by clicking the clipboard icon

### Test Scenarios

- ✅ Logs appear for completed jobs
- ✅ Logs auto-refresh for running jobs
- ✅ Search filters logs correctly
- ✅ All view modes display properly
- ✅ Copy to clipboard works in all modes
- ✅ Error handling shows appropriate messages
- ✅ Works without Grafana configuration (graceful degradation)

## Technical Details

### LogQL Query Format

```logql
{app="event-handlers", label="value"}
| json
| line_format "{{.ts}} [{{.level}}] {{.message}}"
```

### API Endpoint

```
GET https://hopdrive.grafana.net/loki/api/v1/query_range
```

**Query Parameters:**
- `query`: LogQL query string
- `start`: Start time (nanoseconds)
- `end`: End time (nanoseconds)
- `limit`: Max logs to return (default: 1000)
- `direction`: `forward` or `backward`

### Response Format

```json
{
  "data": {
    "result": [
      {
        "stream": {
          "app": "event-handlers",
          "level": "info",
          ...
        },
        "values": [
          ["1234567890000000000", "{\"message\":\"Log message\",\"level\":\"info\"}"]
        ]
      }
    ]
  }
}
```

## Files Created/Modified

### New Files
- `packages/console/src/services/GrafanaService.ts` - Grafana Loki API service
- `packages/console/src/components/LogsViewer.tsx` - Reusable logs viewer component
- `packages/console/.env.example` - Environment variable examples
- `packages/console/GRAFANA_LOGS_IMPLEMENTATION.md` - This document

### Modified Files
- `packages/console/src/components/JobDetailDrawer.tsx` - Added Logs tab
- `packages/console/src/components/EventDetailDrawer.tsx` - Added Logs tab
- `packages/console/src/components/InvocationDetailDrawer.tsx` - Added Logs tab
- `packages/console/README.md` - Added Grafana configuration docs

## Questions & Support

For issues or questions about the Grafana logs integration:

1. Check that environment variables are set correctly
2. Verify Grafana API credentials are valid
3. Ensure logs have the expected labels (`app`, `invocationId`, etc.)
4. Check browser console for API errors
5. Test the Grafana API directly using curl to rule out network issues

Example curl test:
```bash
curl -u "$VITE_GRAFANA_ID:$VITE_GRAFANA_SECRET" \
  "https://hopdrive.grafana.net/loki/api/v1/query_range?query={app=\"event-handlers\"}&limit=10"
```
