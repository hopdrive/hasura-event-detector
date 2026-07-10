import { verifyToken } from './lib/token.js';

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' } });
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return Response.json({ error: 'Token required' }, { status: 401 });
  }

  const secret = process.env.AUTH_TOKEN_SECRET || process.env.CONSOLE_PASSWORD;
  if (!secret) {
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!verifyToken(token, secret)) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  return Response.json({
    environments: {
      test: {
        hasuraAdminSecret: process.env.TEST_HASURA_ADMIN_SECRET || '',
        graphqlEndpoint: process.env.TEST_GRAPHQL_ENDPOINT || 'https://gql-test.hopdrive.io/v1/graphql',
      },
      prod: {
        hasuraAdminSecret: process.env.PROD_HASURA_ADMIN_SECRET || '',
        graphqlEndpoint: process.env.PROD_GRAPHQL_ENDPOINT || 'https://gql.hopdrive.io/v1/graphql',
      },
    },
    shared: {
      grafanaSecret: process.env.GRAFANA_SECRET || '',
      grafanaServiceAccountToken: process.env.GRAFANA_SECRET || '',
      grafanaUserId: process.env.GRAFANA_ID || '',
    },
  });
};

export const config = {
  path: '/api/config',
};
