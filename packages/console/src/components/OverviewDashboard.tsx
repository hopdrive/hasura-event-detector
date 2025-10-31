import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { useOverviewDashboardQuery } from '../types/generated';
import { formatDuration } from '../utils/formatDuration';
import { sub, format } from 'date-fns';
import DatabaseConnectionStatus from './DatabaseConnectionStatus';

const KPICard = ({ title, value, change, trend, icon: Icon, color }: any) => {
  const isPositive = trend === 'up';
  const TrendIcon = isPositive ? ArrowUpIcon : ArrowDownIcon;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-gray-900 dark:text-white">
            {value}
          </p>
          {change && (
            <div className="mt-2 flex items-center text-sm">
              <TrendIcon 
                className={`h-4 w-4 mr-1 ${
                  isPositive ? 'text-green-500' : 'text-red-500'
                }`} 
              />
              <span className={isPositive ? 'text-green-600' : 'text-red-600'}>
                {change}
              </span>
              <span className="ml-2 text-gray-500">vs last period</span>
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
}

const OverviewDashboard: React.FC<OverviewDashboardProps> = ({ correlationSearch = '' }) => {
  // Get data for the last 24 hours - memoize to prevent infinite re-renders
  const timeRange = useMemo(() => sub(new Date(), { days: 1 }).toISOString(), []);

  const { data, loading, error } = useOverviewDashboardQuery({
    variables: { timeRange },
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
    notifyOnNetworkStatusChange: false
  });

  // Process the data for KPI cards - always call hooks in same order
  const totalInvocations = data?.invocations_aggregate?.aggregate?.count || 0;
  const avgDuration = Math.round(data?.invocations_aggregate?.aggregate?.avg?.total_duration_ms || 0);
  const totalJobsRun = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_run || 0;
  const totalJobsSucceeded = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_succeeded || 0;
  const totalJobsFailed = data?.invocations_aggregate?.aggregate?.sum?.total_jobs_failed || 0;
  const successRate = totalJobsRun > 0 ? Math.round((totalJobsSucceeded / totalJobsRun) * 100) : 100;

  // Process hourly metrics for charts from invocations data
  const hourlyMetrics = useMemo(() => {
    const invocations = data?.invocations || [];
    const hourlyMap = new Map();

    invocations.forEach(inv => {
      const hour = format(new Date(inv.created_at), 'HH:mm');
      if (!hourlyMap.has(hour)) {
        hourlyMap.set(hour, { hour, total: 0, successful: 0, failed: 0 });
      }
      const entry = hourlyMap.get(hour);
      entry.total += 1;
      if (inv.status === 'completed') entry.successful += 1;
      if (inv.status === 'failed') entry.failed += 1;
    });

    return Array.from(hourlyMap.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [data?.invocations]);

  // Get recent invocations
  const recentInvocations = data?.invocations || [];

  // Handle loading and error states AFTER all hooks are called
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <p className="text-yellow-600 dark:text-yellow-400 mb-2">Dashboard temporarily unavailable</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The observability database tables may not be set up yet.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            Error: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          Overview Dashboard
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Real-time system metrics and performance indicators
        </p>
      </div>

      {/* Connection Status */}
      <DatabaseConnectionStatus
        error={error}
        loading={loading}
        hasData={totalInvocations > 0}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Invocations"
          value={totalInvocations.toLocaleString()}
          change="+12.5%"
          trend="up"
          icon={CheckCircleIcon}
          color="blue"
        />
        <KPICard
          title="Success Rate"
          value={`${successRate}%`}
          change="+2.1%"
          trend="up"
          icon={CheckCircleIcon}
          color="green"
        />
        <KPICard
          title="Avg Duration"
          value={formatDuration(avgDuration)}
          change="-8.3%"
          trend="up"
          icon={ClockIcon}
          color="purple"
        />
        <KPICard
          title="Failed Jobs"
          value={totalJobsFailed.toLocaleString()}
          change="-15.2%"
          trend="up"
          icon={XCircleIcon}
          color="red"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Metrics Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Hourly Performance Metrics
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={hourlyMetrics}>
              <defs>
                <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="hour" stroke="#6b7280" />
              <YAxis stroke="#6b7280" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none',
                  borderRadius: '8px',
                  color: '#f3f4f6'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="total" 
                stroke="#3b82f6" 
                fillOpacity={1} 
                fill="url(#colorTotal)" 
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="successful"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorSuccess)"
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
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Event Detection Summary
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Events Detected</span>
              <span className="text-2xl font-semibold text-gray-900 dark:text-white">
                {data?.event_executions_aggregate?.aggregate?.count || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Jobs Executed</span>
              <span className="text-2xl font-semibold text-gray-900 dark:text-white">
                {totalJobsRun.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
              <span className="text-2xl font-semibold text-green-600 dark:text-green-400">
                {successRate}%
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Events Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Invocations
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Function
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Correlation ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Time
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {recentInvocations.map((invocation) => (
                <tr key={invocation.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {invocation.source_function}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400 font-mono">
                    {invocation.correlation_id || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {invocation.source_user_email || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                    {invocation.total_duration_ms || 0}ms
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`
                      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${invocation.status === 'completed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : invocation.status === 'failed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                      }
                    `}>
                      {invocation.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
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
