/**
 * @typedef {Object} HasuraEventPayload
 * @property {HasuraEvent} event - The information about the database event that ocurred
 * @property {string} created_at - Timestamp at which event was created
 * @property {UUID} id - UUID identifier for the event
 * @property {HasuraTrigger} trigger - Describes the trigger that raised the event
 * @property {HasuraTable} table - Describes the table the event was raised from
 */

/**
 * @typedef {Object} HasuraEvent
 * @property {string[]|null} session_variables - Key-value pairs of session variables (i.e. "x-hasura-*" variables) and their values (NULL if no session variables found)
 * @property {string} op - Name of the operation. Can only be "INSERT", "UPDATE", "DELETE", "MANUAL"
 * @property {HasuraData} data - The before and after copies of the table row
 */

/**
 * @typedef {Object} HasuraData
 * @property {Object|null} old - Key-value pairs of column name and their values of the table before an update
 * @property {Object|null} new - Key-value pairs of column name and their values of the table after an update
 */

/**
 * @typedef {Object} HasuraTrigger
 * @property {string} name - Name of the trigger
 */

/**
 * @typedef {Object} HasuraTable
 * @property {string} schema - Name of the schema for the table
 * @property {string} name - Name of the table
 */

/**
 * Universally unique identifier.
 * @typedef {string} UUID
 */

/**
 * Safely extract from the Hasura Event specific items if they are present
 * to make referring to these items more convenient in other calling parts
 * of the application.
 *
 * @param {HasuraEventPayload} hasuraEvent Hasura event trigger payload as
 *    defined here: https://hasura.io/docs/latest/event-triggers/payload/
 * @returns {Object} Items extracted from the Hasura Event for convenience
 */
const parseHasuraEvent = hasuraEvent => {
  let hasuraEventTime;
  let hasuraEventId;
  let dbEvent;
  let sessionVariables;
  let role;
  let user;
  let operation; //Can only be "INSERT", "UPDATE", "DELETE", "MANUAL"

  try {
    hasuraEventTime = hasuraEvent?.created_at;
    hasuraEventId = hasuraEvent?.id
    dbEvent = hasuraEvent?.event?.data;
    operation = hasuraEvent?.event?.op;
    sessionVariables = hasuraEvent?.event?.session_variables;
    try {
      role = sessionVariables['x-hasura-role'];
      user = sessionVariables['x-hasura-user-email'] || (role === 'admin' ? 'system' : null);
    } catch {}
  } catch (error) {
    console.error('Error parsing Hasura event:', error.message);
  }

  return { hasuraEventTime, hasuraEventId, dbEvent, sessionVariables, role, user, operation };
};

/**
 * Compare the old and new record embedded in the HasuraEvent.data
 * property to detect changes to a specific column name.
 *
 * @param {String} column The name of the column to compare
 * @param {HasuraData} hasuraData The data element from a Hasura event
 * @returns {Boolean} True if differences found, else false
 */
const columnHasChanged = (column, hasuraData) => {
  try {
    if (!column) return false;
    if (!hasuraData) return false;
    if (!hasuraData.hasOwnProperty('old')) return false;
    if (!hasuraData.hasOwnProperty('new')) return false;
    if (!hasuraData.old.hasOwnProperty(column)) return false;
    if (!hasuraData.new.hasOwnProperty(column)) return false;
    //log('columnHasChanged', column, { before: dbEvent.old[column], after: dbEvent.new[column] });
    return hasuraData.old[column] !== hasuraData.new[column];
  } catch (error) {
    console.error(`columnHasChanged failed`, error.message);
  }
};

module.exports = { parseHasuraEvent, columnHasChanged };
