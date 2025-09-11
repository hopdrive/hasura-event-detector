/**
 * Create Event Command
 * 
 * CLI command to create new event modules from templates.
 */

import fs from 'fs';
import path from 'path';

interface CreateEventOptions {
  template: string;
  directory: string;
}

export async function createEventCommand(eventName: string, options: CreateEventOptions) {
  console.log(`🎯 Creating event module: ${eventName}`);
  
  try {
    // Validate event name
    if (!/^[a-z0-9-]+$/.test(eventName)) {
      throw new Error('Event name must contain only lowercase letters, numbers, and hyphens');
    }
    
    // Ensure events directory exists
    if (!fs.existsSync(options.directory)) {
      fs.mkdirSync(options.directory, { recursive: true });
      console.log(`📁 Created events directory: ${options.directory}`);
    }
    
    // Determine template and target files
    const templateMap: Record<string, string> = {
      'basic': 'event-module.template.ts',
      'user-activation': 'user-activation-event.ts'
    };
    
    const templateFile = templateMap[options.template];
    if (!templateFile) {
      throw new Error(`Unknown template: ${options.template}. Available: ${Object.keys(templateMap).join(', ')}`);
    }
    
    const templatePath = path.join(__dirname, '../../templates', templateFile);
    const targetPath = path.join(options.directory, `${eventName}.ts`);
    
    // Check if target file already exists
    if (fs.existsSync(targetPath)) {
      throw new Error(`Event module already exists: ${targetPath}`);
    }
    
    // Read template
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    
    let templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Replace template variables
    templateContent = templateContent
      .replace(/example-event/g, eventName)
      .replace(/Example Event/g, eventName.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' '))
      .replace(/ExampleEvent/g, eventName.split('-').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(''));
    
    // Write the new event module
    fs.writeFileSync(targetPath, templateContent);
    
    console.log(`✅ Event module created: ${targetPath}`);
    console.log(`📝 Template used: ${options.template}`);
    console.log('\nNext steps:');
    console.log(`1. Edit ${targetPath} to customize your event logic`);
    console.log(`2. Test your event: hasura-event-detector test ${eventName}`);
    
  } catch (error) {
    console.error('❌ Failed to create event module:', (error as Error).message);
    process.exit(1);
  }
}