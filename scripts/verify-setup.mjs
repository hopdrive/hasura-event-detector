#!/usr/bin/env node

/**
 * Setup Verification Script for Hasura Event Detector
 *
 * Validates your event detection configuration by:
 * 1. Detecting all event modules across all function directories
 * 2. Verifying .generated.js files exist and are loadable
 * 3. Parsing imports to identify job functions
 * 4. Extracting job names using actual runtime logic
 * 5. Displaying a complete tree view of your configuration
 *
 * This helps diagnose issues with:
 * - TypeScript compilation and build setup
 * - Event module structure and exports
 * - Job function naming (detects anonymous jobs)
 * - Import paths and module resolution
 *
 * Usage:
 *   npx hasura-event-detector verify-setup
 *   npx hasura-event-detector verify-setup --functions-dir path/to/functions
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Get the directory from where the script is called (user's project root)
const callerDir = process.cwd();

// Parse command line arguments
const args = process.argv.slice(2);
const functionsDirIndex = args.indexOf('--functions-dir');
const functionsDir = functionsDirIndex !== -1 && args[functionsDirIndex + 1]
  ? join(callerDir, args[functionsDirIndex + 1])
  : join(callerDir, 'functions');

// Import from the installed package (not relative import)
let detectEventModules, extractJobName;
try {
  const detector = await import('@hopdrive/hasura-event-detector');
  detectEventModules = detector.detectEventModules;
  extractJobName = detector.extractJobName;
} catch (error) {
  console.error('❌ Failed to import @hopdrive/hasura-event-detector');
  console.error('   Make sure the package is installed: npm install @hopdrive/hasura-event-detector');
  process.exit(1);
}

/**
 * Find all function directories that might contain event modules
 */
async function findFunctionDirs() {
  try {
    await fs.access(functionsDir);
  } catch {
    console.error(`❌ Functions directory not found: ${functionsDir}`);
    console.error('   Use --functions-dir to specify a different location');
    process.exit(1);
  }

  const entries = await fs.readdir(functionsDir, { withFileTypes: true });

  const functionDirs = [];

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const fullPath = join(functionsDir, entry.name);
      const eventsDir = join(fullPath, 'events');

      // Check if this function has an events directory
      try {
        await fs.access(eventsDir);
        functionDirs.push({
          name: entry.name,
          path: fullPath,
          eventsDir
        });
      } catch {
        // No events directory, skip
      }
    }
  }

  return functionDirs;
}

/**
 * Parse imports from a JavaScript file to find imported job functions
 */
function parseJobImports(fileContent) {
  const jobImports = [];

  // Match import statements that import from ../jobs or similar paths
  // Example: import { handleRidehailAccessorials, handleOtherJob } from '../jobs/index.js';
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"](\.\.\/jobs[^'"]*)['"]/g;

  let match;
  while ((match = importRegex.exec(fileContent)) !== null) {
    const imports = match[1];
    const importPath = match[2];

    // Split the imported names and clean them up
    const importedNames = imports
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    jobImports.push({
      imports: importedNames,
      from: importPath
    });
  }

  return jobImports;
}

/**
 * Analyze an event module by reading its file and parsing imports
 */
