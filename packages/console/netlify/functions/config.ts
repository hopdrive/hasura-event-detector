import { verifyToken } from './lib/token.js';

export default async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' } });
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const authHeader = req.headers.get('authorization') || '';
  console.log('[config] auth header present:', !!authHeader, 'value:', authHeader.substring(0, 40) + '...');
  const token = authHeader.replace(/^Bearer\s+/i, '');
  console.log('[config] token after strip:', token.substring(0, 30) + '...');

  if (!token) {
    console.log('[config] FAIL: no token');
    return Response.json({ error: 'Token required' }, { status: 401 });
  }

  const secret = process.env.AUTH_TOKEN_SECRET || process.env.CONSOLE_PASSWORD;
  if (!secret) {
    console.log('[config] FAIL: no secret env var');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  console.log('[config] secret length:', secret.length);

  const valid = verifyToken(token, secret);
  console.log('[config] verifyToken result:', valid);
  if (!valid) {
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  return Response.json({
    hasuraAdminSecret: process.env.HASURA_ADMIN_SECRET || '',
    grafanaSecret: process.env.GRAFANA_SECRET || '',
    grafanaServiceAccountToken: process.env.GRAFANA_SERVICE || '',
    grafanaUserId: process.env.GRAFANA_ID || '',
  });
};

export const config = {
  path: '/api/config',
};
