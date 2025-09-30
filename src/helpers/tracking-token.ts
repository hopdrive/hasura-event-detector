/**
 * TrackingToken - A hierarchical tracking identifier for execution chain tracing
 *
 * Format: source.correlationId.jobId
 *
 * This provides a standardized way to track execution lineage through the system,
 * commonly used in database updated_by columns or other transport mechanisms.
 */

import type { CorrelationId, JobName } from '../types';

/**
 * Branded type for tracking tokens to ensure type safety
 */
export type TrackingToken = string & { readonly __trackingToken: unique symbol };

/**
 * Valid source identifiers for tracking tokens
 */
export type TrackingTokenSource = string;

/**
 * Parsed components of a tracking token
 */
export interface TrackingTokenComponents {
  source: TrackingTokenSource;
  correlationId: string;
  jobId?: string;
}

/**
 * Utilities for working with tracking tokens (TrackingTokenUtils class aliased as TrackingToken)
 *
 * Tracking tokens provide a hierarchical identifier that captures:
 * - The source/origin of an action
 * - The correlation ID linking related operations
 * - Optionally, a specific job ID for granular tracking
 *
 * @example
 * ```typescript
 * // Create a tracking token
 * const token = TrackingToken.create('api-handler', correlationId, 'job-123');
 * // Result: "api-handler.550e8400-e29b-41d4-a716-446655440000.job-123"
 *
 * // Parse a token back to components
 * const components = TrackingToken.parse(token);
 * // Result: { source: 'api-handler', correlationId: '550e8400-...', jobId: 'job-123' }
 *
 * // Use in database operations
 * await db.update({
 *   ...data,
 *   updated_by: token // Transport mechanism
 * });
 * ```
 */
export class TrackingTokenUtils {
  /**
   * Create a tracking token from components
   *
   * @param source - The source/origin identifier (e.g., 'api', 'webhook', 'scheduler')
   * @param correlationId - The correlation ID linking related operations
   * @param jobId - Optional job identifier for specific job tracking
   * @returns A formatted tracking token
   */
  static create(
    source: TrackingTokenSource,
    correlationId: CorrelationId | string,
    jobId?: JobName | string
  ): TrackingToken {
    if (!source || !correlationId) {
      throw new Error('TrackingToken requires both source and correlationId');
    }

    // Sanitize inputs to prevent delimiter conflicts
    const sanitizedSource = source.replace(/\./g, '_');
    const sanitizedJobId = jobId?.replace(/\./g, '_');

    const token = sanitizedJobId
      ? `${sanitizedSource}.${correlationId}.${sanitizedJobId}`
      : `${sanitizedSource}.${correlationId}`;

    return token as TrackingToken;
  }

  /**
   * Parse a tracking token into its components
   *
   * @param token - The tracking token to parse
   * @returns The parsed components or null if invalid
   */
  static parse(token: TrackingToken | string): TrackingTokenComponents | null {
    if (!this.isValid(token)) return null;

    const parts = token.split('.');

    return {
      source: parts[0]!,
      correlationId: parts[1]!,
      ...(parts[2] ? { jobId: parts[2] } : {}),
    };
  }

  /**
   * Check if a value is a valid tracking token format
   *
   * @param value - The value to check
   * @returns True if the value matches the tracking token format
   */
  static isValid(value: unknown): value is TrackingToken {
    if (!value || typeof value !== 'string') return false;

    // Format: source.correlationId or source.correlationId.jobId
    const parts = value.split('.');

    // Must have 2 or 3 parts
    if (parts.length < 2 || parts.length > 3) return false;

    // All parts must be non-empty
    if (!parts.every(part => part.length > 0)) return false;

    // Correlation ID (2nd part) should be a valid UUID format
    const correlationId = parts[1];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    return uuidRegex.test(correlationId!);
  }

  /**
   * Extract just the correlation ID from a tracking token
   *
   * @param token - The tracking token
   * @returns The correlation ID or null if invalid
   */
  static getCorrelationId(token: TrackingToken | string): string | null {
    const parsed = this.parse(token);
    return parsed?.correlationId || null;
  }

  /**
   * Extract just the job ID from a tracking token
   *
   * @param token - The tracking token
   * @returns The job ID or null if not present/invalid
   */
  static getJobId(token: TrackingToken | string): string | null {
    const parsed = this.parse(token);
    return parsed?.jobId || null;
  }

  /**
   * Extract just the source from a tracking token
   *
   * @param token - The tracking token
   * @returns The source identifier or null if invalid
   */
  static getSource(token: TrackingToken | string): string | null {
    const parsed = this.parse(token);
    return parsed?.source || null;
  }

  /**
   * Create a new token with a different job ID but same source and correlation
   *
   * @param token - The original tracking token
   * @param newJobId - The new job ID to use
   * @returns A new tracking token with the updated job ID
   */
  static withJobId(token: TrackingToken | string, newJobId: string): TrackingToken {
    const parsed = this.parse(token);
    if (!parsed) {
      throw new Error('Invalid tracking token provided');
    }

    return this.create(parsed.source, parsed.correlationId, newJobId);
  }

  /**
   * Create a new token with a different source but same correlation and job
   *
   * @param token - The original tracking token
   * @param newSource - The new source to use
   * @returns A new tracking token with the updated source
   */
  static withSource(token: TrackingToken | string, newSource: string): TrackingToken {
    const parsed = this.parse(token);
    if (!parsed) {
      throw new Error('Invalid tracking token provided');
    }

    return this.create(newSource, parsed.correlationId, parsed.jobId);
  }
}

// Export the class with an alias for convenience
export const TrackingToken = TrackingTokenUtils;
export default TrackingTokenUtils;