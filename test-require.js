#!/usr/bin/env node

// Test script to verify the package can be required
console.log('Testing require of @hopdrive/hasura-event-detector...\n');

try {
  // Test 1: Direct require from dist
  console.log('Test 1: Requiring from dist/cjs/index.js');
  const direct = require('./dist/cjs/index.js');
  console.log('✅ Direct require successful');
  console.log('Exports:', Object.keys(direct));
  
  console.log('\n---\n');
  
  // Test 2: Package require (simulating npm install)
  console.log('Test 2: Requiring as npm package');
  const pkg = require('.');
  console.log('✅ Package require successful');
  console.log('Exports:', Object.keys(pkg));
  
  console.log('\n---\n');
  
  // Test 3: Check specific exports
  console.log('Test 3: Checking specific exports');
  const { listenTo, handleSuccess, handleFailure } = require('.');
  console.log('✅ listenTo:', typeof listenTo);
  console.log('✅ handleSuccess:', typeof handleSuccess);
  console.log('✅ handleFailure:', typeof handleFailure);
  
  console.log('\n✨ All tests passed!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}