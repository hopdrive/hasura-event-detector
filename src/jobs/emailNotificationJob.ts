/**
 * Email Notification Job
 * 
 * A realistic example of sending email notifications with proper TypeScript typing.
 */

import type { EventName, HasuraEventPayload, JobOptions } from '@/types/index.js';

interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface EmailJobOptions extends JobOptions {
  to?: string;
  template?: string;
  variables?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

interface EmailJobResult {
  action: 'email_sent' | 'email_failed' | 'email_skipped';
  recipient?: string;
  template?: string;
  messageId?: string;
  error?: string;
  timestamp: string;
}

/**
 * Simulated email service - replace with actual email provider
 */
class EmailService {
  private templates: Record<string, EmailTemplate> = {
    welcome: {
      subject: 'Welcome to our platform!',
      htmlBody: '<h1>Welcome {{name}}!</h1><p>Thanks for joining us.</p>',
      textBody: 'Welcome {{name}}! Thanks for joining us.'
    },
    activation: {
      subject: 'Account Activated',
      htmlBody: '<h1>Hi {{name}}</h1><p>Your account is now active!</p>',
      textBody: 'Hi {{name}}, your account is now active!'
    },
    orderConfirmation: {
      subject: 'Order Confirmation #{{orderNumber}}',
      htmlBody: '<h1>Order Confirmed</h1><p>Order #{{orderNumber}} for ${{total}}</p>',
      textBody: 'Order #{{orderNumber}} confirmed for ${{total}}'
    }
  };

  async sendEmail(
    to: string, 
    templateName: string, 
    variables: Record<string, any> = {}
  ): Promise<{ messageId: string }> {
    const template = this.templates[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    // Simulate email rendering
    let subject = template.subject;
    let htmlBody = template.htmlBody;
    
    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      subject = subject.replace(new RegExp(placeholder, 'g'), String(value));
      htmlBody = htmlBody.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional failures (5% chance)
    if (Math.random() < 0.05) {
      throw new Error('Email service temporarily unavailable');
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`📧 Email sent to ${to}: ${subject} [${messageId}]`);
    
    return { messageId };
  }
}

const emailService = new EmailService();

/**
 * Email notification job function
 */
export const emailNotificationJob = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options: EmailJobOptions = {}
): Promise<EmailJobResult> => {
  const timestamp = new Date().toISOString();
  
  try {
    // Validate required options
    if (!options.to) {
      return {
        action: 'email_skipped',
        error: 'No recipient specified',
        timestamp
      };
    }

    if (!options.template) {
      return {
        action: 'email_skipped',
        error: 'No template specified',
        timestamp
      };
    }

    // Send the email
    const result = await emailService.sendEmail(
      options.to,
      options.template,
      options.variables || {}
    );

    return {
      action: 'email_sent',
      recipient: options.to,
      template: options.template,
      messageId: result.messageId,
      timestamp
    };

  } catch (error) {
    console.error(`Failed to send email to ${options.to}:`, error);
    
    return {
      action: 'email_failed',
      recipient: options.to,
      template: options.template,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp
    };
  }
};

export default emailNotificationJob;