-- Database Creation Script for Hasura Event Detector Observability
-- This script creates a new PostgreSQL database on the same RDS server
-- for isolated observability data storage

-- Connect as superuser (postgres) to create the database and users
-- Usage: psql -h your-rds-endpoint -U postgres -f create-database.sql

-- Create the observability database
CREATE DATABASE hasura_event_detector_observability
    WITH
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'en_US.UTF-8'
    LC_CTYPE = 'en_US.UTF-8'
    TABLESPACE = pg_default
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
GRANT CONNECT ON DATABASE hasura_event_detector_observability TO observability_admin;
GRANT CONNECT ON DATABASE hasura_event_detector_observability TO observability_app;
GRANT CONNECT ON DATABASE hasura_event_detector_observability TO observability_readonly;

-- Switch to the new database context for remaining operations
\c hasura_event_detector_observability

-- Grant schema creation permissions to admin
GRANT ALL PRIVILEGES ON DATABASE hasura_event_detector_observability TO observability_admin;

-- Create default schema (public is sufficient since we have our own database)
-- Grant permissions on public schema
GRANT ALL PRIVILEGES ON SCHEMA public TO observability_admin;
GRANT USAGE ON SCHEMA public TO observability_app;
GRANT USAGE ON SCHEMA public TO observability_readonly;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO observability_readonly;

-- Set default privileges for sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO observability_readonly;

-- Set default privileges for functions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO observability_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO observability_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO observability_readonly;

COMMENT ON DATABASE hasura_event_detector_observability IS 'Dedicated database for Hasura Event Detector observability data - execution metadata, performance metrics, and debugging information';

-- Create connection information view for reference
CREATE OR REPLACE VIEW connection_info AS
SELECT
    current_database() as database_name,
    current_user as current_user,
    session_user as session_user,
    inet_server_addr() as server_address,
    inet_server_port() as server_port,
    version() as postgres_version;

COMMENT ON VIEW connection_info IS 'Database connection and version information for troubleshooting';

-- Display setup completion message
DO $$
BEGIN
    RAISE NOTICE 'Observability database setup completed successfully!';
    RAISE NOTICE 'Database: hasura_event_detector_observability';
    RAISE NOTICE 'Users created: observability_admin, observability_app, observability_readonly';
    RAISE NOTICE 'Next step: Run schema.sql to create tables and indexes';
    RAISE NOTICE 'IMPORTANT: Change default passwords before production use!';
END $$;