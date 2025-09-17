/**
 * Utility Functions
 *
 * This module provides utility functions for event processing, logging,
 * and other common operations used throughout the hasura-event-detector.
 * These utilities are designed to be lightweight and focused on specific tasks.
 */

// Event processing utilities
export {
  parseHasuraEvent,
  columnHasChanged
} from '../helpers/hasura';

// Logging utilities
export {
  log,
  logError,
  logWarn
} from '../helpers/log';

// Object manipulation utilities
export {
  getObjectSafely
} from '../helpers/object';

// Netlify-specific utilities
export {
  handleSuccess,
  handleFailure,
  type NetlifyResponse
} from '../helpers/netlify';

// Tracking token utilities
export {
  TrackingToken,
  type TrackingTokenComponents,
  type TrackingTokenSource
} from '../helpers/tracking-token';
