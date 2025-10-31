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

    // Run type checking
    console.log('Running type checks...');
    execSync('npm run test:types', { stdio: 'inherit' });

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