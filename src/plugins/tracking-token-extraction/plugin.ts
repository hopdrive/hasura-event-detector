/**
 * Tracking Token Extraction Plugin
 *
 * This plugin extracts tracking tokens (source, correlationId, jobId) from Hasura event payloads
 * using various strategies. It populates hasuraEvent.__correlationId and hasuraEvent.__sourceJobId
 * for use by other plugins and jobs.
 */

import type { HasuraEventPayload, ParsedHasuraEvent, PluginName, PluginConfig, ListenToOptions } from '../../types';
import { BasePlugin } from '../../plugin';
import { log, logWarn } from '../../helpers/log';
import { parseHasuraEvent } from '../../helpers/hasura';
import { TrackingToken } from '../../helpers/tracking-token';

export interface TrackingTokenExtractionConfig extends PluginConfig {
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

export class TrackingTokenExtractionPlugin extends BasePlugin<TrackingTokenExtractionConfig> {
  constructor(config: Partial<TrackingTokenExtractionConfig> = {}) {
    const defaultConfig: TrackingTokenExtractionConfig = {
      enabled: true,
      extractFromUpdatedBy: true,
      extractFromMetadata: true,
      extractFromSession: true,
      // Default pattern: extract correlation ID from "something.correlation_id.source_job_id" format (2nd position)
      // Also supports "something.correlation_id" format
      updatedByPattern: /^[^.]+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[^.]+)?$/i,
      sessionVariables: ['x-correlation-id', 'x-request-id', 'x-trace-id'],
      metadataKeys: ['correlation_id', 'trace_id', 'request_id', 'workflow_id'],
      ...config,
    };
    super(defaultConfig);
  }

  /**
   * Pre-configure hook - extract tracking token components and set in options/hasuraEvent before processing
   */
  async onPreConfigure(
    hasuraEvent: HasuraEventPayload,
    options: Partial<ListenToOptions>
  ): Promise<Partial<ListenToOptions>> {
    if (!this.enabled) return options;

    // Parse the Hasura event to get structured data
    const parsedEvent = parseHasuraEvent(hasuraEvent);

    log('TrackingTokenExtraction', 'Starting tracking token extraction');

    let correlationId: string | null = null;
    let sourceJobId: string | null = null;

    // Strategy 1: Extract from updated_by field with pattern matching
    if (this.config.extractFromUpdatedBy) {
      const trackingResult = this.extractFromUpdatedBy(parsedEvent);
      if (trackingResult) {
        correlationId = trackingResult.correlationId;
        sourceJobId = trackingResult.sourceJobId || null;
        log('TrackingTokenExtraction', `Extracted from updated_by - correlationId: ${correlationId}, sourceJobId: ${sourceJobId}`);
      }
    }

    // Strategy 2: Extract from custom field (if no correlationId yet)
    if (!correlationId && this.config.extractFromCustomField) {
      correlationId = this.extractFromCustomField(parsedEvent, this.config.extractFromCustomField);
      if (correlationId) {
        log('TrackingTokenExtraction', `Extracted correlationId from custom field: ${correlationId}`);
      }
    }

    // Strategy 3: Extract from metadata/JSON fields (if no correlationId yet)
    if (!correlationId && this.config.extractFromMetadata) {
      correlationId = this.extractFromMetadata(parsedEvent);
      if (correlationId) {
        log('TrackingTokenExtraction', `Extracted correlationId from metadata: ${correlationId}`);
      }
    }

    // Strategy 4: Extract from session variables (if no correlationId yet)
    if (!correlationId && this.config.extractFromSession) {
      correlationId = this.extractFromSession(parsedEvent);
      if (correlationId) {
        log('TrackingTokenExtraction', `Extracted correlationId from session: ${correlationId}`);
      }
    }

    // Set the extracted values in hasuraEvent for other plugins/jobs to use
    if (correlationId || sourceJobId) {
      // Store source job ID in hasuraEvent for observability plugin
      if (sourceJobId) {
        (hasuraEvent as any).__sourceJobId = sourceJobId;
      }

      // Return updated options with correlationId
      if (correlationId) {
        return { ...options, correlationId };
      }
    }

    log('TrackingTokenExtraction', 'No tracking token components found in payload');
    return options;
  }

  /**
   * Extract tracking token components from updated_by field
   * Supports formats like:
   * - "something.correlation_id.source_job_id" (full tracking token)
   * - "something.correlation_id" (without source job)
   */
  private extractFromUpdatedBy(parsedEvent: ParsedHasuraEvent): { correlationId: string; sourceJobId?: string } | null {
    if (parsedEvent.operation !== 'UPDATE') return null;

    const updatedBy = parsedEvent.dbEvent?.new?.updatedby || parsedEvent.dbEvent?.new?.updated_by;
    if (!updatedBy || typeof updatedBy !== 'string') return null;

    // Try parsing as a TrackingToken first
    const components = TrackingToken.parse(updatedBy);
    if (components) {
      return {
        correlationId: components.correlationId,
        sourceJobId: components.jobId
      };
    }

    // Fallback: use the configured pattern if needed (correlation ID only)
    if (this.config.updatedByPattern) {
      const match = updatedBy.match(this.config.updatedByPattern);
      if (match && match[1]) {
        return { correlationId: match[1] };
      }
    }

    // Fallback: check if the whole updated_by value is a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(updatedBy)) {
      return { correlationId: updatedBy };
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
export const basicTrackingTokenPlugin = new TrackingTokenExtractionPlugin();

/**
 * Updated-by pattern extraction only
 */
export const updatedByOnlyPlugin = new TrackingTokenExtractionPlugin({
  extractFromUpdatedBy: true,
  extractFromMetadata: false,
  extractFromSession: false,
  // Extract correlation ID from "user:12345.correlation-id.source-job-id" format (2nd position)
  updatedByPattern: /^user:\d+\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[^.]+)?$/i,
});

/**
 * Custom field extraction
 */
export const customFieldPlugin = new TrackingTokenExtractionPlugin({
  extractFromUpdatedBy: false,
  extractFromMetadata: false,
  extractFromSession: false,
  extractFromCustomField: 'process_id',
});

/**
 * Multi-tenant extraction with session variables
 */
export const multiTenantPlugin = new TrackingTokenExtractionPlugin({
  extractFromSession: true,
  sessionVariables: ['x-hasura-tenant-id', 'x-correlation-id', 'x-workflow-id'],
  extractFromMetadata: true,
  metadataKeys: ['tenant_correlation_id', 'workflow_id'],
});

// Export for backward compatibility
export const CorrelationIdExtractionPlugin = TrackingTokenExtractionPlugin;

export default TrackingTokenExtractionPlugin;