import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendWelcomeEmail } from '../jobs/send-welcome-email';
import { createUserProfile } from '../jobs/create-user-profile';
import { assignDefaultPermissions } from '../jobs/assign-default-permissions';

/**
 * Event: users.activated
 *
 * Table: users (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'active'
 *
 * Detects when a user's status changes to 'active'
 * Triggers welcome flow and account setup
 */

export const detector: DetectorFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  const isUsersTable = hasuraEvent.table?.name === 'users';
  const operation = hasuraEvent.event?.op;

  switch (operation) {
    case 'INSERT':
      return false; // New user creation not handled by this event

    case 'UPDATE':
      const oldData = hasuraEvent.event.data.old;
      const newData = hasuraEvent.event.data.new;

      const wasNotActive = oldData?.status !== 'active';
      const isNowActive = newData?.status === 'active';

      // Reads like a sentence: "users table AND was not active AND is now active"
      return isUsersTable && wasNotActive && isNowActive;

    case 'DELETE':
      return false; // Deletes not handled

    case 'MANUAL':
      return false; // Manual triggers not handled

    default:
      return false;
  }
};

export const handler: HandlerFunction = async (eventName, hasuraEvent: HasuraEventPayload) => {
  const jobs = [
    job(sendWelcomeEmail),
    job(createUserProfile),
    job(assignDefaultPermissions),
  ];

  return await run(eventName, hasuraEvent, jobs);
};
