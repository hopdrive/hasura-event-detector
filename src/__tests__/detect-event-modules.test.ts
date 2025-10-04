/**
 * Event Module Auto-Detection Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { listenTo } from '../detector';
import { createMockHasuraEvent, createTempDir, cleanupTempDir } from '../../tests/test-utils';
import { promises as fs } from 'fs';
import path from 'path';

describe('Event Module Auto-Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should exclude index.js from auto-detected modules', async () => {
    // Create several event modules including an index.js
    await fs.writeFile(path.join(tempDir, 'event-one.js'), `
      module.exports.detector = async () => true;
      module.exports.handler = async () => [];
    `);

    await fs.writeFile(path.join(tempDir, 'event-two.js'), `
      module.exports.detector = async () => true;
      module.exports.handler = async () => [];
    `);

    await fs.writeFile(path.join(tempDir, 'index.js'), `
      // This should be excluded from auto-detection
      module.exports.detector = async () => true;
      module.exports.handler = async () => [];
    `);

    const hasuraEvent = createMockHasuraEvent();
    const result = await listenTo(hasuraEvent, {
      autoLoadEventModules: true,
      eventModulesDirectory: tempDir,
    });

    // Should only detect event-one and event-two, not index
    expect(result.events).toHaveLength(2);
    expect(result.events.some(e => e.name === 'event-one')).toBe(true);
    expect(result.events.some(e => e.name === 'event-two')).toBe(true);
    expect(result.events.some(e => e.name === 'index')).toBe(false);
  });

  it('should exclude index.ts from auto-detected modules', async () => {
    // Create TypeScript event modules including an index.ts
    await fs.writeFile(path.join(tempDir, 'event-one.ts'), `
      export const detector = async () => true;
      export const handler = async () => [];
    `);

    await fs.writeFile(path.join(tempDir, 'index.ts'), `
      // This should be excluded from auto-detection
      export const detector = async () => true;
      export const handler = async () => [];
    `);

    const hasuraEvent = createMockHasuraEvent();
    const result = await listenTo(hasuraEvent, {
      autoLoadEventModules: true,
      eventModulesDirectory: tempDir,
    });

    // Should only detect event-one, not index
    expect(result.events).toHaveLength(1);
    expect(result.events[0].name).toBe('event-one');
    expect(result.events.some(e => e.name === 'index')).toBe(false);
  });

  it('should only include .js and .ts files', async () => {
    // Create various file types
    await fs.writeFile(path.join(tempDir, 'event-one.js'), `
      module.exports.detector = async () => true;
      module.exports.handler = async () => [];
    `);

    await fs.writeFile(path.join(tempDir, 'event-two.ts'), `
      export const detector = async () => true;
      export const handler = async () => [];
    `);

    await fs.writeFile(path.join(tempDir, 'readme.md'), 'Documentation');
    await fs.writeFile(path.join(tempDir, 'config.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'event.txt'), 'text file');

    const hasuraEvent = createMockHasuraEvent();
    const result = await listenTo(hasuraEvent, {
      autoLoadEventModules: true,
      eventModulesDirectory: tempDir,
    });

    // Should only detect .js and .ts files
    expect(result.events).toHaveLength(2);
    expect(result.events.some(e => e.name === 'event-one')).toBe(true);
    expect(result.events.some(e => e.name === 'event-two')).toBe(true);
  });
});
