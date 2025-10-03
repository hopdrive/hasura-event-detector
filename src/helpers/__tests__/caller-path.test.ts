/**
 * Caller Path Helper Tests
 */

import { describe, it, expect } from '@jest/globals';
import { getCallerDirectory, resolveFromCaller } from '../caller-path';
import path from 'path';

describe('Caller Path Helpers', () => {
  describe('getCallerDirectory', () => {
    it('should return a valid directory path', () => {
      const callerDir = getCallerDirectory();

      expect(typeof callerDir).toBe('string');
      expect(callerDir.length).toBeGreaterThan(0);
      expect(path.isAbsolute(callerDir)).toBe(true);
    });

    it('should return directory containing this test file', () => {
      const callerDir = getCallerDirectory();

      // Should contain __tests__ directory since this is called from a test file
      expect(callerDir).toContain('__tests__');
    });
  });

  describe('resolveFromCaller', () => {
    it('should resolve relative paths from caller directory', () => {
      const resolved = resolveFromCaller('./events');

      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved).toContain('helpers'); // Called from helpers/__tests__
      expect(resolved.endsWith('events')).toBe(true);
    });

    it('should return absolute paths unchanged', () => {
      const absolutePath = '/absolute/path/to/events';
      const resolved = resolveFromCaller(absolutePath);

      expect(resolved).toBe(absolutePath);
    });

    it('should handle paths with ../', () => {
      const resolved = resolveFromCaller('../events');

      expect(path.isAbsolute(resolved)).toBe(true);
      expect(resolved.endsWith('events')).toBe(true);
    });
  });
});
