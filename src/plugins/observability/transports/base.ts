import { logError } from '../../../helpers/log';
import type { ObservabilityConfig } from '../plugin';

/**
 * Base class for observability transports with shared serialization logic
 */
export abstract class BaseTransport {
  protected config: ObservabilityConfig;

  constructor(config: ObservabilityConfig) {
    this.config = config;
  }

  /**
   * Replace circular references in objects to prevent JSON serialization errors
   */
  protected replaceCircularReferences(obj: any, path = new Set(), currentPath = ''): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (path.has(obj)) {
      return {
        json_error: '[Circular Reference Removed]',
        path: currentPath,
      };
    }

    path.add(obj);

    if (Array.isArray(obj)) {
      const newArray = obj.map((item, index) =>
        this.replaceCircularReferences(item, new Set(path), currentPath ? `${currentPath}[${index}]` : `[${index}]`)
      );
      path.delete(obj);
      return newArray;
    }

    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      newObj[key] = this.replaceCircularReferences(value, new Set(path), currentPath ? `${currentPath}.${key}` : key);
    }
    path.delete(obj);
    return newObj;
  }

  /**
   * Check if an object appears to be an Apollo Client cache
   */
  protected isApolloClientCache(obj: any): boolean {
    // Check for Apollo Client cache characteristics
    return (
      obj &&
      typeof obj === 'object' &&
      (obj.hasOwnProperty('ROOT_QUERY') ||
        obj.hasOwnProperty('ROOT_MUTATION') ||
        obj.hasOwnProperty('__typename') ||
        (obj.data && obj.data.hasOwnProperty('ROOT_QUERY')))
    );
  }

  /**
   * Serialize Apollo Client cache to a more compact representation
   */
  protected serializeApolloClientCache(cache: any): any {
    return {
      _type: 'ApolloClientCache',
      _message: 'Apollo Client cache data excluded for performance',
      _keys: Object.keys(cache).slice(0, 10),
      _size_estimate: JSON.stringify(cache).length,
    };
  }

  /**
   * Create a truncated version of an object that's too large
   */
  protected createTruncatedObject(obj: any, maxSize: number): any {
    const truncated: any = {
      _truncated: true,
      _original_type: obj?.constructor?.name || typeof obj,
      _message: 'Object truncated due to size constraints',
    };

    // Try to preserve important top-level keys
    const importantKeys = ['id', 'name', 'type', 'status', 'error', 'message', 'code'];
    for (const key of importantKeys) {
      if (key in obj && typeof obj[key] !== 'object') {
        truncated[key] = obj[key];
      }
    }

    // Add a sample of other keys
    const otherKeys = Object.keys(obj).filter((k) => !importantKeys.includes(k)).slice(0, 5);
    if (otherKeys.length > 0) {
      truncated._sample_keys = otherKeys;
    }

    return truncated;
  }

  /**
   * Sanitize JSON string to ensure it's valid
   */
  protected sanitizeJsonString(jsonString: string): string {
    try {
      // First, try to parse it to ensure it's valid JSON
      const parsed = JSON.parse(jsonString);
      // Re-stringify to ensure consistent formatting
      return JSON.stringify(parsed);
    } catch {
      // If parsing fails, try to fix common issues
      let sanitized = jsonString;

      // Remove any BOM characters
      sanitized = sanitized.replace(/^\uFEFF/, '');

      // Replace undefined with null
      sanitized = sanitized.replace(/:\s*undefined/g, ': null');

      // Try parsing again
      try {
        JSON.parse(sanitized);
        return sanitized;
      } catch (error) {
        // If still failing, return a safe error object
        return JSON.stringify({
          json_error: 'Failed to sanitize JSON',
          original_length: jsonString.length,
          error_message: (error as Error).message,
        });
      }
    }
  }

  /**
   * Serialize JSON column values
   */
  protected serializeJsonColumn(value: any, columnName: string): any {
    if (value === null || value === undefined) return null;

    // If it's already a string, validate it's valid JSON
    if (typeof value === 'string') {
      try {
        // Try to parse to validate it's JSON
        JSON.parse(value);
        return value;
      } catch {
        // If it's not valid JSON, wrap it in an object
        return JSON.stringify({
          _raw_string: value,
          _column: columnName,
        });
      }
    }

    // For objects, serialize them (without the columnName to avoid recursion)
    return this.serializeValue(value);
  }

  /**
   * Serialize values for database insertion
   */
  protected serializeValue(value: any, columnName?: string): any {
    if (value === undefined || value === null) return null;

    // Special handling for JSON columns
    const jsonColumns = [
      'result',
      'job_options',
      'source_event_payload',
      'context_data',
      'error_stack',
      'detection_error_stack',
      'handler_error_stack',
    ];
    if (columnName && jsonColumns.includes(columnName)) {
      return this.serializeJsonColumn(value, columnName);
    }

    // Handle primitive types
    if (typeof value !== 'object') {
      return value;
    }

    // Handle Date objects
    if (value instanceof Date) {
      return value;
    }

    // Handle Buffer objects
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }

    // Handle Error objects specially
    if (value instanceof Error) {
      const errorObj: any = {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };

      // Check if cause property exists (ES2022+ feature)
      if ('cause' in value && value.cause) {
        errorObj.cause = this.serializeValue((value as any).cause);
      }

      return errorObj;
    }

    // Handle other objects
    try {
      // Special handling for Apollo Client cache objects
      if (this.isApolloClientCache(value)) {
        return this.serializeApolloClientCache(value);
      }

      // Clean circular references before JSON stringification
      const cleanedValue = this.replaceCircularReferences(value);

      // Validate that the cleaned value can be stringified
      const jsonString = JSON.stringify(cleanedValue);

      // Check if JSON string is too large
      if (jsonString.length > this.config.maxJsonSize) {
        logError(
          'ObservabilityTransport',
          `JSON object too large (${jsonString.length} chars), truncating`,
          new Error('JSON size limit exceeded')
        );

        // Try to create a truncated version
        const truncatedValue = this.createTruncatedObject(value, this.config.maxJsonSize);
        const truncatedJson = this.sanitizeJsonString(JSON.stringify(truncatedValue));

        // Validate truncated JSON
        JSON.parse(truncatedJson);
        return truncatedJson;
      }

      // Sanitize and validate the JSON string
      const sanitizedJson = this.sanitizeJsonString(jsonString);

      // Validate that the JSON string is valid by parsing it back
      JSON.parse(sanitizedJson);

      return sanitizedJson;
    } catch (error) {
      // If JSON serialization fails, return a safe fallback
      logError('ObservabilityTransport', 'JSON serialization failed', error as Error);
      return JSON.stringify({
        serialization_error: 'Failed to serialize object',
        error_message: (error as Error).message,
        object_type: value.constructor?.name || 'Unknown',
        object_keys: Object.keys(value).slice(0, 10),
      });
    }
  }

  /**
   * Validate JSON values before sending to database
   */
  protected validateJsonValues(values: any[][], tableName: string): void {
    values.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (typeof value === 'string' && value.startsWith('{')) {
          try {
            JSON.parse(value);
          } catch (error) {
            logError(
              'ObservabilityTransport',
              `Invalid JSON in ${tableName} at row ${rowIndex}, col ${colIndex}`,
              error as Error
            );
            throw new Error(`Invalid JSON detected in ${tableName} data`);
          }
        }
      });
    });
  }

  /**
   * Log complete query for debugging
   */
  protected logCompleteQuery(query: string, values: any[], tableName: string): void {
    try {
      let substitutedQuery = query;
      values.forEach((value, index) => {
        const placeholder = `$${index + 1}`;
        const serializedValue =
          value === null
            ? 'NULL'
            : typeof value === 'string'
            ? `'${value.replace(/'/g, "''")}'`
            : value instanceof Date
            ? `'${value.toISOString()}'`
            : value.toString();
        substitutedQuery = substitutedQuery.replace(placeholder, serializedValue);
      });

      console.log(`\n--- Failed Query for ${tableName} ---`);
      console.log(substitutedQuery);
      console.log('--- End Query ---\n');
    } catch (logError) {
      console.log(`Could not generate complete query for debugging: ${(logError as Error).message}`);
    }
  }
}