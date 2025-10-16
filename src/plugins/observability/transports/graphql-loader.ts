/**
 * Dynamic loader for graphql-request to handle ESM/CJS compatibility
 * This uses Function constructor to ensure the import() is not transformed by TypeScript
 */

export async function loadGraphQLClient(): Promise<any> {
  try {
    // Polyfill fetch API for Node.js < 18 or environments without native fetch
    // This is required for graphql-request v7+ which depends on the Fetch API
    await ensureFetchPolyfill();

    // Use Function constructor to preserve dynamic import in CommonJS build
    // This prevents TypeScript from transforming import() to require()
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const module = await dynamicImport('graphql-request');
    return module.GraphQLClient;
  } catch (error: any) {
    // If dynamic import fails, it means we're in an environment that doesn't support it
    // or graphql-request is not installed
    throw new Error(
      `Failed to load graphql-request. ${error.message}. ` +
      'This package requires graphql-request to be installed when using GraphQL transport. ' +
      'Note: The GraphQL transport requires Node.js with ESM support (Node 12.20+, 14.14+, or 16+). ' +
      'Run: npm install graphql-request'
    );
  }
}

/**
 * Ensures the Fetch API globals are available
 * Required for graphql-request v7+ which uses native fetch
 */
async function ensureFetchPolyfill(): Promise<void> {
  // Check if fetch is already available (Node 18+ or browser)
  if (typeof globalThis.fetch !== 'undefined') {
    return;
  }

  try {
    // Try to use Node's built-in fetch (Node 18+)
    // @ts-ignore - node:fetch may not be available in older Node versions
    const nodeFetch = await import('node:fetch');
    if (nodeFetch) {
      return; // Node 18+ has native fetch
    }
  } catch {
    // Node < 18, need to polyfill
  }

  try {
    // Try cross-fetch as polyfill (for Node < 18)
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const crossFetch = await dynamicImport('cross-fetch');

    // Polyfill globals
    if (!globalThis.fetch) {
      globalThis.fetch = crossFetch.default || crossFetch.fetch;
    }
    if (!globalThis.Headers) {
      globalThis.Headers = crossFetch.Headers;
    }
    if (!globalThis.Request) {
      globalThis.Request = crossFetch.Request;
    }
    if (!globalThis.Response) {
      globalThis.Response = crossFetch.Response;
    }
  } catch (error: any) {
    throw new Error(
      'Fetch API is not available. ' +
      'graphql-request v7+ requires native fetch support (Node 18+) or the cross-fetch polyfill. ' +
      'Run: npm install cross-fetch'
    );
  }
}