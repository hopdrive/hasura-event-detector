#!/usr/bin/env node

/**
 * Fix ESM Import Paths
 *
 * Node.js ESM requires explicit .js extensions in import paths, but TypeScript
 * doesn't add them automatically when compiling. This script fixes all relative
 * imports in compiled JavaScript files to add the correct extensions.
 *
 * Usage:
 *   - As CLI: node fix-esm-imports.cjs [directory]
 *   - As module: require('./fix-esm-imports.cjs').fixEsmImports(directory)
 *   - With build-events: automatically runs after TypeScript compilation
 *
 * What it fixes:
 *   - from '../lib/utils' → from '../lib/utils.js'
 *   - from '../jobs' → from '../jobs/index.js' (for directories)
 *   - Preserves existing .js, .mjs, .json extensions
 *   - Only affects relative imports (not npm packages)
 */

const fs = require('fs');
const path = require('path');

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  const dir = path.dirname(filePath);

  // Fix ESM imports: Node.js requires .js extensions for relative imports
  // Transform: from '../../path' → from '../../path.js'
  // Only rewrite relative imports (starting with . or ..), not npm packages
  const fixed = content.replace(
    /from\s+['"](\.\.[\/\\][^'"]+|\.\/[^'"]+)['"]/g,
    (match, importPath) => {
      // Skip if already has an extension
      if (importPath.match(/\.(js|mjs|json)$/)) {
        return match;
      }

      // Check if this is a directory import (needs /index.js)
      const fullPath = path.resolve(dir, importPath);
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
        modified = true;
        return match.replace(importPath, `${importPath}/index.js`);
      }

      modified = true;
      // Add .js extension for file imports
      return match.replace(importPath, `${importPath}.js`);
    }
  );

  if (modified) {
    fs.writeFileSync(filePath, fixed, 'utf8');
    return true;
  }
  return false;
}

function findJsFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip common directories that don't need fixing
      if (entry.name === 'node_modules' || entry.name === '.netlify' || entry.name === 'dist') {
        continue;
      }
      findJsFiles(fullPath, files);
    } else if (entry.name.endsWith('.js') && !entry.name.includes('.generated.')) {
      // Skip .generated.js files as they're already fixed by build-events
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Fix ESM imports in all JS files within a directory
 * @param {string} targetDir - Directory to process
 * @param {object} options - Options
 * @param {boolean} options.verbose - Show detailed output
 * @returns {object} Results with success status and counts
 */
function fixEsmImports(targetDir, options = {}) {
  const verbose = options.verbose !== false;
  const resolvedDir = path.resolve(targetDir);

  if (verbose) {
    console.log(`Fixing ESM imports in ${resolvedDir}...`);
  }

  if (!fs.existsSync(resolvedDir)) {
    if (verbose) {
      console.log(`⚠️  Directory not found: ${resolvedDir}`);
    }
    return { success: false, fixed: 0, total: 0 };
  }

  const jsFiles = findJsFiles(resolvedDir);
  let fixedCount = 0;

  for (const file of jsFiles) {
    if (fixImportsInFile(file)) {
      fixedCount++;
      if (verbose) {
        console.log(`✓ Fixed: ${path.relative(process.cwd(), file)}`);
      }
    }
  }

  if (verbose) {
    console.log(`\n✓ Fixed ${fixedCount} of ${jsFiles.length} files`);
  }

  return { success: true, fixed: fixedCount, total: jsFiles.length };
}

// Export for use as a module
module.exports = { fixEsmImports, fixImportsInFile, findJsFiles };

// CLI execution
if (require.main === module) {
  const targetDir = process.argv[2] || path.join(process.cwd(), 'functions');
  const result = fixEsmImports(targetDir);
  process.exit(result.success ? 0 : 1);
}
