/**
 * Console Development Server with Grafana Proxy
 *
 * This Express server:
 * 1. Proxies Grafana Loki API requests (avoids CORS, keeps credentials secure)
 * 2. Serves the Vite dev server in development
 * 3. Serves static files in production
 */

import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

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

// Grafana API proxy endpoint
app.use('/api/grafana', createProxyMiddleware({
  target: grafanaHost,
  changeOrigin: true,
  pathRewrite: {
    '^/api/grafana': '', // Remove /api/grafana prefix
  },
  onProxyReq: (proxyReq, req, res) => {
    // Add Basic Auth header
    if (GRAFANA_USER_ID && GRAFANA_SECRET) {
      const auth = Buffer.from(`${GRAFANA_USER_ID}:${GRAFANA_SECRET}`).toString('base64');
      proxyReq.setHeader('Authorization', `Basic ${auth}`);
    } else {
      console.warn('⚠️  Grafana credentials not configured. Set VITE_GRAFANA_ID and VITE_GRAFANA_SECRET.');
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Log successful requests
    if (proxyRes.statusCode === 200) {
      console.log(`✓ Grafana API: ${req.method} ${req.path} → ${proxyRes.statusCode}`);
    } else {
      console.log(`✗ Grafana API: ${req.method} ${req.path} → ${proxyRes.statusCode}`);
    }
  },
  onError: (err, req, res) => {
    console.error('Grafana proxy error:', err.message);
    res.status(500).json({
      error: 'Failed to proxy request to Grafana',
      message: err.message
    });
  },
}));

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
