-- Database Creation Script for Event Detector Observability (Step 1 of 2)
-- This script creates a new PostgreSQL database and users on the same RDS server
-- for isolated observability data storage
--
-- IMPORTANT: This script only creates the database and users. After running this,
-- you must connect to the new database and run setup-permissions.sql (Step 2).
--
-- Connect as your RDS master user (the one you created the RDS instance with)
-- Usage examples:
--   psql: psql -h your-rds-endpoint -U your_master_user -f create-database.sql
--   pgAdmin: Open and execute this script while connected to any database
--   DBeaver: Execute this script in SQL editor connected to any database

-- Create the observability database
-- Note: TABLESPACE omitted for RDS compatibility (uses default automatically)
CREATE DATABASE event_detector_observability
    WITH
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    CONNECTION LIMIT = -1
    TEMPLATE = template0;

-- Create dedicated users for the observability system
CREATE ROLE observability_admin WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'CHANGE_THIS_PASSWORD_IN_PRODUCTION';

CREATE ROLE observability_app WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'CHANGE_THIS_PASSWORD_IN_PRODUCTION';

CREATE ROLE observability_readonly WITH
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    INHERIT
    NOREPLICATION
    CONNECTION LIMIT -1
    PASSWORD 'CHANGE_THIS_PASSWORD_IN_PRODUCTION';

-- Grant database connection permissions
GRANT CONNECT ON DATABASE event_detector_observability TO observability_admin;
GRANT CONNECT ON DATABASE event_detector_observability TO observability_app;
GRANT CONNECT ON DATABASE event_detector_observability TO observability_readonly;

-- Add database comment
COMMENT ON DATABASE event_detector_observability IS 'Dedicated database for Event Detector observability data - execution metadata, performance metrics, and debugging information';

-- Grant additional database privileges to observability_admin
GRANT ALL PRIVILEGES ON DATABASE event_detector_observability TO observability_admin;

-- Try to make observability_admin the owner (may fail in RDS, which is okay)
DO $$
BEGIN
    ALTER DATABASE event_detector_observability OWNER TO observability_admin;
    RAISE NOTICE 'Database ownership transferred to observability_admin';
EXCEPTION
    WHEN insufficient_privilege THEN
        RAISE NOTICE 'Note: Could not change database ownership (RDS limitation) - using granted privileges instead';
END $$;

-- Display setup completion message
DO $$
BEGIN
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Step 1 completed successfully!';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Database created: event_detector_observability';
    RAISE NOTICE 'Users created: observability_admin, observability_app, observability_readonly';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Connect to the event_detector_observability database';
    RAISE NOTICE '2. Run setup-permissions.sql as observability_admin';
    RAISE NOTICE '3. Run schema.sql to create tables and indexes';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Change default passwords before production use!';
    RAISE NOTICE '==========================================';
END $$;