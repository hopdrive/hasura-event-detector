# RDS-Specific Setup Notes for Event Detector Observability

This document addresses common RDS-specific issues and solutions when setting up the observability database.

## Common RDS Issues and Solutions

### 1. UUID Extension Creation Permission Error

**Error:** `ERROR: permission denied to create extension "uuid-ossp"`

**Solution:** The schema.sql now handles this gracefully by:
- Attempting to create the uuid-ossp extension
- Falling back to PostgreSQL's built-in `gen_random_uuid()` function (available in PostgreSQL 13+)
- Using a wrapper function `generate_uuid()` that works with either method

**Manual Fix (if needed):**
```sql
-- Option 1: Have your RDS master user create the extension
-- Connect as master user to event_detector_observability database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Option 2: Use RDS Parameter Groups
-- Add uuid-ossp to shared_preload_libraries in your RDS parameter group
```

### 2. Tablespace Permission Error

**Error:** `ERROR: permission denied for tablespace pg_default`

**Solution:** Already fixed in create-database.sql - the TABLESPACE parameter is omitted for RDS compatibility.

### 3. Role "postgres" Does Not Exist

**Error:** `ERROR: role "postgres" does not exist`

**Solution:** Use your RDS master username (the one you specified when creating the RDS instance) instead of 'postgres'.

## Complete Setup Process for RDS

### Prerequisites
- PostgreSQL version 13 or higher (for gen_random_uuid() support)
- RDS master user credentials
- Database client (psql, pgAdmin, DBeaver, etc.)

### Step-by-Step Setup

#### 1. Create Database and Users
```bash
# Connect as your RDS master user
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U your_master_user \
     -d postgres \
     -f create-database.sql
```

#### 2. (Optional) Enable UUID Extension as Master User
```bash
# Connect to the new database as master user
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U your_master_user \
     -d event_detector_observability \
     -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"
```

#### 3. Set Up Permissions
```bash
# Connect as observability_admin
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U observability_admin \
     -d event_detector_observability \
     -f setup-permissions.sql
```

#### 4. Create Schema
```bash
# Still as observability_admin
psql -h your-rds-endpoint.region.rds.amazonaws.com \
     -U observability_admin \
     -d event_detector_observability \
     -f schema.sql
```

## Verification Queries

After setup, verify everything is working:

```sql
-- Check UUID generation is working
SELECT generate_uuid();

-- Check which UUID method is being used
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp')
        THEN 'Using uuid-ossp extension'
        ELSE 'Using built-in gen_random_uuid()'
    END as uuid_method;

-- Verify tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Test inserting a record
INSERT INTO invocations (source_function, source_system, source_event_payload)
VALUES ('test-function', 'test', '{"test": true}'::jsonb)
RETURNING id;
```

## RDS Parameter Group Settings (Optional)

If you want to enable extensions via RDS parameter groups:

1. Go to RDS Console → Parameter Groups
2. Create or modify a parameter group
3. Add to `shared_preload_libraries`: `uuid-ossp`
4. Apply the parameter group to your RDS instance
5. Reboot the instance for changes to take effect

## Troubleshooting

### Check PostgreSQL Version
```sql
SELECT version();
-- Should be 13.0 or higher for gen_random_uuid() support
```

### Check Available Extensions
```sql
SELECT * FROM pg_available_extensions WHERE name LIKE '%uuid%';
```

### Check Current User Privileges
```sql
SELECT current_user, current_database();
SELECT has_database_privilege(current_user, current_database(), 'CREATE');
```

### View Function Source
```sql
-- See how generate_uuid() is implemented
SELECT prosrc FROM pg_proc WHERE proname = 'generate_uuid';
```

## Security Considerations

1. **Change Default Passwords**: Always change the default passwords in production
2. **Network Security**: Ensure RDS security groups only allow connections from authorized sources
3. **SSL Connections**: Enable SSL for production connections
4. **Least Privilege**: Use observability_app for the plugin, not observability_admin

## Performance Tips

1. **Connection Pooling**: Use appropriate pool sizes based on workload
2. **Monitoring**: Set up CloudWatch alarms for connection count and storage
3. **Maintenance Windows**: Schedule vacuum and analyze during low-traffic periods
4. **Read Replicas**: Consider read replicas for dashboard queries if needed

## Support

If you encounter issues not covered here:
1. Check RDS logs in CloudWatch
2. Verify RDS instance class supports your workload
3. Ensure sufficient storage space
4. Check RDS maintenance events

The setup is designed to be resilient and work with standard RDS configurations without requiring special privileges or modifications.