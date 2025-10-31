# Observability Database Migrations

This directory contains database migration scripts for the Event Detector observability system.

## Migration Files

### 001 - Add source_job_id field
- **Up**: `001_add_source_job_id_up.sql` - Adds `source_job_id` UUID column, foreign key constraint, and index
- **Down**: `001_add_source_job_id_down.sql` - Removes `source_job_id` column, foreign key constraint, and index

## How to Use Migrations

### Prerequisites
1. Connect to your `event_detector_observability` database
2. Ensure you have appropriate permissions to alter tables

### Running Migrations

#### Apply Migration (UP)
```bash
# Add the source_job_id field
psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 001_add_source_job_id_up.sql
```

#### Rollback Migration (DOWN)
```bash
# Remove the source_job_id field (WARNING: Data will be lost!)
psql -h your-rds-endpoint -U observability_admin -d event_detector_observability -f 001_add_source_job_id_down.sql
```

### Migration Safety

- **Always backup** your database before running migrations
- **Test migrations** on a staging database first
- **DOWN migrations** will permanently delete data for the affected columns
- Each migration script includes verification steps and clear success/failure messages

### What source_job_id Does

The `source_job_id` field enables tracking of **job-to-job execution chains**:

1. **Job A** completes and triggers a new event
2. **Job B** runs in response to that event
3. The invocation for Job B will have `source_job_id` pointing to Job A's execution ID

**Foreign Key Benefits**:
- **Referential Integrity**: Ensures `source_job_id` always points to a valid job execution
- **Cascade Behavior**: When a job execution is deleted, the reference is set to NULL (preserving the invocation)
- **Query Performance**: Database can optimize joins between invocations and job executions
- **Data Consistency**: Prevents orphaned references and maintains data quality

This enables powerful analytics like:
- Tracing complete workflow chains
- Understanding job dependencies
- Debugging cascading failures
- Performance analysis of multi-step processes

### Example Queries

```sql
-- Find all invocations that were triggered by a specific job
SELECT * FROM invocations
WHERE source_job_id = 'job-execution-uuid-here';

-- Find job execution chains (jobs that triggered other jobs) with FK JOIN
SELECT
    i1.source_function as triggering_function,
    source_job.job_name as triggering_job,
    source_job.status as triggering_job_status,
    source_job.duration_ms as triggering_job_duration,
    i2.source_function as triggered_function,
    i2.created_at as triggered_at,
    i2.status as triggered_status
FROM invocations i2
INNER JOIN job_executions source_job ON i2.source_job_id = source_job.id
INNER JOIN invocations i1 ON source_job.invocation_id = i1.id
WHERE i2.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY i2.created_at DESC;

-- Find the complete execution tree for a job chain
WITH RECURSIVE job_chain AS (
    -- Base case: Find root invocations (not triggered by other jobs)
    SELECT id, source_function, source_job_id, created_at, 0 as depth
    FROM invocations
    WHERE source_job_id IS NULL
    AND created_at >= NOW() - INTERVAL '24 hours'

    UNION ALL

    -- Recursive case: Find invocations triggered by jobs in the chain
    SELECT i.id, i.source_function, i.source_job_id, i.created_at, jc.depth + 1
    FROM invocations i
    INNER JOIN job_executions je ON i.source_job_id = je.id
    INNER JOIN job_chain jc ON je.invocation_id = jc.id
    WHERE jc.depth < 10  -- Prevent infinite recursion
)
SELECT
    REPEAT('  ', depth) || source_function as execution_tree,
    created_at,
    depth
FROM job_chain
ORDER BY created_at, depth;
```

### Creating New Migrations

When creating new migration files:

1. **Use sequential numbering**: `002_description_up.sql`, `002_description_down.sql`
2. **Include verification**: Check that changes were applied successfully
3. **Add comments**: Document what the migration does and why
4. **Test both directions**: Ensure both UP and DOWN migrations work
5. **Update this README**: Document the new migration