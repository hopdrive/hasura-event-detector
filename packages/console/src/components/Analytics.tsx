import React, { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ClockIcon,
  CheckCircleIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { ChevronRightIcon } from '@heroicons/react/20/solid';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  Cell,
} from 'recharts';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
} from '@tanstack/react-table';
import {
  useAnalyticsJobsEventsQuery,
  useAnalyticsPerformanceQuery,
  useAnalyticsSourcesQuery,
  useJobExecutionSamplesLazyQuery,
} from '../types/generated';
import { formatDuration } from '../utils/formatDuration';
import { resolveTimeRange } from '../utils/resolveTimeRange';
import { format } from 'date-fns';
import { NetworkStatus } from '@apollo/client';
import { usePolling } from '../contexts/PollingContext';

// --- Reusable pieces ---

const TOOLTIP_STYLE = {
  backgroundColor: '#1f2937',
  border: 'none',
  borderRadius: '8px',
  color: '#f3f4f6',
};

const KPICard = ({ title, value, icon: Icon, color }: any) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'
  >
    <div className='flex items-center justify-between'>
      <div className='flex-1'>
        <p className='text-sm font-medium text-gray-600 dark:text-gray-400'>{title}</p>
        <p className='mt-2 text-3xl font-semibold text-gray-900 dark:text-white'>{value}</p>
      </div>
      <div className={`p-3 rounded-lg bg-${color}-50 dark:bg-${color}-900/20`}>
        <Icon className={`h-6 w-6 text-${color}-600 dark:text-${color}-400`} />
      </div>
    </div>
  </motion.div>
);

