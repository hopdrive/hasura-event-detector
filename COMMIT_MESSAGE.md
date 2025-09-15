Refactor: Implement TrackingToken system and enhance plugin architecture for complete job lineage tracking

## Major Changes

### 1. Introduce TrackingToken as First-Class Library Concept

- **NEW**: `src/helpers/tracking-token.ts` - Core TrackingToken utility class
- **NEW**: Branded `TrackingToken` type for type safety
- **NEW**: Comprehensive API for creating, parsing, and validating tracking tokens
- **Format**: `source.correlationId.jobId` (e.g., "api-handler.uuid.job-123")
- **Export**: Available as `import { TrackingToken } from '@hopdrive/hasura-event-detector'`

TrackingToken replaces the previous database-specific "updated_by utils" with a
transport-agnostic solution that can be used in database columns, HTTP headers,
logs, and other contexts.

### 2. Add Type-Safe Plugin Hook Wrappers

- **NEW**: Strongly-typed wrapper methods for all plugin hooks in PluginManager
- **REPLACE**: Generic `callHook(hookName, ...args: any[])` with typed methods
- **ADD**: `callOnInvocationStart()`, `callOnJobStart()`, etc. with exact signatures
- **BENEFIT**: Compile-time validation of plugin hook parameters
- **IMPACT**: Eliminates type safety gaps that allowed incorrect parameter counts

### 3. Rename and Enhance Tracking Plugin

- **RENAME**: `correlation-id-extraction` → `tracking-token-extraction`
- **RENAME**: `CorrelationIdExtractionPlugin` → `TrackingTokenExtractionPlugin`
- **ENHANCE**: Now extracts both `correlationId` AND `sourceJobId` from tracking tokens
- **NEW**: Stores `sourceJobId` in `hasuraEvent.__sourceJobId` for plugin consumption
- **MAINTAIN**: Backward compatibility export for existing code

### 4. Enhance Observability Plugin for Job Lineage

- **ADD**: `source_job_id` field population in invocations table
- **SOURCE**: Reads from `hasuraEvent.__sourceJobId` set by tracking token plugin
- **ENABLE**: Complete job execution lineage tracking through database relationships
- **LINK**: Invocations can now reference their triggering jobs via foreign key

### 5. Remove Duplicate and Legacy Code

- **DELETE**: `example-plugins/updated-by-correlation/` (duplicate functionality)
- **REMOVE**: `UpdatedByUtils` class from correlation plugin (replaced by TrackingToken)
- **CLEAN**: All migration guides and deprecation comments (active development code)
- **CONSOLIDATE**: Single source of truth for tracking token operations

## Technical Details

### Plugin Parameter Refactoring
Following user's architectural changes to eliminate duplicate correlationId/context
parameters by using `hasuraEvent.__correlationId` and `hasuraEvent.__context`:

- **FIXED**: Plugin interface signatures to match refactored parameter approach
- **UPDATED**: All `callHook()` calls to use typed wrapper methods
- **ENSURE**: Type safety across 15+ plugin hook call sites

### Data Flow Enhancement
```
Tracking Token → Plugin Extraction → {
  correlationId → options.correlationId (existing)
  sourceJobId → hasuraEvent.__sourceJobId (NEW)
} → Observability Plugin → Database
```

### Job Author Benefits
```typescript
// Create tracking tokens for database mutations
const token = TrackingToken.create('job-system', correlationId, jobId);
await updateRecord({ updated_by: token });

// Access extracted components in jobs
const sourceJobId = hasuraEvent.__sourceJobId; // NEW capability
```

## Files Modified

### Core Library
- `src/helpers/tracking-token.ts` - NEW: Core TrackingToken utility
- `src/types.ts` - Add TrackingToken type, update plugin interfaces
- `src/index.ts` - Export TrackingToken utilities
- `src/plugin.ts` - Add typed plugin hook wrapper methods

### Plugin System
- `example-plugins/tracking-token-extraction/` - Renamed and enhanced plugin
- `example-plugins/observability/plugin.ts` - Add source_job_id support
- `src/detector.ts` - Use typed plugin wrapper methods (8 calls)
- `src/handler.ts` - Use typed plugin wrapper methods (3 calls)
- `src/helpers/log.ts` - Use typed plugin wrapper methods (3 calls)

### Documentation and Examples
- `README.md` - Update plugin examples and usage
- `example-plugins/README.md` - Update plugin documentation
- `templates/event-module.template.ts` - Update plugin references
- `src/__tests__/debug-moves-event.test.ts` - Update test imports
- `docs/tracking-token.md` - NEW: Comprehensive documentation
- `docs/tracking-token-plugin-migration.md` - NEW: Migration guide

## Backward Compatibility

- **MAINTAINED**: Existing `correlationId` extraction continues to work
- **EXPORT**: `CorrelationIdExtractionPlugin` alias for renamed plugin
- **PRESERVED**: All existing plugin hook signatures for core functionality
- **EXTENDED**: New capabilities without breaking changes

## Benefits

1. **Type Safety**: Compile-time validation of all plugin hook calls
2. **Job Lineage**: Complete tracking of job execution chains through database
3. **First-Class Concept**: TrackingToken as core library feature, not plugin utility
4. **Developer Experience**: Clean APIs, comprehensive documentation
5. **Observability**: Enhanced tracking capabilities for debugging and monitoring
6. **Architecture**: Cleaner separation between core concepts and transport mechanisms

This refactor transforms tracking tokens from database-specific utilities into a
core library concept while adding complete type safety to the plugin system and
enabling full job lineage tracking through the observability system.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>