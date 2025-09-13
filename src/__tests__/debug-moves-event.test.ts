/**
 * Debug Test for Moves Event
 *
 * Use this test to debug the listenTo function with real Hasura payloads.
 *
 * To debug in VSCode:
 * 1. Set breakpoints in src/detector.ts or any other source files
 * 2. Open this test file
 * 3. Click "Debug" above the test in VSCode
 * 4. Or use the Jest extension's debug button
 */

import { listenTo } from '../detector';
import * as path from 'path';

describe('Debug Moves Event', () => {
  // Your actual Hasura payload from Insomnia
  const HASURA_PAYLOAD = {
    created_at: '2025-09-13T12:21:08.552674',
    delivery_info: {
      current_retry: 0,
      max_retries: 0,
    },
    event: {
      data: {
        new: {
          active: 0,
          actual_delivery_mileage: null,
          actual_pickup_mileage: null,
          auto_assign: 0,
          cancel_reason: null,
          cancel_requested_at: null,
          cancel_status: null,
          canceled_at: null,
          chargeable: true,
          class: null,
          config: null,
          consumer_at_pickup: 0,
          consumer_name: null,
          consumer_phone: null,
          consumer_pickup: false,
          consumer_type: null,
          createdBy: null,
          createdat: '2025-09-10T04:21:27.232771+00:00',
          customer_id: 6,
          dealer_contact: null,
          deliver_by: null,
          delivery_arrived: null,
          delivery_started: null,
          delivery_stop_id: null,
          delivery_successful: null,
          delivery_template_override: null,
          delivery_time: null,
          delivery_workflow_data: null,
          delivery_workflow_id: null,
          discount_amount: 0,
          discount_reason: null,
          dispute_reason: null,
          disputed: false,
          driver_app_version: null,
          driver_id: null,
          driver_name: null,
          driver_status: 'unassigned',
          earliest_available_time: null,
          id: 827,
          lane_id: 1,
          lite: false,
          lyft_flag: 0,
          lyft_trigger_id: null,
          manual_flag: false,
          move_details: null,
          move_failed: null,
          move_type: 'ride',
          parent_move_id: 822,
          payable: true,
          payer_id: null,
          pickup_arrived: null,
          pickup_started: null,
          pickup_stop_id: null,
          pickup_successful: null,
          pickup_template_override: null,
          pickup_time: '2025-09-10T15:39:40+00:00',
          pickup_workflow_data: null,
          pickup_workflow_id: null,
          pinnable: false,
          plan_id: null,
          priority: 10,
          rate_class_override: 0,
          ready_by: null,
          reference_num: null,
          return_ride_id: null,
          ride_type: 'auto',
          sequence: null,
          settled: false,
          sla_id: 1,
          status: null,
          synced_with_tookan: null,
          tags: null,
          target_pickup_time: null,
          tookan_relationship_id: null,
          tracking_link: null,
          trip_id: null,
          updatedBy: null,
          updatedat: '2025-09-10T04:21:27.232771+00:00',
          usecase_key: null,
          vehicle_color: null,
          vehicle_gross_weight_lbs: null,
          vehicle_id: null,
          vehicle_image: null,
          vehicle_make: null,
          vehicle_model: null,
          vehicle_odometer: null,
          vehicle_stock: null,
          vehicle_vin: null,
          vehicle_year: null,
          workflow_data: null,
          workflowset_id: 1,
        },
        old: {
          active: 1,
          actual_delivery_mileage: null,
          actual_pickup_mileage: null,
          auto_assign: 0,
          cancel_reason: null,
          cancel_requested_at: null,
          cancel_status: null,
          canceled_at: null,
          chargeable: true,
          class: null,
          config: null,
          consumer_at_pickup: 0,
          consumer_name: null,
          consumer_phone: null,
          consumer_pickup: false,
          consumer_type: null,
          createdBy: null,
          createdat: '2025-09-10T04:21:27.232771+00:00',
          customer_id: 6,
          dealer_contact: null,
          deliver_by: null,
          delivery_arrived: null,
          delivery_started: null,
          delivery_stop_id: null,
          delivery_successful: null,
          delivery_template_override: null,
          delivery_time: null,
          delivery_workflow_data: null,
          delivery_workflow_id: null,
          discount_amount: 0,
          discount_reason: null,
          dispute_reason: null,
          disputed: false,
          driver_app_version: null,
          driver_id: null,
          driver_name: null,
          driver_status: 'unassigned',
          earliest_available_time: null,
          id: 827,
          lane_id: 1,
          lite: false,
          lyft_flag: 0,
          lyft_trigger_id: null,
          manual_flag: false,
          move_details: null,
          move_failed: null,
          move_type: 'ride',
          parent_move_id: 822,
          payable: true,
          payer_id: null,
          pickup_arrived: null,
          pickup_started: null,
          pickup_stop_id: null,
          pickup_successful: null,
          pickup_template_override: null,
          pickup_time: '2025-09-10T15:39:40+00:00',
          pickup_workflow_data: null,
          pickup_workflow_id: null,
          pinnable: false,
          plan_id: null,
          priority: 10,
          rate_class_override: 0,
          ready_by: null,
          reference_num: null,
          return_ride_id: null,
          ride_type: 'auto',
          sequence: null,
          settled: false,
          sla_id: 1,
          status: null,
          synced_with_tookan: null,
          tags: null,
          target_pickup_time: null,
          tookan_relationship_id: null,
          tracking_link: null,
          trip_id: null,
          updatedBy: null,
          updatedat: '2025-09-10T04:21:27.232771+00:00',
          usecase_key: null,
          vehicle_color: null,
          vehicle_gross_weight_lbs: null,
          vehicle_id: null,
          vehicle_image: null,
          vehicle_make: null,
          vehicle_model: null,
          vehicle_odometer: null,
          vehicle_stock: null,
          vehicle_vin: null,
          vehicle_year: null,
          workflow_data: null,
          workflowset_id: 1,
        },
      },
      op: 'UPDATE',
      session_variables: {
        'x-hasura-role': 'admin',
      },
      trace_context: {
        sampling_state: '1',
        span_id: 'fb0a58ec79591ef7',
        trace_id: '85d80ed11fdebf0de2e3b663e584a632',
      },
    },
    id: '0d19a3ef-5d74-42e6-b33c-23f9a7383a7f',
    table: {
      name: 'moves',
      schema: 'public',
    },
    trigger: {
      name: 'event_detector_moves',
    },
  };

  it('should process moves UPDATE event with debugging', async () => {
    // Set a breakpoint on the next line to start debugging
    const result = await listenTo(HASURA_PAYLOAD, {
      autoLoadEventModules: true,
      // Update this path to point to your event-handlers events directory
      eventModulesDirectory: path.join('', '/Users/robnewton/Github/event-handlers/functions/db-moves/events'),

      // Optional: Add correlation ID if you want to test that
      correlationId: 'test-correlation-123',

      // Optional: Add context like your production code does
      context: {
        environment: 'development',
        testMode: false,
        requestId: 'test-request-123',

        // Add any context your event modules expect
        featureFlags: {
          enableNotifications: true,
          useEnrichment: false,
        },
      },

    });

    // Add assertions or just inspect the result
    console.log('Result:', JSON.stringify(result, null, 2));

    expect(result).toBeDefined();
    expect(result.events).toBeInstanceOf(Array);

    // Check if your specific event was detected
    const detectedEvent = result.events.find(e => e.name === 'move-completed');
    if (detectedEvent) {
      console.log('Move completed event detected!');
      console.log('Jobs run:', detectedEvent.jobs);
    }
  });

  it('should process moves INSERT event', async () => {
    const INSERT_PAYLOAD = {
      event: {
        session_variables: {
          'x-hasura-role': 'admin',
        },
        op: 'INSERT',
        data: {
          old: null,
          new: {
            id: 'move_new_123',
            status: 'pending',
            created_at: '2024-01-15T11:00:00Z',
            updated_at: '2024-01-15T11:00:00Z',
            // Add your fields
          },
        },
      },
      created_at: '2024-01-15T11:00:00Z',
      id: 'evt_xyz789',
      table: {
        schema: 'public',
        name: 'moves',
      },
    };

    const result = await listenTo(INSERT_PAYLOAD, {
      autoLoadEventModules: true,
      eventModulesDirectory: path.join(__dirname, '../../../../event-handlers/functions/db-moves/events'),
    });

    console.log('Insert result:', result);
    expect(result).toBeDefined();
  });
});

/**
 * Tips for debugging:
 *
 * 1. Set breakpoints in:
 *    - src/detector.ts (listenTo function)
 *    - src/helpers/hasura.ts (parseHasuraEvent)
 *    - Your event module files in event-handlers/functions/db-moves/events/
 *    - src/plugins/* if testing plugins
 *
 * 2. Use VSCode's debugger:
 *    - Click the "Debug" CodeLens above the test
 *    - Or use Run > Start Debugging (F5) with Jest configuration
 *
 * 3. Add a launch.json configuration if needed:
 *    {
 *      "type": "node",
 *      "request": "launch",
 *      "name": "Debug Jest Test",
 *      "runtimeArgs": [
 *        "--inspect-brk",
 *        "${workspaceRoot}/node_modules/.bin/jest",
 *        "--runInBand",
 *        "--testPathPattern=debug-moves-event"
 *      ],
 *      "console": "integratedTerminal",
 *      "internalConsoleOptions": "neverOpen"
 *    }
 */