async function analyzeEventModule(eventName, eventsDir) {
  try {
    // Check which file exists (prefer .generated.js)
    const extensions = ['.generated.js', '.js', '.mjs'];
    let fileContent = null;
    let loadedFrom = null;

    for (const ext of extensions) {
      const filePath = join(eventsDir, `${eventName}${ext}`);
      try {
        fileContent = await fs.readFile(filePath, 'utf-8');
        loadedFrom = ext;
        break;
      } catch {
        continue;
      }
    }

    if (!fileContent) {
      return {
        success: false,
        error: 'No event module file found',
        loadedFrom: null
      };
    }

    // Parse imports to find job functions
    const jobImports = parseJobImports(fileContent);

    if (jobImports.length === 0) {
      return {
        success: true,
        loadedFrom,
        jobCount: 0,
        jobNames: [],
        note: 'No job imports detected'
      };
    }

    // Collect all imported job function names
    const allJobFunctions = [];
    for (const importGroup of jobImports) {
      allJobFunctions.push(...importGroup.imports);
    }

    // Import the actual job functions to get their names using extractJobName
    const jobNames = [];
    for (const importGroup of jobImports) {
      const importPath = importGroup.from;
      const fullImportPath = join(eventsDir, importPath);

      try {
        // Convert to file URL for ESM import
        const moduleUrl = `file://${fullImportPath}`;
        const jobModule = await import(moduleUrl);

        for (const jobFuncName of importGroup.imports) {
          const jobFunc = jobModule[jobFuncName];

          if (jobFunc && typeof jobFunc === 'function') {
            // Use the actual extractJobName function from the library
            // It expects a Job descriptor: { func, options }
            const detectedName = extractJobName({ func: jobFunc, options: {} });
            jobNames.push({
              importedAs: jobFuncName,
              detectedName
            });
          } else {
            jobNames.push({
              importedAs: jobFuncName,
              detectedName: 'not a function'
            });
          }
        }
      } catch (error) {
        // If we can't import the jobs module, just use the imported names
        for (const jobFuncName of importGroup.imports) {
          jobNames.push({
            importedAs: jobFuncName,
            detectedName: `error: ${error.message}`
          });
        }
      }
    }

    return {
      success: true,
      loadedFrom,
      jobCount: allJobFunctions.length,
      jobNames,
      imports: jobImports
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
      loadedFrom: null
    };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('='.repeat(80));
  console.log('Hasura Event Detector - Setup Verification');
  console.log('='.repeat(80));
  console.log();
  console.log('Functions directory:', functionsDir);
  console.log();

  const functionDirs = await findFunctionDirs();

  if (functionDirs.length === 0) {
    console.log('⚠️  No functions with event directories found');
    console.log();
    console.log('Expected structure:');
    console.log('  functions/');
    console.log('    my-function/');
    console.log('      events/');
    console.log('        my.event.ts');
    console.log();
    return;
  }

  console.log(`Found ${functionDirs.length} function(s) with event directories:\n`);

  let totalEvents = 0;
  let totalJobs = 0;
  let anonymousJobs = 0;

  for (const funcDir of functionDirs) {
    console.log('📁', funcDir.name);
    console.log('   Path:', funcDir.eventsDir);
    console.log();

    try {
      // Use the actual detectEventModules function from the library
      const eventNames = await detectEventModules(funcDir.eventsDir);

      if (eventNames.length === 0) {
        console.log('   ⚠️  No event modules detected');
        console.log();
        continue;
      }

      console.log(`   Detected ${eventNames.length} event module(s):\n`);
      totalEvents += eventNames.length;

      for (const eventName of eventNames) {
        const analysis = await analyzeEventModule(eventName, funcDir.eventsDir);

        if (analysis.success) {
          console.log(`   ✓ ${eventName}`);
          console.log(`     Loaded from: ${analysis.loadedFrom}`);
          console.log(`     Jobs imported: ${analysis.jobCount}`);

          totalJobs += analysis.jobCount;

          if (analysis.jobNames && analysis.jobNames.length > 0) {
            analysis.jobNames.forEach((job, idx) => {
              const isAnonymous = job.detectedName === 'anonymous';
              const hasError = job.detectedName.startsWith('error:');

              if (isAnonymous) anonymousJobs++;

              const icon = isAnonymous ? '⚠️ ' : hasError ? '❌' : '  ';
              console.log(`       ${icon}[${idx + 1}] ${job.importedAs} → "${job.detectedName}"`);
            });
          }

          if (analysis.note) {
            console.log(`     Note: ${analysis.note}`);
          }

          if (analysis.jobNames && analysis.jobNames.some(job => job.detectedName === 'anonymous')) {
            console.log(`     ⚠️  WARNING: Some jobs will have anonymous names at runtime`);
          }
        } else {
          console.log(`   ❌ ${eventName}`);
          console.log(`     Error: ${analysis.error}`);
        }
        console.log();
      }

    } catch (error) {
      console.log(`   ❌ Error analyzing events: ${error.message}`);
      console.log();
    }
  }

  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Total event modules: ${totalEvents}`);
  console.log(`Total jobs imported: ${totalJobs}`);

  if (anonymousJobs > 0) {
    console.log(`⚠️  Jobs with anonymous names: ${anonymousJobs}`);
    console.log();
    console.log('To fix anonymous job names:');
    console.log('1. Ensure job functions are named functions (not arrow functions)');
    console.log('2. OR pass explicit jobName in options when calling job():');
    console.log('   job(myFunction, { ...options, jobName: "myJobName" })');
    console.log('3. Check that wrapper functions (like scopedJob) preserve function names');
  } else {
    console.log('✓ All jobs have proper names');
  }
  console.log();
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
