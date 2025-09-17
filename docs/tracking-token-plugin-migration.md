# Tracking Token Plugin Migration Summary

## What Changed

### Plugin Rename
- **From**: `correlation-id-extraction` → **To**: `tracking-token-extraction`
- **From**: `CorrelationIdExtractionPlugin` → **To**: `TrackingTokenExtractionPlugin`

### Enhanced Functionality

#### 1. Full Tracking Token Support
- **Before**: Only extracted `correlationId` from tracking tokens
- **After**: Extracts both `correlationId` AND `sourceJobId` from tracking tokens

#### 2. Enhanced Data Flow
- **correlationId**: Still passed in `options.correlationId` (backward compatible)
- **sourceJobId**: NEW - stored in `hasuraEvent.__sourceJobId` for plugin use

#### 3. Observability Integration
- Observability plugin now reads `hasuraEvent.__sourceJobId`
- Populates `source_job_id` field in invocations table
- Enables full job lineage tracking in database

## Migration Guide

### For Plugin Users
```typescript
// Old
import { CorrelationIdExtractionPlugin } from 'hasura-event-detector/example-plugins';
const plugin = new CorrelationIdExtractionPlugin({...});

// New
import { TrackingTokenExtractionPlugin } from 'hasura-event-detector/example-plugins';
const plugin = new TrackingTokenExtractionPlugin({...});

// Or use backward compatibility export
import { CorrelationIdExtractionPlugin } from 'hasura-event-detector/example-plugins';
const plugin = new CorrelationIdExtractionPlugin({...}); // Still works!
```

### For Job Authors
```typescript
// In jobs, you can now access:
export const myJob: JobFunction = async (event, hasuraEvent, options) => {
  const correlationId = options.correlationId; // Still available
  const sourceJobId = (hasuraEvent as any).__sourceJobId; // NEW: source job tracking

  // Create tracking token for database mutations
  const trackingToken = TrackingToken.create('my-job', correlationId, 'current-job-id');

  await updateRecord({
    // ... data
    updated_by: trackingToken // Continues the tracking chain
  });
};
```

## Technical Details

### Extraction Strategy
1. **TrackingToken parsing**: Uses `TrackingToken.parse()` for full token parsing
2. **Fallback patterns**: Still supports regex fallback for edge cases
3. **Component extraction**: Extracts both correlation and job IDs when available

### Database Schema
- `invocations.source_job_id` field is now populated from tracking tokens
- Enables foreign key relationships to `job_executions` table
- Supports complete job lineage tracking

### Files Modified
- `src/example-plugins/tracking-token-extraction/` (renamed directory)
- `src/example-plugins/observability/plugin.ts` (added source_job_id support)
- All documentation and reference files updated
- Backward compatibility exports maintained

## Benefits

1. **Complete Lineage Tracking**: Track the full execution chain from source job → correlation → current job
2. **Database Relationships**: Observability plugin can now link invocations to their triggering jobs
3. **Backward Compatibility**: Existing code continues to work with compatibility exports
4. **Enhanced Observability**: Full job execution tracing through the database
5. **First-Class TrackingToken Support**: Uses the core library's TrackingToken utility

This migration maintains all existing functionality while adding powerful new job lineage tracking capabilities.