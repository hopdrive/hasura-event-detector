# Order Enrichment Plugin

A powerful data enrichment plugin that automatically fetches related records and enriches Hasura event payloads to prevent N+1 database queries in event detectors and jobs.

## Overview

The OrderEnrichmentPlugin demonstrates how to enrich Hasura event payloads with related database records during the `onPreConfigure` phase. This ensures that all subsequent event detectors and jobs have access to enriched data without needing to make additional database queries, significantly improving performance.

## Features

- **Automatic Data Enrichment**: Fetches related records based on foreign key relationships
- **N+1 Query Prevention**: Eliminates redundant database queries in jobs
- **Configurable Tables**: Specify which tables should be enriched
- **Performance Optimized**: Built-in caching and query limits
- **Database Connection Pooling**: Efficient database connections
- **Error Handling**: Graceful handling of enrichment failures
- **Memory Efficient**: Configurable limits on related record fetching

## Configuration

```typescript
import { OrderEnrichmentPlugin } from './example-plugins/order-enrichment/plugin.js';

const orderEnrichment = new OrderEnrichmentPlugin({
  enabled: true,

  // Database connection for enrichment queries
  database: {
    host: 'localhost',
    port: 5432,
    database: 'your_database',
    user: 'username',
    password: 'password'
  },

  // Tables that should be enriched with related data
  enrichTables: ['orders', 'shipments', 'bookings'],

  // Maximum number of related records to fetch per relationship
  maxRelatedRecords: 50,

  // Cache TTL for enrichment data (seconds)
  cacheTtl: 300  // 5 minutes
});
```

## Usage

```typescript
import { pluginManager } from '@/plugins/plugin-system.js';
import { OrderEnrichmentPlugin } from './example-plugins/order-enrichment/plugin.js';

// Register the plugin
const orderEnrichment = new OrderEnrichmentPlugin({
  enrichTables: ['orders', 'shipments'],
  maxRelatedRecords: 25
});

pluginManager.register(orderEnrichment);

// Initialize the plugin system
await pluginManager.initialize();

// Now events will have enriched data available in jobs
```

## Enrichment Examples

### Order Event Enrichment
When an `orders` table event occurs, the plugin automatically enriches it with:

**Original Event Payload**:
```json
{
  "event": {
    "data": {
      "new": {
        "id": 123,
        "customer_id": 456,
        "status": "confirmed",
        "total": 99.99
      }
    }
  }
}
```

**Enriched Event Payload**:
```json
{
  "event": {
    "data": {
      "new": {
        "id": 123,
        "customer_id": 456,
        "status": "confirmed",
        "total": 99.99,
        "_enriched": {
          "customer": {
            "id": 456,
            "name": "John Doe",
            "email": "john@example.com"
          },
          "order_items": [
            {"id": 1, "product_id": 101, "quantity": 2},
            {"id": 2, "product_id": 102, "quantity": 1}
          ],
          "shipping_address": {
            "id": 789,
            "street": "123 Main St",
            "city": "Anytown"
          }
        }
      }
    }
  }
}
```

## Enrichment Strategies

### 1. Foreign Key Relationships
Automatically detects and follows foreign key relationships:
```typescript
// For orders table, automatically enriches:
// - customer (via customer_id)
// - shipping_address (via shipping_address_id)
// - billing_address (via billing_address_id)
```

### 2. Reverse Relationships
Fetches related records that reference the current record:
```typescript
// For orders table, fetches:
// - order_items (where order_id = orders.id)
// - shipments (where order_id = orders.id)
// - payments (where order_id = orders.id)
```

### 3. Custom Relationships
Configure custom enrichment queries for complex relationships:
```typescript
const orderEnrichment = new OrderEnrichmentPlugin({
  customEnrichments: {
    orders: [
      {
        key: 'recent_orders',
        query: 'SELECT * FROM orders WHERE customer_id = $1 AND created_at > NOW() - INTERVAL \'30 days\' LIMIT 5',
        params: ['customer_id']
      }
    ]
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable the plugin |
| `database` | `DatabaseConfig` | `undefined` | Database connection configuration |
| `enrichTables` | `string[]` | `['orders', 'shipments', 'bookings']` | Tables to enrich |
| `maxRelatedRecords` | `number` | `50` | Max related records per relationship |
| `cacheTtl` | `number` | `300` | Cache TTL in seconds |

## Performance Benefits

### Before Enrichment
```typescript
// Event handler makes multiple queries
export const handler = async (eventName, hasuraEvent) => {
  const order = hasuraEvent.event.data.new;

  // N+1 query problem:
  const customer = await db.query('SELECT * FROM customers WHERE id = $1', [order.customer_id]);
  const items = await db.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const address = await db.query('SELECT * FROM addresses WHERE id = $1', [order.shipping_address_id]);

  // Process with enriched data...
};
```

### After Enrichment
```typescript
// Event handler uses pre-enriched data
export const handler = async (eventName, hasuraEvent) => {
  const order = hasuraEvent.event.data.new;

  // No additional queries needed:
  const customer = order._enriched.customer;
  const items = order._enriched.order_items;
  const address = order._enriched.shipping_address;

  // Process with enriched data...
};
```

## Advanced Usage

### Custom Enrichment Logic
```typescript
class CustomOrderEnrichmentPlugin extends OrderEnrichmentPlugin {
  async enrichOrder(order) {
    // Custom enrichment logic
    const enriched = await super.enrichOrder(order);

    // Add custom calculated fields
    enriched.total_items = enriched.order_items?.length || 0;
    enriched.is_premium_customer = enriched.customer?.tier === 'premium';

    return enriched;
  }
}
```

### Conditional Enrichment
```typescript
const orderEnrichment = new OrderEnrichmentPlugin({
  shouldEnrich: (tableName, operation) => {
    // Only enrich INSERT and UPDATE operations for orders
    return tableName === 'orders' && ['INSERT', 'UPDATE'].includes(operation);
  }
});
```

## Use Cases

- **Order Processing**: Enrich order events with customer, items, and address data
- **Notification Systems**: Pre-load user preferences and contact information
- **Analytics**: Gather related data for comprehensive event analysis
- **Workflow Automation**: Provide complete context for business rule processing
- **API Responses**: Build rich responses without additional queries

## Best Practices

1. **Selective Enrichment**: Only enrich tables that benefit from related data
2. **Limit Related Records**: Set reasonable `maxRelatedRecords` to control memory usage
3. **Use Caching**: Enable caching for frequently accessed related data
4. **Monitor Performance**: Track enrichment query performance and adjust limits
5. **Error Handling**: Ensure jobs can handle cases where enrichment fails

## Troubleshooting

### Common Issues

**Enrichment not working**:
- Verify database connection configuration
- Check that table names are in `enrichTables` array
- Ensure foreign key relationships exist

**Performance issues**:
- Reduce `maxRelatedRecords` limit
- Increase `cacheTtl` for stable data
- Review which tables really need enrichment

**Memory usage high**:
- Lower `maxRelatedRecords`
- Reduce number of tables in `enrichTables`
- Implement custom enrichment with specific field selection