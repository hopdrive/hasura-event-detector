/**
 * Validate Config Command
 * 
 * CLI command to validate event detector configuration.
 */

import fs from 'fs';
import path from 'path';
import type { ListenToOptions } from '../types/index.js';

interface ValidateConfigOptions {
  config: string;
}

export async function validateConfigCommand(options: ValidateConfigOptions) {
  console.log('🔍 Validating configuration...');
  
  try {
    // Check if config file exists
    if (!fs.existsSync(options.config)) {
      console.log(`⚠️  Config file not found: ${options.config}`);
      console.log('💡 Run "hasura-event-detector init" to create a config file');
      return;
    }
    
    console.log(`📄 Loading config from: ${options.config}`);
    
    // Load and validate config
    let config: Partial<ListenToOptions>;
    
    try {
      if (options.config.endsWith('.json')) {
        const configContent = fs.readFileSync(options.config, 'utf8');
        config = JSON.parse(configContent);
      } else {
        // Assume it's a JS/TS module
        delete require.cache[path.resolve(options.config)];
        const configModule = require(path.resolve(options.config));
        config = configModule.default || configModule.config || configModule;
      }
    } catch (error) {
      throw new Error(`Failed to load config: ${(error as Error).message}`);
    }
    
    console.log('✅ Config loaded successfully');
    
    // Validate configuration
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Check required/recommended fields
    if (config.autoLoadEventModules === undefined) {
      warnings.push('autoLoadEventModules not specified (will default to true)');
    }
    
    if (!config.eventModulesDirectory) {
      warnings.push('eventModulesDirectory not specified (will default to "./events")');
    } else {
      // Check if events directory exists
      if (!fs.existsSync(config.eventModulesDirectory)) {
        issues.push(`Events directory does not exist: ${config.eventModulesDirectory}`);
      } else {
        const eventFiles = fs.readdirSync(config.eventModulesDirectory)
          .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        
        if (eventFiles.length === 0) {
          warnings.push(`No event modules found in ${config.eventModulesDirectory}`);
        } else {
          console.log(`📦 Found ${eventFiles.length} event module(s)`);
        }
      }
    }
    
    
    // Validate listened events if provided
    if (config.listenedEvents && Array.isArray(config.listenedEvents)) {
      console.log(`🎯 Validating ${config.listenedEvents.length} specified events...`);
      
      for (const eventName of config.listenedEvents) {
        if (typeof eventName !== 'string' || eventName.length === 0) {
          issues.push(`Invalid event name: ${eventName}`);
        }
      }
    }
    
    // Display results
    console.log('\n📊 Validation Results:');
    console.log(`   Config file: ${options.config}`);
    console.log(`   Issues: ${issues.length}`);
    console.log(`   Warnings: ${warnings.length}`);
    
    if (issues.length > 0) {
      console.log('\n❌ Issues found:');
      issues.forEach(issue => console.log(`   • ${issue}`));
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      warnings.forEach(warning => console.log(`   • ${warning}`));
    }
    
    if (issues.length === 0) {
      console.log('\n✅ Configuration is valid!');
    } else {
      console.log('\n❌ Configuration has issues that need to be resolved');
      process.exit(1);
    }
    
    // Display effective configuration
    console.log('\n📋 Effective Configuration:');
    console.log(JSON.stringify(config, null, 2));
    
  } catch (error) {
    console.error('❌ Validation failed:', (error as Error).message);
    process.exit(1);
  }
}