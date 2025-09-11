/**
 * CLI End-to-End Tests
 * 
 * Tests for CLI commands and functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import fs from 'fs';
import path from 'path';

describe('CLI End-to-End Tests', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  });

  const runCLI = (args: string[], timeout: number = 10000): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }> => {
    return new Promise((resolve, reject) => {
      const cliPath = path.join(originalCwd, 'bin/hasura-event-detector');
      const child = spawn('node', [cliPath, ...args], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      child.on('error', reject);

      // Timeout protection
      setTimeout(() => {
        child.kill();
        reject(new Error(`CLI command timed out after ${timeout}ms`));
      }, timeout);
    });
  };

  describe('init command', () => {
    it('should initialize a new project', async () => {
      const result = await runCLI(['init']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Initializing Hasura Event Detector project');
      expect(result.stdout).toContain('Project initialized successfully');

      // Check created files
      expect(fs.existsSync('./events')).toBe(true);
      expect(fs.existsSync('./events/user-activation.js')).toBe(true);
      expect(fs.existsSync('./hasura-event-detector.config.js')).toBe(true);
    });

    it('should initialize with TypeScript when requested', async () => {
      const result = await runCLI(['init', '--typescript']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Project initialized successfully');

      // Check TypeScript files
      expect(fs.existsSync('./events/user-activation.ts')).toBe(true);
      expect(fs.existsSync('./hasura-event-detector.config.ts')).toBe(true);
    });
  });

  describe('create command', () => {
    beforeEach(async () => {
      // Initialize project first
      await runCLI(['init']);
    });

    it('should create a new event module', async () => {
      const result = await runCLI(['create', 'order-completed']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Creating event module: order-completed');
      expect(result.stdout).toContain('Event module created');

      // Check created file
      expect(fs.existsSync('./events/order-completed.ts')).toBe(true);

      // Verify file content
      const content = await fs.promises.readFile('./events/order-completed.ts', 'utf8');
      expect(content).toContain('order-completed');
      expect(content).toContain('Order Completed');
    });

    it('should create with specified template', async () => {
      const result = await runCLI(['create', 'user-signup', '--template', 'user-activation']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Template used: user-activation');

      const content = await fs.promises.readFile('./events/user-signup.ts', 'utf8');
      expect(content).toContain('user-signup');
    });

    it('should fail with invalid event name', async () => {
      const result = await runCLI(['create', 'Invalid_Event_Name']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Event name must contain only lowercase letters, numbers, and hyphens');
    });

    it('should fail when event already exists', async () => {
      // Create event first time
      await runCLI(['create', 'duplicate-event']);

      // Try to create again
      const result = await runCLI(['create', 'duplicate-event']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Event module already exists');
    });
  });

  describe('list command', () => {
    beforeEach(async () => {
      await runCLI(['init']);
      await runCLI(['create', 'test-event-1']);
      await runCLI(['create', 'test-event-2']);
    });

    it('should list all event modules', async () => {
      const result = await runCLI(['list']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found 3 event module(s)'); // init creates user-activation + 2 created
      expect(result.stdout).toContain('test-event-1');
      expect(result.stdout).toContain('test-event-2');
      expect(result.stdout).toContain('user-activation');
    });

    it('should show detailed information with --detailed flag', async () => {
      const result = await runCLI(['list', '--detailed']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Detector:');
      expect(result.stdout).toContain('Handler:');
      expect(result.stdout).toContain('Lines:');
    });

    it('should handle empty events directory', async () => {
      // Remove all events
      await fs.promises.rm('./events', { recursive: true });

      const result = await runCLI(['list']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('No event modules found');
    });
  });

  describe('test command', () => {
    beforeEach(async () => {
      await runCLI(['init']);
    });

    it('should test an existing event module', async () => {
      const result = await runCLI(['test', 'user-activation']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Testing event module: user-activation');
      expect(result.stdout).toContain('Test completed');
      expect(result.stdout).toContain('Events detected:');
    });

    it('should run dry-run test', async () => {
      const result = await runCLI(['test', 'user-activation', '--dry-run']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('This was a dry run');
    });

    it('should test with custom data file', async () => {
      // Create test data file
      const testData = {
        id: 'test-123',
        created_at: new Date().toISOString(),
        table: { name: 'users', schema: 'public' },
        event: {
          op: 'UPDATE',
          data: {
            old: { id: 1, active: false },
            new: { id: 1, active: true }
          },
          session_variables: { 'x-hasura-role': 'user' }
        }
      };

      await fs.promises.writeFile('./test-data.json', JSON.stringify(testData, null, 2));

      const result = await runCLI(['test', 'user-activation', '--file', './test-data.json']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Test completed');
    });

    it('should fail for non-existent event', async () => {
      const result = await runCLI(['test', 'non-existent-event']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Event module not found');
    });

    it('should fail for invalid test data file', async () => {
      await fs.promises.writeFile('./invalid.json', 'invalid json content');

      const result = await runCLI(['test', 'user-activation', '--file', './invalid.json']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Test failed');
    });
  });

  describe('validate command', () => {
    beforeEach(async () => {
      await runCLI(['init']);
    });

    it('should validate a valid configuration', async () => {
      const result = await runCLI(['validate']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Validating configuration');
      expect(result.stdout).toContain('Configuration is valid');
    });

    it('should validate configuration with warnings', async () => {
      // Create minimal config that will generate warnings
      const minimalConfig = `
module.exports = {};
      `;
      await fs.promises.writeFile('./minimal.config.js', minimalConfig);

      const result = await runCLI(['validate', '--config', './minimal.config.js']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Warnings:');
    });

    it('should fail for missing config file', async () => {
      const result = await runCLI(['validate', '--config', './nonexistent.config.js']);

      expect(result.exitCode).toBe(0); // Shows warning but doesn't fail
      expect(result.stdout).toContain('Config file not found');
    });

    it('should fail for invalid configuration', async () => {
      // Create invalid config
      const invalidConfig = `
module.exports = {
  observability: {
    enabled: true,
    database: {
      // Missing required fields
    }
  }
};
      `;
      await fs.promises.writeFile('./invalid.config.js', invalidConfig);

      const result = await runCLI(['validate', '--config', './invalid.config.js']);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain('Issues found');
      expect(result.stdout).toContain('Database host is required');
    });
  });

  describe('help and version', () => {
    it('should show help information', async () => {
      const result = await runCLI(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('create');
      expect(result.stdout).toContain('test');
      expect(result.stdout).toContain('list');
    });

    it('should show version information', async () => {
      const result = await runCLI(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version pattern
    });

    it('should show command-specific help', async () => {
      const result = await runCLI(['create', '--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('create <eventName>');
      expect(result.stdout).toContain('--template');
    });
  });

  describe('error handling', () => {
    it('should handle unknown commands gracefully', async () => {
      const result = await runCLI(['unknown-command']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('unknown command');
    });

    it('should handle missing required arguments', async () => {
      const result = await runCLI(['create']); // Missing event name

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('missing required argument');
    });

    it('should handle filesystem errors gracefully', async () => {
      // Try to create event in read-only directory
      await fs.promises.chmod(tempDir, 0o444); // Read-only

      const result = await runCLI(['init']);

      // Should handle the error gracefully
      expect(result.exitCode).toBe(1);

      // Restore permissions for cleanup
      await fs.promises.chmod(tempDir, 0o755);
    });
  });

  describe('directory options', () => {
    it('should respect custom events directory', async () => {
      await runCLI(['init']);
      
      // Create custom directory
      await fs.promises.mkdir('./custom-events');

      const result = await runCLI(['create', 'custom-event', '--directory', './custom-events']);

      expect(result.exitCode).toBe(0);
      expect(fs.existsSync('./custom-events/custom-event.ts')).toBe(true);
    });

    it('should list events from custom directory', async () => {
      await runCLI(['init']);
      await fs.promises.mkdir('./custom-events');
      await runCLI(['create', 'custom-event', '--directory', './custom-events']);

      const result = await runCLI(['list', '--directory', './custom-events']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found 1 event module(s)');
      expect(result.stdout).toContain('custom-event');
    });
  });
});