/**
 * Netlify-specific utilities for Hasura Event Detector
 *
 * This module provides Netlify-specific helper functions for handling
 * success and failure responses in Netlify Functions. These utilities
 * are optional and only needed when deploying to Netlify.
 */

// Re-export Netlify-specific utilities from helpers
export {
  handleSuccess,
  handleFailure,
  type NetlifyResponse
} from '../helpers/netlify';