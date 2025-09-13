-- Event Detector Observability Database Schema - DOWN Migration
-- This script removes all tables, indexes, functions, and other objects created by schema.sql
-- Use this script to completely clean up the observability database if needed
--
-- Prerequisites:
-- 1. Connect to event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f schema-down.sql
--
-- WARNING: This will permanently delete ALL observability data!

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This script must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Removing schema from database: %', current_database();
    RAISE NOTICE 'WARNING: This will permanently delete all observability data!';
END $$;

-- Prompt for confirmation (commented out for automated scripts)
-- DO $$
-- DECLARE
--     confirm TEXT;
-- BEGIN
--     SELECT pg_read_file('/dev/stdin', 0, 1000) INTO confirm;
--     IF LOWER(TRIM(confirm)) != 'yes' THEN
--         RAISE EXCEPTION 'Operation cancelled. Type "yes" to confirm deletion of all observability data.';
--     END IF;
-- END $$;

-- Drop materialized views first (they depend on tables)
DROP MATERIALIZED VIEW IF EXISTS dashboard_stats CASCADE;

-- Drop computed field functions
DROP FUNCTION IF EXISTS invocation_success_rate(invocations) CASCADE;
DROP FUNCTION IF EXISTS invocation_avg_job_duration(invocations) CASCADE;
DROP FUNCTION IF EXISTS event_job_success_rate(event_executions) CASCADE;
DROP FUNCTION IF EXISTS refresh_dashboard_stats() CASCADE;

-- Drop triggers (before dropping the function they reference)
DROP TRIGGER IF EXISTS invocations_updated_at ON invocations;
DROP TRIGGER IF EXISTS event_executions_updated_at ON event_executions;
DROP TRIGGER IF EXISTS job_executions_updated_at ON job_executions;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- Drop indexes (will be dropped automatically with tables, but explicit for clarity)
DROP INDEX IF EXISTS idx_invocations_created_at;
DROP INDEX IF EXISTS idx_invocations_source_function;
DROP INDEX IF EXISTS idx_invocations_source_system;
DROP INDEX IF EXISTS idx_invocations_status;
DROP INDEX IF EXISTS idx_invocations_source_event_id;
DROP INDEX IF EXISTS idx_invocations_correlation_id;

DROP INDEX IF EXISTS idx_event_executions_invocation_id;
DROP INDEX IF EXISTS idx_event_executions_event_name;
DROP INDEX IF EXISTS idx_event_executions_detected;
DROP INDEX IF EXISTS idx_event_executions_status;
DROP INDEX IF EXISTS idx_event_executions_correlation_id;

DROP INDEX IF EXISTS idx_job_executions_invocation_id;
DROP INDEX IF EXISTS idx_job_executions_event_execution_id;
DROP INDEX IF EXISTS idx_job_executions_job_name;
DROP INDEX IF EXISTS idx_job_executions_status;
DROP INDEX IF EXISTS idx_job_executions_created_at;
DROP INDEX IF EXISTS idx_job_executions_correlation_id;

DROP INDEX IF EXISTS idx_metrics_hourly_bucket;
DROP INDEX IF EXISTS idx_metrics_hourly_function;

-- Drop dashboard stats indexes (from materialized view)
DROP INDEX IF EXISTS idx_dashboard_stats_hour_bucket;
DROP INDEX IF EXISTS idx_dashboard_stats_function;

-- Drop tables in reverse dependency order (child tables first)
-- job_executions references both invocations and event_executions
DROP TABLE IF EXISTS job_executions CASCADE;

-- event_executions references invocations
DROP TABLE IF EXISTS event_executions CASCADE;

-- metrics_hourly is independent but references invocations conceptually
DROP TABLE IF EXISTS metrics_hourly CASCADE;

-- invocations is the parent table
DROP TABLE IF EXISTS invocations CASCADE;

-- Drop connection info view
DROP VIEW IF EXISTS connection_info CASCADE;

-- Drop the UUID extension (only if no other objects use it)
-- Note: This might fail if other databases/schemas use uuid-ossp
-- DROP EXTENSION IF EXISTS "uuid-ossp";

-- Remove any scheduled cron jobs (if pg_cron is installed)
-- Note: This requires superuser privileges and pg_cron extension
-- SELECT cron.unschedule('refresh-dashboard-stats');

-- Final cleanup verification
DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    view_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Count remaining objects
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('invocations', 'event_executions', 'job_executions', 'metrics_hourly');

    SELECT COUNT(*) INTO function_count
    FROM information_schema.routines
    WHERE routine_schema = 'public'
    AND routine_name IN ('invocation_success_rate', 'invocation_avg_job_duration', 'event_job_success_rate', 'refresh_dashboard_stats', 'update_updated_at');

    SELECT COUNT(*) INTO view_count
    FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name IN ('dashboard_stats', 'connection_info');

    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%';

    -- Report cleanup status
    IF table_count = 0 AND function_count = 0 AND view_count <= 1 THEN -- connection_info might remain
        RAISE NOTICE 'SUCCESS: Schema cleanup completed successfully!';
        RAISE NOTICE 'Tables removed: All observability tables dropped';
        RAISE NOTICE 'Functions removed: All computed field functions dropped';
        RAISE NOTICE 'Indexes removed: All observability indexes dropped';
        RAISE NOTICE 'Views removed: All materialized views dropped';
    ELSE
        RAISE NOTICE 'PARTIAL CLEANUP: Some objects may remain:';
        RAISE NOTICE 'Remaining tables: %', table_count;
        RAISE NOTICE 'Remaining functions: %', function_count;
        RAISE NOTICE 'Remaining views: %', view_count;
        RAISE NOTICE 'Remaining indexes: %', index_count;
    END IF;

    RAISE NOTICE 'Database cleanup completed. Connection info view preserved for diagnostics.';
END $$;

-- Optional: Show remaining objects for verification
-- Uncomment these queries to see what objects remain in the database

/*
-- Show remaining tables
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Show remaining functions
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- Show remaining views
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Show remaining indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY indexname;
*/

-- Final message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Schema down migration completed!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'All observability data has been removed.';
    RAISE NOTICE 'To recreate the schema, run schema.sql';
    RAISE NOTICE '==========================================';
END $$;