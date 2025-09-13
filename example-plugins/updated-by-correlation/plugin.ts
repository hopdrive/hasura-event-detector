/**
 * Updated By Correlation ID Plugin
 * 
 * This plugin demonstrates how to extract correlation IDs from the `updated_by` 
 * field in Hasura event payloads using pattern matching. It shows the complete
 * flow of reading from the database event payload, validating the format,
 * extracting the UUID part, and setting it in options.correlationId.
 * 
 * Example updated_by formats supported:
 * - "user.12345678-1234-1234-1234-123456789abc" → extracts "12345678-1234-1234-1234-123456789abc"
 * - "system.workflow.abcd-1234-efgh-5678-ijkl" → extracts "abcd-1234-efgh-5678-ijkl"
 * - "api-gateway.abc123-def456-ghi789" → extracts "abc123-def456-ghi789" (if UUID format)
 */

import type {
  HasuraEventPayload,
  BasePluginInterface,
  PluginName,
  PluginConfig,
  ListenToOptions,
  ParsedHasuraEvent
} from '@/types/index.js';
import { log, logWarn } from '@/helpers/log.js';
import { parseHasuraEvent } from '@/helpers/hasura.js';

export interface UpdatedByCorrelationConfig extends PluginConfig {
  enabled?: boolean;
  // Pattern to extract correlation ID from updated_by field
  extractionPattern?: RegExp;
  // Whether to validate extracted ID as UUID format
  validateUuidFormat?: boolean;
  // Whether to only process UPDATE operations
  updateOperationsOnly?: boolean;
}

export class UpdatedByCorrelationPlugin implements BasePluginInterface<UpdatedByCorrelationConfig> {
  readonly name = 'updated-by-correlation' as PluginName;
  readonly config: UpdatedByCorrelationConfig;
  readonly enabled: boolean;

  constructor(config: Partial<UpdatedByCorrelationConfig> = {}) {
    this.config = {
      enabled: true,
      // Default pattern: extract anything after the last dot that looks like a UUID
      extractionPattern: /^.+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
      validateUuidFormat: true,
      updateOperationsOnly: true,
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
   * onPreConfigure hook - runs before correlation ID processing
   * This is where we can modify options.correlationId based on the updated_by field
   */
  async onPreConfigure(
    hasuraEvent: HasuraEventPayload,
    options: Partial<ListenToOptions>
  ): Promise<Partial<ListenToOptions>> {
    if (!this.enabled) return options;

    // Parse the Hasura event to get structured data
    const parsedEvent = parseHasuraEvent(hasuraEvent);
    
    // Only process UPDATE operations if configured to do so
    if (this.config.updateOperationsOnly && parsedEvent.operation !== 'UPDATE') {
      log('UpdatedByCorrelation', `Skipping non-UPDATE operation: ${parsedEvent.operation}`);
      return options;
    }

    // Get the updated_by field from the database event
    const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
    
    if (!updatedBy || typeof updatedBy !== 'string') {
      log('UpdatedByCorrelation', 'No updated_by field found or not a string');
      return options;
    }

    log('UpdatedByCorrelation', `Checking updated_by field: ${updatedBy}`);

    // Extract correlation ID using the configured pattern
    const extractedId = this.extractCorrelationId(updatedBy);
    
    if (extractedId) {
      log('UpdatedByCorrelation', `✅ Extracted correlation ID: ${extractedId}`);
      
      // Set the correlation ID in options (this takes precedence over other extraction methods)
      return {
        ...options,
        correlationId: extractedId
      };
    } else {
      log('UpdatedByCorrelation', `❌ No valid correlation ID found in updated_by: ${updatedBy}`);
      return options;
    }
  }

  /**
   * Extract correlation ID from updated_by field using pattern matching
   */
  private extractCorrelationId(updatedBy: string): string | null {
    if (!this.config.extractionPattern) {
      logWarn('UpdatedByCorrelation', 'No extraction pattern configured');
      return null;
    }

    // Apply the extraction pattern
    const match = updatedBy.match(this.config.extractionPattern);
    
    if (!match || !match[1]) {
      log('UpdatedByCorrelation', `Pattern did not match: ${this.config.extractionPattern}`);
      return null;
    }

    const extractedId = match[1];
    log('UpdatedByCorrelation', `Pattern matched, extracted: ${extractedId}`);

    // Validate UUID format if configured to do so
    if (this.config.validateUuidFormat) {
      if (!this.isValidUuidFormat(extractedId)) {
        logWarn('UpdatedByCorrelation', `Extracted ID is not valid UUID format: ${extractedId}`);
        return null;
      }
    }

    return extractedId;
  }

  /**
   * Validate that the extracted ID is in UUID format
   */
  private isValidUuidFormat(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

// Example configurations for different use cases

/**
 * Basic plugin with default configuration
 * Extracts UUID from "anything.uuid" pattern in updated_by field
 */
export const basicUpdatedByPlugin = new UpdatedByCorrelationPlugin();

/**
 * User-scoped correlation ID extraction
 * Example: "user:12345.abc-def-ghi" → extracts "abc-def-ghi"
 */
export const userScopedPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^user:\d+\.([0-9a-f-]{36})$/i,
  validateUuidFormat: true
});

/**
 * System workflow extraction
 * Example: "system.workflow.my-correlation-id" → extracts "my-correlation-id"
 */
export const systemWorkflowPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^system\.workflow\.(.+)$/i,
  validateUuidFormat: false, // Allow non-UUID correlation IDs
  updateOperationsOnly: true
});

/**
 * API Gateway correlation extraction
 * Example: "api-gateway.request-123.correlation-abc" → extracts "correlation-abc"
 */
export const apiGatewayPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^api-gateway\.[^.]+\.(.+)$/i,
  validateUuidFormat: false
});

/**
 * Multi-prefix extraction (handles multiple patterns)
 * Handles: "user.uuid", "system.uuid", "workflow.uuid"
 */
export const multiPrefixPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^(?:user|system|workflow)\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  validateUuidFormat: true
});

/**
 * Strict UUID extraction (only accepts perfect UUID format after dot)
 */
export const strictUuidPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^[^.]+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  validateUuidFormat: true,
  updateOperationsOnly: true
});

// Example usage:
/*
import { listenTo } from '@hopdrive/hasura-event-detector';
import { UpdatedByCorrelationPlugin } from './plugins/updated-by-correlation-plugin';

// Create and register the plugin
const correlationPlugin = new UpdatedByCorrelationPlugin({
  extractionPattern: /^user\.([0-9a-f-]{36})$/i,
  validateUuidFormat: true
});

// Register plugin with plugin manager (implementation depends on your plugin system)
pluginManager.register(correlationPlugin);

// Now when you call listenTo, the plugin will automatically extract correlation IDs
const result = await listenTo(hasuraEvent, {
  autoLoadEventModules: true,
  eventModulesDirectory: './events'
});

// The plugin will have extracted the correlation ID from updated_by and set it in options
// Jobs will receive the correlation ID via options.correlationId
*/

export default UpdatedByCorrelationPlugin;