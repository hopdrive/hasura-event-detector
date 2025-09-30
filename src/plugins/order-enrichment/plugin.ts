/**
 * Order Enrichment Plugin Example
 *
 * This plugin demonstrates how to enrich Hasura event payloads with related records
 * to prevent N+1 database queries in event detectors and jobs.
 *
 * It modifies the payload by reference in the onPreConfigure hook, ensuring all
 * subsequent event detectors and jobs have access to the enriched data.
 */

import type { BasePluginInterface } from '../../types';
import type {
  HasuraEventPayload,
  ParsedHasuraEvent,
  PluginName,
  PluginConfig,
  ListenToOptions
} from '../../types';
import { log, logWarn, parseHasuraEvent } from '../../helpers/index';

export interface OrderEnrichmentConfig extends PluginConfig {
  enabled?: boolean;
  // Database connection for enrichment queries
  database?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  // Tables to enrich
  enrichTables?: string[];
  // Maximum related records to fetch
  maxRelatedRecords?: number;
  // Cache TTL for enrichment data (seconds)
  cacheTtl?: number;
}

export class OrderEnrichmentPlugin implements BasePluginInterface<OrderEnrichmentConfig> {
  readonly name = 'order-enrichment' as PluginName;
  readonly config: OrderEnrichmentConfig;
  readonly enabled: boolean;

  constructor(config: Partial<OrderEnrichmentConfig> = {}) {
    this.config = {
      enabled: true,
      enrichTables: ['orders', 'shipments', 'bookings'],
      maxRelatedRecords: 50,
      cacheTtl: 300, // 5 minutes
      ...config
    };
    this.enabled = this.config.enabled ?? true;
  }

  getStatus() {
    return {
      name: this.name,
      enabled: this.enabled,
      config: this.config
    };
  }

  /**
   * Pre-configure hook - enrich payload with related data and extract correlation ID
   */
  async onPreConfigure(
    hasuraEvent: HasuraEventPayload,
    options: Partial<ListenToOptions>
  ): Promise<Partial<ListenToOptions>> {
    if (!this.enabled) return options;

    const parsedEvent = parseHasuraEvent(hasuraEvent);

    // Step 1: ENRICH PAYLOAD (by reference) - happens first
    await this.enrichPayloadWithRelatedData(hasuraEvent, parsedEvent);

    // Step 2: EXTRACT CORRELATION ID - happens after enrichment
    const correlationId = this.extractCorrelationId(parsedEvent);

    return correlationId ? { ...options, correlationId } : options;
  }

  /**
   * Enrich the Hasura payload with related records to prevent N+1 queries
   */
  private async enrichPayloadWithRelatedData(
    hasuraEvent: HasuraEventPayload,
    parsedEvent: ParsedHasuraEvent
  ): Promise<void> {
    const tableName = hasuraEvent.table?.name;

    // Only enrich configured tables
    if (!this.config.enrichTables?.includes(tableName)) {
      return;
    }

    // Only enrich UPDATE and INSERT operations that have new data
    if (!parsedEvent.dbEvent?.new) {
      return;
    }

    const recordId = parsedEvent.dbEvent.new.id;
    if (!recordId) {
      logWarn('OrderEnrichment', 'No record ID found for enrichment');
      return;
    }

    log('OrderEnrichment', `Enriching ${tableName} record ${recordId} with related data`);

    try {
      // Fetch related data based on table type
      let relatedData = {};

      switch (tableName) {
        case 'orders':
          relatedData = await this.fetchOrderRelatedData(recordId);
          break;
        case 'shipments':
          relatedData = await this.fetchShipmentRelatedData(recordId);
          break;
        case 'bookings':
          relatedData = await this.fetchBookingRelatedData(recordId);
          break;
      }

      // Modify the payload directly by reference
      // All event detectors and jobs will see this enriched data
      hasuraEvent.event.data.new = {
        ...hasuraEvent.event.data.new,
        ...relatedData,
        // Add enrichment metadata
        __enriched: {
          enriched_at: new Date().toISOString(),
          enriched_by: this.name,
          enriched_tables: Object.keys(relatedData)
        }
      };

      const enrichedKeys = Object.keys(relatedData);
      log('OrderEnrichment', `✅ Enriched ${tableName} ${recordId} with: ${enrichedKeys.join(', ')}`);

    } catch (error) {
      logWarn('OrderEnrichment',
        `Failed to enrich ${tableName} ${recordId}`,
        error as Error
      );
      // Don't throw - continue processing even if enrichment fails
    }
  }

