import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { log, logError } from '../../helpers/log';
import { Pool } from 'pg';

export interface ConsoleServerConfig {
  enabled: boolean;
  port: number;
  host?: string;
  serveInProduction?: boolean;
  ssl?: {
    key: string;
    cert: string;
  };
  cors?: {
    enabled: boolean;
    origins?: string[];
  };
}

export class ConsoleServer {
  private config: ConsoleServerConfig;
  private server: http.Server | https.Server | null = null;
  private pool: Pool;
  private consolePackagePath: string | null = null;

  constructor(config: ConsoleServerConfig, pool: Pool) {
    this.config = {
      host: 'localhost',
      serveInProduction: false,
      cors: {
        enabled: true,
        origins: ['http://localhost:3000', 'http://localhost:3001']
      },
      ...config
    };
    this.pool = pool;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      log('ConsoleServer', 'Console server is disabled');
      return;
    }

    // Check if in production and if serving is allowed
    if (process.env.NODE_ENV === 'production' && !this.config.serveInProduction) {
      log('ConsoleServer', 'Console server is disabled in production');
      return;
    }

    // Try to find the console package
    try {
      this.consolePackagePath = this.findConsolePackage();
      if (!this.consolePackagePath) {
        log('ConsoleServer', 'Console package not found. Install @hopdrive/hasura-event-detector-console to enable the UI');
        return;
      }
    } catch (error) {
      log('ConsoleServer', 'Console package not installed. Skipping console server');
      return;
    }

    // Create the server
    const requestHandler = this.createRequestHandler();

    if (this.config.ssl) {
      this.server = https.createServer({
        key: fs.readFileSync(this.config.ssl.key),
        cert: fs.readFileSync(this.config.ssl.cert)
      }, requestHandler);
    } else {
      this.server = http.createServer(requestHandler);
    }

