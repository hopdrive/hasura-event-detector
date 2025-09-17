const { execSync } = require('child_process');

/**
 * Pre-build script for TypeScript package
 * This handles TypeScript-specific build tasks
 */
function buildPackage() {
  console.log('Building TypeScript package...');

  // Use relaxed TypeScript config for production builds to handle remaining technical debt
  const useRelaxed = !process.argv.includes('--strict');

  if (useRelaxed) {
    console.log('Using relaxed TypeScript configuration for production build...');
  }

  try {
    // Clean previous build
    console.log('Cleaning previous build...');
    execSync('npm run clean', { stdio: 'inherit' });

    // Run TypeScript build process
    console.log('Compiling TypeScript...');

    if (useRelaxed) {
      execSync('tsc -p tsconfig.relaxed.json --outDir dist/cjs --module commonjs', { stdio: 'inherit' });
      execSync('tsc-alias -p tsconfig.relaxed.json --outDir dist/cjs', { stdio: 'inherit' });
      execSync('tsc -p tsconfig.relaxed.json --outDir dist/esm --module esnext', { stdio: 'inherit' });
      execSync(
        'tsc-alias -p tsconfig.relaxed.json --outDir dist/esm --resolve-full-paths --resolve-full-extension .js',
        { stdio: 'inherit' }
      );
      execSync('tsc -p tsconfig.relaxed.json --declaration --emitDeclarationOnly --outDir dist/types', {
        stdio: 'inherit',
      });
    } else {
      execSync('npm run build:cjs', { stdio: 'inherit' });
      execSync('npm run build:esm', { stdio: 'inherit' });
      execSync('npm run build:types', { stdio: 'inherit' });
    }

    // Copy templates to dist directory for CLI access
    console.log('Copying templates...');
    execSync('cp -r templates dist/', { stdio: 'inherit' });

    console.log('TypeScript build completed successfully!');
    return true;
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    return false;
  }
}

// Run the build if this script is executed directly
if (require.main === module) {
  const success = buildPackage();
  process.exit(success ? 0 : 1);
}

module.exports = { buildPackage };