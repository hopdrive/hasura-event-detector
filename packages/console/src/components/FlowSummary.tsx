import React from 'react';
import { motion } from 'framer-motion';

interface FlowSummaryData {
  totalInvocations: number;
  totalEvents: number;
  detectedEvents: number;
  undetectedEvents: number;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  runningJobs: number;
}

interface FlowSummaryProps {
  data: FlowSummaryData;
}

export const FlowSummary: React.FC<FlowSummaryProps> = ({ data }) => {
  const eventDetectionRate = data.totalEvents > 0 ? (data.detectedEvents / data.totalEvents * 100) : 0;
  const jobSuccessRate = data.totalJobs > 0 ? (data.successfulJobs / data.totalJobs * 100) : 0;

  const stats = [
    {
      label: 'Invocations',
      value: data.totalInvocations,
      subtitle: `${data.totalInvocations === 1 ? '1 invocation' : `${data.totalInvocations} invocations`} in tree`,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      icon: '⚡'
    },
    {
      label: 'Events',
      value: data.totalEvents,
      subtitle: `${data.detectedEvents} detected, ${data.undetectedEvents} not detected`,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      icon: '📡',
      percentage: Math.round(eventDetectionRate)
    },
    {
      label: 'Jobs',
      value: data.totalJobs,
      subtitle: `${data.successfulJobs} successful, ${data.failedJobs} failed${data.runningJobs > 0 ? `, ${data.runningJobs} running` : ''}`,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      icon: '⚙️',
      percentage: Math.round(jobSuccessRate)
    }
  ];

  return (
    <div className="flex items-center space-x-6">
      {stats.map((stat, index) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className={`${stat.bgColor} rounded-lg px-4 py-3 min-w-[140px]`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {stat.label}
            </span>
            <span className="text-lg">{stat.icon}</span>
          </div>

          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </span>
            {stat.percentage !== undefined && (
              <span className={`text-sm font-medium ${stat.color}`}>
                {stat.percentage}%
              </span>
            )}
          </div>

          {stat.subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-tight">
              {stat.subtitle}
            </p>
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default FlowSummary;