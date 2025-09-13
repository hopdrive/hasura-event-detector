/**
 * Hasura Event Helper Functions
 * 
 * This module provides utility functions for parsing and analyzing Hasura event payloads.
 * All JSDoc types have been replaced with proper TypeScript types imported from @/types.
 */

import type {
  HasuraEventPayload,
  ParsedHasuraEvent,
  HasuraEventData,
  HasuraOperation
} from "../types";
import { logError } from './log';

/**
 * Safely extract from the Hasura Event specific items if they are present
 * to make referring to these items more convenient in other calling parts
 * of the application.
 *
 * @param hasuraEvent - Hasura event trigger payload
 * @returns Items extracted from the Hasura Event for convenience
 */
export const parseHasuraEvent = <T = Record<string, any>>(
  hasuraEvent: HasuraEventPayload<T>
): ParsedHasuraEvent<T> => {
  let hasuraEventTime: string | undefined;
  let hasuraEventId: string | undefined;
  let dbEvent: HasuraEventData<T> | undefined;
  let sessionVariables: any;
  let role: string | undefined;
  let user: string | null | undefined;
  let operation: HasuraOperation | undefined;

  try {
    hasuraEventTime = hasuraEvent?.created_at;
    hasuraEventId = hasuraEvent?.id;
    dbEvent = hasuraEvent?.event?.data as HasuraEventData<T> | undefined;
    operation = hasuraEvent?.event?.op as HasuraOperation | undefined;
    sessionVariables = hasuraEvent?.event?.session_variables;
    try {
      role = sessionVariables?.['x-hasura-role'];
      user = sessionVariables?.['x-hasura-user-email'] || (role === 'admin' ? 'system' : null);
    } catch {
      // Ignore session variable parsing errors
    }
  } catch (error) {
    logError('parseHasuraEvent', 'Error parsing Hasura event', error as Error);
  }

  const result: ParsedHasuraEvent<T> = {};
  
  if (hasuraEventTime !== undefined) result.hasuraEventTime = hasuraEventTime;
  if (hasuraEventId !== undefined) result.hasuraEventId = hasuraEventId;
  if (dbEvent !== undefined) result.dbEvent = dbEvent;
  if (sessionVariables !== undefined) result.sessionVariables = sessionVariables;
  if (role !== undefined) result.role = role;
  if (user !== undefined) result.user = user;
  if (operation !== undefined) result.operation = operation;
  
  return result;
};

/**
 * Compare the old and new record embedded in the HasuraEvent.data
 * property to detect changes to a specific column name.
 *
 * @param column - The name of the column to compare
 * @param hasuraData - The data element from a Hasura event
 * @returns True if differences found, else false
 */
export const columnHasChanged = (
  column: string, 
  hasuraData: HasuraEventData
): boolean => {
  try {
    if (!column) return false;
    if (!hasuraData) return false;
    if (!Object.prototype.hasOwnProperty.call(hasuraData, 'old')) return false;
    if (!Object.prototype.hasOwnProperty.call(hasuraData, 'new')) return false;
    if (!hasuraData.old || !Object.prototype.hasOwnProperty.call(hasuraData.old, column)) return false;
    if (!hasuraData.new || !Object.prototype.hasOwnProperty.call(hasuraData.new, column)) return false;
    //log('columnHasChanged', column, { before: dbEvent.old[column], after: dbEvent.new[column] });
    return hasuraData.old[column] !== hasuraData.new[column];
  } catch (error) {
    logError('columnHasChanged', 'columnHasChanged failed', error as Error);
    return false;
  }
};

// Exports are handled above with export statements
