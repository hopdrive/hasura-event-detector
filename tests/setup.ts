/**
 * Jest Test Setup
 * 
 * Global test configuration and utilities.
 */

import { jest } from '@jest/globals';

// Extend Jest matchers
expect.extend({
  toBeValidCorrelationId(received: unknown) {
    const pass = typeof received === 'string' && 
                  received.includes('.') && 
                  received.split('.').length === 2;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid correlation ID`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid correlation ID (format: source.uuid)`,
        pass: false
      };
    }
  },
  
  toBeValidJobResult(received: unknown) {
    const pass = typeof received === 'object' && 
                  received !== null &&
                  'name' in received &&
                  'duration' in received &&
                  'completed' in received &&
                  'result' in received;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid job result`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid job result with required properties`,
        pass: false
      };
    }
  }
});

// Global test utilities
global.testUtils = {
  // Create a delay for testing async operations
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate a unique test ID
  generateTestId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Mock console methods while preserving original behavior
  mockConsole: () => {
    const originalConsole = { ...console };
    const mockLog = jest.fn();
    const mockError = jest.fn();
    const mockWarn = jest.fn();
    
    console.log = mockLog;
    console.error = mockError;
    console.warn = mockWarn;
    
    return {
      mockLog,
      mockError,
      mockWarn,
      restore: () => {
        console.log = originalConsole.log;
        console.error = originalConsole.error;
        console.warn = originalConsole.warn;
      }
    };
  }
};

// Suppress console output during tests unless explicitly needed
if (process.env.NODE_ENV === 'test' && !process.env.VERBOSE_TESTS) {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = 'true';

// Declare global types for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidCorrelationId(): R;
      toBeValidJobResult(): R;
    }
  }
  
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    generateTestId: () => string;
    mockConsole: () => {
      mockLog: jest.MockedFunction<typeof console.log>;
      mockError: jest.MockedFunction<typeof console.error>;
      mockWarn: jest.MockedFunction<typeof console.warn>;
      restore: () => void;
    };
  };
}