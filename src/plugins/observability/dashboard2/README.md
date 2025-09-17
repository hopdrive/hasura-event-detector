# Event Detector Observability Dashboard

A modern, interactive dashboard for monitoring and debugging the Hasura Event Detector system at HopDrive.

## Features

- **Overview Dashboard**: Real-time KPIs, performance metrics, and system health monitoring
- **Invocations Table**: Browse and filter all event detector invocations with detailed metadata
- **Flow Diagram Visualization**: Interactive React Flow diagrams showing:
  - Complete event chains from invocations → events → jobs
  - Recursive correlation chains when jobs trigger new invocations
  - Color-coded status indicators and performance metrics
- **Detailed Inspection**: Click any node or table row to view:
  - JSON payloads (before/after states)
  - Visual diffs of database changes
  - Event detection results
  - Job execution details
  - Correlation ID tracking

## Tech Stack

- **React 18** with TypeScript
- **React Flow** for interactive flow diagrams
- **Tailwind CSS** for styling
- **Apollo Client** for GraphQL integration
- **Framer Motion** for animations
- **Recharts** for data visualization
- **Vite** for fast development and building

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
# Create .env file
touch .env

# Add your Hasura endpoint and secret
VITE_GRAPHQL_ENDPOINT=http://localhost:8080/v1/graphql
VITE_HASURA_ADMIN_SECRET=your-admin-secret
```

3. Start the development server:
```bash
npm run dev
```

The dashboard will open at http://localhost:3000

## Project Structure

```
src/
├── components/
│   ├── OverviewDashboard.tsx    # Main dashboard with KPIs
│   ├── InvocationsTable.tsx     # Data table with filtering
│   ├── FlowDiagram.tsx          # React Flow visualization
│   ├── InvocationDetailDrawer.tsx # Slide-over detail panel
│   └── CorrelationSearch.tsx    # Global search component
├── data/
│   └── mockData.ts              # Mock data for development
├── styles/
│   └── globals.css              # Tailwind styles
└── App.tsx                      # Main app with routing
```

## Key Features Implemented

### 1. Recursive Correlation Tracking
- Jobs that trigger new invocations are highlighted with purple rings
- Dashed arrows show recursive relationships
- Full correlation chain visualization across multiple invocations

### 2. Professional Visual Design
- 8px grid system for consistent spacing
- Rounded rectangles for all nodes
- Color-coded accent strips (blue for invocations, green for events, purple for jobs)
- Status indicators with animations
- Dark mode support

### 3. Interactive Flow Diagram
- Click nodes to open detail drawer
- Hover effects and connected edge highlighting
- Mini-map for navigation
- Zoom and pan controls
- Filter nodes by correlation ID or name

### 4. Detailed Inspection
- Tabbed interface in detail drawer:
  - Summary: Key metadata and metrics
  - Raw JSON: Tree view of payloads
  - Diff: Visual comparison of before/after states
  - Events: List of detected events
  - Jobs: Execution results and errors

### 5. Performance Optimizations
- Virtualized scrolling for large tables
- Lazy loading of detail data
- Smooth animations under 300ms
- Optimistic UI updates

## Development

### Building for Production
```bash
npm run build
```

### Type Checking
```bash
npm run type-check
```

### Connect to Real Data

Replace the mock data in `src/data/mockData.ts` with real GraphQL queries:

```typescript
// Example GraphQL query
const INVOCATIONS_QUERY = gql`
  query GetInvocations($limit: Int!, $offset: Int!) {
    invocations(limit: $limit, offset: $offset, order_by: { created_at: desc }) {
      id
      source_function
      correlation_id
      total_duration_ms
      events_detected_count
      status
      event_executions {
        event_name
        detected
        job_executions {
          job_name
          status
          duration_ms
        }
      }
    }
  }
`;
```

## Design Decisions

1. **Correlation ID Format**: `{system_name}.{job_name}.{uuid}` for system-generated IDs
2. **Node Visual Hierarchy**: Size and color intensity indicate importance
3. **Progressive Disclosure**: Start with overview, drill down for details
4. **Keyboard Navigation**: Full accessibility support
5. **Live Updates**: WebSocket subscriptions for real-time data (when connected to Hasura)

## Future Enhancements

- [ ] Log viewer with Grafana integration
- [ ] Advanced filtering and search across time ranges
- [ ] Export capabilities (PNG, PDF, CSV)
- [ ] Custom alert configuration
- [ ] Performance profiling tools
- [ ] Team collaboration features

## License

Private - HopDrive Internal Use Only
