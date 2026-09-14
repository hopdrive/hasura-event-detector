/**
 * Classification of transport failures into permanent (the batch will never be
 * accepted, so re-sending it is a loop) and transient (worth a retry).
 *
 * The loop this guards against: a lane DELETE carrying a non-uuid id made
 * `insert_invocations` reject the whole batch, and because the buffer only
 * cleared on success the plugin re-sent it about four times a second for five
 * hours. Nothing about that batch was going to change between attempts.
 */

/** SQLSTATE classes that no amount of retrying will fix. */
const PERMANENT_SQLSTATE_CLASSES = [
  '22', // data exception, e.g. 22P02 invalid input syntax for type uuid
  '23', // integrity constraint violation, e.g. 23503 foreign key, 23505 unique
];

/**
 * Hasura's `extensions.code` values that mean the request itself is wrong.
 * `permission-error` is in the list because a missing permission stays missing
 * until someone changes metadata, which a retry loop cannot do.
 */
const PERMANENT_GRAPHQL_CODES = new Set([
  'data-exception',
  'constraint-violation',
  'validation-failed',
  'parse-failed',
  'bad-request',
  'permission-error',
]);

const isPermanentSqlState = (value: unknown): boolean =>
  typeof value === 'string' && PERMANENT_SQLSTATE_CLASSES.includes(value.slice(0, 2));

/**
 * True when the error says the data is wrong rather than the write path.
 *
 * Recognises a pg driver error (`error.code` is the SQLSTATE), a Hasura
 * GraphQL rejection (`error.response.errors[].extensions`), and the SQLSTATE
 * Hasura nests under `extensions.internal.error.status_code`.
 */
export const isDataError = (error: any): boolean => {
  if (!error) return false;

  if (isPermanentSqlState(error.code)) return true;

  const graphqlErrors = error.response?.errors;
  if (!Array.isArray(graphqlErrors)) return false;

  return graphqlErrors.some((graphqlError: any) => {
    const extensions = graphqlError?.extensions;
    if (!extensions) return false;
    if (typeof extensions.code === 'string' && PERMANENT_GRAPHQL_CODES.has(extensions.code)) return true;
    return isPermanentSqlState(extensions.internal?.error?.status_code);
  });
};

/** The first few record ids in a batch, for the one line we log when dropping it. */
export const describeBatchIds = (objects: any[], limit = 10): string => {
  const ids = objects.map(object => object?.id ?? '(no id)');
  const shown = ids.slice(0, limit).join(', ');
  return ids.length > limit ? `${shown}, and ${ids.length - limit} more` : shown;
};

/** The message logged once per dropped batch. */
export const dropMessage = (tableName: string, objects: any[], error: any): string =>
  `Dropping ${objects.length} ${tableName} record(s) after a data error; they will not be retried. ` +
  `ids: ${describeBatchIds(objects)}. reason: ${error?.message ?? 'unknown'}`;
