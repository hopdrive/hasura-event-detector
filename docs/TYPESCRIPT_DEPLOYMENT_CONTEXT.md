# TypeScript Multi-Module Build & Deployment Configuration

This context provides a complete TypeScript build and deployment setup that supports both CommonJS and ESM modules with proper type definitions and automated deployment scripts.

## Overview
This configuration creates a dual-module TypeScript package that:
- Builds to both CommonJS (`dist/cjs/`) and ESM (`dist/esm/`) formats
- Generates TypeScript declarations (`dist/types/`)
- Supports modern package.json exports field
- Includes automated deployment with version management
- Integrates with HopDrive deployment scripts

## File Structure
```
project/
├── tsconfig.json          # Base TypeScript configuration
├── tsconfig.cjs.json      # CommonJS build configuration
├── tsconfig.esm.json      # ESM build configuration
├── tsconfig.types.json    # Type definitions configuration
├── scripts/
│   ├── build.js           # Build orchestration script
│   ├── deploy-wrapper.js  # Deployment wrapper with error handling
│   └── modified-deploy.js # Modified deployment with empty commit
└── package.json           # Package configuration with scripts
```

## Complete Configuration Files

### 1. Base TypeScript Configuration (`tsconfig.json`)
```json
{
  "compilerOptions": {
    "target": "ES2019",
    "module": "ESNext",
    "moduleResolution": "node",
    "declaration": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist/esm",
    "declarationDir": "dist/types",
    "rootDir": "src",
    "sourceMap": true,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### 2. CommonJS Build Configuration (`tsconfig.cjs.json`)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "outDir": "dist/cjs"
  }
}
```

### 3. ESM Build Configuration (`tsconfig.esm.json`)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "outDir": "dist/esm"
  }
}
```

### 4. Type Definitions Configuration (`tsconfig.types.json`)
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declaration": true,
    "declarationDir": "dist/types",
    "emitDeclarationOnly": true
  }
}
```

### 5. Build Orchestration Script (`scripts/build.js`)
```javascript
const { execSync } = require('child_process');

/**
 * Pre-build script for TypeScript package
 * This handles TypeScript-specific build tasks
 */
function buildPackage() {
  console.log('Building TypeScript package...');

  try {
    // Clean previous build
    console.log('Cleaning previous build...');
    execSync('npm run clean', { stdio: 'inherit' });

    // Run TypeScript build process
    console.log('Compiling TypeScript...');
    execSync('npm run build:cjs', { stdio: 'inherit' });
    execSync('npm run build:esm', { stdio: 'inherit' });
    execSync('npm run build:types', { stdio: 'inherit' });

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
```

### 6. Deployment Wrapper Script (`scripts/deploy-wrapper.js`)
```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Wrapper script for the deploy process that handles errors gracefully
 */
function deployWrapper() {
  // Get version from command line arguments
  const args = process.argv.slice(2);
  const version = args[0];

  if (!version) {
    console.error('\n❌ Error: Please provide a version number: npm run deploy 1.0.0\n');
    process.exit(1);
  }

  try {
    // Read current version from package.json
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    // Check if trying to deploy the same version
    if (version === currentVersion) {
      console.error(`\n❌ Error: Version ${version} is already set in package.json.`);
      console.error(`Please use a different version number or update package.json first.\n`);
      process.exit(1);
    }

    // Run the build process
    console.log(`Building package before deployment...`);
    execSync('npm run build', { stdio: 'inherit' });

    // Run the deploy script
    console.log(`\nDeploying version ${version}...`);
    const deployScript = path.resolve(
      process.cwd(),
      'node_modules/@hopdrive/package-deploy-scripts/deploy.js'
    );

    execSync(`node "${deployScript}" ${version}`, { stdio: 'inherit' });

    console.log(`\n✅ Successfully deployed version ${version}!`);
  } catch (error) {
    // Check if it's a version not changed error
    if (error.message.includes('Version not changed')) {
      console.error(`\n❌ Error: Version ${version} is already set in package.json.`);
      console.error(`Please use a different version number or update package.json first.\n`);
    } else {
      // For other errors, show a cleaner message
      console.error(`\n❌ Deployment failed: ${error.message}\n`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  deployWrapper();
}
```

