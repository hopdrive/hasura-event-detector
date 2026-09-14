import { isDataError } from '../transports/data-errors';
import { GraphQLTransport } from '../transports/graphql-transport';
import { SQLTransport } from '../transports/sql-transport';
import type { BufferData } from '../transports/types';
import { logError } from '../../../helpers/log';

const mockedLogError = logError as unknown as jest.Mock;

const mockGraphQLClientInstance = {
  request: jest.fn(),
};

jest.mock('../../../helpers/log', () => ({
  ...jest.requireActual('../../../helpers/log'),
  log: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../transports/graphql-loader', () => ({
  loadGraphQLClient: jest.fn().mockResolvedValue(
    jest.fn().mockImplementation(() => mockGraphQLClientInstance)
  ),
}));

let mockQuery: jest.Mock;
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockImplementation(async () => ({
      query: (...args: any[]) => mockQuery(...args),
      release: jest.fn(),
    })),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

/** A Hasura rejection of a non-uuid id, shaped the way graphql-request throws it. */
const badUuidError = () => {
  const error: any = new Error(
    'invalid input syntax for type uuid: "repro-0001": {"response":{"errors":[...]}}'
  );
  error.response = {
    errors: [
      {
        message: 'invalid input syntax for type uuid: "repro-0001"',
        extensions: {
          code: 'data-exception',
          path: '$.selectionSet.insert_invocations.args.objects',
          internal: {
            error: {
              status_code: '22P02',
              message: 'invalid input syntax for type uuid: "repro-0001"',
            },
          },
        },
      },
    ],
  };
  return error;
};

const timeoutError = () => {
  const error: any = new Error('connect ETIMEDOUT');
  error.code = 'ETIMEDOUT';
  return error;
};

const graphqlConfig = () => ({
  enabled: true,
  transport: 'graphql' as const,
  maxJsonSize: 100000,
  captureErrorStacks: true,
  graphql: {
    endpoint: 'http://localhost:8080/v1/graphql',
    headers: {},
    maxRetries: 3,
    retryDelay: 1,
  },
});

const bufferWith = (invocationId: string): BufferData =>
  ({
    invocations: new Map([[invocationId, { id: invocationId, source_function: 'db-lanes' } as any]]),
    eventExecutions: new Map(),
    jobExecutions: new Map(),
  } as unknown as BufferData);

describe('isDataError', () => {
  it('treats a Postgres 22xxx SQLSTATE on the error itself as permanent', () => {
    const error: any = new Error('invalid input syntax for type uuid');
    error.code = '22P02';
    expect(isDataError(error)).toBe(true);
  });

  it('treats a Postgres 23xxx integrity violation as permanent', () => {
    const error: any = new Error('insert violates foreign key constraint');
    error.code = '23503';
    expect(isDataError(error)).toBe(true);
  });

  it('treats a Hasura data-exception GraphQL error as permanent', () => {
    expect(isDataError(badUuidError())).toBe(true);
  });

  it('treats a Hasura validation-failed GraphQL error as permanent', () => {
    const error: any = new Error('field not found');
    error.response = { errors: [{ message: 'x', extensions: { code: 'validation-failed' } }] };
    expect(isDataError(error)).toBe(true);
  });

  it('does not treat a network timeout as permanent', () => {
    expect(isDataError(timeoutError())).toBe(false);
  });

  it('does not treat a refused connection as permanent', () => {
    const error: any = new Error('connect ECONNREFUSED');
    error.code = 'ECONNREFUSED';
    expect(isDataError(error)).toBe(false);
  });

  it('does not treat a Postgres 53xxx resource error as permanent', () => {
    const error: any = new Error('too many connections');
    error.code = '53300';
    expect(isDataError(error)).toBe(false);
  });

  it('does not treat an unrecognised error as permanent', () => {
    expect(isDataError(new Error('boom'))).toBe(false);
  });
});

