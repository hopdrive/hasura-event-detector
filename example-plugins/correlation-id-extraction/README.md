# Correlation ID Extraction Plugin

A flexible plugin that extracts correlation IDs from various sources in Hasura event payloads, enabling distributed tracing and request correlation across your event system.

## Overview

The CorrelationIdExtractionPlugin demonstrates how to extract correlation IDs from Hasura event payloads using multiple extraction strategies. It can pull correlation IDs from `updated_by` fields, session variables, metadata, or custom fields based on your application's data structure.

## Features

- **Multiple Extraction Strategies**: Extract from various data sources
- **Pattern Matching**: Configurable regex patterns for field parsing
- **Session Variable Support**: Extract from Hasura session variables
- **Metadata Parsing**: Pull IDs from event metadata
- **Custom Field Support**: Extract from any custom field
- **Fallback Chain**: Try multiple strategies until one succeeds
- **Validation**: Ensures extracted IDs are valid correlation ID format

## Configuration

```typescript
import { CorrelationIdExtractionPlugin } from './example-plugins/correlation-id-extraction/plugin.js';

const correlationExtractor = new CorrelationIdExtractionPlugin({
  enabled: true,
  extractFromUpdatedBy: true,     // Extract from updated_by field
  extractFromMetadata: true,      // Extract from event metadata
  extractFromSession: true,       // Extract from session variables
  extractFromCustomField: 'trace_id',  // Extract from custom field

  // Pattern to match in updated_by field (e.g., "user.uuid" -> "uuid")
  updatedByPattern: /^.+\\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,

  // Session variables to check for correlation IDs
  sessionVariables: ['x-correlation-id', 'x-request-id', 'x-trace-id'],

  // Metadata keys to check
  metadataKeys: ['correlation_id', 'trace_id', 'request_id', 'workflow_id']
});
```

## Usage

```typescript
import { pluginManager } from '@/plugin.js';
import { CorrelationIdExtractionPlugin } from './example-plugins/correlation-id-extraction/plugin.js';

// Register the plugin
const correlationExtractor = new CorrelationIdExtractionPlugin({
  extractFromUpdatedBy: true,
  sessionVariables: ['x-correlation-id']
});

pluginManager.register(correlationExtractor);

// Initialize the plugin system
await pluginManager.initialize();

// The plugin will now extract correlation IDs during the onPreConfigure phase
```

## Extraction Strategies

### 1. Updated By Field Extraction
Extracts correlation IDs from the `updated_by` field using pattern matching:

```sql
-- If updated_by contains "user.abc-123-def"
-- Pattern extracts "abc-123-def" as correlation ID
UPDATE users SET name='John', updated_by='user.abc-123-def' WHERE id=1;
```

### 2. Session Variable Extraction
Pulls correlation IDs from Hasura session variables:

```json
{
  "event": {
    "session_variables": {
      "x-correlation-id": "abc-123-def",
      "x-hasura-user-id": "123"
    }
  }
}
```

### 3. Metadata Extraction
Extracts from event metadata fields:

```json
{
  "event": {
    "data": {
      "new": { "id": 1, "name": "John" },
      "metadata": {
        "correlation_id": "abc-123-def",
        "source": "api"
      }
    }
  }
}
```

### 4. Custom Field Extraction
Extracts from any specified custom field:

```json
{
  "event": {
    "data": {
      "new": {
        "id": 1,
        "name": "John",
        "trace_id": "abc-123-def"
      }
    }
  }
}
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `extractFromUpdatedBy` | `boolean` | `true` | Extract from updated_by field |
| `extractFromMetadata` | `boolean` | `true` | Extract from event metadata |
| `extractFromSession` | `boolean` | `true` | Extract from session variables |
| `extractFromCustomField` | `string` | `undefined` | Custom field name to extract from |
| `updatedByPattern` | `RegExp` | UUID pattern | Regex pattern for updated_by parsing |
| `sessionVariables` | `string[]` | `['x-correlation-id', ...]` | Session variable names to check |
| `metadataKeys` | `string[]` | `['correlation_id', ...]` | Metadata keys to check |

## Integration

This plugin integrates with the event detector's correlation ID system:

```typescript
// Example: Auto-extract correlation IDs for all events
const correlationExtractor = new CorrelationIdExtractionPlugin({
  extractFromUpdatedBy: true,
  updatedByPattern: /user\.(.+)$/,  // Extract from "user.correlation-id"
});

pluginManager.register(correlationExtractor);

// Now all events will have correlation IDs automatically extracted
await listenTo(hasuraEvent, {
  autoLoadEventModules: true
  // No need to manually specify correlationId - plugin extracts it!
});
```

## Use Cases

- **Distributed Tracing**: Track requests across microservices
- **Audit Logging**: Correlate user actions with event processing
- **Debug Assistance**: Link related events and jobs together
- **Performance Analysis**: Group related operations for metrics
- **Request Flow**: Follow data changes through your system

## Best Practices

1. **Use consistent patterns** across your application for correlation ID storage
2. **Configure multiple extraction strategies** as fallbacks
3. **Validate correlation ID format** to ensure consistency
4. **Document your correlation ID conventions** for team members
5. **Test extraction patterns** with your actual data structures

## Custom Patterns

You can customize extraction patterns for your specific use case:

```typescript
// Extract from custom format: "workflow:abc-123:step:2"
const customExtractor = new CorrelationIdExtractionPlugin({
  extractFromCustomField: 'workflow_context',
  // Custom pattern to extract correlation ID from complex format
  updatedByPattern: /workflow:([^:]+):/
});
```