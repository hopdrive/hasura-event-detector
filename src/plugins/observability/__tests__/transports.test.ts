import { ObservabilityPlugin } from '../plugin';
import { SQLTransport } from '../transports/sql-transport';
import { GraphQLTransport } from '../transports/graphql-transport';
import type { BufferData } from '../transports/types';

// Mock dependencies
jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    }),
    end: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('graphql-request', () => ({
  GraphQLClient: jest.fn().mockImplementation(() => ({
    request: jest.fn().mockResolvedValue({
      insert_invocations: { affected_rows: 1 },
      insert_event_executions: { affected_rows: 1 },
      insert_job_executions: { affected_rows: 1 },
      invocations: [{ id: 'test' }],
    }),
  })),
}));

describe('ObservabilityPlugin Transport Modes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Transport Selection', () => {
    it('should use SQL transport by default', async () => {
      const plugin = new ObservabilityPlugin({
        database: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
      });

      await plugin.initialize();

      // @ts-ignore - accessing private property for testing
      expect(plugin.transport).toBeInstanceOf(SQLTransport);

      await plugin.shutdown();
    });

    it('should use GraphQL transport when configured', async () => {
      const plugin = new ObservabilityPlugin({
        transport: 'graphql',
        graphql: {
          endpoint: 'http://localhost:8080/v1/graphql',
          headers: {
            'x-hasura-admin-secret': 'test-secret',
          },
        },
      });

      await plugin.initialize();

      // @ts-ignore - accessing private property for testing
      expect(plugin.transport).toBeInstanceOf(GraphQLTransport);

      await plugin.shutdown();
    });

    it('should throw error if SQL transport is selected but no database config provided', async () => {
      const plugin = new ObservabilityPlugin({
        transport: 'sql',
        // No database config
      });

      await expect(plugin.initialize()).rejects.toThrow(
        'Database connection configuration is required for SQL transport'
      );
    });

    it('should throw error if GraphQL transport is selected but no endpoint provided', async () => {
      const plugin = new ObservabilityPlugin({
        transport: 'graphql',
        // No graphql config
      });

      await expect(plugin.initialize()).rejects.toThrow(
        'GraphQL endpoint is required when using GraphQL transport'
      );
    });
  });

  describe('Data Flushing', () => {
    it('should flush data using SQL transport', async () => {
      const plugin = new ObservabilityPlugin({
        database: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
      });

      await plugin.initialize();

      // Add some test data to buffer
      const invocationId = await plugin.recordInvocationStart({
        correlationId: 'test-correlation',
        sourceFunction: 'test-function',
        sourceTable: 'test-table',
        sourceOperation: 'INSERT',
        hasuraEventId: 'test-event-id',
        hasuraEventPayload: { test: 'payload' },
        hasuraEventTime: new Date(),
        autoLoadModules: false,
        eventModulesDirectory: './events',
        contextData: { test: 'context' },
      });

      // Force flush
      await plugin.flush();

      // @ts-ignore - accessing private property for testing
      expect(plugin.buffer.invocations.size).toBe(0);

      await plugin.shutdown();
    });

    it('should flush data using GraphQL transport', async () => {
      const plugin = new ObservabilityPlugin({
        transport: 'graphql',
        graphql: {
          endpoint: 'http://localhost:8080/v1/graphql',
          headers: {
            'x-hasura-admin-secret': 'test-secret',
          },
        },
      });

      await plugin.initialize();

      // Add some test data to buffer
      const invocationId = await plugin.recordInvocationStart({
        correlationId: 'test-correlation',
        sourceFunction: 'test-function',
        sourceTable: 'test-table',
        sourceOperation: 'INSERT',
        hasuraEventId: 'test-event-id',
        hasuraEventPayload: { test: 'payload' },
        hasuraEventTime: new Date(),
        autoLoadModules: false,
        eventModulesDirectory: './events',
        contextData: { test: 'context' },
      });

      // Force flush
      await plugin.flush();

      // @ts-ignore - accessing private property for testing
      expect(plugin.buffer.invocations.size).toBe(0);

      await plugin.shutdown();
    });
  });

  describe('Transport Health Check', () => {
    it('should check SQL transport health', async () => {
      const transport = new SQLTransport({
        enabled: true,
        transport: 'sql',
        database: {
          host: 'localhost',
          port: 5432,
          database: 'test',
          user: 'test',
          password: 'test',
        },
        schema: 'public',
        captureJobOptions: true,
        captureHasuraPayload: true,
        captureErrorStacks: true,
        batchSize: 100,
        flushInterval: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
        maxJsonSize: 1000000,
      });

      await transport.initialize();
      const isHealthy = await transport.isHealthy();
      expect(isHealthy).toBe(true);
      await transport.shutdown();
    });

    it('should check GraphQL transport health', async () => {
      const transport = new GraphQLTransport({
        enabled: true,
        transport: 'graphql',
        graphql: {
          endpoint: 'http://localhost:8080/v1/graphql',
          headers: {
            'x-hasura-admin-secret': 'test-secret',
          },
        },
        schema: 'public',
        captureJobOptions: true,
        captureHasuraPayload: true,
        captureErrorStacks: true,
        batchSize: 100,
        flushInterval: 5000,
        retryAttempts: 3,
        retryDelay: 1000,
        maxJsonSize: 1000000,
      });

      await transport.initialize();
      const isHealthy = await transport.isHealthy();
      expect(isHealthy).toBe(true);
      await transport.shutdown();
    });
  });

  describe('Configuration Defaults', () => {
    it('should use environment variables for SQL configuration', async () => {
      process.env.OBSERVABILITY_DB_HOST = 'env-host';
      process.env.OBSERVABILITY_DB_PORT = '5433';
      process.env.OBSERVABILITY_DB_NAME = 'env-db';
      process.env.OBSERVABILITY_DB_USER = 'env-user';
      process.env.OBSERVABILITY_DB_PASSWORD = 'env-pass';

      const plugin = new ObservabilityPlugin();

      // @ts-ignore - accessing private property for testing
      expect(plugin.config.database?.host).toBe('env-host');
      // @ts-ignore - accessing private property for testing
      expect(plugin.config.database?.port).toBe(5433);

      // Cleanup
      delete process.env.OBSERVABILITY_DB_HOST;
      delete process.env.OBSERVABILITY_DB_PORT;
      delete process.env.OBSERVABILITY_DB_NAME;
      delete process.env.OBSERVABILITY_DB_USER;
      delete process.env.OBSERVABILITY_DB_PASSWORD;
    });

    it('should use environment variables for GraphQL configuration', async () => {
      process.env.HASURA_GRAPHQL_ENDPOINT = 'http://env-endpoint/v1/graphql';
      process.env.HASURA_ADMIN_SECRET = 'env-secret';

      const plugin = new ObservabilityPlugin({
        transport: 'graphql',
      });

      // @ts-ignore - accessing private property for testing
      expect(plugin.config.graphql?.endpoint).toBe('http://env-endpoint/v1/graphql');
      // @ts-ignore - accessing private property for testing
      expect(plugin.config.graphql?.headers?.['x-hasura-admin-secret']).toBe('env-secret');

      // Cleanup
      delete process.env.HASURA_GRAPHQL_ENDPOINT;
      delete process.env.HASURA_ADMIN_SECRET;
    });
  });
});