/**
 * Console Development Server with Grafana Proxy
 *
 * This Express server:
 * 1. Proxies Grafana Loki API requests (avoids CORS, keeps credentials secure)
 * 2. Serves the Vite dev server in development
 * 3. Serves static files in production
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import https from 'https';
import http from 'http';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenvConfig();

const app = express();
const PORT = process.env.CONSOLE_PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Grafana configuration
const GRAFANA_HOST = process.env.VITE_GRAFANA_HOST || 'https://hopdrive.grafana.net';
const GRAFANA_USER_ID = process.env.VITE_GRAFANA_ID;
const GRAFANA_SECRET = process.env.VITE_GRAFANA_SECRET;

// Ensure Grafana host has protocol
const grafanaHost = GRAFANA_HOST.startsWith('http')
  ? GRAFANA_HOST
  : `https://${GRAFANA_HOST}`;

// Custom Grafana proxy (avoids redirect following issues)
app.use('/api/grafana', (req, res) => {
  if (!GRAFANA_USER_ID || !GRAFANA_SECRET) {
    return res.status(500).json({
      error: 'Grafana credentials not configured',
      message: 'Set VITE_GRAFANA_ID and VITE_GRAFANA_SECRET in .env file'
    });
  }

  // Build the target URL
  const targetPath = req.url; // Already includes query params
  const targetUrl = new URL(targetPath, grafanaHost);

  console.log(`📤 Proxying to: ${targetUrl.href}`);

  // Determine authentication method
  // If GRAFANA_USER_ID looks like a service account ID (starts with 'sa-' or is numeric),
  // use Basic Auth with ID:TOKEN format
  // Otherwise, just use the token as Bearer auth
  let authHeader;

  if (GRAFANA_USER_ID && GRAFANA_USER_ID.trim() !== '') {
    // Basic Auth: ID:TOKEN
    const basicAuth = Buffer.from(`${GRAFANA_USER_ID}:${GRAFANA_SECRET}`).toString('base64');
    authHeader = `Basic ${basicAuth}`;
    console.log(`   Auth: Basic ${GRAFANA_USER_ID}:${'*'.repeat(GRAFANA_SECRET.length)}`);
  } else {
    // Bearer Token (for service accounts without explicit ID)
    authHeader = `Bearer ${GRAFANA_SECRET}`;
    console.log(`   Auth: Bearer ${'*'.repeat(GRAFANA_SECRET.length)}`);
  }

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };

  const protocol = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = protocol.request(options, (proxyRes) => {
    console.log(`📥 Grafana response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

    // Check for authentication failures
    if (proxyRes.statusCode === 302 || proxyRes.statusCode === 301) {
      console.log(`   ⚠️  Redirect to: ${proxyRes.headers.location}`);
      console.log('   Authentication failed! Check your Grafana API key.');
      return res.status(401).json({
        error: 'Grafana authentication failed',
        message: 'The API key may be invalid or expired',
        statusCode: proxyRes.statusCode
      });
    }

    if (proxyRes.statusCode === 401 || proxyRes.statusCode === 403) {
      console.log('   ❌ Unauthorized - Check your Grafana API key permissions');
      return res.status(proxyRes.statusCode).json({
        error: 'Grafana authorization failed',
        message: 'API key may not have datasources:query permission'
      });
    }

    if (proxyRes.statusCode === 200) {
      console.log(`   ✓ Success`);
    }

    // Forward the response
    res.status(proxyRes.statusCode);
    Object.keys(proxyRes.headers).forEach(key => {
      res.setHeader(key, proxyRes.headers[key]);
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('❌ Grafana proxy error:', err.message);
    res.status(500).json({
      error: 'Failed to connect to Grafana',
      message: err.message
    });
  });

  // Forward request body if present
  if (req.body) {
    proxyReq.write(JSON.stringify(req.body));
  }

  proxyReq.end();
});

async function startServer() {
  if (IS_PRODUCTION) {
    // Production: Serve static built files
    app.use(express.static(path.join(__dirname, 'dist')));

    // SPA fallback - serve index.html for all routes
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });

    console.log('🚀 Console server running in PRODUCTION mode');

    app.listen(PORT, () => {
      console.log(`✓ Server listening on port ${PORT}`);
    });
  } else {
    // Development: Proxy to Vite dev server
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);

    console.log('🚀 Console server running in DEVELOPMENT mode');
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 Grafana proxy: http://localhost:${PORT}/api/grafana/*`);

    if (!GRAFANA_USER_ID || !GRAFANA_SECRET) {
      console.log('');
      console.log('⚠️  Grafana logs will not be available.');
      console.log('   Set VITE_GRAFANA_ID and VITE_GRAFANA_SECRET in .env file');
    }

    app.listen(PORT, () => {
      console.log(`✓ Server listening on port ${PORT}`);
    });
  }
}

startServer();
