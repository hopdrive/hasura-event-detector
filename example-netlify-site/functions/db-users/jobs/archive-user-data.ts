import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Archive User Data
 *
 * Purpose: Archives user data to long-term storage
 * Action-Oriented: "archive" is the action, "user data" is what
 * Single-Purpose: ONLY archives data, doesn't send emails or revoke permissions
 */

export const archiveUserData: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const userData = hasuraEvent.event.data.new;

  console.log('[archiveUserData] Archiving data for user:', userData.id);

  // Simulate archive service
  await new Promise(resolve => setTimeout(resolve, 300));

  // In production: Copy to archive storage and mark as archived
  // await archiveService.store({
  //   userId: userData.id,
  //   data: userData,
  //   timestamp: new Date().toISOString(),
  // });

  return {
    success: true,
    userId: userData.id,
    archivedAt: new Date().toISOString(),
  };
};
