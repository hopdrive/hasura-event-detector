import { verifyToken } from './lib/token.js';

const ALLOWED_PARAMS = ['query', 'limit', 'direction', 'start', 'end'];

// Cache verified tokens across warm lambda invocations (token hash → expiry)
const verifiedTokens = new Map<string, number>();
let coldStart = true;

function cachedVerifyToken(token: string, secret: string): boolean {
  // Quick lookup: have we verified this exact token before and is it still valid?
  const cached = verifiedTokens.get(token);
  if (cached && cached > Date.now()) {
    console.log('[grafana-proxy] JWT cache HIT — skipping verification');
    return true;
  }

  const valid = verifyToken(token, secret);
  if (valid) {
    // Cache for 5 minutes (re-verify periodically, but not every request)
    verifiedTokens.set(token, Date.now() + 5 * 60 * 1000);
    // Prune old entries if map grows
    if (verifiedTokens.size > 50) {
      const now = Date.now();
      for (const [k, exp] of verifiedTokens) {
        if (exp <= now) verifiedTokens.delete(k);
      }
    }
  }
  return valid;
}

export default async (req: Request) => {
  const isCold = coldStart;
  coldStart = false;
  console.log(`[grafana-proxy] === Request START (${isCold ? 'COLD' : 'WARM'} start) ===`);
  console.log(`[grafana-proxy] Method: ${req.method}, URL: ${req.url}`);

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization' } });
  }

  if (req.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  // --- Console JWT validation ---
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  console.log(`[grafana-proxy] Auth header present: ${!!authHeader}, Token length: ${token.length}`);

  if (!token) {
    console.log('[grafana-proxy] REJECT: no token');
    return Response.json({ error: 'Token required' }, { status: 401 });
  }

  const secret = process.env.AUTH_TOKEN_SECRET || process.env.CONSOLE_PASSWORD;
  if (!secret) {
    console.log('[grafana-proxy] REJECT: no AUTH_TOKEN_SECRET or CONSOLE_PASSWORD env var');
    return Response.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!cachedVerifyToken(token, secret)) {
    console.log('[grafana-proxy] REJECT: JWT verification failed (invalid or expired)');
    return Response.json({ error: 'Invalid or expired token' }, { status: 401 });
  }
  console.log('[grafana-proxy] Console JWT verified OK');

  // --- Extract and allowlist query params ---
  const url = new URL(req.url);
  const queryParams = new URLSearchParams();
  for (const key of ALLOWED_PARAMS) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      queryParams.set(key, value);
    }
  }
  console.log(`[grafana-proxy] Query params: ${queryParams.toString().slice(0, 200)}...`);

  if (!queryParams.get('query')) {
    console.log('[grafana-proxy] REJECT: missing "query" param');
    return Response.json({ error: 'Missing required "query" parameter' }, { status: 400 });
  }

  // --- Build Grafana Loki URL ---
  // Note: VITE_* vars are also available to Netlify functions at runtime
  const grafanaServiceToken = process.env.GRAFANA_SERVICE || '';
  const grafanaId = process.env.GRAFANA_ID || '';
  const grafanaSecret = process.env.GRAFANA_SECRET || '';
  const lokiDatasourceUid = process.env.GRAFANA_LOKI_UID || process.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs';
  const grafanaUrl = (process.env.GRAFANA_URL || process.env.VITE_GRAFANA_URL || '').replace(/\/$/, '');

  console.log(`[grafana-proxy] Env check: GRAFANA_SERVICE=${grafanaServiceToken ? `set (${grafanaServiceToken.length} chars)` : 'EMPTY'}`);
  console.log(`[grafana-proxy] Env check: GRAFANA_URL=${grafanaUrl || 'EMPTY'}, VITE_GRAFANA_URL=${process.env.VITE_GRAFANA_URL || 'EMPTY'}`);
  console.log(`[grafana-proxy] Env check: GRAFANA_ID=${grafanaId ? 'set' : 'EMPTY'}, GRAFANA_SECRET=${grafanaSecret ? `set (${grafanaSecret.length} chars)` : 'EMPTY'}`);
  console.log(`[grafana-proxy] Env check: lokiDatasourceUid=${lokiDatasourceUid}`);

  let lokiUrl: string;
  const headers: Record<string, string> = {};

  if (grafanaServiceToken && grafanaUrl) {
    // Primary: service account token via Grafana datasource proxy
    lokiUrl = `${grafanaUrl}/api/datasources/proxy/uid/${lokiDatasourceUid}/loki/api/v1/query_range?${queryParams.toString()}`;
    headers['Authorization'] = `Bearer ${grafanaServiceToken.slice(0, 8)}...`;
    console.log(`[grafana-proxy] PATH: service-account-token via Grafana datasource proxy`);
    console.log(`[grafana-proxy] Loki URL: ${lokiUrl}`);
    // Set real token (after logging redacted version)
    headers['Authorization'] = `Bearer ${grafanaServiceToken}`;
  } else if (grafanaId && grafanaSecret) {
    // Fallback: basic auth direct to Loki
    const lokiHost = (process.env.GRAFANA_LOKI_HOST || process.env.VITE_GRAFANA_LOKI_HOST || '').replace(/\/$/, '');
    console.log(`[grafana-proxy] Env check: GRAFANA_LOKI_HOST=${lokiHost || 'EMPTY'}, VITE_GRAFANA_LOKI_HOST=${process.env.VITE_GRAFANA_LOKI_HOST || 'EMPTY'}`);
    if (!lokiHost) {
      console.log('[grafana-proxy] REJECT: no GRAFANA_LOKI_HOST');
      return Response.json({ error: 'Grafana not configured' }, { status: 500 });
    }
    const normalizedHost = lokiHost.startsWith('http') ? lokiHost : `https://${lokiHost}`;
    lokiUrl = `${normalizedHost}/loki/api/v1/query_range?${queryParams.toString()}`;
    headers['Authorization'] = `Basic ${Buffer.from(`${grafanaId}:${grafanaSecret}`).toString('base64')}`;
    headers['Content-Type'] = 'application/json';
    console.log(`[grafana-proxy] PATH: basic-auth direct to Loki`);
    console.log(`[grafana-proxy] Loki URL: ${lokiUrl}`);
  } else {
    console.log('[grafana-proxy] REJECT: neither service-token+url nor id+secret configured');
    return Response.json({ error: 'Grafana not configured' }, { status: 500 });
  }

  // --- Forward to Grafana ---
  try {
    console.log(`[grafana-proxy] Fetching from Grafana...`);
    const response = await fetch(lokiUrl, { method: 'GET', headers });
    console.log(`[grafana-proxy] Grafana response: ${response.status} ${response.statusText}`);
    console.log(`[grafana-proxy] Grafana response headers: content-type=${response.headers.get('content-type')}, www-authenticate=${response.headers.get('www-authenticate')}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`[grafana-proxy] Grafana error body (first 500 chars): ${errorText.slice(0, 500)}`);
      return Response.json({ error: `Grafana error: ${response.status}`, detail: errorText }, { status: response.status });
    }

    const data = await response.json();
    const resultCount = data?.data?.result?.length ?? 0;
    console.log(`[grafana-proxy] Success — ${resultCount} stream(s) returned`);
    return Response.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log(`[grafana-proxy] Fetch exception: ${message}`);
    return Response.json({ error: `Proxy error: ${message}` }, { status: 502 });
  }
};

export const config = {
  path: '/api/grafana-proxy',
};
