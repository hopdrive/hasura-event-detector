import type { JobFunction, HasuraEventPayload } from '@hopdrive/hasura-event-detector';

/**
 * Job: Revoke User Permissions
 *
 * Purpose: Revokes ALL permissions for the deactivated user
 * Action-Oriented: "revoke" is the action, "user permissions" is what
 * Single-Purpose: ONLY revokes permissions, doesn't send emails or archive data
 */

export const revokeUserPermissions: JobFunction = async (
  eventName,
  hasuraEvent: HasuraEventPayload,
  options
) => {
  const userData = hasuraEvent.event.data.new;

  console.log('[revokeUserPermissions] Revoking permissions for user:', userData.id);

  // Simulate permission system API
  await new Promise(resolve => setTimeout(resolve, 250));

  // In production: Update permissions table or call IAM service
  // await db.query(`
  //   DELETE FROM user_permissions
  //   WHERE user_id = $1
  // `, [userData.id]);

  return {
    success: true,
    userId: userData.id,
    permissionsRevoked: true,
  };
};