describe('GraphQLTransport data-error handling', () => {
  let transport: GraphQLTransport;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGraphQLClientInstance.request.mockResolvedValue({ invocations: [] });
    transport = new GraphQLTransport(graphqlConfig() as any);
    await transport.initialize();
    mockGraphQLClientInstance.request.mockReset();
  });

  it('sends a batch rejected with a data error exactly once and empties the buffer', async () => {
    mockGraphQLClientInstance.request.mockRejectedValue(badUuidError());
    const buffer = bufferWith('repro-0001');

    await transport.flush(buffer);

    expect(mockGraphQLClientInstance.request).toHaveBeenCalledTimes(1);
    expect(buffer.invocations.size).toBe(0);
  });

  it('does not re-send the rejected batch on the next flush', async () => {
    mockGraphQLClientInstance.request.mockRejectedValue(badUuidError());
    const buffer = bufferWith('repro-0001');

    await transport.flush(buffer);
    const afterFirstFlush = mockGraphQLClientInstance.request.mock.calls.length;
    await transport.flush(buffer);

    expect(afterFirstFlush).toBe(1);
    expect(mockGraphQLClientInstance.request).toHaveBeenCalledTimes(1);
  });

  it('logs the dropped batch exactly once, naming the offending ids, and never again', async () => {
    mockGraphQLClientInstance.request.mockRejectedValue(badUuidError());
    const buffer = bufferWith('repro-0001');

    await transport.flush(buffer);

    const dropLines = mockedLogError.mock.calls
      .map(call => String(call[1]))
      .filter(message => message.includes('Dropping') && message.includes('repro-0001'));
    expect(dropLines).toHaveLength(1);

    await transport.flush(buffer);
    const afterSecondFlush = mockedLogError.mock.calls
      .map(call => String(call[1]))
      .filter(message => message.includes('Dropping') && message.includes('repro-0001'));
    expect(afterSecondFlush).toHaveLength(1);
  });

  it('still retries a transient error and keeps the batch buffered', async () => {
    mockGraphQLClientInstance.request.mockRejectedValue(timeoutError());
    const buffer = bufferWith('11111111-1111-1111-1111-111111111111');

    await expect(transport.flush(buffer)).rejects.toThrow();

    expect(mockGraphQLClientInstance.request).toHaveBeenCalledTimes(4);
    expect(buffer.invocations.size).toBe(1);
  });
});

describe('SQLTransport data-error handling', () => {
  let transport: SQLTransport;

  const sqlConfig = () => ({
    enabled: true,
    transport: 'sql' as const,
    maxJsonSize: 100000,
    captureErrorStacks: true,
    database: { host: 'localhost', port: 5432, database: 'test', user: 'test', password: 'test' },
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQuery = jest.fn().mockResolvedValue({ rows: [] });
    transport = new SQLTransport(sqlConfig() as any);
    await transport.initialize();
  });

  it('drops a batch rejected with a data error and empties the buffer', async () => {
    mockQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('invocations')) {
        const error: any = new Error('invalid input syntax for type uuid: "repro-0001"');
        error.code = '22P02';
        throw error;
      }
      return { rows: [] };
    });
    const buffer = bufferWith('repro-0001');

    await expect(transport.flush(buffer)).resolves.toBeUndefined();
    expect(buffer.invocations.size).toBe(0);
  });

  it('keeps a batch buffered and rethrows when the failure is transient', async () => {
    mockQuery = jest.fn().mockImplementation(async (sql: string) => {
      if (typeof sql === 'string' && sql.includes('invocations')) {
        const error: any = new Error('too many connections');
        error.code = '53300';
        throw error;
      }
      return { rows: [] };
    });
    const buffer = bufferWith('11111111-1111-1111-1111-111111111111');

    await expect(transport.flush(buffer)).rejects.toThrow();
    expect(buffer.invocations.size).toBe(1);
  });
});
