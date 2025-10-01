/**
 * Dynamic loader for graphql-request to handle ESM/CJS compatibility
 * This uses Function constructor to ensure the import() is not transformed by TypeScript
 */

export async function loadGraphQLClient(): Promise<any> {
  try {
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