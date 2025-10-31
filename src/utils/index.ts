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

// Netlify-specific utilities are now available at 'hasura-event-detector/netlify'
// This keeps the main utils package focused on general utilities

// Tracking token utilities
export {
  TrackingToken,
  type TrackingTokenComponents,
  type TrackingTokenSource
} from '../helpers/tracking-token';
