/**
 * TrackingToken - A hierarchical tracking identifier for execution chain tracing
 *
 * Format: source|correlationId|jobExecutionId
 *
 * This provides a standardized way to track execution lineage through the system,
 * commonly used in database updated_by columns or other transport mechanisms.
 *
 * The source can be a system name, user ID, or user email (e.g., "user@example.com")
 * The jobExecutionId is a UUID that references the job_executions.id in the observability
 * database, enabling parent-child relationship tracking between job executions and invocations.
 *
 * Uses pipe (|) as separator to avoid conflicts with email addresses containing dots.
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
  jobExecutionId?: string;
}

/**
 * Utilities for working with tracking tokens (TrackingTokenUtils class aliased as TrackingToken)
 *
 * Tracking tokens provide a hierarchical identifier that captures:
 * - The source/origin of an action (system name, user ID, or email)
 * - The correlation ID linking related operations
 * - Optionally, a job execution UUID for tracking job-to-job chains
 *
 * @example
 * ```typescript
 * // Create a tracking token
 * const token = TrackingToken.create('user@example.com', correlationId, jobExecutionId);
 * // Result: "user@example.com|550e8400-e29b-41d4-a716-446655440000|abc-def-12345"
 *
 * // Parse a token back to components
 * const components = TrackingToken.parse(token);
 * // Result: { source: 'user@example.com', correlationId: '550e8400-...', jobExecutionId: 'abc-def-12345' }
 *
 * // Use in database operations
 * await db.update({
 *   ...data,
 *   updated_by: token // Transport mechanism for tracking job chains
 * });
 * ```
 */
export class TrackingTokenUtils {
  /**
   * Create a tracking token from components
   *
   * @param source - The source/origin identifier (e.g., 'system', 'user@example.com', 'user-id-123')
   * @param correlationId - The correlation ID linking related operations
   * @param jobExecutionId - Optional job execution UUID for tracking job-to-job chains
   * @returns A formatted tracking token with pipe separators
   */
  static create(
    source: TrackingTokenSource,
    correlationId: CorrelationId | string,
    jobExecutionId?: string
  ): TrackingToken {
    if (!source || !correlationId) {
      throw new Error('TrackingToken requires both source and correlationId');
    }

    // Sanitize inputs to prevent delimiter conflicts (replace pipe characters)
    const sanitizedSource = source.replace(/\|/g, '_');
    const sanitizedJobExecutionId = jobExecutionId?.replace(/\|/g, '_');

    const token = sanitizedJobExecutionId
      ? `${sanitizedSource}|${correlationId}|${sanitizedJobExecutionId}`
      : `${sanitizedSource}|${correlationId}`;

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

    const parts = token.split('|');

    return {
      source: parts[0]!,
      correlationId: parts[1]!,
      ...(parts[2] ? { jobExecutionId: parts[2] } : {}),
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

    // Format: source|correlationId or source|correlationId|jobExecutionId
    const parts = value.split('|');

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
   * Extract just the job execution ID from a tracking token
   *
   * @param token - The tracking token
   * @returns The job execution ID (UUID) or null if not present/invalid
   */
  static getJobExecutionId(token: TrackingToken | string): string | null {
    const parsed = this.parse(token);
    return parsed?.jobExecutionId || null;
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
   * Create a new token with a different job execution ID but same source and correlation
   *
   * @param token - The original tracking token
   * @param newJobExecutionId - The new job execution ID (UUID) to use
   * @returns A new tracking token with the updated job execution ID
   */
  static withJobExecutionId(token: TrackingToken | string, newJobExecutionId: string): TrackingToken {
    const parsed = this.parse(token);
    if (!parsed) {
      throw new Error('Invalid tracking token provided');
    }

    return this.create(parsed.source, parsed.correlationId, newJobExecutionId);
  }

  /**
   * Create a new token with a different source but same correlation and job execution ID
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

    return this.create(newSource, parsed.correlationId, parsed.jobExecutionId);
  }

  /**
   * Helper function to get a tracking token for use in job functions
   * Automatically handles token reuse or creation based on context
   *
   * @param hasuraEvent - The Hasura event payload
   * @param options - Job options containing sourceTrackingToken and jobExecutionId
   * @param fallbackSource - Source to use when creating a new token (e.g., user email, role, or system name)
   * @returns A tracking token ready to use in database updates
   *
   * @example
   * ```typescript
   * const trackingToken = TrackingToken.forJob(
   *   hasuraEvent,
   *   options,
   *   user || role || 'event-handlers'
   * );
   * await db.update({ ...data, updated_by: trackingToken });
   * ```
   */
  static forJob(
    hasuraEvent: any,
    options: any,
    fallbackSource?: string
  ): TrackingToken {
    // Try to reuse existing tracking token if available
    const sourceTrackingToken = options?.sourceTrackingToken;
    const jobExecutionId = options?.jobExecutionId;

    if (sourceTrackingToken && this.isValid(sourceTrackingToken)) {
      // Reuse the token and just update the jobExecutionId for this job
      return this.withJobExecutionId(sourceTrackingToken, jobExecutionId || 'unknown');
    }

    // Create a new token if no previous token exists (new record)
    const source = fallbackSource || 'system';
    const correlationId = hasuraEvent?.__correlationId || options?.correlationId || 'unknown';

    return this.create(source, correlationId, jobExecutionId);
  }
}

// Export the class with an alias for convenience
export const TrackingToken = TrackingTokenUtils;
export default TrackingTokenUtils;