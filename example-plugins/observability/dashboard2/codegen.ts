import type { CodegenConfig } from '@graphql-codegen/cli';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// CODEGEN Setup will generate config against the specified GraphQL endpoint
const graphqlUrl = process.env.VITE_GRAPHQL_ENDPOINT || 'http://localhost:8080/v1/graphql';
const graphqlSecret = process.env.VITE_HASURA_ADMIN_SECRET || '';

console.log('[codegen] setup', { graphqlUrl, hasSecret: !!graphqlSecret });

const config: CodegenConfig = {
  schema: [
    {
      [graphqlUrl]: {
        headers: graphqlSecret ? {
          'x-hasura-admin-secret': graphqlSecret,
        } : {},
      },
    },
  ],
  debug: true,
  verbose: true,
  documents: ['./src/**/*.tsx', './src/**/*.ts', './src/**/*.graphql', './src/**/*.gql'],
  ignoreNoDocuments: true,
  overwrite: true,
  generates: {
    './src/types/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
      config: {
        withHOC: false,
        withComponent: false,
        withHooks: true,
        skipTypename: false,
        scalars: {
          ID: {
            input: 'string',
            output: 'string',
          },
          String: {
            input: 'string',
            output: 'string',
          },
          Boolean: {
            input: 'boolean',
            output: 'boolean',
          },
          Int: {
            input: 'number',
            output: 'number',
          },
          Float: {
            input: 'number',
            output: 'number',
          },
          bigint: {
            input: 'number',
            output: 'number',
          },
          bpchar: {
            input: 'string',
            output: 'string',
          },
          date: {
            input: 'string',
            output: 'string',
          },
          float8: {
            input: 'number',
            output: 'number',
          },
          geography: {
            input: 'any',
            output: 'object',
          },
          geometry: {
            input: 'any',
            output: 'object',
          },
          jsonb: {
            input: 'any',
            output: 'object',
          },
          numeric: {
            input: 'number',
            output: 'number',
          },
          smallint: {
            input: 'number',
            output: 'number',
          },
          timestamp: {
            input: 'string',
            output: 'string',
          },
          timestamptz: {
            input: 'string',
            output: 'string',
          },
          uuid: {
            input: 'string',
            output: 'string',
          },
        },
      },
    },
    './src/types/schema.json': {
      plugins: ['introspection'],
    },
  },
};

export default config;