# Migration Plan: Generalize Event Handler System

## Overview
Convert `@hopdrive/hasura-event-detector` from Hasura-specific to a general-purpose event handler system that works with any event payload (webhooks, custom events, etc.) while maintaining backward compatibility with existing Hasura implementations.

## Key Design Decisions (From User Input)
1. **Payload Type**: `EventPayload` (generic name)
2. **Hasura Helpers**: Keep as exported utilities (parseHasuraEvent, columnHasChanged)
3. **Event Pattern**: Support both file-based auto-discovery AND programmatic registration
4. **Options Flow**: Pass options as explicit parameters through the stack
5. **Extension Fields**: Move `__*` fields from payload to options object

---

## Phase 1: Core Type System Refactoring

### 1.1 Create New Generic Event Types (`src/types.ts`)
**Changes:**
- Create new `EventPayload<T>` interface as the base generic type
- Create `EventMetadata` interface for common metadata (id, created_at, source, etc.)
- Create `EventOptions` interface to hold execution context (replaces `__*` fields in payload)
- Keep `HasuraEventPayload` as a type alias that extends `EventPayload` for backward compatibility
- Update all branded types to remain source-agnostic

**New Types to Add:**
```typescript
// Generic base payload
interface EventPayload<T = any> {
  data: T;
  metadata?: EventMetadata;
}

// Execution context (replaces __* fields)
interface EventOptions {
  context?: Record<string, any>;
  correlationId?: CorrelationId;
  abortSignal?: AbortSignal;
  maxJobExecutionTime?: number;
  invocationId?: string;
  logger?: ScopedLogger;
  source?: string; // 'hasura', 'webhook', 'custom', etc.
  [key: string]: any; // Allow custom fields
}

// Hasura backward compatibility
type HasuraEventPayload<T> = EventPayload<HasuraEvent<T>> & {
  // Hasura-specific top-level fields
  event: HasuraEvent<T>;
  created_at: string;
  id: string;
  delivery_info: HasuraDeliveryInfo;
  trigger: HasuraTrigger;
  table: HasuraTable;
}
```

### 1.2 Update Function Signatures
**Changes to:**
- `DetectorFunction`: Add `options` parameter
- `HandlerFunction`: Add `options` parameter
- `JobFunction`: Replace `hasuraEvent` with generic `eventPayload`, add explicit `options` parameter
- `PluginLifecycleHooks`: Update all hook signatures to accept `eventPayload` and `options` separately

**Migration Example:**
```typescript
// BEFORE
interface JobFunction<T = any> {
  (event: EventName, hasuraEvent: HasuraEventPayload, options?: JobOptions): Promise<T>;
}

// AFTER
interface JobFunction<T = any, P = any> {
  (event: EventName, eventPayload: EventPayload<P>, options: EventOptions & JobOptions): Promise<T>;
}
```

---

## Phase 2: Refactor Core Detection System

### 2.1 Rename and Generalize `listenTo()` (`src/detector.ts`)
**Changes:**
- Keep `listenTo()` name but make it generic
- Remove `validateHasuraEventPayload()` - replace with generic `validateEventPayload()`
- Extract Hasura-specific validation to `validateHasuraEvent()` helper in utils
- Update to accept `EventPayload` instead of `HasuraEventPayload`
- Move `__*` field injection logic into `EventOptions` building
- Add payload source detection/configuration

**Function Signature Change:**
```typescript
// BEFORE
export const listenTo = async (
  hasuraEvent: HasuraEventPayload,
  options: Partial<ListenToOptions> = {}
): Promise<ListenToResponse>

// AFTER
export const listenTo = async <P = any>(
  eventPayload: EventPayload<P>,
  options: Partial<ListenToOptions> = {}
): Promise<ListenToResponse>
```

**Key Implementation Changes:**
- Replace `hasuraEvent.__context = options.context` with building `eventOptions` object
- Pass both `eventPayload` and `eventOptions` separately throughout the stack
- Add optional payload adapter/transformer configuration

