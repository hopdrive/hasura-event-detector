-- Database Permissions Setup for Event Detector Observability (Step 2 of 2)
-- This script sets up permissions and default privileges for the observability database
--
-- Prerequisites:
-- 1. Run create-database.sql first (Step 1)
-- 2. Connect to the event_detector_observability database before running this script
-- 3. Run this script as the observability_admin user
--
-- Usage examples:
--   psql: psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f setup-permissions.sql
--   pgAdmin: Connect to event_detector_observability database, then execute this script
--   DBeaver: Connect to event_detector_observability database, then run in SQL editor

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'event_detector_observability' THEN
        RAISE EXCEPTION 'This script must be run on the event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Setting up permissions in database: %', current_database();
END $$;

-- Verify we're running as the correct user
DO $$
BEGIN
    IF current_user != 'observability_admin' THEN
        RAISE WARNING 'This script should be run as observability_admin user. Current user: %', current_user;
        RAISE WARNING 'Continuing anyway, but some operations may fail if insufficient privileges...';
    END IF;
END $$;

-- Grant database-level permissions to admin user
-- Note: This may require the user running this script to have sufficient privileges
BEGIN;

-- Grant schema permissions on public schema
GRANT ALL PRIVILEGES ON SCHEMA public TO observability_admin;
GRANT USAGE ON SCHEMA public TO observability_app;
GRANT USAGE ON SCHEMA public TO observability_readonly;

-- Set default privileges for future tables
-- These ensure that any tables created later will have the correct permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO observability_readonly;

-- Set default privileges for sequences (used by SERIAL columns)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO observability_readonly;

-- Set default privileges for functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO observability_readonly;

-- Create connection information view for reference
CREATE OR REPLACE VIEW connection_info AS
SELECT
    current_database() as database_name,
    current_user as current_user,
    session_user as session_user,
    inet_server_addr() as server_address,
    inet_server_port() as server_port,
    version() as postgres_version,
    NOW() as current_timestamp;

COMMENT ON VIEW connection_info IS 'Database connection and version information for troubleshooting';

-- Grant access to connection_info view
GRANT SELECT ON connection_info TO observability_app;
GRANT SELECT ON connection_info TO observability_readonly;

COMMIT;

-- Verification queries to check permissions setup
DO $$
DECLARE
    admin_schemas INTEGER;
    app_schemas INTEGER;
    readonly_schemas INTEGER;
    view_exists BOOLEAN;
BEGIN
    -- Check schema permissions
    SELECT COUNT(*) INTO admin_schemas
    FROM information_schema.usage_privileges
    WHERE grantee = 'observability_admin'
    AND object_type = 'SCHEMA'
    AND object_name = 'public';

    SELECT COUNT(*) INTO app_schemas
    FROM information_schema.usage_privileges
    WHERE grantee = 'observability_app'
    AND object_type = 'SCHEMA'
    AND object_name = 'public';

    SELECT COUNT(*) INTO readonly_schemas
    FROM information_schema.usage_privileges
    WHERE grantee = 'observability_readonly'
    AND object_type = 'SCHEMA'
    AND object_name = 'public';

    -- Check if connection_info view exists
    SELECT EXISTS(
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'connection_info'
        AND table_schema = 'public'
    ) INTO view_exists;

    -- Report results
    RAISE NOTICE '';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'PERMISSIONS SETUP VERIFICATION';
    RAISE NOTICE '==========================================';

    IF admin_schemas > 0 THEN
        RAISE NOTICE '✓ observability_admin: Schema permissions granted';
    ELSE
        RAISE NOTICE '✗ observability_admin: Schema permissions missing';
    END IF;

    IF app_schemas > 0 THEN
        RAISE NOTICE '✓ observability_app: Schema permissions granted';
    ELSE
        RAISE NOTICE '✗ observability_app: Schema permissions missing';
    END IF;

    IF readonly_schemas > 0 THEN
        RAISE NOTICE '✓ observability_readonly: Schema permissions granted';
    ELSE
        RAISE NOTICE '✗ observability_readonly: Schema permissions missing';
    END IF;

    IF view_exists THEN
        RAISE NOTICE '✓ connection_info view created successfully';
    ELSE
        RAISE NOTICE '✗ connection_info view creation failed';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE 'Default privileges set for future objects:';
    RAISE NOTICE '- Tables: admin (ALL), app (SELECT/INSERT/UPDATE/DELETE), readonly (SELECT)';
    RAISE NOTICE '- Sequences: admin (ALL), app (USAGE), readonly (SELECT)';
    RAISE NOTICE '- Functions: admin (ALL), app (EXECUTE), readonly (EXECUTE)';
    RAISE NOTICE '';
END $$;

-- Display completion message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Step 2 completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Database permissions configured for:';
    RAISE NOTICE '- observability_admin: Full database management';
    RAISE NOTICE '- observability_app: Read/write access for plugins';
    RAISE NOTICE '- observability_readonly: Read-only access for dashboards';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEP:';
    RAISE NOTICE 'Run schema.sql to create tables, indexes, and functions';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Change default passwords before production use!';
    RAISE NOTICE '==========================================';
END $$;

-- Optional: Test connection with a simple query
SELECT 'Permissions setup completed at: ' || NOW()::TEXT as status;