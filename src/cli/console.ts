/**
 * Console Command
 *
 * CLI command for managing the observability console.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface ConsoleOptions {
  config?: string;
  port?: number;
  host?: string;
  open?: boolean;
  watch?: boolean;
  outputDir?: string;
  publicUrl?: string;
  scriptName?: string;
  addScript?: boolean;
  databaseUrl?: string;
  hasuraEndpoint?: string;
  hasuraAdminSecret?: string;
  env?: string;
}

/**
 * Start the console development server
 */
export async function startConsoleCommand(options: ConsoleOptions) {
  console.log('🚀 Starting Hasura Event Detector Console...');

  try {
    const consolePath = path.join(__dirname, '../../../src/plugins/observability/console');

    // Check if console directory exists
    if (!fs.existsSync(consolePath)) {
      throw new Error('Console directory not found. Please run "hasura-event-detector console init" first.');
    }

    // Load configuration
    const config = await loadConsoleConfig(options.config);

    // Load environment variables from file if provided
    const envVars = options.env ? loadEnvFile(options.env) : {};

    // Set environment variables
    const env = {
      ...process.env,
      DATABASE_URL: options.databaseUrl || config.database.url,
      HASURA_ENDPOINT: options.hasuraEndpoint || config.hasura.endpoint,
      HASURA_ADMIN_SECRET: options.hasuraAdminSecret || config.hasura.adminSecret,
      CONSOLE_PORT: options.port?.toString() || config.console.port.toString(),
      CONSOLE_HOST: options.host || config.console.host,
      CONSOLE_PUBLIC_URL: options.publicUrl || config.console.publicUrl,
      CONSOLE_AUTO_OPEN: options.open !== false ? 'true' : 'false',
      NODE_ENV: options.watch !== false ? 'development' : 'production',
      // Add VITE_ prefixed variables from the env file
      ...Object.entries(envVars).reduce((acc, [key, value]) => {
        if (key.startsWith('VITE_')) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>),
    };

    // Change to console directory
    process.chdir(consolePath);

    // Install dependencies if needed
    if (!fs.existsSync(path.join(consolePath, 'node_modules'))) {
      console.log('📦 Installing console dependencies...');
      execSync('npm install', { stdio: 'inherit', env });
    }

    // Start the development server
    console.log(`🌐 Starting console on http://${env.CONSOLE_HOST}:${env.CONSOLE_PORT}`);

    if (env.CONSOLE_AUTO_OPEN === 'true') {
      // Open browser after a short delay
      setTimeout(() => {
        const open = require('open');
        open(`http://${env.CONSOLE_HOST}:${env.CONSOLE_PORT}`);
      }, 2000);
    }

    // Start the React development server
    execSync('npm start', { stdio: 'inherit', env });
  } catch (error) {
    console.error('❌ Failed to start console:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Initialize console configuration
 */
export async function initConsoleCommand(options: ConsoleOptions) {
  console.log('🔧 Initializing Hasura Event Detector Console...');

  try {
    const configPath = options.config || './console.config.js';

    // Check if config already exists
    if (fs.existsSync(configPath)) {
      console.log(`⚠️  Configuration file already exists: ${configPath}`);
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>(resolve => {
        rl.question('Do you want to overwrite it? (y/N): ', resolve);
      });
      rl.close();

      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('❌ Initialization cancelled.');
        return;
      }
    }

    // Create configuration file
    const configContent = `/**
 * Hasura Event Detector Console Configuration
 *
 * This file contains the configuration for the observability console.
 * You can override these settings using environment variables or command line arguments.
 */

module.exports = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL || '${
      options.databaseUrl || 'postgresql://localhost:5432/hasura_event_detector_observability'
    }',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },

  // Hasura configuration
  hasura: {
    endpoint: process.env.HASURA_ENDPOINT || '${options.hasuraEndpoint || 'http://localhost:8080/v1/graphql'}',
    adminSecret: process.env.HASURA_ADMIN_SECRET || '${options.hasuraAdminSecret || 'myadminsecretkey'}'
  },

  // Console server configuration
  console: {
    port: parseInt(process.env.CONSOLE_PORT) || ${options.port || 3000},
    host: process.env.CONSOLE_HOST || '${options.host || 'localhost'}',
    publicUrl: process.env.CONSOLE_PUBLIC_URL || 'http://${options.host || 'localhost'}:${options.port || 3000}',
    autoOpen: process.env.CONSOLE_AUTO_OPEN !== 'false',
    watchMode: process.env.NODE_ENV !== 'production'
  },

  // Console features
  features: {
    realTimeUpdates: true,
    darkMode: true,
    exportData: true,
    correlationSearch: true,
    flowDiagram: true,
    analytics: true
  },

  // Development settings
  development: {
    hotReload: true,
    sourceMaps: true,
    verboseLogging: process.env.NODE_ENV === 'development'
  }
};
`;

    fs.writeFileSync(configPath, configContent);
    console.log(`✅ Created configuration file: ${configPath}`);

    // Add npm script to package.json if requested
    if (options.addScript) {
      await addNpmScript('event-console', options.port || 3000);
    }

    console.log('\n🎉 Console initialized successfully!');
    console.log('\nNext steps:');
    console.log('1. Configure your database connection in the config file');
    console.log('2. Start the console: hasura-event-detector console start');
    console.log('3. Or use the npm script: npm run event-console');
  } catch (error) {
    console.error('❌ Failed to initialize console:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Build console for production
 */
export async function buildConsoleCommand(options: ConsoleOptions) {
  console.log('🏗️  Building Hasura Event Detector Console for production...');

  try {
    const consolePath = path.join(__dirname, '../../../src/plugins/observability/console');

    // Check if console directory exists
    if (!fs.existsSync(consolePath)) {
      throw new Error('Console directory not found. Please run "hasura-event-detector console init" first.');
    }

    // Load configuration
    const config = await loadConsoleConfig(options.config);

    // Set environment variables
    const env = {
      ...process.env,
      DATABASE_URL: options.databaseUrl || config.database.url,
      HASURA_ENDPOINT: options.hasuraEndpoint || config.hasura.endpoint,
      HASURA_ADMIN_SECRET: options.hasuraAdminSecret || config.hasura.adminSecret,
      CONSOLE_PUBLIC_URL: options.publicUrl || config.console.publicUrl,
      NODE_ENV: 'production'
    };

    // Change to console directory
    process.chdir(consolePath);

    // Install dependencies if needed
    if (!fs.existsSync(path.join(consolePath, 'node_modules'))) {
      console.log('📦 Installing console dependencies...');
      execSync('npm install', { stdio: 'inherit', env });
    }

    // Build the console
    console.log('🔨 Building console...');
    execSync('npm run build', { stdio: 'inherit', env });

    // Move build to output directory if specified
    if (options.outputDir) {
      const buildDir = path.join(consolePath, 'build');
      const outputDir = path.resolve(options.outputDir);

      if (fs.existsSync(buildDir)) {
        if (fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true });
        }
        fs.renameSync(buildDir, outputDir);
        console.log(`✅ Console built to: ${outputDir}`);
      }
    } else {
      console.log('✅ Console built successfully!');
    }

  } catch (error) {
    console.error('❌ Failed to build console:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Add npm script to package.json
 */
export async function addScriptCommand(options: ConsoleOptions) {
  console.log('📝 Adding event-console script to package.json...');

  try {
    await addNpmScript(options.scriptName || 'event-console', options.port || 3000);
    console.log('✅ Added event-console script to package.json');
    console.log('You can now run: npm run event-console');

  } catch (error) {
    console.error('❌ Failed to add script:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Remove npm script from package.json
 */
export async function removeScriptCommand() {
  console.log('🗑️  Removing event-console script from package.json...');

  try {
    const packageJsonPath = './package.json';

    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found in current directory');
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    if (packageJson.scripts && packageJson.scripts['event-console']) {
      delete packageJson.scripts['event-console'];
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log('✅ Removed event-console script from package.json');
    } else {
      console.log('ℹ️  event-console script not found in package.json');
    }

  } catch (error) {
    console.error('❌ Failed to remove script:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Check console configuration
 */
export async function checkConsoleCommand(options: ConsoleOptions) {
  console.log('🔍 Checking console configuration...');

  try {
    const config = await loadConsoleConfig(options.config);

    console.log('✅ Configuration loaded successfully');
    console.log(`📊 Database URL: ${config.database.url}`);
    console.log(`🔗 Hasura Endpoint: ${config.hasura.endpoint}`);
    console.log(`🌐 Console URL: ${config.console.publicUrl}`);

    // Check if console directory exists
    const consolePath = path.join(__dirname, '../../../src/plugins/observability/console');
    if (fs.existsSync(consolePath)) {
      console.log('✅ Console directory found');
    } else {
      console.log('❌ Console directory not found');
    }

    // Check if package.json has the script
    const packageJsonPath = './package.json';
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.scripts && packageJson.scripts['event-console']) {
        console.log('✅ event-console script found in package.json');
      } else {
        console.log('ℹ️  event-console script not found in package.json');
      }
    }

  } catch (error) {
    console.error('❌ Configuration check failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Load console configuration
 */
async function loadConsoleConfig(configPath?: string): Promise<any> {
  const defaultConfigPath = './console.config.js';
  const finalConfigPath = configPath || defaultConfigPath;

  if (fs.existsSync(finalConfigPath)) {
    return require(path.resolve(finalConfigPath));
  }

  // Return default configuration
  return {
    database: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/hasura_event_detector_observability'
    },
    hasura: {
      endpoint: process.env.HASURA_ENDPOINT || 'http://localhost:8080/v1/graphql',
      adminSecret: process.env.HASURA_ADMIN_SECRET || 'myadminsecretkey'
    },
    console: {
      port: parseInt(process.env.CONSOLE_PORT || '3000') || 3000,
      host: process.env.CONSOLE_HOST || 'localhost',
      publicUrl: process.env.CONSOLE_PUBLIC_URL || 'http://localhost:3000'
    }
  };
}

/**
 * Add npm script to package.json
 */
async function addNpmScript(scriptName: string, port: number): Promise<void> {
  const packageJsonPath = './package.json';

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('package.json not found in current directory');
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }

  packageJson.scripts[scriptName] = `hasura-event-detector console start --port ${port}`;

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
}

/**
 * Load environment variables from a file
 * Supports file:// protocol and direct file paths
 */
function loadEnvFile(envPath: string): Record<string, string> {
  try {
    // Remove file:// protocol if present
    let filePath = envPath.startsWith('file://') ? envPath.slice(7) : envPath;

    // Resolve to absolute path
    filePath = path.resolve(filePath);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`);
    }

    const envContent = fs.readFileSync(filePath, 'utf8');
    const envVars: Record<string, string> = {};

    // Parse .env file format
    envContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      line = line.trim();
      if (!line || line.startsWith('#')) {
        return;
      }

      // Parse KEY=VALUE format
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1]?.trim();
        let value = match[2]?.trim();

        if (!key || !value) return;

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        envVars[key] = value;
      }
    });

    console.log(`✅ Loaded ${Object.keys(envVars).length} environment variables from ${filePath}`);
    return envVars;
  } catch (error) {
    throw new Error(`Failed to load environment file: ${error instanceof Error ? error.message : String(error)}`);
  }
}
