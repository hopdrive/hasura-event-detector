# Event Detector Observability Dashboard Setup Guide

This guide provides multiple options for launching and using dashboards to visualize your Event Detector observability data.

## Table of Contents
- [Quick Start](#quick-start)
- [Option 1: Hasura Console Dashboard](#option-1-hasura-console-dashboard)
- [Option 2: Grafana Dashboard](#option-2-grafana-dashboard)
- [Option 3: Custom Web Dashboard](#option-3-custom-web-dashboard)
- [Option 4: Retool Dashboard](#option-4-retool-dashboard)
- [Option 5: Metabase Dashboard](#option-5-metabase-dashboard)

## Quick Start

The fastest way to view your observability data:

1. **Connect directly with a PostgreSQL client**:
```bash
psql -h your-rds-endpoint -U observability_readonly -d event_detector_observability

-- View recent invocations
SELECT source_function, source_system, status, total_duration_ms, created_at
FROM invocations
ORDER BY created_at DESC
LIMIT 10;

-- View hourly metrics
SELECT * FROM dashboard_stats
ORDER BY hour_bucket DESC;
```

2. **Use pgAdmin or DBeaver** for a graphical interface

## Option 1: Hasura Console Dashboard

### Setup Steps

1. **Add the Observability Database to Hasura**:
```bash
# Set environment variable for Hasura
export OBSERVABILITY_DATABASE_URL="postgresql://observability_readonly:password@your-rds-endpoint:5432/event_detector_observability"
```

2. **In Hasura Console**:
   - Go to Data → Connect Database
   - Database Display Name: `event_detector_observability`
   - Database URL: Environment variable `OBSERVABILITY_DATABASE_URL`
   - Click "Connect Database"

3. **Track Tables and Views**:
   - Click "Track All" for tables
   - Track the `dashboard_stats` materialized view
   - Track the computed fields (`success_rate`, `avg_job_duration`)

4. **Use GraphiQL to Query Data**:
```graphql
query DashboardOverview {
  invocations(order_by: {created_at: desc}, limit: 20) {
    id
    source_function
    source_system
    created_at
    total_duration_ms
    status
    success_rate

    event_executions_aggregate {
      aggregate {
        count
      }
      nodes {
        event_name
        detected
      }
    }
  }

  dashboard_stats(limit: 24, order_by: {hour_bucket: desc}) {
    hour_bucket
    total_invocations
    avg_duration_ms
    successful_invocations
    failed_invocations
  }
}
```

5. **Create a Simple Dashboard Page** (optional):
   - Use the GraphQL endpoint with any frontend framework
   - See `simple-dashboard.html` for an example

## Option 2: Grafana Dashboard

### Prerequisites
- Grafana installed (locally or cloud)
- PostgreSQL data source plugin

### Setup Steps

1. **Add PostgreSQL Data Source**:
   - Go to Configuration → Data Sources → Add data source
   - Choose PostgreSQL
   - Configure:
     ```
     Host: your-rds-endpoint:5432
     Database: event_detector_observability
     User: observability_readonly
     Password: [your-password]
     SSL Mode: require (for production)
     Version: 13.0+ (or your version)
     ```

2. **Import Dashboard**:
   - Go to Dashboards → Import
   - Upload `grafana-dashboard.json` (provided in this folder)
   - Select your PostgreSQL data source

3. **Available Panels**:
   - Invocation Rate (time series)
   - Success Rate (gauge)
   - Average Duration (stat)
   - Event Detection Heatmap
   - Job Execution Table
   - Error Log

### Sample Grafana Queries

**Invocation Rate**:
```sql
SELECT
  $__timeGroupAlias(created_at, 5m),
  COUNT(*) as invocations
FROM invocations
WHERE $__timeFilter(created_at)
GROUP BY 1
ORDER BY 1
```

**Success Rate**:
```sql
SELECT
  (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*))::numeric(5,2) as success_rate
FROM invocations
WHERE created_at >= NOW() - INTERVAL '1 hour'
```

**Top Event Types**:
```sql
SELECT
  event_name,
  COUNT(*) as count
FROM event_executions
WHERE created_at >= NOW() - INTERVAL '24 hours'
  AND detected = true
GROUP BY event_name
ORDER BY count DESC
LIMIT 10
```

## Option 3: Custom Web Dashboard

### Simple HTML Dashboard

We provide a standalone HTML dashboard that connects directly to your Hasura GraphQL endpoint:

1. **Setup Hasura** (as described in Option 1)

2. **Open the Dashboard**:
   ```bash
   # From this directory
   open simple-dashboard.html
   # Or serve it with any web server
   python3 -m http.server 8000
   ```

3. **Configure the Endpoint**:
   - Edit `simple-dashboard.html`
   - Update `HASURA_ENDPOINT` with your Hasura URL

### React Dashboard Example

```jsx
// Install dependencies
// npm install @apollo/client graphql recharts

import { useQuery, gql } from '@apollo/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const DASHBOARD_QUERY = gql`
  query GetMetrics {
    dashboard_stats(order_by: {hour_bucket: asc}, limit: 24) {
      hour_bucket
      total_invocations
      avg_duration_ms
      successful_invocations
    }
  }
`;

function ObservabilityDashboard() {
  const { loading, error, data } = useQuery(DASHBOARD_QUERY, {
    pollInterval: 30000, // Refresh every 30 seconds
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <h1>Event Detector Observability</h1>
      <LineChart width={800} height={400} data={data.dashboard_stats}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="hour_bucket" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="total_invocations" stroke="#8884d8" />
        <Line type="monotone" dataKey="successful_invocations" stroke="#82ca9d" />
      </LineChart>
    </div>
  );
}
```

## Option 4: Retool Dashboard

### Setup Steps

1. **Add Resource**:
   - Resources → Create New → PostgreSQL
   - Connection string: `postgresql://observability_readonly:password@your-rds-endpoint:5432/event_detector_observability`

2. **Create Queries**:
   - Recent Invocations query
   - Metrics aggregation query
   - Event distribution query

3. **Build Dashboard**:
   - Add Table component for invocations
   - Add Chart component for metrics
   - Add Statistics components for KPIs

### Sample Retool Query
```sql
-- For KPI cards
SELECT
  COUNT(*) as total_invocations,
  AVG(total_duration_ms)::int as avg_duration_ms,
  (COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*))::int as success_rate,
  SUM(total_jobs_run) as total_jobs
FROM invocations
WHERE created_at >= CURRENT_DATE
```

## Option 5: Metabase Dashboard

### Setup Steps

1. **Add Database**:
   - Settings → Admin → Databases → Add Database
   - Database type: PostgreSQL
   - Connection details as above

2. **Create Questions**:
   - Use the query builder or native SQL
   - Save as questions

3. **Build Dashboard**:
   - Create new dashboard
   - Add saved questions
   - Arrange and resize

### Sample Metabase Queries

**Event Detection Funnel**:
```sql
SELECT
  'Invocations' as stage,
  COUNT(*) as count
FROM invocations
WHERE created_at >= {{start_date}}

UNION ALL

SELECT
  'Events Detected' as stage,
  COUNT(*) as count
FROM event_executions
WHERE detected = true
  AND created_at >= {{start_date}}

UNION ALL

SELECT
  'Jobs Executed' as stage,
  COUNT(*) as count
FROM job_executions
WHERE created_at >= {{start_date}}

UNION ALL

SELECT
  'Jobs Succeeded' as stage,
  COUNT(*) as count
FROM job_executions
WHERE status = 'completed'
  AND created_at >= {{start_date}}
```

## Dashboard Features to Implement

### Essential Metrics
- ✅ Total invocations (today, this week, this month)
- ✅ Success rate percentage
- ✅ Average execution time
- ✅ Events detected count
- ✅ Jobs executed/succeeded/failed

### Time Series Charts
- ✅ Invocation rate over time
- ✅ Duration trends
- ✅ Error rate trends
- ✅ Event detection patterns

### Detailed Views
- ✅ Individual invocation trace
- ✅ Event → Job execution flow
- ✅ Error logs and stack traces
- ✅ Slow query analysis

### Alerting (Advanced)
- Set up alerts for:
  - High error rates
  - Slow execution times
  - Failed jobs
  - System anomalies

## Monitoring Best Practices

1. **Set Refresh Intervals**:
   - Overview: 30 seconds - 1 minute
   - Details: 5 minutes
   - Historical: 15 minutes

2. **Create Time-based Filters**:
   - Last hour (real-time monitoring)
   - Last 24 hours (daily operations)
   - Last 7 days (weekly trends)
   - Last 30 days (monthly analysis)

3. **Focus on Key Metrics**:
   - Success rate < 95% → Investigate
   - Duration > 2x average → Performance issue
   - Error rate > 5% → System problem

4. **Use Correlation IDs**:
   - Track related events across invocations
   - Debug complex event chains
   - Identify cascading failures

## Troubleshooting

### Can't Connect to Database
- Check security groups allow connection
- Verify credentials are correct
- Ensure using `observability_readonly` user
- Check SSL requirements

### Slow Dashboard Performance
- Refresh materialized view: `SELECT refresh_dashboard_stats();`
- Add more specific time filters
- Use dashboard_stats instead of raw tables
- Consider read replica for heavy usage

### Missing Data
- Verify observability plugin is enabled
- Check invocations table has recent data
- Ensure all services are writing to correct database
- Look for errors in plugin logs

## Next Steps

1. **Choose Your Dashboard Platform** based on:
   - Team familiarity
   - Existing infrastructure
   - Budget constraints
   - Feature requirements

2. **Start Simple**:
   - Begin with basic metrics
   - Add complexity gradually
   - Focus on actionable insights

3. **Iterate and Improve**:
   - Gather feedback from users
   - Add custom metrics as needed
   - Optimize slow queries
   - Set up alerting

The observability data is now ready to be visualized in your preferred dashboard platform!