# Plugin System Sequence Diagram

This diagram shows the complete lifecycle of plugin hook execution during event processing.

```mermaid
sequenceDiagram
    participant Client as Client/Hasura
    participant Detector as Event Detector
    participant PluginMgr as Plugin Manager
    participant EnrichPlugin as Enrichment Plugin
    participant CorrPlugin as Correlation Plugin
    participant ObsPlugin as Observability Plugin
    participant EventModule as Event Module
    participant Job as Job Execution

    Note over Client, Job: System Initialization (One Time)
    Client->>Detector: Initialize System
    Detector->>PluginMgr: pluginManager.initialize()
    PluginMgr->>EnrichPlugin: initialize()
    PluginMgr->>CorrPlugin: initialize()
    PluginMgr->>ObsPlugin: initialize()

    Note over Client, Job: Event Processing (Per Request)
    Client->>Detector: listenTo(hasuraEvent, options)
    
    Note over Detector, ObsPlugin: Phase 1: Pre-Configure
    Detector->>PluginMgr: callHook('onPreConfigure', hasuraEvent, options)
    PluginMgr->>EnrichPlugin: onPreConfigure(hasuraEvent, options)
    EnrichPlugin->>EnrichPlugin: fetchRelatedData(recordId)
    Note right of EnrichPlugin: Modify hasuraEvent by reference<br/>Add lanes, driver, vehicle, customer
    EnrichPlugin->>EnrichPlugin: extractCorrelationId(hasuraEvent)
    EnrichPlugin-->>PluginMgr: { ...options, correlationId }
    PluginMgr->>CorrPlugin: onPreConfigure(hasuraEvent, options)
    CorrPlugin-->>PluginMgr: options (unchanged)
    PluginMgr-->>Detector: mergedOptions

    Detector->>Detector: resolveCorrelationId(options)
    Detector->>Detector: hasuraEvent.__correlationId = correlationId

    Note over Detector, ObsPlugin: Phase 2: Invocation Start
    Detector->>PluginMgr: callHook('onInvocationStart', hasuraEvent, options, context, correlationId)
    PluginMgr->>ObsPlugin: onInvocationStart(...)
    ObsPlugin->>ObsPlugin: metrics.invocations++
    ObsPlugin-->>PluginMgr: void
    PluginMgr-->>Detector: void

    Note over Detector, Job: Phase 3: Event Detection Loop
    loop for each event in listenedEvents
        Note over Detector, ObsPlugin: Event Detection Start
        Detector->>PluginMgr: callHook('onEventDetectionStart', eventName, hasuraEvent, correlationId)
        PluginMgr->>ObsPlugin: onEventDetectionStart(...)
        ObsPlugin-->>PluginMgr: void
        
        Detector->>EventModule: detector(eventName, hasuraEvent)
        EventModule-->>Detector: boolean (detected)
        
        Note over Detector, ObsPlugin: Event Detection End
        Detector->>PluginMgr: callHook('onEventDetectionEnd', eventName, detected, hasuraEvent, correlationId)
        PluginMgr->>ObsPlugin: onEventDetectionEnd(...)
        alt if detected
            ObsPlugin->>ObsPlugin: metrics.eventsDetected++
        end
        ObsPlugin-->>PluginMgr: void

        alt if event detected
            Note over Detector, Job: Event Handler Execution
            Detector->>PluginMgr: callHook('onEventHandlerStart', eventName, hasuraEvent, correlationId)
            PluginMgr->>ObsPlugin: onEventHandlerStart(...)
            ObsPlugin-->>PluginMgr: void
            
            Detector->>EventModule: handler(eventName, hasuraEvent)
            
            Note over EventModule, Job: Job Execution Loop
            loop for each job in jobs
                EventModule->>PluginMgr: callHook('onJobStart', jobName, jobOptions, eventName, hasuraEvent, correlationId)
                PluginMgr->>ObsPlugin: onJobStart(...)
                ObsPlugin-->>PluginMgr: void
                
                EventModule->>Job: executeJob(jobFunction, enrichedHasuraEvent)
                Note right of Job: Job has access to:<br/>- Enriched payload data<br/>- Correlation ID<br/>- Job name via options
                Job-->>EventModule: JobResult
                
                EventModule->>PluginMgr: callHook('onJobEnd', jobName, result, eventName, hasuraEvent, correlationId)
                PluginMgr->>ObsPlugin: onJobEnd(...)
                ObsPlugin->>ObsPlugin: metrics.jobsExecuted++
                ObsPlugin->>ObsPlugin: sendMetrics(result, correlationId)
                ObsPlugin-->>PluginMgr: void
            end
            
            EventModule-->>Detector: JobResult[]
            
            Detector->>PluginMgr: callHook('onEventHandlerEnd', eventName, jobResults, hasuraEvent, correlationId)
            PluginMgr->>ObsPlugin: onEventHandlerEnd(...)
            ObsPlugin-->>PluginMgr: void
        end
    end

    Note over Detector, ObsPlugin: Phase 4: Invocation End
    Detector->>PluginMgr: callHook('onInvocationEnd', hasuraEvent, result, correlationId)
    PluginMgr->>ObsPlugin: onInvocationEnd(...)
    ObsPlugin->>ObsPlugin: sendFinalMetrics(result, correlationId)
    ObsPlugin-->>PluginMgr: void
    PluginMgr-->>Detector: void

    Detector-->>Client: ListenToResponse

    Note over Client, Job: Error Handling (Throughout)
    alt if any error occurs
        Detector->>PluginMgr: callHook('onError', error, context, correlationId)
        PluginMgr->>ObsPlugin: onError(...)
        ObsPlugin->>ObsPlugin: sendErrorTracking(error, correlationId)
        ObsPlugin-->>PluginMgr: void
    end

    Note over Client, Job: System Shutdown (One Time)
    Client->>Detector: Shutdown System
    Detector->>PluginMgr: shutdown()
    PluginMgr->>EnrichPlugin: shutdown()
    PluginMgr->>CorrPlugin: shutdown()
    PluginMgr->>ObsPlugin: shutdown()
```

## Key Sequence Points

### 1. **Initialization Phase** (One Time)
- Plugin manager initializes all registered plugins
- Each plugin sets up connections, loads configuration

### 2. **Pre-Configure Phase** (Critical for Data Flow)
- **Enrichment Plugin**: Modifies `hasuraEvent` by reference, adds related data
- **Correlation Plugin**: Extracts correlation ID from payload or enriched data
- **Result**: Enhanced payload + correlation ID available for all subsequent processing

### 3. **Event Detection Phase**
- System detects which business events occurred
- Plugins track detection metrics and performance

### 4. **Job Execution Phase**  
- Jobs execute with access to:
  - Enriched payload data (from enrichment plugin)
  - Correlation ID (from correlation plugin)
  - Job metadata (name, options)
- Plugins track job performance and results

### 5. **Error Handling** (Throughout)
- Any errors trigger `onError` hooks across all plugins
- Enables centralized error tracking and reporting

## Data Flow Highlights

1. **Payload Enrichment**: Raw Hasura payload → Enriched with related records → Available to all jobs
2. **Correlation ID**: Extracted from payload → Set in options → Available throughout pipeline  
3. **Observability**: Metrics collected at each phase → Sent to external systems
4. **Error Propagation**: Errors caught at any level → Sent to tracking systems with correlation ID