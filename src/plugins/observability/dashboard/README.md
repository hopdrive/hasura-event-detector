# Observability Dashboard

A React-based dashboard for monitoring and visualizing the Hasura Event Detector system execution, providing comprehensive insights into event processing, job execution, and correlation tracking.

## Features

### Core Monitoring
- **Real-time Invocation Tracking**: Monitor every `listenTo()` call with detailed execution metrics
- **Event Detection Visualization**: Track which events are detected and their success rates
- **Job Execution Monitoring**: View individual job performance, success/failure rates, and timing
- **Correlation Chain Tracing**: Follow related events through their entire execution lifecycle

### Advanced Analytics
- **Performance Trends**: Historical performance analysis with hourly aggregations
- **Success Rate Metrics**: System-wide and per-function success rate tracking
- **Error Analysis**: Detailed error tracking and failure pattern identification
- **Duration Analytics**: Response time analysis and bottleneck identification

### Interactive Visualizations
- **Event Flow Diagrams**: Interactive node-based visualization of event processing chains
- **Correlation Mapping**: Visual representation of how events trigger downstream processing
- **Performance Charts**: Time-series charts for performance monitoring
- **Real-time Updates**: Live dashboard updates with configurable polling intervals

## Quick Start

### 1. Environment Setup

Copy the environment template:
```bash
cp .env.example .env
```

Update `.env` with your configuration:
```env
REACT_APP_GRAPHQL_ENDPOINT=http://localhost:8080/v1/graphql
REACT_APP_HASURA_ADMIN_SECRET=your-admin-secret
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

The dashboard will be available at `http://localhost:3000`

### 4. Build for Production

```bash
npm run build
```

Built files will be in the `dist/` directory.

## Configuration

### GraphQL Connection

The dashboard connects to your Hasura GraphQL API to query observability data:

```javascript
// src/config.js
export const config = {
  graphql: {
    endpoint: 'http://localhost:8080/v1/graphql',
    headers: {
      'x-hasura-admin-secret': 'your-admin-secret'
    }
  }
};
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_GRAPHQL_ENDPOINT` | Hasura GraphQL endpoint | `http://localhost:8080/v1/graphql` |
| `REACT_APP_HASURA_ADMIN_SECRET` | Admin secret for authentication | Required |
| `REACT_APP_OVERVIEW_POLLING` | Overview refresh interval (ms) | `30000` |
| `REACT_APP_REALTIME_POLLING` | Real-time monitoring interval (ms) | `5000` |
| `REACT_APP_SHOW_RAW_PAYLOADS` | Show Hasura event payloads | `false` |
| `REACT_APP_DEFAULT_TIME_RANGE` | Default analytics time range (hours) | `24` |

### Feature Flags

Enable/disable dashboard features:

```env
REACT_APP_SHOW_CORRELATION_CHAINS=true
REACT_APP_SHOW_EXECUTION_FLOWS=true
REACT_APP_SHOW_ANALYTICS=true
REACT_APP_ENABLE_SEARCH=true
```

## Dashboard Sections

### 1. Overview Dashboard
- **System Health**: Overall success rates and system status
- **Recent Invocations**: Latest event processing activities
- **Performance Trends**: Duration and throughput charts
- **Quick Stats**: Events detected, jobs executed, error rates

### 2. Invocation Details
- **Execution Timeline**: Step-by-step processing breakdown
- **Event Detection Results**: Which events were detected and processed
- **Job Execution Details**: Individual job performance and results
- **Error Details**: Full error messages and stack traces when available

### 3. Event Flow Visualization
- **Interactive Flow Diagrams**: Node-based visualization of event processing
- **Correlation Tracing**: Visual representation of event relationships
- **Execution Paths**: See how events flow through the system
- **Performance Overlays**: Timing information on flow nodes

### 4. Correlation Chain Analysis
- **Chain Discovery**: Find related events by correlation ID
- **Multi-step Flows**: Trace events across multiple function invocations
- **Impact Analysis**: Understand downstream effects of initial events
- **Timing Analysis**: See end-to-end processing times

### 5. Performance Analytics
- **Historical Trends**: Performance over time with hourly aggregations
- **Function Comparison**: Compare performance across different functions
- **Bottleneck Identification**: Find slow operations and failure points
- **Capacity Planning**: Understand system load and scaling needs

## Data Model Integration

The dashboard queries the observability database schema:

### Core Tables
- **`invocations`**: Each `listenTo()` call with overall metrics
- **`event_executions`**: Individual event detection attempts
- **`job_executions`**: Individual job runs with timing and results
- **`metrics_hourly`**: Pre-aggregated hourly performance metrics

### Materialized Views
- **`dashboard_stats`**: Optimized aggregations for dashboard performance

