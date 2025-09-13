-- Hasura Event Detector Observability Database Schema
-- This schema captures detailed execution metadata for event detection and job processing
-- to provide comprehensive observability and debugging capabilities.
--
-- Prerequisites:
-- 1. Run create-database.sql first to create the observability database
-- 2. Connect to hasura_event_detector_observability database before running this script
-- Usage: psql -h your-rds-endpoint -U observability_admin -d hasura_event_detector_observability -f schema.sql

-- Verify we're connected to the correct database
DO $$
BEGIN
    IF current_database() != 'hasura_event_detector_observability' THEN
        RAISE EXCEPTION 'This script must be run on the hasura_event_detector_observability database. Current database: %', current_database();
    END IF;
    RAISE NOTICE 'Creating schema in database: %', current_database();
END $$;

-- Enable UUID extension for primary keys
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main invocation table - each call to listenTo()
CREATE TABLE invocations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Correlation tracking
    correlation_id TEXT, -- Format: {source_function}.{uuid} for chaining related events
    
    -- Source context
    source_function TEXT NOT NULL, -- netlify function name
    source_table TEXT, -- hasura table that triggered the event
    source_operation TEXT, -- INSERT, UPDATE, DELETE, MANUAL
    
    -- Hasura event details
    hasura_event_id UUID,
    hasura_event_payload JSONB NOT NULL,
    hasura_event_time TIMESTAMPTZ,
    hasura_user_email TEXT,
    hasura_user_role TEXT,
    
    -- Execution metadata
    total_duration_ms INTEGER,
    events_detected_count INTEGER DEFAULT 0,
    total_jobs_run INTEGER DEFAULT 0,
    total_jobs_succeeded INTEGER DEFAULT 0,
    total_jobs_failed INTEGER DEFAULT 0,
    
    -- Configuration used
    auto_load_modules BOOLEAN DEFAULT true,
    event_modules_directory TEXT,
    
    -- Overall status
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    error_stack TEXT,
    
    -- Custom context passed in
    context_data JSONB
);

-- Event module execution - each event module checked during an invocation
CREATE TABLE event_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invocation_id UUID NOT NULL REFERENCES invocations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Correlation tracking (denormalized for query efficiency)
    correlation_id TEXT, -- Same as parent invocation's correlation_id
    
    -- Event module details
    event_name TEXT NOT NULL,
    event_module_path TEXT,
    
    -- Detection results
    detected BOOLEAN NOT NULL DEFAULT false,
    detection_duration_ms INTEGER,
    detection_error TEXT,
    detection_error_stack TEXT,
    
    -- Handler execution (if detected)
    handler_duration_ms INTEGER,
    handler_error TEXT,
    handler_error_stack TEXT,
    jobs_count INTEGER DEFAULT 0,
    jobs_succeeded INTEGER DEFAULT 0,
    jobs_failed INTEGER DEFAULT 0,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'detecting' CHECK (status IN ('detecting', 'not_detected', 'handling', 'completed', 'failed'))
);

-- Job execution - each async job run for detected events
CREATE TABLE job_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invocation_id UUID NOT NULL REFERENCES invocations(id) ON DELETE CASCADE,
    event_execution_id UUID NOT NULL REFERENCES event_executions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Correlation tracking (denormalized for query efficiency)
    correlation_id TEXT, -- Same as parent invocation's correlation_id
    
    -- Job details
    job_name TEXT NOT NULL,
    job_function_name TEXT, -- extracted from func.name
    
    -- Job configuration
    job_options JSONB,
    
    -- Execution results
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    result JSONB,
    error_message TEXT,
    error_stack TEXT,
    
);


-- Performance metrics aggregated by time periods
CREATE TABLE metrics_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hour_bucket TIMESTAMPTZ NOT NULL,
    source_function TEXT NOT NULL,
    
    -- Counts
    total_invocations INTEGER DEFAULT 0,
    total_events_detected INTEGER DEFAULT 0,
    total_jobs_run INTEGER DEFAULT 0,
    successful_invocations INTEGER DEFAULT 0,
    failed_invocations INTEGER DEFAULT 0,
    
    -- Performance
    avg_duration_ms NUMERIC(10,2),
    min_duration_ms INTEGER,
    max_duration_ms INTEGER,
    p95_duration_ms NUMERIC(10,2),
    
    -- Top events and jobs
    top_detected_events JSONB DEFAULT '[]'::jsonb,
    most_failed_jobs JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(hour_bucket, source_function)
);

-- Performance indexes
CREATE INDEX idx_invocations_created_at ON invocations(created_at DESC);
CREATE INDEX idx_invocations_source_function ON invocations(source_function);
CREATE INDEX idx_invocations_status ON invocations(status);
CREATE INDEX idx_invocations_hasura_event_id ON invocations(hasura_event_id);
CREATE INDEX idx_invocations_correlation_id ON invocations(correlation_id);

