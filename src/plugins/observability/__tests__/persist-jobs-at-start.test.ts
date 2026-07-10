import { ObservabilityPlugin } from '../plugin';
import { GraphQLTransport } from '../transports/graphql-transport';
import type { HasuraEventPayload, JobOptions } from '../../../types';

const CORRELATION_ID = 'corr-test-1';

const hasuraEvent = {
  __correlationId: CORRELATION_ID,
  event: { op: 'UPDATE', session_variables: {} },
  table: { schema: 'public', name: 'moves' },
} as unknown as HasuraEventPayload;

function buildPlugin(config: Record<string, unknown> = {}): ObservabilityPlugin {
  const plugin = new ObservabilityPlugin({
    transport: 'graphql',
    graphql: { endpoint: 'http://hasura.test/v1/graphql' },
    ...config,
  });
  // Wire the internal maps onJobStart reads, without running a full invocation
  (plugin as any).activeInvocations.set(CORRELATION_ID, 'inv-1');
  (plugin as any).activeEventExecutions.set(`${CORRELATION_ID}:move.updated`, 'ee-1');
  return plugin;
}

describe('ObservabilityPlugin eager job persist', () => {
  it('awaits a flush during onJobStart, after buffering the job row', async () => {
    const plugin = buildPlugin();
    const bufferedAtFlush: number[] = [];
    jest.spyOn(plugin, 'flush').mockImplementation(async () => {
      bufferedAtFlush.push((plugin as any).buffer.jobExecutions.size);
    });

    const jobOptions = {} as JobOptions;
    await plugin.onJobStart('myJob', jobOptions, 'move.updated', hasuraEvent);

    expect(plugin.flush).toHaveBeenCalledTimes(1);
    // The job row must already be in the buffer when flush runs — that's what
    // makes the row durable before the job body executes
    expect(bufferedAtFlush).toEqual([1]);
    expect(jobOptions.jobExecutionId).toBeDefined();
  });

  it('does not flush when the job row could not be buffered (missing event execution)', async () => {
    const plugin = buildPlugin();
    (plugin as any).activeEventExecutions.clear();
    jest.spyOn(plugin, 'flush').mockResolvedValue(undefined);

    await plugin.onJobStart('myJob', {} as JobOptions, 'move.updated', hasuraEvent);

    expect(plugin.flush).not.toHaveBeenCalled();
  });
});

describe('GraphQLTransport source_job_id FK fallback', () => {
  const fkViolation = {
    response: {
      errors: [
        {
          message:
            'Foreign key violation. insert or update on table "invocations" violates foreign key constraint "fk_invocations_source_job_id"',
          extensions: { path: '$.selectionSet.insert_invocations.args.objects', code: 'constraint-violation' },
        },
      ],
    },
  };

  function buildTransport(requestMock: jest.Mock): GraphQLTransport {
    const transport = new GraphQLTransport({
      graphql: { endpoint: 'http://hasura.test/v1/graphql', retryDelay: 1 },
    } as any);
    (transport as any).client = { request: requestMock };
    // Single attempt per call — the FK fallback is what's under test here,
    // not the backoff loop (whose maxRetries falls back to 3 on falsy values)
    jest.spyOn(transport as any, 'retryWithBackoff').mockImplementation((op: any) => op());
    return transport;
  }

  function invocationRecords() {
    return new Map([
      ['inv-1', { id: 'inv-1', source_job_id: 'job-from-other-fn', source_function: 'db-moves' } as any],
    ]);
  }

  it('re-sends invocations without source_job_id on that FK violation and clears the buffer', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(fkViolation)
      .mockResolvedValueOnce({ insert_invocations: { affected_rows: 1 } });
    const transport = buildTransport(request);
    const records = invocationRecords();

    await (transport as any).flushInvocations(records);

    expect(request).toHaveBeenCalledTimes(2);
    const retryObjects = request.mock.calls[1][1].objects;
    expect(retryObjects[0].source_job_id).toBeNull();
    expect(retryObjects[0].source_function).toBe('db-moves'); // everything else intact
    expect(records.size).toBe(0); // buffer cleared — no poisoned retry loop
  });

  it('still throws (buffer kept) for other GraphQL errors', async () => {
    const otherError = {
      response: { errors: [{ message: 'field "nope" not found', extensions: { code: 'validation-failed' } }] },
    };
    const request = jest.fn().mockRejectedValue(otherError);
    const transport = buildTransport(request);
    const records = invocationRecords();

    await expect((transport as any).flushInvocations(records)).rejects.toBeDefined();
    expect(request).toHaveBeenCalledTimes(1); // no unlink retry for unrelated errors
    expect(records.size).toBe(1);
  });

  it('throws if the unlinked re-send also fails', async () => {
    const request = jest.fn().mockRejectedValue(fkViolation);
    const transport = buildTransport(request);
    const records = invocationRecords();

    await expect((transport as any).flushInvocations(records)).rejects.toBeDefined();
    expect(records.size).toBe(1);
  });
});