### Key Relationships
```
invocations (1) → (many) event_executions
event_executions (1) → (many) job_executions
```

## GraphQL Queries

The dashboard uses optimized GraphQL queries for different views:

### Overview Query
```graphql
query OverviewDashboard($timeRange: timestamptz!) {
  invocations(where: { created_at: { _gte: $timeRange } }) {
    id
    source_function
    total_duration_ms
    events_detected_count
    correlation_id
  }
  dashboard_stats(where: { hour_bucket: { _gte: $timeRange } }) {
    hour_bucket
    avg_duration_ms
    total_invocations
  }
}
```

### Correlation Chain Query
```graphql
query CorrelationChainFlow($correlationId: String!) {
  invocations(where: { correlation_id: { _eq: $correlationId } }) {
    id
    source_function
    event_executions {
      event_name
      job_executions {
        job_name
        status
      }
    }
  }
}
```

## Development

### Project Structure
```
dashboard/
├── src/
│   ├── components/          # React components
│   │   ├── OverviewDashboard.jsx
│   │   └── EventFlowVisualizer.jsx
│   ├── graphql/            # GraphQL queries
│   │   └── queries.js
│   ├── utils/              # Utility functions
│   └── config.js           # Configuration
├── package.json
├── vite.config.js          # Build configuration
└── .env.example           # Environment template
```

### Adding New Features

1. **New Dashboard Section**:
   - Create component in `src/components/`
   - Add GraphQL queries in `src/graphql/queries.js`
   - Update routing in main App component

2. **New Chart Type**:
   - Use Ant Design Charts (`@ant-design/charts`)
   - Follow existing patterns in `OverviewDashboard.jsx`
   - Ensure responsive design

3. **New Query**:
   - Add to `src/graphql/queries.js`
   - Align with database schema in `../model/schema.sql`
   - Test with GraphQL playground

### Testing

Test GraphQL queries directly:

```bash
# Using curl
curl -X POST http://localhost:8080/v1/graphql \
  -H "x-hasura-admin-secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"query": "query { invocations(limit: 5) { id source_function } }"}'
```

### Build Optimization

The build is optimized with:
- **Code Splitting**: Vendor libraries separated for caching
- **Tree Shaking**: Unused code eliminated
- **Asset Optimization**: Images and CSS optimized
- **Chunk Analysis**: Use `npm run build` to analyze bundle size

## Troubleshooting

### Common Issues

**GraphQL Connection Failed**:
```
Error: Network error: Failed to fetch
```
- Check `REACT_APP_GRAPHQL_ENDPOINT` in `.env`
- Verify Hasura is running and accessible
- Check `REACT_APP_HASURA_ADMIN_SECRET`

**No Data Showing**:
- Ensure observability plugin is enabled and capturing data
- Check database schema exists: `event_detector_observability`
- Verify Hasura metadata includes observability tables

**Performance Issues**:
- Increase polling intervals in configuration
- Disable real-time features if not needed
- Check browser network tab for slow queries

**Build Errors**:
```
Module not found: Can't resolve '@ant-design/charts'
```
- Run `npm install` to ensure all dependencies are installed
- Clear node_modules and reinstall if needed

### Debug Mode

Enable debug logging:
```env
REACT_APP_DEBUG=true
```

This will show:
- GraphQL query execution times
- Component render performance
- WebSocket connection status

## Security Considerations

### Authentication
- Use JWT tokens instead of admin secret in production:
  ```env
  # Remove admin secret
  # REACT_APP_HASURA_ADMIN_SECRET=

  # Use JWT instead
  REACT_APP_JWT_TOKEN=eyJ0eXAiOiJKV1QiLCJhbGc...
  ```

### Data Privacy
- Disable raw payload display in production:
  ```env
  REACT_APP_SHOW_RAW_PAYLOADS=false
  ```
- Consider filtering sensitive fields in GraphQL queries

### Access Control
- Configure Hasura permissions for observability tables
- Limit dashboard access to authorized users only
- Use HTTPS in production environments

## Deployment

### Static Hosting
After building (`npm run build`), deploy the `dist/` folder to:
- **Netlify**: Drag and drop the dist folder
- **Vercel**: Connect GitHub repository with auto-deployment
- **AWS S3**: Upload to S3 bucket with static website hosting
- **GitHub Pages**: Use GitHub Actions for automatic deployment

### Docker Deployment
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

### Environment-specific Configuration
Use different `.env` files for different environments:
- `.env.development`
- `.env.staging`
- `.env.production`

## Contributing

1. Follow existing code patterns and component structure
2. Update GraphQL queries when schema changes
3. Add new environment variables to `.env.example`
4. Test with different data scenarios
5. Ensure responsive design works on mobile devices