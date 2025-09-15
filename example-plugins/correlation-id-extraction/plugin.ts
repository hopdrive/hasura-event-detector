/**
 * Correlation ID Extraction Plugin
 *
 * This plugin demonstrates how to extract correlation IDs from Hasura event payloads
 * using the plugin system. It provides various extraction strategies that can be
 * customized based on your application's data structure.
 */

import type { HasuraEventPayload, ParsedHasuraEvent, PluginName, PluginConfig, ListenToOptions } from '../../src/types';
import { BasePlugin } from '../../src/plugin';
import { log, logWarn } from '../../src/helpers/log';
import { parseHasuraEvent } from '../../src/helpers/hasura';

export interface CorrelationIdExtractionConfig extends PluginConfig {
  enabled?: boolean;
  // Enable specific extraction strategies
  extractFromUpdatedBy?: boolean;
  extractFromMetadata?: boolean;
  extractFromSession?: boolean;
  extractFromCustomField?: string;
  // Pattern matching for updated_by field (e.g., "prefix.uuid")
  updatedByPattern?: RegExp;
  // Session variable names to check
  sessionVariables?: string[];
  // Metadata keys to check
  metadataKeys?: string[];
}

export class CorrelationIdExtractionPlugin extends BasePlugin<CorrelationIdExtractionConfig> {
  constructor(config: Partial<CorrelationIdExtractionConfig> = {}) {
    const defaultConfig: CorrelationIdExtractionConfig = {
      enabled: true,
      extractFromUpdatedBy: true,
      extractFromMetadata: true,
      extractFromSession: true,
      // Default pattern: extract correlation ID from "something.correlation_id.source_job_id" format (2nd position)
      // Also supports legacy "something.correlation_id" format for backward compatibility
      updatedByPattern: /^[^.]+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[^.]+)?$/i,
      sessionVariables: ['x-correlation-id', 'x-request-id', 'x-trace-id'],
      metadataKeys: ['correlation_id', 'trace_id', 'request_id', 'workflow_id'],
      ...config,
    };
    super(defaultConfig);
  }

  /**
   * Pre-configure hook - extract correlation ID and set in options before processing
   */
  async onPreConfigure(
    hasuraEvent: HasuraEventPayload,
    options: Partial<ListenToOptions>
  ): Promise<Partial<ListenToOptions>> {
    if (!this.enabled) return options;

    // Parse the Hasura event to get structured data
    const parsedEvent = parseHasuraEvent(hasuraEvent);

    log('CorrelationIdExtraction', 'Starting correlation ID extraction');

    // Strategy 1: Extract from updated_by field with pattern matching
    if (this.config.extractFromUpdatedBy) {
      const updatedByResult = this.extractFromUpdatedBy(parsedEvent);
      if (updatedByResult) {
        log('CorrelationIdExtraction', `Extracted from updated_by: ${updatedByResult}`);
        return { ...options, correlationId: updatedByResult };
      }
    }

    // Strategy 2: Extract from custom field
    if (this.config.extractFromCustomField) {
      const customFieldResult = this.extractFromCustomField(parsedEvent, this.config.extractFromCustomField);
      if (customFieldResult) {
        log('CorrelationIdExtraction', `Extracted from custom field: ${customFieldResult}`);
        return { ...options, correlationId: customFieldResult };
      }
    }

    // Strategy 3: Extract from metadata/JSON fields
    if (this.config.extractFromMetadata) {
      const metadataResult = this.extractFromMetadata(parsedEvent);
      if (metadataResult) {
        log('CorrelationIdExtraction', `Extracted from metadata: ${metadataResult}`);
        return { ...options, correlationId: metadataResult };
      }
    }

    // Strategy 4: Extract from session variables
    if (this.config.extractFromSession) {
      const sessionResult = this.extractFromSession(parsedEvent);
      if (sessionResult) {
        log('CorrelationIdExtraction', `Extracted from session: ${sessionResult}`);
        return { ...options, correlationId: sessionResult };
      }
    }

    log('CorrelationIdExtraction', 'No correlation ID found in payload');
    return options;
  }

  /**
   * Extract correlation ID from updated_by field using pattern matching
   * Supports formats like:
   * - "something.correlation_id.source_job_id" (new format with source job tracking)
   * - "something.correlation_id" (legacy format)
   */
  private extractFromUpdatedBy(parsedEvent: ParsedHasuraEvent): string | null {
    if (parsedEvent.operation !== 'UPDATE') return null;

    const updatedBy = parsedEvent.dbEvent?.new?.updated_by;
    if (!updatedBy || typeof updatedBy !== 'string') return null;

    // Check if updated_by matches the correlation ID pattern
    if (this.config.updatedByPattern) {
      const match = updatedBy.match(this.config.updatedByPattern);
      if (match && match[1]) {
        return match[1]; // Return the captured correlation ID (2nd position)
      }
    }

    // Fallback: check if the whole updated_by value is a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(updatedBy)) {
      return updatedBy;
    }

    return null;
  }

  /**
   * Extract correlation ID from a custom field
   */
  private extractFromCustomField(parsedEvent: ParsedHasuraEvent, fieldName: string): string | null {
    const newData = parsedEvent.dbEvent?.new;
    if (!newData) return null;

    const fieldValue = newData[fieldName];
    if (fieldValue && typeof fieldValue === 'string' && fieldValue.length > 0) {
      return fieldValue;
    }

    return null;
  }

  /**
   * Extract correlation ID from metadata or JSON fields
   */
  private extractFromMetadata(parsedEvent: ParsedHasuraEvent): string | null {
    const newData = parsedEvent.dbEvent?.new;
    if (!newData) return null;

    // Check each configured metadata key
    for (const key of this.config.metadataKeys || []) {
      // Direct field check
      const directValue = newData[key];
      if (directValue && typeof directValue === 'string' && directValue.length > 0) {
        return directValue;
      }

      // Check in metadata object
      const metadata = newData.metadata;
      if (metadata && typeof metadata === 'object' && metadata[key]) {
        const metadataValue = metadata[key];
        if (typeof metadataValue === 'string' && metadataValue.length > 0) {
          return metadataValue;
        }
      }

      // Check in other common JSON fields
      for (const jsonField of ['data', 'properties', 'attributes']) {
        const jsonData = newData[jsonField];
        if (jsonData && typeof jsonData === 'object' && jsonData[key]) {
          const jsonValue = jsonData[key];
          if (typeof jsonValue === 'string' && jsonValue.length > 0) {
            return jsonValue;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract correlation ID from Hasura session variables
   */
  private extractFromSession(parsedEvent: ParsedHasuraEvent): string | null {
    const sessionVars = parsedEvent.sessionVariables;
    if (!sessionVars) return null;

    for (const varName of this.config.sessionVariables || []) {
      const sessionValue = sessionVars[varName];
      if (sessionValue && typeof sessionValue === 'string' && sessionValue.length > 0) {
        return sessionValue;
      }
    }

    return null;
  }
}

// Example usage configurations

/**
 * Basic configuration - uses default extraction strategies
 */
export const basicCorrelationIdPlugin = new CorrelationIdExtractionPlugin();

/**
 * Updated-by pattern extraction only
 */
export const updatedByOnlyPlugin = new CorrelationIdExtractionPlugin({
  extractFromUpdatedBy: true,
  extractFromMetadata: false,
  extractFromSession: false,
  // Extract correlation ID from "user:12345.correlation-id.source-job-id" format (2nd position)
  updatedByPattern: /^user:\d+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[^.]+)?$/i
});

/**
 * Custom field extraction
 */
export const customFieldPlugin = new CorrelationIdExtractionPlugin({
  extractFromUpdatedBy: false,
  extractFromMetadata: false,
  extractFromSession: false,
  extractFromCustomField: 'process_id'
});

/**
 * Multi-tenant extraction with session variables
 */
export const multiTenantPlugin = new CorrelationIdExtractionPlugin({
  extractFromSession: true,
  sessionVariables: ['x-hasura-tenant-id', 'x-correlation-id', 'x-workflow-id'],
  extractFromMetadata: true,
  metadataKeys: ['tenant_correlation_id', 'workflow_id']
});

export default CorrelationIdExtractionPlugin;