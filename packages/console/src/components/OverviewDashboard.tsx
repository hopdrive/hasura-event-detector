import React, { useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { useOverviewDashboardQuery } from '../types/generated';
import { formatDuration } from '../utils/formatDuration';
import {
  sub,
  addHours,
  addMinutes,
  format,
  startOfHour,
  eachHourOfInterval,
  eachDayOfInterval,
  startOfDay,
  startOfMinute,
  eachMinuteOfInterval,
} from 'date-fns';
import { NetworkStatus } from '@apollo/client';
import DatabaseConnectionStatus from './DatabaseConnectionStatus';
import { usePolling } from '../contexts/PollingContext';
import { useSystemStatus } from '../hooks/useSystemStatus';

const KPICard = ({ title, value, change, icon: Icon, color }: any) => {
  // Determine if change is negative by checking if it starts with '-'
  const isNegative = change && change.startsWith('-');
  // Remove the sign prefix ('-' or '+') for display
  const displayChange = change ? change.replace(/^[+-]/, '') : change;
  // Use red color and down arrow for negative changes
  const isPositive = !isNegative;
  const TrendIcon = isPositive ? ArrowUpIcon : ArrowDownIcon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'
    >
      <div className='flex items-center justify-between'>
        <div className='flex-1'>
          <p className='text-sm font-medium text-gray-600 dark:text-gray-400'>{title}</p>
          <p className='mt-2 text-3xl font-semibold text-gray-900 dark:text-white'>{value}</p>
          {change && (
            <div className='mt-2 flex items-center text-sm'>
              <TrendIcon className={`h-4 w-4 mr-1 ${isPositive ? 'text-green-500' : 'text-red-500'}`} />
              <span className={isPositive ? 'text-green-600' : 'text-red-600'}>{displayChange}</span>
              <span className='ml-2 text-gray-500'>vs last period</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-${color}-50 dark:bg-${color}-900/20`}>
          <Icon className={`h-6 w-6 text-${color}-600 dark:text-${color}-400`} />
        </div>
      </div>
    </motion.div>
  );
};

interface OverviewDashboardProps {
  correlationSearch?: string;
  timeRange?: string;
}

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  correlationSearch = '',
  timeRange: timeRangeOption = '24h',
}) => {
  const { setIsPolling } = usePolling();
  const systemStatus = useSystemStatus();

  // Calculate the actual time range based on the selected option
  const timeRange = useMemo(() => {
    const now = new Date();
    let startDate: Date;

    switch (timeRangeOption) {
      case '1h':
        startDate = sub(now, { hours: 1 });
        break;
      case '6h':
        startDate = sub(now, { hours: 6 });
        break;
      case '24h':
        startDate = sub(now, { hours: 24 });
        break;
      case '7d':
        startDate = sub(now, { days: 7 });
        break;
      default:
        startDate = sub(now, { hours: 24 });
    }

    return startDate.toISOString();
  }, [timeRangeOption]);

  const { data, loading, error, networkStatus } = useOverviewDashboardQuery({
    variables: { timeRange },
    fetchPolicy: 'cache-and-network', // Use cache first, but fetch in background
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: true, // Enable to track refetch status
    pollInterval: 5000, // Poll every 5 seconds
  });

  // Track polling status for the Layout indicator
  useEffect(() => {
    const isRefetching = networkStatus === NetworkStatus.refetch;
    setIsPolling(isRefetching);
  }, [networkStatus, setIsPolling]);

  // Process the data for KPI cards - always call hooks in same order
  const totalInvocations = data?.invocations_aggregate?.aggregate?.count || 0;
  const avgDuration = Math.round(data?.invocations_aggregate?.aggregate?.avg?.total_duration_ms || 0);
  const totalJobsRun = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_run || 0;
  const totalJobsSucceeded = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_succeeded || 0;
  const totalJobsFailed = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_failed || 0;
  const successRate = totalJobsRun > 0 ? Math.round((totalJobsSucceeded / totalJobsRun) * 100) : 100;

  // Process hourly metrics for charts from invocations data
  // Generate all intervals in the selected range, filling in zeros for intervals with no data
  const hourlyMetrics = useMemo(() => {
    // Use chart-specific data (all records, minimal fields)
    const invocations = data?.invocations_chart || [];
    const now = new Date();
    let startDate: Date;
    let intervals: Date[];
    let formatKey: (date: Date) => string;
    let getIntervalStart: (date: Date) => Date;

    // Determine the start date and interval strategy based on time range
    switch (timeRangeOption) {
      case '1h':
        // For 1 hour, show 12 five-minute intervals
        startDate = sub(now, { hours: 1 });
        // Round start to nearest 5-minute boundary
        const startMinutes = startDate.getMinutes();
        const roundedStartMinutes = Math.floor(startMinutes / 5) * 5;
        const roundedStart = new Date(startDate);
        roundedStart.setMinutes(roundedStartMinutes, 0, 0);
        // Include the current 5-minute interval by adding 5 minutes to now before rounding down
        const endTime = addMinutes(now, 5);
        const endMinutes = endTime.getMinutes();
        const roundedEndMinutes = Math.floor(endMinutes / 5) * 5;
        const roundedEnd = new Date(endTime);
        roundedEnd.setMinutes(roundedEndMinutes, 0, 0);
        intervals = eachMinuteOfInterval({ start: roundedStart, end: roundedEnd }, { step: 5 });
        formatKey = date => format(date, 'HH:mm');
        getIntervalStart = date => {
          const minutes = date.getMinutes();
          const roundedMinutes = Math.floor(minutes / 5) * 5;
          const rounded = new Date(date);
          rounded.setMinutes(roundedMinutes, 0, 0);
          return rounded;
        };
        break;
      case '6h':
        // For 6 hours, show hourly intervals
        startDate = sub(now, { hours: 6 });
        // Include the current hour by adding 1 hour to now before rounding down
        intervals = eachHourOfInterval({ start: startOfHour(startDate), end: startOfHour(addHours(now, 1)) });
        formatKey = date => format(date, 'HH:mm');
        getIntervalStart = startOfHour;
        break;
      case '24h':
        // For 24 hours, show hourly intervals
        startDate = sub(now, { hours: 24 });
        // Include the current hour by adding 1 hour to now before rounding down
        intervals = eachHourOfInterval({ start: startOfHour(startDate), end: startOfHour(addHours(now, 1)) });
        formatKey = date => format(date, 'HH:mm');
        getIntervalStart = startOfHour;
        break;
      case '7d':
        // For 7 days, show daily intervals
        startDate = sub(now, { days: 7 });
        intervals = eachDayOfInterval({ start: startOfDay(startDate), end: startOfDay(now) });
        formatKey = date => format(date, 'MMM d');
        getIntervalStart = startOfDay;
        break;
      default:
        // Default to 24 hours
        startDate = sub(now, { hours: 24 });
        intervals = eachHourOfInterval({ start: startOfHour(startDate), end: startOfHour(now) });
        formatKey = date => format(date, 'HH:mm');
        getIntervalStart = startOfHour;
    }

    // Initialize all intervals with zero values
    const intervalMap = new Map<string, { hour: string; total: number; successful: number; failed: number }>();
    intervals.forEach(intervalDate => {
      const intervalKey = formatKey(intervalDate);
      intervalMap.set(intervalKey, { hour: intervalKey, total: 0, successful: 0, failed: 0 });
    });

    // Fill in actual data
    invocations.forEach(inv => {
      const invDate = new Date(inv.created_at);
      const intervalStart = getIntervalStart(invDate);
      const intervalKey = formatKey(intervalStart);
      if (intervalMap.has(intervalKey)) {
        const entry = intervalMap.get(intervalKey)!;
        entry.total += 1;
        if (inv.status === 'completed') entry.successful += 1;
        if (inv.status === 'failed') entry.failed += 1;
      }
    });

    return Array.from(intervalMap.values()).sort((a, b) => {
      // For date strings like "MMM d", we need to parse them, but for "HH:mm" we can compare directly
      if (timeRangeOption === '7d') {
        // Parse dates for proper sorting
        const dateA = new Date(a.hour);
        const dateB = new Date(b.hour);
        return dateA.getTime() - dateB.getTime();
      }
      return a.hour.localeCompare(b.hour);
    });
  }, [data?.invocations_chart, timeRangeOption]);

  // Get recent invocations for table (limited to 10 records)
  const recentInvocations = data?.invocations_table || [];

  // Handle loading and error states AFTER all hooks are called
  // Only show loading spinner on initial load, not on background refetch
  const isInitialLoading = loading && !data;
  if (isInitialLoading) {
    return (
      <div className='p-6 flex items-center justify-center h-64'>
        <div className='text-center'>
          <div className='inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600'></div>
          <p className='mt-2 text-gray-600 dark:text-gray-400'>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='p-6 flex items-center justify-center h-64'>
        <div className='text-center'>
          <ExclamationTriangleIcon className='mx-auto h-12 w-12 text-yellow-500 mb-4' />
          <p className='text-yellow-600 dark:text-yellow-400 mb-2'>Dashboard temporarily unavailable</p>
          <p className='text-sm text-gray-600 dark:text-gray-400'>
            The observability database tables may not be set up yet.
          </p>
          <p className='text-xs text-gray-500 dark:text-gray-500 mt-2'>Error: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='p-6 space-y-6'>
      {/* Page Header */}
      <div>
        <h1 className='text-2xl font-semibold text-gray-900 dark:text-white'>Overview Dashboard</h1>
        <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
          Real-time system metrics and performance indicators
        </p>
      </div>

      {/* Connection Status */}
      <DatabaseConnectionStatus
        error={error}
        loading={isInitialLoading}
        hasData={totalInvocations > 0}
        databaseInfo={systemStatus.databaseInfo}
      />

      {/* KPI Grid */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        <KPICard
          title='Total Invocations'
          value={totalInvocations.toLocaleString()}
          change='+12.5%'
          icon={CheckCircleIcon}
          color='blue'
        />
        <KPICard title='Success Rate' value={`${successRate}%`} change='+2.1%' icon={CheckCircleIcon} color='green' />
        <KPICard
          title='Avg Duration'
          value={formatDuration(avgDuration)}
          change='-8.3%'
          icon={ClockIcon}
          color='purple'
        />
        <KPICard
          title='Failed Jobs'
          value={totalJobsFailed.toLocaleString()}
          change='-15.2%'
          icon={XCircleIcon}
          color='red'
        />
      </div>

      {/* Charts Row */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Hourly Metrics Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'
        >
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>Hourly Performance Metrics</h3>
          <ResponsiveContainer width='100%' height={300}>
            <AreaChart data={hourlyMetrics}>
              <defs>
                <linearGradient id='colorSuccess' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#10b981' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='#10b981' stopOpacity={0} />
                </linearGradient>
                <linearGradient id='colorTotal' x1='0' y1='0' x2='0' y2='1'>
                  <stop offset='5%' stopColor='#3b82f6' stopOpacity={0.3} />
                  <stop offset='95%' stopColor='#3b82f6' stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray='3 3' stroke='#e5e7eb' />
              <XAxis dataKey='hour' stroke='#6b7280' />
              <YAxis stroke='#6b7280' />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#f3f4f6',
                }}
              />
              <Area
                type='monotone'
                dataKey='total'
                stroke='#3b82f6'
                fillOpacity={1}
                fill='url(#colorTotal)'
                strokeWidth={2}
              />
              <Area
                type='monotone'
                dataKey='successful'
                stroke='#10b981'
                fillOpacity={1}
                fill='url(#colorSuccess)'
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Event Detection Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'
        >
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white mb-4'>Event Detection Summary</h3>
          <div className='space-y-4'>
            <div className='flex justify-between items-center'>
              <span className='text-sm text-gray-600 dark:text-gray-400'>Events Detected</span>
              <span className='text-2xl font-semibold text-gray-900 dark:text-white'>
                {data?.event_executions_aggregate?.aggregate?.count || 0}
              </span>
            </div>
            <div className='flex justify-between items-center'>
              <span className='text-sm text-gray-600 dark:text-gray-400'>Jobs Executed</span>
              <span className='text-2xl font-semibold text-gray-900 dark:text-white'>
                {totalJobsRun.toLocaleString()}
              </span>
            </div>
            <div className='flex justify-between items-center'>
              <span className='text-sm text-gray-600 dark:text-gray-400'>Success Rate</span>
              <span className='text-2xl font-semibold text-green-600 dark:text-green-400'>{successRate}%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Events Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700'
      >
        <div className='px-6 py-4 border-b border-gray-200 dark:border-gray-700'>
          <h3 className='text-lg font-semibold text-gray-900 dark:text-white'>Recent Invocations</h3>
        </div>
        <div className='overflow-x-auto'>
          {/* Scoped fix: remove any ::before/::after pseudo-elements on rows */}
          <style>{`
            /* Scope by data attribute so we don't affect other tables */
            [data-dashboard-table] tbody tr::before,
            [data-dashboard-table] tbody tr::after {
              content: none !important;
              display: none !important;
            }
          `}</style>
          <table className='w-full' data-dashboard-table>
            <thead className='bg-gray-50 dark:bg-gray-700/50'>
              <tr>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Function
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Correlation ID
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  User
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Duration
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Status
                </th>
                <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Time
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
              {recentInvocations.map(invocation => (
                <tr key={invocation.id} className='hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer'>
                  <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                    {invocation.source_function}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono'>
                    {invocation.correlation_id || 'N/A'}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400'>
                    {invocation.source_user_email || 'N/A'}
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400'>
                    {invocation.total_duration_ms || 0}ms
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap'>
                    <span
                      className={`
                      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${
                        invocation.status === 'completed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : invocation.status === 'failed'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                      }
                    `}
                    >
                      {invocation.status}
                    </span>
                  </td>
                  <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400'>
                    {format(new Date(invocation.created_at), 'MMM d, HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default OverviewDashboard;