### 2.2 Update Event Module Loading (`src/detector.ts`)
**Changes:**
- Keep existing file-based auto-discovery (no changes needed - it's already generic)
- Update detector/handler signatures to accept new parameters
- Ensure loaded modules work with generic payload types

---

## Phase 3: Job Execution System Updates

### 3.1 Update Job Handler (`src/handler.ts`)
**Changes:**
- Update `run()` to accept `eventPayload` and `options` separately
- Update `safeJobWrapper()` to:
  - Build `enhancedOptions` from `EventOptions` + `JobOptions` (no more extracting from payload)
  - Pass both `eventPayload` and `enhancedOptions` to job functions
  - Remove extraction of `__correlationId`, `__abortSignal` from payload
- Update all plugin hook calls with new signatures

**Before/After:**
```typescript
// BEFORE
const correlationId = hasuraEvent?.__correlationId;
const abortSignal = hasuraEvent?.__abortSignal;

// AFTER
const correlationId = options.correlationId;
const abortSignal = options.abortSignal;
```

### 3.2 Update Job Examples (`src/jobs/*.ts`)
**Changes:**
- Update all example job signatures to new format
- Show examples of accessing both generic payloads and Hasura-specific payloads
- Add examples of using Hasura helper functions when needed

---

## Phase 4: Plugin System Generalization

### 4.1 Update Plugin Base Types (`src/plugin.ts`, `src/types.ts`)
**Changes:**
- Update all `PluginLifecycleHooks` methods to accept:
  - `eventPayload: EventPayload<any>` instead of `hasuraEvent`
  - `options: EventOptions` as separate parameter
- Update `PluginManager.callHook()` signatures
- Keep plugin implementations backward compatible during transition

### 4.2 Update Existing Plugins
**Changes for each plugin:**

**TrackingTokenExtractionPlugin** (`src/plugins/tracking-token-extraction/plugin.ts`):
- Update to read from generic `eventPayload` structure
- Add configuration for extraction strategies per payload source
- Make Hasura extraction one strategy among many
- Store extracted values in `options` instead of patching payload

**ObservabilityPlugin** (`src/plugins/observability/plugin.ts`):
- Update to work with generic payloads
- Read `__invocationId` from options instead of payload
- Make Hasura-specific columns optional in database schema
- Add `payload_source` column to track event origin

**Other Plugins**:
- Update signatures to match new format
- Test with generic payloads

### 4.3 Payload Adapter Plugin System
**New Feature:**
Create optional adapter plugins that transform specific payload formats to generic format:
- `HasuraPayloadAdapterPlugin` - transforms Hasura events
- `WebhookPayloadAdapterPlugin` - transforms standard webhook payloads
- Custom adapters for other sources

---

## Phase 5: Helper Functions & Utilities

### 5.1 Keep Hasura Helpers (`src/helpers/hasura.ts`)
**No breaking changes:**
- Keep `parseHasuraEvent()` as-is
- Keep `columnHasChanged()` as-is
- Export from main package for use in user code
- Mark as Hasura-specific in documentation

### 5.2 Create Generic Helpers (`src/helpers/event.ts` - NEW FILE)
**Add new generic utilities:**
- `parseEventPayload()` - generic payload parser
- `getEventMetadata()` - extract common metadata
- `transformPayload()` - payload transformation utilities
- `dataHasChanged()` - generic change detection (not specific to DB columns)

### 5.3 Update Other Helpers
**Files to update:**
- `src/helpers/log.ts`: Accept `EventOptions` instead of extracting from payload
- `src/helpers/timeout-wrapper.ts`: Work with `EventOptions`
- `src/helpers/tracking-token.ts`: Update to work with generic options

---

## Phase 6: Configuration & Options

### 6.1 Update `ListenToOptions` (`src/types.ts`)
**Changes:**
- Rename to `ListenToOptions` (keep name)
- Add `payloadSource?: string` to identify event source
- Add `payloadAdapter?: PayloadAdapterFunction` for custom transformations
- Add `eventRegistrationMode?: 'file-based' | 'programmatic' | 'both'`
- Keep all existing options for backward compatibility

### 6.2 Add Programmatic Event Registration (NEW FEATURE)
**New API in `src/detector.ts`:**
```typescript
// Event registry for programmatic registration
export const eventRegistry = {
  on(eventName: EventName, detector: DetectorFunction, handler: HandlerFunction): void,
  off(eventName: EventName): void,
  clear(): void,
  getAll(): NamedEventModule[]
};
```

**Update `listenTo()` to:**
- Check `options.eventRegistrationMode`
- Merge file-based + programmatic events
- Default to file-based for backward compatibility

---

## Phase 7: TypeScript & Type Safety

### 7.1 Generic Type Parameters
**Add throughout:**
- `EventPayload<P>` - P is the data type
- `JobFunction<T, P>` - T is return type, P is payload data type
- `DetectorFunction<P>` - P is payload data type
- Maintain strong typing for Hasura types when used

### 7.2 Type Guards & Validators
**Create new utilities:**
- `isHasuraPayload(payload): payload is HasuraEventPayload`
- `isEventPayload(payload): payload is EventPayload`
- `createPayloadValidator(schema)` - custom validation

---

## Phase 8: Documentation & Examples

### 8.1 Update Main Documentation
**Files to update:**
- `README.md` - Update to show generic usage + Hasura as special case
- Add migration guide for existing users
- Show examples of webhook, custom event, and Hasura usage

### 8.2 Create Migration Examples
**New example files:**
- `/examples/generic-webhook/` - Webhook event handler
- `/examples/custom-events/` - Custom event sources
- `/examples/hasura-migration/` - Migrating from old API
- `/examples/mixed-sources/` - Multiple event sources

### 8.3 Update CLI Templates
**Update templates:**
- Create generic event template (default)
- Keep Hasura template as option
- Update `create` command to ask for event source type

---

## Phase 9: Package & Naming Updates

### 9.1 Package Rename Strategy
**Options:**
1. **Keep name** - `@hopdrive/hasura-event-detector` (maintain branding, update description)
2. **Dual publish** - Both old name (deprecated) and new generic name
3. **Major version bump** - v3.0.0 with breaking changes and migration guide

**Recommendation**: Keep name but update description to "Event Detection and Handling Framework (with first-class Hasura support)"

### 9.2 Export Structure Updates
**Update `src/index.ts`:**
- Export Hasura-specific utilities under `/hasura` path
- Export generic utilities as main exports
- Maintain backward compatibility with default exports

```typescript
// Main exports (generic)
export { listenTo, eventRegistry } from './detector';

// Hasura-specific exports
export * as hasura from './helpers/hasura';
export { HasuraPayloadAdapterPlugin } from './plugins/hasura-adapter';
```

### 9.3 Version and Changelog
- Bump to v3.0.0 (major breaking changes)
- Comprehensive CHANGELOG.md with migration guide
- Deprecation notices for old API patterns

---

## Phase 10: Testing Strategy

### 10.1 Unit Tests
**Update existing tests:**
- `src/__tests__/detector.test.ts` - Test generic payloads
- `src/__tests__/handler.test.ts` - Test with new signatures
- `src/__tests__/plugin.test.ts` - Test plugin updates

**Add new tests:**
- Generic payload validation
- Multiple payload sources
- Options flow through stack
- Backward compatibility with Hasura

### 10.2 Integration Tests
**New test suites:**
- Webhook payload end-to-end
- Custom event payload end-to-end
- Mixed payload sources
- Migration from old API

### 10.3 Backward Compatibility Tests
**Critical tests:**
- Existing Hasura code works with adapters
- Deprecated APIs still function with warnings
- Type compatibility for existing TypeScript code

---

## Implementation Order (For Junior Developer)

### Step 1: Types Foundation (1-2 days)
1. Create new `EventPayload` and `EventOptions` interfaces in `src/types.ts`
2. Create `HasuraEventPayload` type alias for backward compatibility
3. Update all function signature types (don't implement yet, just types)
4. Run `npm run test:types` to find all compilation errors
5. Create TODO list of every file that needs updates

### Step 2: Core System Updates (2-3 days)
6. Update `src/detector.ts`:
   - Create generic `validateEventPayload()`
   - Update `listenTo()` to work with `EventPayload`
   - Build `EventOptions` object instead of patching payload
   - Update all internal calls
7. Update `src/handler.ts`:
   - Update `run()` and `safeJobWrapper()` signatures
   - Pass options explicitly instead of extracting from payload
   - Update all job execution logic
8. Update `src/plugin.ts`:
   - Update hook signatures
   - Update `PluginManager` call methods

### Step 3: Plugin Updates (2-3 days)
9. Update `TrackingTokenExtractionPlugin` to use options
10. Update `ObservabilityPlugin` to use options and generic payloads
11. Update remaining plugins
12. Test each plugin individually

### Step 4: Helpers & Utilities (1-2 days)
13. Create `src/helpers/event.ts` with generic utilities
14. Update `src/helpers/log.ts` to use options
15. Update `src/helpers/timeout-wrapper.ts`
16. Keep `src/helpers/hasura.ts` as-is (export only)

### Step 5: Registration API (1-2 days)
17. Implement `eventRegistry` for programmatic registration
18. Update `listenTo()` to support both modes
19. Add tests for programmatic registration

### Step 6: Testing (2-3 days)
20. Update all existing tests
21. Add generic payload tests
22. Add backward compatibility tests
23. Add integration tests for webhooks and custom events

### Step 7: Documentation (1-2 days)
24. Update README.md
25. Create migration guide
26. Create new examples
27. Update CLI templates

### Step 8: Final Polish (1 day)
28. Update package.json description
29. Update CHANGELOG.md
30. Version bump to 3.0.0
31. Final review and testing

**Total Estimated Time: 11-17 days**

---

## Backward Compatibility Strategy

### Must Support (No Breaking Changes)
- Existing event module format (detector/handler functions)
- Existing job function signatures (with deprecation path)
- Hasura helper functions (parseHasuraEvent, columnHasChanged)
- Plugin system (with signature updates that are backward compatible via overloads)

### Soft Deprecations (Warnings)
- Accessing `__*` fields directly from payload (suggest using options)
- Old type names (provide aliases)

### Hard Breaks (Requires Migration)
- Plugin hook signatures (but provide adapter/migration helper)
- Direct payload manipulation
- Internal APIs not exposed in public exports

---

## Success Criteria

✅ **System works with any JSON payload** (not just Hasura)
✅ **All existing Hasura code continues to work** with minimal/no changes
✅ **`__*` extension fields moved to options object** throughout stack
✅ **File-based and programmatic event registration both work**
✅ **Hasura helpers remain available as exports**
✅ **All tests pass** with new architecture
✅ **Documentation updated** with examples for multiple payload types
✅ **Type safety maintained** for both generic and Hasura-specific usage
