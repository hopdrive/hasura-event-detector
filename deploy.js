const { execSync } = require('child_process')

var args = process.argv.slice(2);
var version = args[0];

console.log(`Deploying version ${version}...`)

execSync(`npm --no-git-tag-version version ${version}`, {stdio: 'inherit'})
execSync(`npx genversion lib/version.js`, {stdio: 'inherit'})
execSync(`git commit -am "HopDrive deploy script set version ${version}"`)
execSync(`git tag -a v${version} -m "HopDrive deploy script set version ${version}"`, {stdio: 'inherit'})
execSync(`npm publish`, {stdio: 'inherit'})
execSync(`git push`, {stdio: 'inherit'})
execSync(`git push --tags`, {stdio: 'inherit'})