    // Start listening
    this.server.listen(this.config.port, this.config.host, () => {
      const protocol = this.config.ssl ? 'https' : 'http';
      log('ConsoleServer', `Console server started at ${protocol}://${this.config.host}:${this.config.port}/console`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          log('ConsoleServer', 'Console server stopped');
          resolve();
        });
      });
    }
  }

  private findConsolePackage(): string | null {
    // Try to find the console package in multiple locations
    const possiblePaths = [
      // Local development - packages folder
      path.join(process.cwd(), 'packages', 'console', 'dist'),
      // Installed as dependency - look for the package root, not just dist
      path.join(process.cwd(), 'node_modules', '@hopdrive', 'hasura-event-detector-console'),
      // Parent directory node_modules (for monorepo setups)
      path.join(process.cwd(), '..', 'node_modules', '@hopdrive', 'hasura-event-detector-console'),
    ];

    for (const packagePath of possiblePaths) {
      // Check if the package exists and has either dist or src folder
      if (fs.existsSync(packagePath)) {
        const distPath = path.join(packagePath, 'dist');
        const srcPath = path.join(packagePath, 'src');

        // Prefer dist if it exists (production build)
        if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
          log('ConsoleServer', `Found console package (dist) at: ${distPath}`);
          return distPath;
        }

        // For development, we could serve from src if needed
        // But for now, require a build
        if (fs.existsSync(srcPath)) {
          log('ConsoleServer', `Found console package at ${packagePath} but dist not built. Run 'npm run build' in the console package.`);
        }
      }
    }

    // Try using require.resolve as last resort
    try {
      const packageJson = require.resolve('@hopdrive/hasura-event-detector-console/package.json');
      const packageRoot = path.dirname(packageJson);
      const distPath = path.join(packageRoot, 'dist');

      if (fs.existsSync(distPath) && fs.existsSync(path.join(distPath, 'index.html'))) {
        log('ConsoleServer', `Found console package via require.resolve at: ${distPath}`);
        return distPath;
      }
    } catch (error) {
      // Package not found
    }

    return null;
  }

  private createRequestHandler() {
    return async (req: http.IncomingMessage, res: http.ServerResponse) => {
      // Handle CORS
      if (this.config.cors?.enabled) {
        this.handleCors(req, res);

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`);

      // Route requests
      if (url.pathname.startsWith('/api/')) {
        await this.handleApiRequest(req, res, url);
      } else if (url.pathname.startsWith('/console') || url.pathname === '/') {
        await this.handleStaticFiles(req, res, url);
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    };
  }

  private handleCors(req: http.IncomingMessage, res: http.ServerResponse) {
    const origin = req.headers.origin;

    if (this.config.cors?.origins?.includes(origin as string) || this.config.cors?.origins?.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
    } else if (!this.config.cors?.origins || this.config.cors.origins.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
  }

  private async handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const endpoint = url.pathname.replace('/api/', '');

    try {
      // Handle different API endpoints
      switch (endpoint) {
        case 'health':
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
          break;

        case 'metrics':
          const metrics = await this.getMetrics();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(metrics));
          break;

        case 'invocations':
          const invocations = await this.getInvocations(url.searchParams);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(invocations));
          break;

        case 'events':
          const events = await this.getEvents(url.searchParams);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(events));
          break;

        case 'jobs':
          const jobs = await this.getJobs(url.searchParams);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(jobs));
          break;

        default:
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    } catch (error) {
      logError('ConsoleServer', 'API request failed', error as Error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: (error as Error).message }));
    }
  }

  private async handleStaticFiles(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (!this.consolePackagePath) {
      res.statusCode = 503;
      res.end('Console package not installed');
      return;
    }

    let filePath = url.pathname;

    // Remove /console prefix if present
    if (filePath.startsWith('/console')) {
      filePath = filePath.substring('/console'.length) || '/';
    }

    // Default to index.html
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    // Security: prevent directory traversal
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.join(this.consolePackagePath, normalizedPath);

    // Ensure the path is within the console package directory
    if (!fullPath.startsWith(this.consolePackagePath)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Try to serve index.html from directory
        const indexPath = path.join(fullPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          this.serveFile(indexPath, res);
        } else {
          res.statusCode = 404;
          res.end('Not Found');
        }
      } else {
        this.serveFile(fullPath, res);
      }
    } catch (error) {
      // File not found, serve index.html for client-side routing
      const indexPath = path.join(this.consolePackagePath, 'index.html');
      if (fs.existsSync(indexPath)) {
        this.serveFile(indexPath, res);
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    }
  }

  private serveFile(filePath: string, res: http.ServerResponse) {
    const ext = path.extname(filePath);
    const contentTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      }
    });
  }

  // Database query methods
  private async getMetrics(): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT
          COUNT(DISTINCT id) as total_invocations,
          COUNT(DISTINCT correlation_id) as unique_correlations,
          AVG(total_duration_ms) as avg_duration,
          SUM(events_detected_count) as total_events_detected,
          SUM(total_jobs_run) as total_jobs,
          SUM(total_jobs_succeeded) as jobs_succeeded,
          SUM(total_jobs_failed) as jobs_failed
        FROM invocations
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  private async getInvocations(params: URLSearchParams): Promise<any> {
    const limit = parseInt(params.get('limit') || '100');
    const offset = parseInt(params.get('offset') || '0');
    const correlationId = params.get('correlationId');

    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM invocations
        ${correlationId ? 'WHERE correlation_id = $3' : ''}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const values = correlationId
        ? [limit, offset, correlationId]
        : [limit, offset];

      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  }

  private async getEvents(params: URLSearchParams): Promise<any> {
    const limit = parseInt(params.get('limit') || '100');
    const offset = parseInt(params.get('offset') || '0');
    const invocationId = params.get('invocationId');

    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM event_executions
        ${invocationId ? 'WHERE invocation_id = $3' : ''}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const values = invocationId
        ? [limit, offset, invocationId]
        : [limit, offset];

      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  }

  private async getJobs(params: URLSearchParams): Promise<any> {
    const limit = parseInt(params.get('limit') || '100');
    const offset = parseInt(params.get('offset') || '0');
    const eventExecutionId = params.get('eventExecutionId');

    const client = await this.pool.connect();
    try {
      let query = `
        SELECT * FROM job_executions
        ${eventExecutionId ? 'WHERE event_execution_id = $3' : ''}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `;

      const values = eventExecutionId
        ? [limit, offset, eventExecutionId]
        : [limit, offset];

      const result = await client.query(query, values);
      return result.rows;
    } finally {
      client.release();
    }
  }
}