# Observability System Project Plan

## Executive Summary

This project implements a comprehensive observability system for tracking database events through their entire lifecycle, from initial triggers to downstream job execution. The system provides end-to-end traceability using correlation IDs and visualizes event flows through a custom React Flow interface.

## System Architecture Overview

The observability system consists of four main components:
1. **Correlation ID Tracking System** - Traces events from database triggers through job execution
2. **Database Architecture** - Separate observability database for isolation
3. **Cloudflare Proxy with Routing Algorithms** - Intelligent event distribution
4. **React Flow UI with Grafana Integration** - Visual observability interface

---

## Component 1: Correlation ID Tracking System

### Objective
Implement correlation IDs to trace database events through their entire execution chain, from initial Hasura event detection through all downstream jobs and updates.

### Technical Design

**Correlation ID Format:**
- User actions: Email address format (existing behavior)
- System actions: `{system_name}.{uuid}` format
- Flexible naming convention decided at implementation time
- Likely pattern: `{event_detector}.{job}.{uuid}`

**Implementation Strategy:**
- Leverage existing `updated_by` audit column in all database tables
- Database triggers generate correlation IDs when events occur
- All subsequent job-driven updates write correlation ID to `updated_by` field
- Replace generic "system" value with traceable correlation ID

**Parsing Logic:**
- Split on dot (`.`) to extract components
- UI displays system name for readability
- Backend maintains full correlation ID for traceability

### Benefits
- Complete event chain visibility
- Reuses existing audit infrastructure
- Backward compatible with current user tracking
- Easy parsing and display logic

---

## Component 2: Database Architecture

### Objective
Provide isolated storage for observability data while maintaining cost efficiency and operational simplicity.

### Architecture Decision: Separate Database, Same RDS

**Selected Approach:**
- Create new database within existing RDS PostgreSQL instance
- Separate from main application database (public schema)
- Dedicated Hasura connection string and metadata configuration

**Rationale:**
- Complete logical isolation prevents accidental foreign keys
- Easy future migration if needed
- Avoids operational overhead of multiple RDS instances
- Cost-effective approach for observability workload

**Scaling Strategy:**
1. **Phase 1:** Monitor performance on shared RDS instance
2. **Phase 2:** Scale up RDS instance if resource contention occurs
3. **Phase 3:** Migrate to separate RDS instance as last resort

**Hasura Configuration:**
- New database connection in Hasura metadata
- Independent permissions and tracking rules
- Separate GraphQL schema for observability data
- Isolated from main application data access

### Performance Considerations
- Expected volume: 3-5x multiplier of current Hasura events
- Current RDS showing performance notifications but has scaling headroom
- T3 instances are deprecated - upgrade planned regardless
- Connection pool management for Lambda concurrency (Netlify functions)

---

## Component 3: Cloudflare Proxy with Routing Algorithms

### Objective
Implement intelligent event routing proxy using Cloudflare Edge Functions with multiple distribution algorithms.

### Technical Architecture

**Edge Function Implementation:**
- Cloudflare Workers with Durable Objects for state management
- JavaScript-based algorithm implementations
- Global distribution with low-latency execution

**URL Parameter Format:**
```
?algorithm={algorithm_type}&destinations={url1,url2,url3}
```

**Supported Algorithms:**

1. **Pass-through** (Default)
   - Simple proxy forwarding to single destination
   - No state management required

2. **Broadcast**
   - Send copy of message to all specified destinations
   - Parallel execution to multiple endpoints

3. **Round-robin**
   - Distribute events evenly across destinations
   - Durable Objects maintain rotation state
   - Configurable state persistence duration

**State Management:**
- Durable Objects store round-robin counters
- Configurable persistence duration (implementation decision)
- Admin UI controls for routing configuration
- Global state synchronization across edge locations

**Configuration Management:**
- Runtime algorithm selection via URL parameters
- Administrative interface for persistence settings
- Flexible destination management

