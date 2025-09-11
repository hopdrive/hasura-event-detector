/**
 * User Activation Event Module
 * 
 * Detects when a user account becomes active and triggers welcome workflows.
 */

import type { 
  EventName, 
  HasuraEventPayload, 
  DetectorFunction, 
  HandlerFunction,
  JobResult 
} from '@hopdrive/hasura-event-detector';
import { parseHasuraEvent, columnHasChanged, job, run } from '@hopdrive/hasura-event-detector';

/**
 * Detects user activation events
 * Triggers when a user's active status changes from false to true
 */
export const detector: DetectorFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<boolean> => {
  const { dbEvent, operation } = parseHasuraEvent(hasuraEvent);
  
  // Only process UPDATE operations
  if (operation !== 'UPDATE') return false;
  
  // Check if the 'active' column changed
  if (!columnHasChanged('active', dbEvent)) return false;
  
  // Verify the user was activated (false -> true)
  const wasInactive = dbEvent?.old?.active === false;
  const isNowActive = dbEvent?.new?.active === true;
  
  return wasInactive && isNowActive;
};

/**
 * Handles user activation by triggering welcome workflows
 */
export const handler: HandlerFunction = async (
  event: EventName, 
  hasuraEvent: HasuraEventPayload
): Promise<JobResult[]> => {
  const { dbEvent, user, hasuraEventId } = parseHasuraEvent(hasuraEvent);
  const activatedUser = dbEvent?.new;
  
  const jobs = [
    // Send welcome email
    job(async (event, hasuraEvent, options) => {
      const email = activatedUser?.email;
      const firstName = activatedUser?.first_name;
      
      console.log(`Sending welcome email to ${email}`);
      
      // Integration example - replace with your email service
      // await emailService.sendTemplate('welcome', {
      //   to: email,
      //   variables: { firstName, activationDate: new Date() }
      // });
      
      return {
        action: 'welcome_email_sent',
        recipient: email,
        template: 'welcome',
        sentAt: new Date().toISOString()
      };
    }, {
      timeout: 8000,
      retries: 3
    }),
    
    // Create onboarding checklist
    job(async (event, hasuraEvent, options) => {
      const userId = activatedUser?.id;
      
      console.log(`Creating onboarding checklist for user ${userId}`);
      
      // Example onboarding tasks
      const tasks = [
        'Complete profile',
        'Upload avatar', 
        'Connect social accounts',
        'Take product tour',
        'Invite team members'
      ];
      
      // Database insertion example
      // await db.onboardingTasks.createMany({
      //   data: tasks.map(task => ({
      //     userId,
      //     task,
      //     completed: false,
      //     createdAt: new Date()
      //   }))
      // });
      
      return {
        action: 'onboarding_checklist_created',
        userId,
        taskCount: tasks.length,
        tasks
      };
    }),
    
    // Track activation analytics
    job(async (event, hasuraEvent, options) => {
      const userId = activatedUser?.id;
      const signupDate = activatedUser?.created_at;
      const activationDate = new Date();
      
      // Calculate time to activation
      const timeToActivation = signupDate 
        ? activationDate.getTime() - new Date(signupDate).getTime()
        : null;
      
      console.log(`Recording user activation analytics for ${userId}`);
      
      // Analytics tracking example
      // await analytics.track('User Activated', {
      //   userId,
      //   email: activatedUser?.email,
      //   timeToActivationMs: timeToActivation,
      //   activationDate: activationDate.toISOString(),
      //   source: 'hasura_trigger'
      // });
      
      return {
        action: 'activation_analytics_tracked',
        userId,
        timeToActivationMs: timeToActivation,
        activationDate: activationDate.toISOString()
      };
    }),
    
    // Notify team of new activation
    job(async (event, hasuraEvent, options) => {
      const userEmail = activatedUser?.email;
      const userPlan = activatedUser?.plan || 'free';
      
      console.log(`Notifying team of user activation: ${userEmail}`);
      
      // Team notification example (Slack, Discord, etc.)
      // await slack.postMessage({
      //   channel: '#user-activations',
      //   text: `🎉 New user activated: ${userEmail} (${userPlan} plan)`,
      //   blocks: [{
      //     type: 'section',
      //     text: {
      //       type: 'mrkdwn',
      //       text: `*New User Activation*\n\nEmail: ${userEmail}\nPlan: ${userPlan}\nTime: ${new Date().toLocaleString()}`
      //     }
      //   }]
      // });
      
      return {
        action: 'team_notification_sent',
        userEmail,
        userPlan,
        notificationChannel: '#user-activations'
      };
    }, {
      timeout: 5000
    })
  ];
  
  return await run(event, hasuraEvent, jobs) || [];
};

export default { detector, handler };