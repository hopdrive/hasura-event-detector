/**
 * Netlify Build Plugin for Hasura Event Detector
 *
 * Automatically compiles TypeScript event modules to .generated.js files
 * during the Netlify build process.
 *
 * Usage in netlify.toml:
 *   [[plugins]]
 *     package = "@hopdrive/hasura-event-detector"
 *
 *   [functions]
 *     directory = "functions"
 *     included_files = ["functions/**​/events/*.generated.js"]
 */

module.exports = {
  /**
   * Run before the build command
   */
  onPreBuild: async ({ utils, inputs, constants }) => {
    const { EventModuleBuilder } = require('../scripts/build-events.js');

    const functionsDir = inputs.functionsDir || constants.FUNCTIONS_SRC || 'functions';

    console.log('[hasura-event-detector] Compiling event modules...');
    console.log(`[hasura-event-detector] Functions directory: ${functionsDir}`);

    const builder = new EventModuleBuilder({
      functionsDir,
      verbose: inputs.verbose || false
    });

    try {
      const results = builder.build();

      if (results.success) {
        console.log(`[hasura-event-detector] ✓ Successfully compiled ${results.compiled} event module(s)`);
      } else {
        console.error(`[hasura-event-detector] ✗ Compilation failed: ${results.failed} error(s)`);

        if (results.errors && results.errors.length > 0) {
          console.error('[hasura-event-detector] Errors:');
          results.errors.forEach(err => {
            console.error(`  - ${err.file}: ${err.error}`);
          });
        }

        utils.build.failBuild('Event module compilation failed');
      }
    } catch (error) {
      console.error('[hasura-event-detector] Unexpected error:', error.message);
      utils.build.failBuild(`Event module compilation error: ${error.message}`);
    }
  }
};
