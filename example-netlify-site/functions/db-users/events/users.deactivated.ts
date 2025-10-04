import type { DetectorFunction, HandlerFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';
import { job, run } from '@hopdrive/hasura-event-detector';
import { sendAccountClosureEmail } from '../jobs/send-account-closure-email';
import { revokeUserPermissions } from '../jobs/revoke-user-permissions';
import { archiveUserData } from '../jobs/archive-user-data';

/**
 * Event: users.deactivated
 *
 * Table: users (plural naming convention)
 * Operation: UPDATE
 * Condition: status changed to 'inactive'
 *
 * Detects when a user's status changes to 'inactive'
 * Triggers account closure flow and cleanup
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

      const wasActive = oldData?.status === 'active';
      const isNowInactive = newData?.status === 'inactive';

      // Reads like a sentence: "users table AND was active AND is now inactive"
      return isUsersTable && wasActive && isNowInactive;

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
    job(sendAccountClosureEmail),
    job(revokeUserPermissions),
    job(archiveUserData),
  ];

  return await run(eventName, hasuraEvent, jobs);
};
