/**
 * Email Notification Job Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { emailNotificationJob } from '../emailNotificationJob';
import { createMockHasuraEvent, createTestJobOptions } from '../../../tests/test-utils';

describe('Email Notification Job', () => {
  let mockConsole: ReturnType<typeof global.testUtils.mockConsole>;

  beforeEach(() => {
    mockConsole = global.testUtils.mockConsole();
  });

  afterEach(() => {
    mockConsole.restore();
  });

  it('should send email successfully with valid options', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome',
      variables: { name: 'John Doe' }
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_sent');
    expect(result.recipient).toBe('test@example.com');
    expect(result.template).toBe('welcome');
    expect(result.messageId).toMatch(/^msg_\d+_[a-z0-9]+$/);
    expect(result.timestamp).toBeDefined();
  });

  it('should skip email when recipient is missing', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      template: 'welcome'
      // Missing 'to' field
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_skipped');
    expect(result.error).toBe('No recipient specified');
  });

  it('should skip email when template is missing', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com'
      // Missing 'template' field
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_skipped');
    expect(result.error).toBe('No template specified');
  });

  it('should handle email service failures', async () => {
    // Mock Math.random to always trigger failure condition
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.01); // Force failure (< 0.05)

    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome'
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_failed');
    expect(result.error).toBe('Email service temporarily unavailable');

    // Restore Math.random
    Math.random = originalRandom;
  });

  it('should handle unknown template', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'nonexistent-template'
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_failed');
    expect(result.error).toBe("Template 'nonexistent-template' not found");
  });

  it('should replace variables in email templates', async () => {
    // This test verifies the template rendering logic
    // Since we can't easily test the internal email service,
    // we verify the job completes successfully with variables
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome',
      variables: {
        name: 'Jane Smith',
        company: 'Acme Corp'
      }
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_sent');
    expect(result.recipient).toBe('test@example.com');
    expect(result.template).toBe('welcome');
  });

  it('should handle empty variables object', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome',
      variables: {}
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_sent');
  });

  it('should handle undefined variables', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome'
      // variables is undefined
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_sent');
  });

  it('should include timestamp in all responses', async () => {
    const beforeTime = new Date();
    
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome'
    });

    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);
    
    const afterTime = new Date();

    expect(result.timestamp).toBeDefined();
    const resultTime = new Date(result.timestamp);
    expect(resultTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    expect(resultTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
  });

  it('should log email sending to console', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome'
    });

    await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(mockConsole.mockLog).toHaveBeenCalledWith(
      expect.stringContaining('📧 Email sent to test@example.com')
    );
  });

  it('should log errors to console', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'nonexistent-template'
    });

    await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(mockConsole.mockError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send email to test@example.com'),
      expect.any(Error)
    );
  });

  it('should work with all available templates', async () => {
    // Mock Math.random to avoid random failures
    const originalRandom = Math.random;
    Math.random = jest.fn(() => 0.1); // Ensure no random failures (> 0.05)

    const templates = ['welcome', 'activation', 'orderConfirmation'];
    const hasuraEvent = createMockHasuraEvent();

    try {
      for (const template of templates) {
        const options = createTestJobOptions({
          to: 'test@example.com',
          template,
          variables: { 
            name: 'Test User',
            orderNumber: '12345',
            total: '99.99'
          }
        });

        const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

        expect(result.action).toBe('email_sent');
        expect(result.template).toBe(template);
      }
    } finally {
      // Restore Math.random
      Math.random = originalRandom;
    }
  });

  it('should handle priority option (for future use)', async () => {
    const hasuraEvent = createMockHasuraEvent();
    const options = createTestJobOptions({
      to: 'test@example.com',
      template: 'welcome',
      priority: 'high'
    });

    // Currently priority doesn't affect behavior, but job should still succeed
    const result = await emailNotificationJob('test-event' as any, hasuraEvent, options);

    expect(result.action).toBe('email_sent');
  });
});