const TABS = [
  { key: 'jobs-events', label: 'Events & Jobs' },
  { key: 'performance', label: 'Performance' },
  { key: 'sources', label: 'Sources' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// Color palette for multi-line charts
const LINE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#10b981'];

// Histogram bucket config
const DURATION_BUCKETS = [
  { label: '<100ms', min: 0, max: 100, color: '#10b981' },
  { label: '100-500ms', min: 100, max: 500, color: '#22d3ee' },
  { label: '0.5-1s', min: 500, max: 1000, color: '#3b82f6' },
  { label: '1-5s', min: 1000, max: 5000, color: '#f59e0b' },
  { label: '5-10s', min: 5000, max: 10000, color: '#f97316' },
  { label: '>10s', min: 10000, max: Infinity, color: '#ef4444' },
];

function failureRateColor(rate: number) {
  if (rate === 0) return 'text-green-600 dark:text-green-400';
  if (rate <= 10) return 'text-yellow-600 dark:text-yellow-400';
  if (rate <= 30) return 'text-orange-500 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function failureRateBarColor(rate: number) {
  if (rate === 0) return '#10b981';
  if (rate <= 10) return '#eab308';
  if (rate <= 30) return '#f97316';
  return '#ef4444';
}

// --- Column definitions ---

type JobFailureRow = {
  name: string;
  total: number;
  failed: number;
  failureRate: number;
  avgDuration: number;
};

type RecentFailureRow = {
  id: string;
  invocation_id: string;
  job_name: string;
  event_name: string;
  source_function: string;
  error_message: string;
  created_at: string;
};

type SlowestFunctionRow = {
  name: string;
  count: number;
  avg: number;
  max: number;
};

const slowestFunctionColumns: ColumnDef<SlowestFunctionRow, any>[] = [
  {
    accessorKey: 'name',
    header: 'Function',
    cell: info => (
      <span className='text-gray-900 dark:text-gray-100 font-mono'>{info.getValue()}</span>
    ),
  },
  {
    accessorKey: 'count',
    header: 'Count',
    cell: info => (
      <span className='text-gray-600 dark:text-gray-400'>{info.getValue<number>().toLocaleString()}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'avg',
    header: 'Avg',
    cell: info => (
      <span className='text-gray-600 dark:text-gray-400'>{formatDuration(info.getValue())}</span>
    ),
    meta: { align: 'right' },
  },
  {
    accessorKey: 'max',
    header: 'Max',
    cell: info => (
      <span className='text-gray-600 dark:text-gray-400'>{formatDuration(info.getValue())}</span>
    ),
    meta: { align: 'right' },
  },
];

type SlowestJobRow = {
  id: string;
  job_name: string;
  event_name: string;
  duration_ms: number | null | undefined;
};

const slowestJobColumns: ColumnDef<SlowestJobRow, any>[] = [
  {
    accessorKey: 'job_name',
    header: 'Job',
    cell: info => (
      <span className='text-gray-900 dark:text-gray-100'>{info.getValue()}</span>
    ),
  },
  {
    accessorKey: 'event_name',
    header: 'Event',
    cell: info => (
      <span className='text-gray-600 dark:text-gray-400'>{info.getValue() || 'N/A'}</span>
    ),
  },
  {
    accessorKey: 'duration_ms',
    header: 'Duration',
    cell: info => (
      <span className='text-gray-600 dark:text-gray-400'>{formatDuration(info.getValue())}</span>
    ),
    meta: { align: 'right' },
  },
];

// --- Component ---

interface AnalyticsProps {
  timeRange?: string;
}

const Analytics: React.FC<AnalyticsProps> = ({ timeRange: timeRangeOption = '24h' }) => {
  const { setIsPolling, getEffectivePollInterval } = usePolling();
  const [activeTab, setActiveTab] = useState<TabKey>('jobs-events');

  const resolved = useMemo(() => resolveTimeRange(timeRangeOption), [timeRangeOption]);
  const queryVars = useMemo(
    () => ({ timeRange: resolved.start, timeRangeEnd: resolved.end }),
    [resolved.start, resolved.end],
  );
  const pollInterval = getEffectivePollInterval(resolved.isCustom);

  // Always fetch jobs-events (provides KPI data + default tab)
  const jobsEvents = useAnalyticsJobsEventsQuery({
    variables: queryVars,
    fetchPolicy: 'cache-and-network',
    pollInterval,
    notifyOnNetworkStatusChange: true,
  });

  const performance = useAnalyticsPerformanceQuery({
    variables: queryVars,
    skip: activeTab !== 'performance',
    fetchPolicy: 'cache-and-network',
    pollInterval,
    notifyOnNetworkStatusChange: true,
  });

  const sources = useAnalyticsSourcesQuery({
    variables: queryVars,
    skip: activeTab !== 'sources',
    fetchPolicy: 'cache-and-network',
    pollInterval,
    notifyOnNetworkStatusChange: true,
  });

  // Track polling for all active queries
  useEffect(() => {
    const isRefetching =
      jobsEvents.networkStatus === NetworkStatus.refetch ||
      performance.networkStatus === NetworkStatus.refetch ||
      sources.networkStatus === NetworkStatus.refetch;
    setIsPolling(isRefetching);
  }, [jobsEvents.networkStatus, performance.networkStatus, sources.networkStatus, setIsPolling]);

  // --- KPI computations (from jobsEvents) ---
  const allJobs = jobsEvents.data?.all_jobs || [];
  const totalJobs = jobsEvents.data?.job_executions_aggregate?.aggregate?.count || 0;
  const avgJobDuration = Math.round(
    jobsEvents.data?.job_executions_aggregate?.aggregate?.avg?.duration_ms || 0
  );
  const totalEvents = jobsEvents.data?.event_executions_aggregate?.aggregate?.count || 0;
  const failedJobs = allJobs.filter(j => j.status === 'failed').length;
  const jobSuccessRate = allJobs.length > 0 ? Math.round(((allJobs.length - failedJobs) / allJobs.length) * 100) : 100;

  // --- Jobs & Events tab data ---
  const jobFrequency = useMemo(() => {
    const map = new Map<string, number>();
    allJobs.forEach(j => map.set(j.job_name, (map.get(j.job_name) || 0) + 1));
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
  }, [allJobs]);

  const jobFailureTable = useMemo(() => {
    const map = new Map<string, { total: number; failed: number; totalDuration: number }>();
    allJobs.forEach(j => {
      const entry = map.get(j.job_name) || { total: 0, failed: 0, totalDuration: 0 };
      entry.total++;
      if (j.status === 'failed') entry.failed++;
      entry.totalDuration += j.duration_ms || 0;
      map.set(j.job_name, entry);
    });
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name,
        total: d.total,
        failed: d.failed,
        failureRate: d.total > 0 ? (d.failed / d.total) * 100 : 0,
        avgDuration: d.total > 0 ? Math.round(d.totalDuration / d.total) : 0,
      }))
      .filter(row => row.failureRate > 0)
      .sort((a, b) => b.failureRate - a.failureRate);
  }, [allJobs]);

  const jobFailureOverTime = useMemo(() => {
    // Find top 5 failing job names
    const failCounts = new Map<string, number>();
    allJobs.forEach(j => {
      if (j.status === 'failed') failCounts.set(j.job_name, (failCounts.get(j.job_name) || 0) + 1);
    });
    const topFailingJobs = Array.from(failCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(e => e[0]);

    if (topFailingJobs.length === 0) return { data: [], jobs: [] as string[] };

    const { intervals, formatKey, getIntervalStart } = resolved;

    // bucket: { time, [jobName]: failureRate }
    type Bucket = { time: string; [key: string]: number | string };
    const bucketMap = new Map<string, { totals: Record<string, number>; fails: Record<string, number> }>();
    intervals.forEach(d => {
      const key = formatKey(d);
      const totals: Record<string, number> = {};
      const fails: Record<string, number> = {};
      topFailingJobs.forEach(j => {
        totals[j] = 0;
        fails[j] = 0;
      });
      bucketMap.set(key, { totals, fails });
    });

    allJobs.forEach(j => {
      if (!topFailingJobs.includes(j.job_name)) return;
      const key = formatKey(getIntervalStart(new Date(j.created_at)));
      const b = bucketMap.get(key);
      if (!b) return;
      b.totals[j.job_name] = (b.totals[j.job_name] || 0) + 1;
      if (j.status === 'failed') b.fails[j.job_name] = (b.fails[j.job_name] || 0) + 1;
    });

    const data: Bucket[] = [];
    bucketMap.forEach((b, key) => {
      const row: Bucket = { time: key };
      topFailingJobs.forEach(j => {
        row[j] = b.totals[j] > 0 ? Math.round((b.fails[j] / b.totals[j]) * 100) : 0;
      });
      data.push(row);
    });

    return { data, jobs: topFailingJobs };
  }, [allJobs, resolved]);

  const eventDetectionData = useMemo(() => {
    const allEvents = jobsEvents.data?.all_events || [];
    const map = new Map<string, { detected: number; notDetected: number }>();
    allEvents.forEach(e => {
      const entry = map.get(e.event_name) || { detected: 0, notDetected: 0 };
      if (e.detected) entry.detected++;
      else entry.notDetected++;
      map.set(e.event_name, entry);
    });
    return Array.from(map.entries())
      .map(([name, d]) => ({ name, detected: d.detected, not_detected: d.notDetected }))
      .sort((a, b) => b.detected + b.not_detected - (a.detected + a.not_detected))
      .slice(0, 15);
  }, [jobsEvents.data?.all_events]);

  // --- Performance tab data ---
  const durationHistogram = useMemo(() => {
    const durations = performance.data?.invocations_durations || [];
    const buckets = DURATION_BUCKETS.map(b => ({ ...b, count: 0 }));
    durations.forEach(d => {
      const ms = d.total_duration_ms || 0;
      for (const bucket of buckets) {
        if (ms >= bucket.min && ms < bucket.max) {
          bucket.count++;
          break;
        }
      }
    });
    return buckets;
  }, [performance.data?.invocations_durations]);

  // --- Sources tab data ---
  const sourceCharts = useMemo(() => {
    const invocations = sources.data?.invocations_by_source || [];

    // By function
    const fnMap = new Map<string, { count: number; failed: number }>();
    invocations.forEach(inv => {
      const fn = inv.source_function || 'unknown';
      const entry = fnMap.get(fn) || { count: 0, failed: 0 };
      entry.count++;
      if (inv.status === 'failed') entry.failed++;
      fnMap.set(fn, entry);
    });
    const byFunction = Array.from(fnMap.entries())
      .map(([name, d]) => ({
        name,
        count: d.count,
        failureRate: d.count > 0 ? Math.round((d.failed / d.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // By table
    const tableMap = new Map<string, number>();
    invocations.forEach(inv => {
      const tbl = inv.source_table || 'unknown';
      tableMap.set(tbl, (tableMap.get(tbl) || 0) + 1);
    });
    const byTable = Array.from(tableMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // By operation
    const opMap = new Map<string, number>();
    invocations.forEach(inv => {
      const op = inv.source_operation || 'UNKNOWN';
      opMap.set(op, (opMap.get(op) || 0) + 1);
    });
    const byOperation = Array.from(opMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // By user
    const userMap = new Map<string, number>();
    invocations.forEach(inv => {
      const user = inv.source_user_email || 'system';
      userMap.set(user, (userMap.get(user) || 0) + 1);
    });
    const byUser = Array.from(userMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return { byFunction, byTable, byOperation, byUser };
  }, [sources.data?.invocations_by_source]);

  // --- Loading / Error ---
  const isInitialLoading = jobsEvents.loading && !jobsEvents.data;
  if (isInitialLoading) {
    return (
      <div className='p-6 flex items-center justify-center h-64'>
        <div className='text-center'>
          <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
          <p className='mt-2 text-gray-600 dark:text-gray-400'>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (jobsEvents.error && !jobsEvents.data) {
    return (
      <div className='p-6 flex items-center justify-center h-64'>
        <div className='text-center'>
          <ExclamationTriangleIcon className='mx-auto h-12 w-12 text-yellow-500 mb-4' />
          <p className='text-yellow-600 dark:text-yellow-400 mb-2'>Analytics temporarily unavailable</p>
          <p className='text-xs text-gray-500 mt-2'>Error: {jobsEvents.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='p-6 space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-2xl font-semibold text-gray-900 dark:text-white'>Analytics</h1>
        <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
          Job failure rates, event frequency rankings, and performance insights
        </p>
      </div>

      {/* KPI Cards */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <KPICard
          title='Avg Job Duration'
          value={formatDuration(avgJobDuration)}
          icon={ClockIcon}
          color='purple'
        />
        <KPICard
          title='Job Success Rate'
          value={`${jobSuccessRate}%`}
          icon={CheckCircleIcon}
          color='green'
        />
        <KPICard title='Total Jobs' value={totalJobs.toLocaleString()} icon={CubeIcon} color='blue' />
        <KPICard
          title='Total Events'
          value={totalEvents.toLocaleString()}
          icon={BoltIcon}
          color='amber'
        />
      </div>

      {/* Tab Bar */}
      <div className='border-b border-gray-200 dark:border-gray-700'>
        <nav className='flex space-x-8'>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'jobs-events' && (
        <JobsEventsTab
          jobFrequency={jobFrequency}
          jobFailureTable={jobFailureTable}
          jobFailureOverTime={jobFailureOverTime}
          eventDetectionData={eventDetectionData}
          timeRange={resolved.start}
          timeRangeEnd={resolved.end}
          recentFailures={(jobsEvents.data?.recent_failures || []).map(f => ({
            id: f.id,
            invocation_id: f.invocation_id,
            job_name: f.job_name,
            event_name: f.event_execution?.event_name || 'N/A',
            source_function: f.invocation?.source_function || 'N/A',
            error_message: f.error_message || '',
            created_at: f.created_at,
          }))}
        />
      )}

      {activeTab === 'performance' && (
        <PerformanceTab
          loading={performance.loading && !performance.data}
          durationHistogram={durationHistogram}
          slowestInvocations={(() => {
            const invocations = performance.data?.all_invocations || [];
            const map = new Map<string, { total: number; max: number; count: number }>();
            invocations.forEach(inv => {
              const fn = inv.source_function;
              const ms = inv.total_duration_ms || 0;
              const entry = map.get(fn) || { total: 0, max: 0, count: 0 };
              entry.total += ms;
              entry.max = Math.max(entry.max, ms);
              entry.count++;
              map.set(fn, entry);
            });
            return Array.from(map.entries())
              .map(([name, d]) => ({
                name,
                count: d.count,
                avg: d.count > 0 ? Math.round(d.total / d.count) : 0,
                max: d.max,
              }))
              .sort((a, b) => b.max - a.max)
              .slice(0, 10);
          })()}
          slowestJobs={(performance.data?.slowest_jobs || []).map(j => ({
            id: j.id,
            job_name: j.job_name === 'anonymous' && j.job_function_name ? j.job_function_name : j.job_name,
            event_name: j.event_execution?.event_name || 'N/A',
            duration_ms: j.duration_ms,
          }))}
        />
      )}

      {activeTab === 'sources' && (
        <SourcesTab loading={sources.loading && !sources.data} charts={sourceCharts} />
      )}
    </div>
  );
};

// ---------- Events & Jobs Tab ----------

function JobsEventsTab({
  jobFrequency,
  jobFailureTable,
  jobFailureOverTime,
  eventDetectionData,
  recentFailures,
  timeRange,
  timeRangeEnd,
}: {
  jobFrequency: { name: string; count: number }[];
  jobFailureTable: {
    name: string;
    total: number;
    failed: number;
    failureRate: number;
    avgDuration: number;
  }[];
  jobFailureOverTime: { data: any[]; jobs: string[] };
  eventDetectionData: { name: string; detected: number; not_detected: number }[];
  recentFailures: RecentFailureRow[];
  timeRange: string;
  timeRangeEnd: string;
}) {
  return (
    <div className='space-y-6'>
      {/* Job Frequency Ranking */}
      <ChartCard title='Job Frequency Ranking' subtitle='Top 15 jobs by execution count'>
        {jobFrequency.length === 0 ? (
          <EmptyState message='No job executions in this time range' />
        ) : (
          <ResponsiveContainer width='100%' height={Math.max(300, jobFrequency.length * 32)}>
            <BarChart data={jobFrequency} layout='vertical' margin={{ left: 140 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis type='number' stroke='#6b7280' />
              <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={130} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='count' fill='#3b82f6' radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Systemic Job Failure Rate Table */}
      <ChartCard title='Systemic Job Failure Rate' subtitle='Jobs with failures, sorted by failure rate (worst first)'>
        <FailureRateAccordion data={jobFailureTable} timeRange={timeRange} timeRangeEnd={timeRangeEnd} />
      </ChartCard>

      {/* Job Failure Rate Over Time */}
      {jobFailureOverTime.jobs.length > 0 && (
        <ChartCard
          title='Job Failure Rate Over Time'
          subtitle='Failure rate % for top failing jobs'
        >
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={jobFailureOverTime.data}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis dataKey='time' stroke='#6b7280' />
              <YAxis stroke='#6b7280' unit='%' domain={[0, 100]} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
              <Legend />
              {jobFailureOverTime.jobs.map((job, i) => (
                <Line
                  key={job}
                  type='monotone'
                  dataKey={job}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Event Detection Rates */}
      <ChartCard title='Event Detection Rates' subtitle='Detected vs not detected per event'>
        {eventDetectionData.length === 0 ? (
          <EmptyState message='No event data available' />
        ) : (
          <ResponsiveContainer width='100%' height={Math.max(300, eventDetectionData.length * 32)}>
            <BarChart data={eventDetectionData} layout='vertical' margin={{ left: 140 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis type='number' stroke='#6b7280' />
              <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={130} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='detected' stackId='a' fill='#10b981' name='Detected' />
              <Bar dataKey='not_detected' stackId='a' fill='#6b7280' name='Not Detected' radius={[0, 4, 4, 0]} />
              <Legend />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Recent Failures Table */}
      <ChartCard title='Recent Failures' subtitle='Latest 20 failed job executions'>
        <RecentFailuresTable data={recentFailures} />
      </ChartCard>
    </div>
  );
}

// ---------- Recent Failures Table (clickable rows) ----------

function RecentFailuresTable({ data }: { data: RecentFailureRow[] }) {
  const navigate = useNavigate();

  if (data.length === 0) {
    return <EmptyState message='No recent failures' />;
  }

  return (
    <div className='overflow-x-auto'>
      <style>{`
        [data-analytics-table] tbody tr::before,
        [data-analytics-table] tbody tr::after {
          content: none !important;
          display: none !important;
        }
      `}</style>
      <table className='w-full' data-analytics-table>
        <thead className='bg-gray-50 dark:bg-gray-700/50'>
          <tr>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Job Name</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Event</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Function</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Error</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Time</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
          {data.map(row => (
            <tr
              key={row.id}
              className='hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer group'
              onClick={() => navigate(`/flow?invocationId=${row.invocation_id}&autoFocus=true`)}
            >
              <td className='px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400'>
                {row.job_name}
              </td>
              <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400'>{row.event_name || 'N/A'}</td>
              <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-mono'>{row.source_function || 'N/A'}</td>
              <td className='px-4 py-3 text-sm text-red-600 dark:text-red-400 max-w-md truncate'>{row.error_message || 'No error message'}</td>
              <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap'>
                {format(new Date(row.created_at), 'MMM d, HH:mm')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Failure Rate Accordion ----------

function FailureRateAccordion({
  data,
  timeRange,
  timeRangeEnd,
}: {
  data: JobFailureRow[];
  timeRange: string;
  timeRangeEnd: string;
}) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  if (data.length === 0) {
    return <EmptyState message='No job failures in this time range' />;
  }

  return (
    <div className='overflow-x-auto'>
      <style>{`
        [data-analytics-table] tbody tr::before,
        [data-analytics-table] tbody tr::after {
          content: none !important;
          display: none !important;
        }
      `}</style>
      <table className='w-full' data-analytics-table>
        <thead className='bg-gray-50 dark:bg-gray-700/50'>
          <tr>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left w-8' />
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left'>Job Name</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right'>Total</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right'>Failed</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left' style={{ width: 220 }}>Failure Rate</th>
            <th className='px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right'>Avg Duration</th>
          </tr>
        </thead>
        <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
          {data.map(row => (
            <React.Fragment key={row.name}>
              <tr
                className='hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'
                onClick={() => setExpandedJob(expandedJob === row.name ? null : row.name)}
              >
                <td className='px-4 py-3 text-sm'>
                  <ChevronRightIcon
                    className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                      expandedJob === row.name ? 'rotate-90' : ''
                    }`}
                  />
                </td>
                <td className='px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100'>{row.name}</td>
                <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right'>{row.total.toLocaleString()}</td>
                <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right'>{row.failed.toLocaleString()}</td>
                <td className='px-4 py-3 text-sm'>
                  <div className='flex items-center gap-2'>
                    <div className='flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden'>
                      <div
                        className='h-full rounded-full'
                        style={{
                          width: `${Math.min(row.failureRate, 100)}%`,
                          backgroundColor: failureRateBarColor(row.failureRate),
                        }}
                      />
                    </div>
                    <span className={`font-medium whitespace-nowrap ${failureRateColor(row.failureRate)}`}>
                      {row.failureRate.toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className='px-4 py-3 text-sm text-gray-600 dark:text-gray-400 text-right'>{formatDuration(row.avgDuration)}</td>
              </tr>
              {expandedJob === row.name && (
                <tr>
                  <td colSpan={6} className='p-0'>
                    <FailureRateDetail jobName={row.name} timeRange={timeRange} timeRangeEnd={timeRangeEnd} />
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FailureRateDetail({ jobName, timeRange, timeRangeEnd }: { jobName: string; timeRange: string; timeRangeEnd: string }) {
  const navigate = useNavigate();
  const [fetchSamples, { data, loading }] = useJobExecutionSamplesLazyQuery();

  useEffect(() => {
    fetchSamples({ variables: { jobName, timeRange, timeRangeEnd } });
  }, [jobName, timeRange, timeRangeEnd, fetchSamples]);

  const handleClick = (invocationId: string) => {
    navigate(`/flow?invocationId=${invocationId}&autoFocus=true`);
  };

  if (loading || !data) {
    return (
      <div className='px-8 py-4 bg-gray-50/50 dark:bg-gray-800/50'>
        <div className='flex items-center gap-2 text-sm text-gray-500'>
          <div className='inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400' />
          Loading samples...
        </div>
      </div>
    );
  }

  const failed = data.failed || [];
  const succeeded = data.succeeded || [];

  return (
    <div className='px-8 py-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700/50'>
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Failed executions */}
        <div>
          <h4 className='text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wider mb-2'>
            Recent Failures ({failed.length})
          </h4>
          {failed.length === 0 ? (
            <p className='text-xs text-gray-400'>No recent failures</p>
          ) : (
            <div className='space-y-1.5'>
              {failed.map(job => (
                <button
                  key={job.id}
                  onClick={() => handleClick(job.invocation_id)}
                  className='w-full text-left px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors group'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-mono text-gray-600 dark:text-gray-400'>
                          {job.invocation?.source_function || 'unknown'}
                        </span>
                        {job.event_execution?.event_name && (
                          <span className='text-xs text-gray-400 dark:text-gray-500'>
                            / {job.event_execution.event_name}
                          </span>
                        )}
                      </div>
                      {job.error_message && (
                        <p className='text-xs text-red-600 dark:text-red-400 truncate mt-0.5'>
                          {job.error_message}
                        </p>
                      )}
                    </div>
                    <div className='flex items-center gap-2 ml-3 shrink-0'>
                      <span className='text-xs text-gray-400'>
                        {format(new Date(job.created_at), 'MMM d, HH:mm')}
                      </span>
                      <ChevronRightIcon className='h-3 w-3 text-gray-300 group-hover:text-gray-500 dark:group-hover:text-gray-300' />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Succeeded executions */}
        <div>
          <h4 className='text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wider mb-2'>
            Recent Successes ({succeeded.length})
          </h4>
          {succeeded.length === 0 ? (
            <p className='text-xs text-gray-400'>No recent successes</p>
          ) : (
            <div className='space-y-1.5'>
              {succeeded.map(job => (
                <button
                  key={job.id}
                  onClick={() => handleClick(job.invocation_id)}
                  className='w-full text-left px-3 py-2 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors group'
                >
                  <div className='flex items-center justify-between'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2'>
                        <span className='text-xs font-mono text-gray-600 dark:text-gray-400'>
                          {job.invocation?.source_function || 'unknown'}
                        </span>
                        {job.event_execution?.event_name && (
                          <span className='text-xs text-gray-400 dark:text-gray-500'>
                            / {job.event_execution.event_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className='flex items-center gap-2 ml-3 shrink-0'>
                      {job.duration_ms != null && (
                        <span className='text-xs text-gray-400'>{formatDuration(job.duration_ms)}</span>
                      )}
                      <span className='text-xs text-gray-400'>
                        {format(new Date(job.created_at), 'MMM d, HH:mm')}
                      </span>
                      <ChevronRightIcon className='h-3 w-3 text-gray-300 group-hover:text-gray-500 dark:group-hover:text-gray-300' />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Performance Tab ----------

function PerformanceTab({
  loading,
  durationHistogram,
  slowestInvocations,
  slowestJobs,
}: {
  loading: boolean;
  durationHistogram: any[];
  slowestInvocations: SlowestFunctionRow[];
  slowestJobs: SlowestJobRow[];
}) {
  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Duration Distribution Histogram */}
      <ChartCard title='Duration Distribution' subtitle='Invocation count by duration bucket'>
        {durationHistogram.every(b => b.count === 0) ? (
          <EmptyState message='No completed invocations in this time range' />
        ) : (
          <ResponsiveContainer width='100%' height={300}>
            <BarChart data={durationHistogram}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis dataKey='label' stroke='#6b7280' />
              <YAxis stroke='#6b7280' />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='count' radius={[4, 4, 0, 0]}>
                {durationHistogram.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Slowest Functions / Jobs side by side */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        <ChartCard title='Slowest Functions' subtitle='Top 10 by max duration, grouped by function'>
          <DataTable
            data={slowestInvocations}
            columns={slowestFunctionColumns}
            emptyMessage='No data'
          />
        </ChartCard>

        <ChartCard title='Slowest Jobs' subtitle='Top 10 by duration'>
          <DataTable
            data={slowestJobs}
            columns={slowestJobColumns}
            emptyMessage='No data'
          />
        </ChartCard>
      </div>
    </div>
  );
}

// ---------- Sources Tab ----------

function SourcesTab({
  loading,
  charts,
}: {
  loading: boolean;
  charts: {
    byFunction: { name: string; count: number; failureRate: number }[];
    byTable: { name: string; count: number }[];
    byOperation: { name: string; count: number }[];
    byUser: { name: string; count: number }[];
  };
}) {
  if (loading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* By Source Function */}
      <ChartCard title='By Source Function' subtitle='Invocation count and failure rate per function'>
        {charts.byFunction.length === 0 ? (
          <EmptyState message='No source data available' />
        ) : (
          <ResponsiveContainer width='100%' height={Math.max(300, charts.byFunction.length * 32)}>
            <BarChart data={charts.byFunction} layout='vertical' margin={{ left: 160 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis type='number' stroke='#6b7280' />
              <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={150} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number, name: string) =>
                  name === 'failureRate' ? `${value}%` : value
                }
              />
              <Legend />
              <Bar dataKey='count' fill='#3b82f6' name='Count' radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* By Table */}
        <ChartCard title='By Source Table' subtitle='Invocations per table'>
          {charts.byTable.length === 0 ? (
            <EmptyState message='No table data' />
          ) : (
            <ResponsiveContainer width='100%' height={Math.max(250, charts.byTable.length * 32)}>
              <BarChart data={charts.byTable} layout='vertical' margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
                <XAxis type='number' stroke='#6b7280' />
                <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={110} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey='count' fill='#8b5cf6' radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* By Operation */}
        <ChartCard title='By Operation' subtitle='INSERT / UPDATE / DELETE / MANUAL breakdown'>
          {charts.byOperation.length === 0 ? (
            <EmptyState message='No operation data' />
          ) : (
            <ResponsiveContainer width='100%' height={Math.max(200, charts.byOperation.length * 40)}>
              <BarChart data={charts.byOperation} layout='vertical' margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
                <XAxis type='number' stroke='#6b7280' />
                <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={90} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey='count' fill='#10b981' radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* By User */}
      <ChartCard title='By User' subtitle='Top active users by invocation count'>
        {charts.byUser.length === 0 ? (
          <EmptyState message='No user data' />
        ) : (
          <ResponsiveContainer width='100%' height={Math.max(250, charts.byUser.length * 32)}>
            <BarChart data={charts.byUser} layout='vertical' margin={{ left: 180 }}>
              <CartesianGrid strokeDasharray='3 3' stroke='#374151' />
              <XAxis type='number' stroke='#6b7280' />
              <YAxis dataKey='name' type='category' stroke='#6b7280' tick={{ fontSize: 12 }} width={170} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey='count' fill='#f59e0b' radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ---------- Shared small components ----------

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'
    >
      <div className='mb-4'>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>{title}</h3>
        {subtitle && <p className='text-sm text-gray-500 dark:text-gray-400 mt-0.5'>{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className='flex items-center justify-center h-32 text-gray-400 dark:text-gray-500 text-sm'>
      {message}
    </div>
  );
}

// ---------- Reusable DataTable ----------

function DataTable<T>({
  data,
  columns,
  emptyMessage = 'No data available',
  initialSorting,
}: {
  data: T[];
  columns: ColumnDef<T, any>[];
  emptyMessage?: string;
  initialSorting?: SortingState;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting || []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className='overflow-x-auto'>
      {/* Neutralize the global tbody tr::before/::after from globals.css */}
      <style>{`
        [data-analytics-table] tbody tr::before,
        [data-analytics-table] tbody tr::after {
          content: none !important;
          display: none !important;
        }
      `}</style>
      <table className='w-full' data-analytics-table>
        <thead className='bg-gray-50 dark:bg-gray-700/50'>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => {
                const meta = header.column.columnDef.meta as any;
                const align = meta?.align;
                return (
                  <th
                    key={header.id}
                    className={`px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap ${
                      align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} className='hover:bg-gray-50 dark:hover:bg-gray-700/50'>
              {row.getVisibleCells().map(cell => {
                const meta = cell.column.columnDef.meta as any;
                const align = meta?.align;
                return (
                  <td
                    key={cell.id}
                    className={`px-4 py-3 text-sm ${align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Analytics;