### Implementation Phases
1. **Phase 1:** Implement pass-through algorithm (current primary use case)
2. **Phase 2:** Add broadcast and round-robin algorithms
3. **Phase 3:** Administrative configuration interface

---

## Component 4: React Flow UI with Grafana Integration

### Objective
Create visual observability interface showing event flows with integrated log access from Grafana.

### UI Design

**React Flow Visualization:**
- Node-based sequence diagrams showing event cascades
- Connected arrows indicating flow direction and relationships
- Each node represents a database event or downstream job
- Interactive nodes for drilling into details

**Node Interaction:**
- Click any node to fetch related logs from Grafana
- Correlation ID used as filter parameter
- Real-time log retrieval and display

**Flow Structure:**
- Root node: Original database event trigger
- Child nodes: Subsequent jobs and updates triggered by correlation ID
- Visual representation of complete event lifecycle

### Grafana Integration

**API Integration:**
- Grafana API calls filtered by correlation ID
- Authentication via API keys or service account (Grafana's requirement)
- On-demand log fetching when users interact with nodes

**Error Handling:**
- Graceful degradation if Grafana is unavailable
- "Grafana Offline" message displayed to users
- UI remains functional without log data

**Core Label Implementation:**
- New Grafana label for correlation IDs
- Standardized across all log sources
- Enables efficient filtering and retrieval

### Database Schema Changes
- **Remove logs table** from observability database DDL
- Grafana serves as single source of truth for log data
- Eliminates data duplication and storage overhead

---

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-3)
- Set up separate observability database
- Configure Hasura connection
- Implement basic correlation ID system
- Deploy pass-through Cloudflare proxy

### Phase 2: Core Functionality (Weeks 4-6)
- Complete correlation ID implementation across all event triggers
- Implement React Flow UI basic structure
- Set up Grafana API integration
- Add correlation ID labels to existing logs

### Phase 3: Advanced Features (Weeks 7-9)
- Implement broadcast and round-robin algorithms
- Complete React Flow node interactions
- Add administrative configuration interface
- Performance testing and optimization

### Phase 4: Production Deployment (Weeks 10-12)
- Production deployment and monitoring
- Performance validation
- Documentation and training
- Iterative improvements based on usage

---

## Risk Mitigation

**Database Performance:**
- Start with same RDS to validate performance impact
- Clear scaling path: instance upgrade → separate RDS
- Monitor metrics continuously

**Grafana Dependency:**
- Graceful degradation if API unavailable
- Consider caching strategy for frequently accessed logs
- Alternative log sources if needed

**Cloudflare Proxy:**
- Start with simple pass-through to minimize risk
- Gradual rollout of advanced algorithms
- Fallback mechanisms for proxy failures

**Lambda Concurrency:**
- Monitor Netlify function performance impact
- Adjust connection pool sizes as needed
- Consider batch processing for high-volume events

---

## Success Metrics

**Observability Coverage:**
- 100% of database events trackable via correlation IDs
- End-to-end visibility for all event chains
- Sub-second response times for UI queries

**System Performance:**
- No degradation in main application performance
- Observability system response times < 2 seconds
- 99.9% uptime for critical observability functions

**User Adoption:**
- Development team actively using observability UI
- Reduced time to debug event-related issues
- Improved incident response times

---

## Technical Dependencies

**Infrastructure:**
- Existing RDS PostgreSQL instance
- Hasura GraphQL engine
- Cloudflare Workers/Edge Functions
- Grafana logging infrastructure

**Development:**
- React Flow library
- Grafana API access and authentication
- Durable Objects for state management
- Existing event detection system (Hasura)

**Operational:**
- Database backup and recovery procedures
- Monitoring and alerting for new components
- Access control for observability data

---

## Conclusion

This observability system provides comprehensive event tracking and visualization while maintaining operational simplicity and cost efficiency. The phased approach allows for validation at each step, with clear escalation paths for scaling challenges. The combination of correlation IDs, visual flow representation, and integrated logging creates a powerful debugging and monitoring tool for the development team.
