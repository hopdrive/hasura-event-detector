# Updated By Correlation Plugin

A specialized plugin that extracts correlation IDs specifically from the `updated_by` field in Hasura event payloads, ideal for tracking user actions and API modifications.

## Overview

The UpdatedByCorrelationPlugin focuses on extracting correlation IDs from the `updated_by` field in database records. This is particularly useful when your application stores user or system identifiers with correlation IDs in the format like `"user.correlation-id"` or `"system.workflow.correlation-id"`.

## Features

- **Pattern-Based Extraction**: Uses regex patterns to extract correlation IDs from `updated_by` fields
- **UUID Validation**: Validates extracted IDs match UUID format
- **Operation Filtering**: Can be configured to only process UPDATE operations
- **Flexible Patterns**: Supports various `updated_by` field formats
- **Fallback Safety**: Won't interfere if correlation ID is already present

## Configuration

```typescript
import { UpdatedByCorrelationPlugin } from './example-plugins/updated-by-correlation/plugin.js';

const updatedByCorrelation = new UpdatedByCorrelationPlugin({
  enabled: true,

  // Pattern to extract correlation ID (captures the UUID part after the last dot)
  extractionPattern: /^.+\\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,

  // Validate that extracted ID is a valid UUID format
  validateUuidFormat: true,

  // Only process UPDATE operations (where updated_by is typically set)
  updateOperationsOnly: true
});
```

## Usage

```typescript
import { pluginManager } from '@hopdrive/hasura-event-detector';
import { UpdatedByCorrelationPlugin } from './example-plugins/updated-by-correlation/plugin.js';

// Register the plugin
const updatedByCorrelation = new UpdatedByCorrelationPlugin({
  extractionPattern: /user\\.(.+)$/,  // Extract from "user.correlation-id"
  updateOperationsOnly: true
});

pluginManager.register(updatedByCorrelation);

// Initialize the plugin system
await pluginManager.initialize();

// Now UPDATE events with updated_by fields will have correlation IDs extracted
```

## Supported Formats

The plugin can extract correlation IDs from various `updated_by` field formats:

### Standard User Format
```sql
UPDATE users
SET name = 'John Doe', updated_by = 'user.12345678-1234-1234-1234-123456789abc'
WHERE id = 1;
```
**Extracted ID**: `12345678-1234-1234-1234-123456789abc`

### System Workflow Format
```sql
UPDATE orders
SET status = 'processed', updated_by = 'system.workflow.abcd-1234-efgh-5678-ijkl'
WHERE id = 100;
```
**Extracted ID**: `abcd-1234-efgh-5678-ijkl`

### API Gateway Format
```sql
UPDATE products
SET price = 29.99, updated_by = 'api-gateway.correlation-abc123-def456'
WHERE sku = 'PROD-001';
```
**Extracted ID**: `correlation-abc123-def456` (if matches UUID format)

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `extractionPattern` | `RegExp` | UUID pattern | Regex to extract correlation ID |
| `validateUuidFormat` | `boolean` | `true` | Validate extracted ID is UUID format |
| `updateOperationsOnly` | `boolean` | `true` | Only process UPDATE operations |

## Custom Patterns

You can customize the extraction pattern for your specific use case:

### Extract from prefix format
```typescript
// For "correlation:abc-123-def" format
new UpdatedByCorrelationPlugin({
  extractionPattern: /^correlation:(.+)$/
});
```

### Extract from JSON format
```typescript
// For JSON format: '{"user": "123", "correlationId": "abc-def"}'
new UpdatedByCorrelationPlugin({
  extractionPattern: /"correlationId":\s*"([^"]+)"/,
  validateUuidFormat: false  // Since it might not be UUID format
});
```

### Extract any UUID-like string
```typescript
// Extract any UUID-like pattern anywhere in the string
new UpdatedByCorrelationPlugin({
  extractionPattern: /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
});
```

## Integration

This plugin works seamlessly with the event detector's correlation ID system:

```typescript
// Example: Track user modifications with correlation IDs
const updatedByCorrelation = new UpdatedByCorrelationPlugin({
  extractionPattern: /user\\.(.+)$/,
  updateOperationsOnly: true
});

pluginManager.register(updatedByCorrelation);

// When processing events, correlation IDs will be automatically extracted
await listenTo(hasuraEvent, {
  autoLoadEventModules: true
  // Plugin automatically extracts correlationId from updated_by field
});
```

## Event Processing Flow

1. **Event Validation**: Plugin checks if event is an UPDATE operation (if configured)
2. **Field Extraction**: Looks for `updated_by` field in the event data
3. **Pattern Matching**: Applies regex pattern to extract correlation ID
4. **UUID Validation**: Validates extracted ID format (if enabled)
5. **Options Update**: Sets the correlation ID in `options.correlationId`
6. **Fallback**: Skips if correlation ID is already present in options

## Use Cases

- **User Action Tracking**: Link user modifications to correlation IDs for audit trails
- **API Request Correlation**: Track API modifications through your system
- **Workflow Tracing**: Follow automated system updates through correlation
- **Debug Assistance**: Connect database changes to originating requests
- **Compliance Logging**: Maintain audit trails with proper correlation

## Best Practices

1. **Consistent Format**: Use consistent `updated_by` field formats across your application
2. **UUID Standards**: Stick to standard UUID formats for better compatibility
3. **Operation Filtering**: Enable `updateOperationsOnly` for better performance
4. **Pattern Testing**: Test your extraction patterns with real data
5. **Validation**: Keep `validateUuidFormat` enabled to ensure data quality

## Troubleshooting

### Common Issues

**Correlation ID not extracted**:
- Check that `updated_by` field contains the expected format
- Verify your regex pattern matches your data format
- Ensure the event is an UPDATE operation (if filtering enabled)

**Invalid UUID format errors**:
- Disable `validateUuidFormat` if using non-UUID correlation IDs
- Adjust your extraction pattern to match your ID format

**Plugin not processing events**:
- Verify the plugin is registered and initialized
- Check that `enabled` is set to `true`
- Ensure events contain `updated_by` fields