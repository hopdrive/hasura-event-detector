/**
 * Test Event Command
 *
 * CLI command to test event modules with sample data.
 */

import fs from 'fs';
import path from 'path';
import { listenTo } from '../detector.js';
import type { HasuraEventPayload, EventName } from '../types/index.js';

interface TestEventOptions {
  file?: string;
  directory: string;
  dryRun?: boolean;
}

export async function testEventCommand(eventName: string, options: TestEventOptions) {
  console.log(`🧪 Testing event module: ${eventName}`);

  try {
    // Check if event module exists
    const eventPath = path.join(options.directory, `${eventName}.ts`);
    const eventPathJs = path.join(options.directory, `${eventName}.js`);

    if (!fs.existsSync(eventPath) && !fs.existsSync(eventPathJs)) {
      throw new Error(`Event module not found: ${eventPath} or ${eventPathJs}`);
    }

    // Load test data
    let testEvent: HasuraEventPayload;

    if (options.file) {
      // Load from specified file
      if (!fs.existsSync(options.file)) {
        throw new Error(`Test file not found: ${options.file}`);
      }

      const fileContent = fs.readFileSync(options.file, 'utf8');
      testEvent = JSON.parse(fileContent);
    } else {
      // Generate sample event based on event name
      testEvent = generateSampleEvent(eventName);
      console.log('📋 Using generated sample event data');
    }

    console.log('📥 Test event payload:', JSON.stringify(testEvent, null, 2));

    // Configure test environment
    const testConfig = {
      autoLoadEventModules: true,
      eventModulesDirectory: options.directory,
      sourceFunction: 'cli-test',
    };

    console.log('🚀 Running event detection...');

    const startTime = Date.now();
    const result = await listenTo(testEvent, {
      ...testConfig,
      context: {
        testMode: true,
        dryRun: options.dryRun,
      },
    });
    const durationMs = Date.now() - startTime;

    console.log(`\n✅ Test completed in ${durationMs}ms`);
    console.log(`📊 Events detected: ${result.events.length}`);

    if (result.events.length === 0) {
      console.log('ℹ️  No events were detected. Check your detector logic.');
      return;
    }

    // Display results
    for (const event of result.events) {
      console.log(`\n🎯 Event: ${event.name}`);
      console.log(`📦 Jobs executed: ${event.jobs.length}`);

      for (const job of event.jobs) {
        const status = job.completed ? '✅' : '❌';
        const durationMs = job.durationMs || 0;

        console.log(`  ${status} ${job.name} (${durationMs}ms)`);

        if (job.result && typeof job.result === 'object') {
          console.log(`      Result:`, JSON.stringify(job.result, null, 6));
        } else if (job.result) {
          console.log(`      Result: ${job.result}`);
        }

        if (job.error) {
          console.log(`      Error: ${job.error.message}`);
        }
      }
    }

    // Summary
    const totalJobs = result.events.reduce((sum, e) => sum + e.jobs.length, 0);
    const successfulJobs = result.events.reduce((sum, e) => sum + e.jobs.filter(j => j.completed).length, 0);

    console.log(`\n📈 Summary:`);
    console.log(`   Events detected: ${result.events.length}`);
    console.log(`   Total jobs: ${totalJobs}`);
    console.log(`   Successful jobs: ${successfulJobs}`);
    console.log(`   Failed jobs: ${totalJobs - successfulJobs}`);
    console.log(`   Total duration: ${result.durationMs}ms`);

    if (options.dryRun) {
      console.log('\n🔍 This was a dry run - jobs were not actually executed');
    }
  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Generate sample Hasura event based on event name
 */
function generateSampleEvent(eventName: string): HasuraEventPayload {
  const baseEvent: HasuraEventPayload = {
    id: `test_${Date.now()}`,
    created_at: new Date().toISOString(),
    table: {
      name: 'users',
      schema: 'public',
    },
    delivery_info: {
      max_retries: 0,
      current_retry: 0,
    },
    trigger: {
      name: `${eventName}_trigger`,
    },
    event: {
      op: 'UPDATE',
      data: {
        old: {},
        new: {},
      },
      session_variables: {
        'x-hasura-role': 'user',
        'x-hasura-user-id': '123',
        'x-hasura-user-email': 'test@example.com',
      },
    },
  };

  // Customize based on event name
  switch (true) {
    case eventName.includes('user-activation') || eventName.includes('activation'):
      baseEvent.event.data = {
        old: { id: 123, email: 'test@example.com', active: false, created_at: '2024-01-01T00:00:00Z' },
        new: { id: 123, email: 'test@example.com', active: true, created_at: '2024-01-01T00:00:00Z' },
      };
      break;

    case eventName.includes('order') || eventName.includes('purchase'):
      baseEvent.table = { name: 'orders', schema: 'public' };
      baseEvent.event.op = 'INSERT';
      baseEvent.event.data = {
        new: {
          id: 456,
          user_id: 123,
          total: 99.99,
          status: 'completed',
          items: [{ name: 'Test Product', price: 99.99 }],
        },
      };
      break;

    case eventName.includes('payment'):
      baseEvent.table = { name: 'payments', schema: 'public' };
      baseEvent.event.data = {
        old: { id: 789, status: 'pending', amount: 99.99 },
        new: { id: 789, status: 'paid', amount: 99.99 },
      };
      break;

    default:
      // Generic status change
      baseEvent.event.data = {
        old: { id: 123, status: 'pending' },
        new: { id: 123, status: 'active' },
      };
  }

  return baseEvent;
}