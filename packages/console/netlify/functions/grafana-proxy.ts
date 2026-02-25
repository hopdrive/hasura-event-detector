import { verifyToken } from './lib/token.js';

const ALLOWED_PARAMS = ['query', 'limit', 'direction', 'start', 'end'];

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

  // Extract and allowlist query params
  const url = new URL(req.url);
  const queryParams = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      queryParams.set(key, value);
    }
  }

  if (!queryParams.get('query')) {
    return Response.json({ error: 'Missing required "query" parameter' }, { status: 400 });
  }

  // Build Grafana Loki URL
  // Note: VITE_* vars are also available to Netlify functions at runtime
  const grafanaServiceToken = process.env.GRAFANA_SERVICE || '';
  const grafanaId = process.env.GRAFANA_ID || '';
  const grafanaSecret = process.env.GRAFANA_SECRET || '';
  const lokiDatasourceUid = process.env.GRAFANA_LOKI_UID || process.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs';
  const grafanaUrl = (process.env.GRAFANA_URL || process.env.VITE_GRAFANA_URL || '').replace(/\/$/, '');

  let lokiUrl: string;
  const headers: Record<string, string> = {};

  if (grafanaServiceToken && grafanaUrl) {
    // Primary: service account token via Grafana datasource proxy
    lokiUrl = `${grafanaUrl}/api/datasources/proxy/uid/${lokiDatasourceUid}/loki/api/v1/query_range?${queryParams.toString()}`;
    headers['Authorization'] = `Bearer ${grafanaServiceToken}`;
  } else if (grafanaId && grafanaSecret) {
    // Fallback: basic auth direct to Loki
    const lokiHost = (process.env.GRAFANA_HOST || process.env.VITE_GRAFANA_HOST || '').replace(/\/$/, '');
    if (!lokiHost) {
      return Response.json({ error: 'Grafana not configured' }, { status: 500 });
    }
    const normalizedHost = lokiHost.startsWith('http') ? lokiHost : `https://${lokiHost}`;
    lokiUrl = `${normalizedHost}/loki/api/v1/query_range?${queryParams.toString()}`;
    headers['Authorization'] = `Basic ${Buffer.from(`${grafanaId}:${grafanaSecret}`).toString('base64')}`;
    headers['Content-Type'] = 'application/json';
  } else {
    return Response.json({ error: 'Grafana not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(lokiUrl, { method: 'GET', headers });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: `Grafana error: ${response.status}`, detail: errorText }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
};

export const config = {
  path: '/api/grafana-proxy',
};
