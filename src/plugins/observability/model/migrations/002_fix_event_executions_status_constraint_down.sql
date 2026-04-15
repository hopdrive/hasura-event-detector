-- Migration: Revert event_executions status check constraint
-- Version: 002 (DOWN)
-- Description: Reverts the event_executions status check constraint to the original set of allowed values.
--
-- Prerequisites:
-- 1. Connect to event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 002_fix_event_executions_status_constraint_down.sql
--
-- WARNING: Any rows with status 'detection_failed' or 'handler_failed' must be updated before running this!

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This migration must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Running migration 002 (DOWN) on database: %', current_database();
END $$;

-- Check for rows that would violate the reverted constraint
DO $$
DECLARE
    row_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO row_count
    FROM event_executions
    WHERE status IN ('detection_failed', 'handler_failed');

    IF row_count > 0 THEN
        RAISE WARNING 'Found % rows with status detection_failed or handler_failed. Updating to failed before reverting constraint.', row_count;
    END IF;
END $$;

-- Migrate any rows with the new statuses back to 'failed' so they don't violate the old constraint
UPDATE event_executions SET status = 'failed' WHERE status IN ('detection_failed', 'handler_failed');

-- Drop the updated constraint
ALTER TABLE event_executions
DROP CONSTRAINT IF EXISTS event_executions_status_check;

-- Re-add the original constraint
ALTER TABLE event_executions
ADD CONSTRAINT event_executions_status_check
CHECK (status IN ('detecting', 'not_detected', 'handling', 'completed', 'failed'));

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
        RAISE NOTICE 'SUCCESS: Migration 002 (DOWN) completed successfully';
        RAISE NOTICE 'Reverted event_executions_status_check to original values: detecting, not_detected, handling, completed, failed';
    ELSE
        RAISE EXCEPTION 'Migration failed - event_executions_status_check constraint not found after revert';
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Migration 002 (DOWN) completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Reverted: event_executions_status_check constraint';
    RAISE NOTICE 'Removed values: detection_failed, handler_failed';
    RAISE NOTICE 'To re-apply: Run 002_fix_event_executions_status_constraint_up.sql';
    RAISE NOTICE '==========================================';
END $$;