### 7. Modified Deployment Script (`scripts/modified-deploy.js`)
```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * A modified version of the deploy script that creates an empty commit first
 * to ensure there are always changes to commit
 */
function deploy() {
  // Get version from command line arguments
  const args = process.argv.slice(2);
  const version = args[0];

  if (!version) {
    console.error('\n❌ Error: Please provide a version number: npm run deploy 1.0.0\n');
    process.exit(1);
  }

  try {
    // Read current version from package.json
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    console.log(`Building package before deployment...`);
    execSync('npm run build', { stdio: 'inherit' });

    console.log(`\nDeploying version ${version}...`);

    // Create an empty commit first to ensure there are changes
    try {
      console.log('Creating an empty commit to ensure successful deployment...');
      execSync('git commit --allow-empty -m "Pre-deploy commit"', { stdio: 'inherit' });
    } catch (error) {
      // Ignore errors from the empty commit
      console.log('Empty commit failed, continuing with deployment...');
    }

    // Continue with normal deployment
    console.log(`Setting package version to ${version}...`);
    execSync(`npm --no-git-tag-version version ${version}`, { stdio: 'inherit' });

    // Commit the version change
    execSync(`git commit -am "HopDrive deploy script set version ${version}"`, { stdio: 'inherit' });

    // Create tag
    execSync(`git tag -a v${version} -m "HopDrive deploy script set version ${version}"`, { stdio: 'inherit' });

    // Publish
    execSync('npm publish', { stdio: 'inherit' });

    // Push changes and tags
    execSync('git push', { stdio: 'inherit' });
    execSync('git push --tags', { stdio: 'inherit' });

    console.log(`\n✅ Successfully deployed version ${version}!`);
  } catch (error) {
    console.error(`\n❌ Deployment failed: ${error.message}\n`);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  deploy();
}
```

## Package.json Configuration

### Essential Scripts Section
```json
{
  "scripts": {
    "build": "node scripts/build.js",
    "build:cjs": "tsc -p tsconfig.cjs.json",
    "build:esm": "tsc -p tsconfig.esm.json",
    "build:types": "tsc -p tsconfig.types.json",
    "clean": "rimraf dist",
    "test": "jest",
    "lint": "eslint src --ext .ts",
    "prepublishOnly": "npm run build",
    "deploy": "node scripts/deploy-wrapper.js",
    "deploy-force": "node scripts/modified-deploy.js"
  }
}
```

### Module Exports Configuration
```json
{
  "main": "dist/cjs/index.js",
  "module": "dist/esm/index.js",
  "types": "dist/types/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js",
      "types": "./dist/types/index.d.ts"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md",
    "LICENSE"
  ]
}
```

### Required Dependencies
```json
{
  "devDependencies": {
    "@hopdrive/package-deploy-scripts": "0.0.4",
    "@types/node": "^18.15.11",
    "@typescript-eslint/eslint-plugin": "^5.57.1",
    "@typescript-eslint/parser": "^5.57.1",
    "eslint": "^8.37.0",
    "rimraf": "^4.4.1",
    "typescript": "^5.0.3"
  }
}
```

## Usage Instructions

### 1. Setup
1. Copy all configuration files to your project
2. Install dependencies: `npm install`
3. Update package.json with your project details

### 2. Build Process
```bash
# Clean and build all formats
npm run build

# Build individual formats
npm run build:cjs    # CommonJS
npm run build:esm    # ESM modules
npm run build:types  # TypeScript declarations
```

### 3. Deployment
```bash
# Standard deployment (with error handling)
npm run deploy 1.0.0

# Force deployment (with empty commit)
npm run deploy-force 1.0.0
```

## Key Features

### TypeScript Configuration
- **Dual Module Support**: Builds both CommonJS and ESM formats
- **Type Safety**: Strict TypeScript configuration with full type checking
- **Source Maps**: Generated for debugging
- **Modern Target**: ES2019 with ES2020 libraries
- **Declaration Files**: Separate type definitions build

### Build System
- **Orchestrated Builds**: Single command builds all formats
- **Clean Builds**: Automatic cleanup before building
- **Error Handling**: Proper error reporting and exit codes
- **Modular Scripts**: Separate scripts for each build type

### Deployment System
- **Version Management**: Automatic version bumping and validation
- **Git Integration**: Automatic commits and tagging
- **Error Handling**: Graceful error handling with user-friendly messages
- **HopDrive Integration**: Works with HopDrive deployment scripts
- **Empty Commit Support**: Modified script ensures successful deployments

### Package Configuration
- **Modern Exports**: Uses package.json exports field for dual module support
- **TypeScript Support**: Proper type definitions and IntelliSense
- **File Inclusion**: Only includes necessary files in published package
- **Registry Configuration**: Supports GitHub Packages registry

## Customization Notes

1. **Source Directory**: Update `rootDir` in tsconfig.json if your source is not in `src/`
2. **Output Directories**: Modify `outDir` in each config if you want different output locations
3. **Target Version**: Adjust `target` in tsconfig.json for different JavaScript versions
4. **Dependencies**: Add or remove dependencies based on your project needs
5. **Registry**: Update `publishConfig.registry` for different npm registries

This configuration provides a robust, production-ready TypeScript build and deployment system that can be easily adapted to any TypeScript project.
