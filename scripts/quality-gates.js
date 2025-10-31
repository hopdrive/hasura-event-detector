#!/usr/bin/env node

/**
 * Quality Gates Script
 * 
 * Runs all quality checks for the project and ensures they meet minimum standards.
 * This script is designed to be run in CI/CD pipelines or before releases.
 */

const { spawn } = require('child_process');
const chalk = require('chalk');

const checks = [
  {
    name: 'TypeScript Compilation',
    command: 'npm',
    args: ['run', 'test:types'],
    description: 'Validates TypeScript types and compilation'
  },
  {
    name: 'ESLint',
    command: 'npm',
    args: ['run', 'lint'],
    description: 'Checks code style and quality'
  },
  {
    name: 'Unit Tests',
    command: 'npm',
    args: ['run', 'test:unit'],
    description: 'Runs unit tests with coverage'
  },
  {
    name: 'Integration Tests',
    command: 'npm',
    args: ['run', 'test:integration'],
    description: 'Runs integration tests'
  },
  {
    name: 'E2E Tests',
    command: 'npm',
    args: ['run', 'test:e2e'],
    description: 'Runs end-to-end CLI tests'
  },
  {
    name: 'Coverage Threshold',
    command: 'npm',
    args: ['run', 'test:coverage:check'],
    description: 'Validates coverage meets minimum thresholds (80%)'
  },
  {
    name: 'Build',
    command: 'npm',
    args: ['run', 'build'],
    description: 'Validates production build succeeds'
  }
];

async function runCheck(check) {
  return new Promise((resolve) => {
    console.log(chalk.blue(`\n🔍 Running: ${check.name}`));
    console.log(chalk.gray(`   ${check.description}`));
    
    const startTime = Date.now();
    const child = spawn(check.command, check.args, { 
      stdio: 'inherit',
      shell: true 
    });
    
    child.on('close', (code) => {
      const duration = Date.now() - startTime;
      const durationStr = `${(duration / 1000).toFixed(2)}s`;
      
      if (code === 0) {
        console.log(chalk.green(`✅ ${check.name} passed (${durationStr})`));
        resolve({ name: check.name, passed: true, duration });
      } else {
        console.log(chalk.red(`❌ ${check.name} failed (${durationStr})`));
        resolve({ name: check.name, passed: false, duration });
      }
    });
    
    child.on('error', (error) => {
      console.error(chalk.red(`❌ ${check.name} error: ${error.message}`));
      resolve({ name: check.name, passed: false, error: error.message });
    });
  });
}

async function main() {
  console.log(chalk.bold.cyan('\n🚦 Running Quality Gates\n'));
  console.log(chalk.gray('This will run all quality checks to ensure code meets standards.\n'));
  
  const startTime = Date.now();
  const results = [];
  
  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    
    // Stop on first failure if --fail-fast is provided
    if (!result.passed && process.argv.includes('--fail-fast')) {
      console.log(chalk.red('\n💥 Stopping on first failure (--fail-fast mode)'));
      break;
    }
  }
  
  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(chalk.bold('\n📊 Quality Gates Summary'));
  console.log(chalk.gray('='.repeat(50)));
  
  results.forEach(result => {
    const status = result.passed ? chalk.green('✅ PASS') : chalk.red('❌ FAIL');
    const duration = result.duration ? `${(result.duration / 1000).toFixed(2)}s` : 'N/A';
    console.log(`${status} ${result.name.padEnd(25)} ${duration}`);
  });
  
  console.log(chalk.gray('='.repeat(50)));
  console.log(`Total: ${results.length} checks`);
  console.log(`${chalk.green('Passed:')} ${passed}`);
  console.log(`${chalk.red('Failed:')} ${failed}`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  
  if (failed === 0) {
    console.log(chalk.bold.green('\n🎉 All quality gates passed! Ready for deployment.'));
    process.exit(0);
  } else {
    console.log(chalk.bold.red(`\n💥 ${failed} quality gate(s) failed. Please fix the issues above.`));
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n💥 Unhandled error:'), error);
  process.exit(1);
});

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n💥 Quality gates failed:'), error);
    process.exit(1);
  });
}