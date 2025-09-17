-- Migration: Remove source_job_id field from invocations table
-- Version: 001 (DOWN)
-- Description: Removes source_job_id UUID field and index from invocations table
--
-- Prerequisites:
-- 1. Connect to event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 001_add_source_job_id_down.sql
--
-- WARNING: This will permanently delete the source_job_id data!

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This migration must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Running migration 001 (DOWN) on database: %', current_database();
    RAISE NOTICE 'WARNING: This will permanently delete source_job_id data!';
END $$;

-- Drop the foreign key constraint first
ALTER TABLE invocations
DROP CONSTRAINT IF EXISTS fk_invocations_source_job_id;

-- Drop the index
DROP INDEX IF EXISTS idx_invocations_source_job_id;

-- Drop the column (this will permanently delete all data in this column)
ALTER TABLE invocations
DROP COLUMN IF EXISTS source_job_id;

-- Verify the changes
DO $$
DECLARE
    column_exists BOOLEAN;
    index_exists BOOLEAN;
    fk_exists BOOLEAN;
BEGIN
    -- Check if column was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invocations'
        AND column_name = 'source_job_id'
        AND table_schema = 'public'
    ) INTO column_exists;

    -- Check if index was removed
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'invocations'
        AND indexname = 'idx_invocations_source_job_id'
        AND schemaname = 'public'
    ) INTO index_exists;

    -- Check if foreign key constraint was removed
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'invocations'
        AND constraint_name = 'fk_invocations_source_job_id'
        AND constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    ) INTO fk_exists;

    IF NOT column_exists AND NOT index_exists AND NOT fk_exists THEN
        RAISE NOTICE 'SUCCESS: Migration 001 (DOWN) completed successfully';
        RAISE NOTICE '✅ Removed source_job_id column from invocations table';
        RAISE NOTICE '✅ Removed foreign key constraint to job_executions';
        RAISE NOTICE '✅ Removed idx_invocations_source_job_id index';
        RAISE NOTICE 'WARNING: All source_job_id data has been permanently deleted';
    ELSE
        RAISE EXCEPTION 'Migration failed - column still exists: %, fk still exists: %, index still exists: %', column_exists, fk_exists, index_exists;
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Migration 001 (DOWN) completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Removed: source_job_id UUID column';
    RAISE NOTICE 'Removed: Foreign key constraint to job_executions';
    RAISE NOTICE 'Removed: idx_invocations_source_job_id index';
    RAISE NOTICE 'WARNING: All source_job_id data permanently deleted';
    RAISE NOTICE 'To re-add: Run 001_add_source_job_id_up.sql';
    RAISE NOTICE '==========================================';
END $$;