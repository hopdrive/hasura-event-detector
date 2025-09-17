/**
 * Example Plugins
 *
 * This module provides example plugins that demonstrate various capabilities
 * of the hasura-event-detector plugin system. These plugins are intended
 * for reference, testing, and as starting points for custom implementations.
 */

// Observability Plugin - Comprehensive monitoring and analytics
export {
  ObservabilityPlugin,
  type ObservabilityConfig
} from './observability/plugin';

// Tracking Token Extraction Plugin - Extract and manage tracking tokens
export {
  TrackingTokenExtractionPlugin,
  CorrelationIdExtractionPlugin,
  basicTrackingTokenPlugin,
  updatedByOnlyPlugin,
  customFieldPlugin,
  multiTenantPlugin,
  type TrackingTokenExtractionConfig
} from './tracking-token-extraction/plugin';

// Simple Logging Plugin - Basic event logging
export {
  SimpleLoggingPlugin,
  type SimpleLoggingConfig
} from './simple-logging/plugin';

// Console Interceptor Plugin - Intercept and log console output
export {
  ConsoleInterceptorPlugin,
  type ConsoleInterceptorConfig
} from './console-interceptor/plugin';

// Order Enrichment Plugin - Enrich events with related data
export {
  OrderEnrichmentPlugin,
  productionOrderEnrichment,
  developmentOrderEnrichment,
  testOrderEnrichment,
  type OrderEnrichmentConfig
} from './order-enrichment/plugin';
