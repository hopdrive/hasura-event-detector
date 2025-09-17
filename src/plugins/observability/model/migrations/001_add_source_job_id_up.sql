-- Migration: Add source_job_id field to invocations table
-- Version: 001
-- Description: Adds source_job_id UUID field and index to track job-to-job execution chains
--
-- Prerequisites:
-- 1. Connect to event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 001_add_source_job_id_up.sql

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This migration must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Running migration 001 (UP) on database: %', current_database();
END $$;

-- Add source_job_id column to invocations table
ALTER TABLE invocations
ADD COLUMN source_job_id UUID;

-- Add foreign key constraint to ensure referential integrity
ALTER TABLE invocations
ADD CONSTRAINT fk_invocations_source_job_id
FOREIGN KEY (source_job_id) REFERENCES job_executions(id) ON DELETE SET NULL;

-- Add index for the new column to support efficient queries
CREATE INDEX idx_invocations_source_job_id ON invocations(source_job_id);

-- Add comment to document the column purpose
COMMENT ON COLUMN invocations.source_job_id IS 'Nullable reference to originating job execution (for job-to-job chains)';

-- Verify the changes
DO $$
DECLARE
    column_exists BOOLEAN;
    index_exists BOOLEAN;
    fk_exists BOOLEAN;
BEGIN
    -- Check if column was added
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'invocations'
        AND column_name = 'source_job_id'
        AND table_schema = 'public'
    ) INTO column_exists;

    -- Check if index was created
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'invocations'
        AND indexname = 'idx_invocations_source_job_id'
        AND schemaname = 'public'
    ) INTO index_exists;

    -- Check if foreign key constraint was created
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'invocations'
        AND constraint_name = 'fk_invocations_source_job_id'
        AND constraint_type = 'FOREIGN KEY'
        AND table_schema = 'public'
    ) INTO fk_exists;

    IF column_exists AND index_exists AND fk_exists THEN
        RAISE NOTICE 'SUCCESS: Migration 001 completed successfully';
        RAISE NOTICE '✅ Added source_job_id column to invocations table';
        RAISE NOTICE '✅ Created foreign key constraint to job_executions';
        RAISE NOTICE '✅ Created idx_invocations_source_job_id index';
        RAISE NOTICE '✅ Added column documentation';
    ELSE
        RAISE EXCEPTION 'Migration failed - column exists: %, fk exists: %, index exists: %', column_exists, fk_exists, index_exists;
    END IF;
END $$;

-- Final message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Migration 001 (UP) completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Added: source_job_id UUID column';
    RAISE NOTICE 'Added: Foreign key constraint to job_executions';
    RAISE NOTICE 'Added: idx_invocations_source_job_id index';
    RAISE NOTICE 'Purpose: Track job-to-job execution chains';
    RAISE NOTICE 'To undo: Run 001_add_source_job_id_down.sql';
    RAISE NOTICE '==========================================';
END $$;