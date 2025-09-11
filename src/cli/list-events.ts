/**
 * List Events Command
 * 
 * CLI command to list all available event modules.
 */

import fs from 'fs';
import path from 'path';

interface ListEventsOptions {
  directory: string;
  detailed?: boolean;
}

export async function listEventsCommand(options: ListEventsOptions) {
  console.log('📋 Listing event modules...');
  
  try {
    if (!fs.existsSync(options.directory)) {
      console.log(`📁 Events directory not found: ${options.directory}`);
      console.log('💡 Run "hasura-event-detector init" to get started');
      return;
    }
    
    const files = fs.readdirSync(options.directory);
    const eventFiles = files.filter(file => 
      file.endsWith('.ts') || file.endsWith('.js')
    );
    
    if (eventFiles.length === 0) {
      console.log(`📭 No event modules found in ${options.directory}`);
      console.log('💡 Create your first event: hasura-event-detector create my-event');
      return;
    }
    
    console.log(`\n📦 Found ${eventFiles.length} event module(s) in ${options.directory}:\n`);
    
    for (const file of eventFiles) {
      const eventName = path.basename(file, path.extname(file));
      const filePath = path.join(options.directory, file);
      const stats = fs.statSync(filePath);
      
      console.log(`🎯 ${eventName}`);
      console.log(`   File: ${file}`);
      console.log(`   Size: ${formatBytes(stats.size)}`);
      console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
      
      if (options.detailed) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          
          // Extract basic info from the file
          const hasDetector = content.includes('detector');
          const hasHandler = content.includes('handler');
          const exportCount = (content.match(/export/g) || []).length;
          const lineCount = content.split('\n').length;
          
          console.log(`   Detector: ${hasDetector ? '✅' : '❌'}`);
          console.log(`   Handler: ${hasHandler ? '✅' : '❌'}`);
          console.log(`   Lines: ${lineCount}`);
          console.log(`   Exports: ${exportCount}`);
          
          // Try to extract comments/descriptions
          const descriptionMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
          if (descriptionMatch) {
            console.log(`   Description: ${descriptionMatch[1]}`);
          }
          
        } catch (error) {
          console.log(`   ⚠️  Error reading file: ${(error as Error).message}`);
        }
      }
      
      console.log('');
    }
    
    console.log('💡 Commands:');
    console.log(`   Test an event: hasura-event-detector test <event-name>`);
    console.log(`   Create new event: hasura-event-detector create <event-name>`);
    
  } catch (error) {
    console.error('❌ Failed to list events:', (error as Error).message);
    process.exit(1);
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}