CREATE INDEX idx_event_executions_invocation_id ON event_executions(invocation_id);
CREATE INDEX idx_event_executions_event_name ON event_executions(event_name);
CREATE INDEX idx_event_executions_detected ON event_executions(detected);
CREATE INDEX idx_event_executions_status ON event_executions(status);
CREATE INDEX idx_event_executions_correlation_id ON event_executions(correlation_id);

CREATE INDEX idx_job_executions_invocation_id ON job_executions(invocation_id);
CREATE INDEX idx_job_executions_event_execution_id ON job_executions(event_execution_id);
CREATE INDEX idx_job_executions_job_name ON job_executions(job_name);
CREATE INDEX idx_job_executions_status ON job_executions(status);
CREATE INDEX idx_job_executions_created_at ON job_executions(created_at DESC);
CREATE INDEX idx_job_executions_correlation_id ON job_executions(correlation_id);

CREATE INDEX idx_metrics_hourly_bucket ON metrics_hourly(hour_bucket DESC);
CREATE INDEX idx_metrics_hourly_function ON metrics_hourly(source_function);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invocations_updated_at
    BEFORE UPDATE ON invocations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER event_executions_updated_at
    BEFORE UPDATE ON event_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER job_executions_updated_at
    BEFORE UPDATE ON job_executions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Computed field functions for Hasura
CREATE OR REPLACE FUNCTION invocation_success_rate(invocation_row invocations)
RETURNS NUMERIC AS $$
BEGIN
    IF invocation_row.total_jobs_run = 0 THEN
        RETURN 100.0;
    END IF;
    RETURN ROUND((invocation_row.total_jobs_succeeded::NUMERIC / invocation_row.total_jobs_run::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION invocation_avg_job_duration(invocation_row invocations)
RETURNS NUMERIC AS $$
DECLARE
    avg_duration NUMERIC;
BEGIN
    SELECT AVG(duration_ms)
    INTO avg_duration
    FROM job_executions
    WHERE invocation_id = invocation_row.id;

    RETURN COALESCE(avg_duration, 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION event_job_success_rate(event_row event_executions)
RETURNS NUMERIC AS $$
BEGIN
    IF event_row.jobs_count = 0 THEN
        RETURN 100.0;
    END IF;
    RETURN ROUND((event_row.jobs_succeeded::NUMERIC / event_row.jobs_count::NUMERIC) * 100, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Materialized view for dashboard performance
CREATE MATERIALIZED VIEW dashboard_stats AS
SELECT
    DATE_TRUNC('hour', created_at) as hour_bucket,
    source_function,
    COUNT(*) as total_invocations,
    COUNT(*) FILTER (WHERE status = 'completed') as successful_invocations,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_invocations,
    SUM(events_detected_count) as total_events_detected,
    SUM(total_jobs_run) as total_jobs_run,
    SUM(total_jobs_succeeded) as total_jobs_succeeded,
    AVG(total_duration_ms) as avg_duration_ms,
    MIN(total_duration_ms) as min_duration_ms,
    MAX(total_duration_ms) as max_duration_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY total_duration_ms) as p95_duration_ms
FROM invocations
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), source_function
ORDER BY hour_bucket DESC;

-- Index for materialized view
CREATE INDEX idx_dashboard_stats_hour_bucket ON dashboard_stats(hour_bucket DESC);
CREATE INDEX idx_dashboard_stats_function ON dashboard_stats(source_function);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- Set up automatic refresh of materialized view every 5 minutes
-- Note: This requires pg_cron extension in production
-- SELECT cron.schedule('refresh-dashboard-stats', '*/5 * * * *', 'SELECT refresh_dashboard_stats();');

COMMENT ON DATABASE hasura_event_detector_observability IS 'Dedicated observability database for Hasura Event Detector - captures execution metadata for monitoring and debugging';
COMMENT ON TABLE invocations IS 'Each call to listenTo() function with context and results';
COMMENT ON TABLE event_executions IS 'Each event module checked during an invocation';
COMMENT ON TABLE job_executions IS 'Each async job executed for detected events';
COMMENT ON TABLE metrics_hourly IS 'Pre-aggregated hourly metrics for dashboard performance';

-- Why correlation_id is in all tables:
-- 1. Enables efficient querying at any level (invocations, events, or jobs by correlation ID)
-- 2. Supports partial queries (e.g., all job executions for a correlation chain)
-- 3. Provides redundancy if foreign key relationships break
-- 4. Allows fast analytics queries grouped by correlation ID
-- 5. Enables visualization of complete event chains across multiple invocations