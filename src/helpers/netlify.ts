/**
 * Handle Netlify function success in a consistent way.
 * The results of detecting events will be returned back
 * to Hasura in the response payload as JSON. This will
 * make it available to anyone reviewing the Hasura
 * event logs.
 */

import type { ListenToResponse } from "../types";
import { logError } from './log';

export interface NetlifyResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
}

export const handleSuccess = (results: ListenToResponse): NetlifyResponse => {
  return {
    statusCode: 200,
    body: JSON.stringify(results, null, 2),
    headers: { 'Content-Type': 'application/json' },
  };
};

/**
 * Handle Netlify function failure in a consistent way.
 * The error will be returned back to Hasura in the response
 * payload as JSON. This will make it available to anyone
 * reviewing the Hasura event logs.
 */
export const handleFailure = (error: Error): NetlifyResponse => {
  logError('netlifyHandler', 'Unknown error', error);
  return {
    statusCode: 500, // We assume its our fault because Hasura is consistently formatting
    body: JSON.stringify({ errors: [error] }, null, 2),
    headers: { 'Content-Type': 'application/json' },
  };
};
