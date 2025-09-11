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
    
    // Run type checking
    console.log('Running type checks...');
    execSync('npm run test:types', { stdio: 'inherit' });

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