  /**
   * Fetch order-related data in a single optimized query
   */
  private async fetchOrderRelatedData(orderId: string): Promise<Record<string, any>> {
    // In a real application, this would be a single database query
    // joining multiple tables for optimal performance

    // Simulated database query result
    return {
      // Child lanes for this order
      lanes: [
        {
          id: 'lane_1',
          order_id: orderId,
          pickup_location: 'Seattle, WA',
          delivery_location: 'Portland, OR',
          distance_miles: 173,
          status: 'assigned'
        },
        {
          id: 'lane_2',
          order_id: orderId,
          pickup_location: 'Portland, OR',
          delivery_location: 'San Francisco, CA',
          distance_miles: 635,
          status: 'pending'
        }
      ],

      // Assigned driver details
      driver: {
        id: 'driver_123',
        name: 'John Smith',
        phone: '+1-555-0123',
        license_class: 'CDL-A',
        status: 'available',
        current_location: {
          lat: 47.6062,
          lng: -122.3321
        }
      },

      // Vehicle information
      vehicle: {
        id: 'truck_456',
        make: 'Peterbilt',
        model: '579',
        year: 2022,
        vin: '1XP5DB9X5ND123456',
        capacity_lbs: 80000,
        fuel_type: 'diesel'
      },

      // Customer details
      customer: {
        id: 'customer_789',
        company_name: 'Acme Corp',
        contact_name: 'Jane Doe',
        email: 'jane@acme.com',
        phone: '+1-555-0456',
        billing_address: {
          street: '123 Business St',
          city: 'Seattle',
          state: 'WA',
          zip: '98101'
        }
      }
    };
  }

  /**
   * Fetch shipment-related data
   */
  private async fetchShipmentRelatedData(shipmentId: string): Promise<Record<string, any>> {
    // Simulated shipment enrichment
    return {
      packages: [
        { id: 'pkg_1', weight_lbs: 25, dimensions: '12x8x6' },
        { id: 'pkg_2', weight_lbs: 15, dimensions: '8x6x4' }
      ],
      carrier: {
        id: 'carrier_abc',
        name: 'Fast Shipping Inc',
        tracking_url: 'https://fastship.com/track'
      },
      origin_warehouse: {
        id: 'wh_001',
        name: 'Seattle Distribution Center',
        address: '456 Warehouse Blvd, Seattle, WA'
      }
    };
  }

  /**
   * Fetch booking-related data
   */
  private async fetchBookingRelatedData(bookingId: string): Promise<Record<string, any>> {
    // Simulated booking enrichment
    return {
      appointments: [
        {
          type: 'pickup',
          scheduled_time: '2024-01-15T10:00:00Z',
          location: 'Origin Terminal',
          status: 'confirmed'
        },
        {
          type: 'delivery',
          scheduled_time: '2024-01-16T14:00:00Z',
          location: 'Destination Terminal',
          status: 'pending'
        }
      ],
      route: {
        total_distance_miles: 1200,
        estimated_duration_hours: 18,
        fuel_stops: ['Truck Stop A', 'Truck Stop B']
      }
    };
  }

  /**
   * Extract correlation ID from enriched payload
   */
  private extractCorrelationId(parsedEvent: ParsedHasuraEvent): string | null {
    // Try to extract from updated_by field
    const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
    if (updatedBy && typeof updatedBy === 'string') {
      // Extract UUID from "user.uuid" format
      const match = updatedBy.match(/^user\.([0-9a-f-]{36})$/i);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Try to extract from workflow_id or process_id
    const workflowId = parsedEvent.dbEvent?.new?.workflow_id ||
                       parsedEvent.dbEvent?.new?.process_id;
    if (workflowId && typeof workflowId === 'string') {
      return workflowId;
    }

    return null;
  }
}

// Example usage configurations

/**
 * Production order enrichment with database connection
 */
export const productionOrderEnrichment = new OrderEnrichmentPlugin({
  enabled: true,
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'logistics',
    user: process.env.DB_USER || 'app',
    password: process.env.DB_PASSWORD || 'password'
  },
  enrichTables: ['orders', 'shipments', 'loads', 'bookings'],
  maxRelatedRecords: 100,
  cacheTtl: 600 // 10 minutes
});

/**
 * Development order enrichment with mocked data
 */
export const developmentOrderEnrichment = new OrderEnrichmentPlugin({
  enabled: true,
  enrichTables: ['orders'],
  maxRelatedRecords: 10,
  cacheTtl: 60 // 1 minute for development
});

/**
 * Lightweight enrichment for testing
 */
export const testOrderEnrichment = new OrderEnrichmentPlugin({
  enabled: false, // Disabled by default in tests
  enrichTables: [],
  cacheTtl: 0
});

export default OrderEnrichmentPlugin;