/**
 * Standalone Debug Script
 * 
 * Run this with: npx tsx debug-script.ts
 * Or debug it directly in VSCode
 */

import { listenTo } from './src/detector';
import * as path from 'path';

async function debugMovesEvent() {
  // Your actual Hasura payload from Insomnia
  const hasuraPayload = {
    "created_at": "2025-09-13T12:21:08.552674",
    "delivery_info": {
        "current_retry": 0,
        "max_retries": 0
    },
    "event": {
        "data": {
            "new": {
                "active": 0,
                "id": 827,
                "lane_id": 1,
                "move_type": "ride",
                "driver_status": "unassigned",
                "customer_id": 6,
                "status": null
                // ... truncated for readability - you can paste the full payload here
            },
            "old": {
                "active": 1,
                "id": 827,
                "lane_id": 1,
                "move_type": "ride", 
                "driver_status": "unassigned",
                "customer_id": 6,
                "status": null
                // ... truncated for readability
            }
        },
        "op": "UPDATE",
        "session_variables": {
            "x-hasura-role": "admin"
        },
        "trace_context": {
            "sampling_state": "1",
            "span_id": "fb0a58ec79591ef7",
            "trace_id": "85d80ed11fdebf0de2e3b663e584a632"
        }
    },
    "id": "0d19a3ef-5d74-42e6-b33c-23f9a7383a7f",
    "table": {
        "name": "moves",
        "schema": "public"
    },
    "trigger": {
        "name": "event_detector_moves"
    }
  };

  console.log('🚀 Starting debug session...');
  
  try {
    const result = await listenTo(hasuraPayload, {
      autoLoadEventModules: true,
      eventModulesDirectory: path.join(__dirname, '../event-handlers/functions/db-moves/events'),
      correlationId: 'debug-session-123',
      context: {
        environment: 'debug',
        testMode: false
      }
    });

    console.log('✅ Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the debug function
debugMovesEvent();