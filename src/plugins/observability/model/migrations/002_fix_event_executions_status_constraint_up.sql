-- Migration: Fix event_executions status check constraint
-- Version: 002
-- Description: Adds 'detection_failed' and 'handler_failed' to the event_executions status check constraint.
--              The ObservabilityPlugin writes these statuses when detector or handler errors occur, but the
--              existing constraint rejects them, causing a cascading failure loop (500 on every event).
--
-- Prerequisites:
-- 1. Connect to event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 002_fix_event_executions_status_constraint_up.sql

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This migration must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Running migration 002 (UP) on database: %', current_database();
END $$;

-- Drop the existing check constraint
ALTER TABLE event_executions
DROP CONSTRAINT IF EXISTS event_executions_status_check;

-- Re-add with the full set of allowed status values
ALTER TABLE event_executions
ADD CONSTRAINT event_executions_status_check
CHECK (status IN ('detecting', 'not_detected', 'handling', 'completed', 'failed', 'detection_failed', 'handler_failed'));

-- Verify the changes
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'event_executions_status_check'
        AND constraint_schema = 'public'
    ) INTO constraint_exists;

    IF constraint_exists THEN
        RAISE NOTICE 'SUCCESS: Migration 002 completed successfully';
        RAISE NOTICE 'Updated event_executions_status_check to allow: detecting, not_detected, handling, completed, failed, detection_failed, handler_failed';
    ELSE
        RAISE EXCEPTION 'Migration failed - event_executions_status_check constraint not found after update';
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Migration 002 (UP) completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Updated: event_executions_status_check constraint';
    RAISE NOTICE 'Added values: detection_failed, handler_failed';
    RAISE NOTICE 'To undo: Run 002_fix_event_executions_status_constraint_down.sql';
    RAISE NOTICE '==========================================';
END $$;
