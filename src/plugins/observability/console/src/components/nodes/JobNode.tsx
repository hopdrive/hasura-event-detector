import React from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, NodeProps } from 'reactflow';
import { formatDuration } from '../../utils/formatDuration';
import { useRunningDuration } from '../../hooks/useRunningDuration';

export interface JobNodeData {
  jobName: string;
  functionName?: string;
  correlationId: string;
  status: string;
  duration: number;
  result?: any;
  error?: string;
  triggersInvocation?: boolean;
  isSourceJob?: boolean;
  triggeredInvocationsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const JobNode: React.FC<NodeProps<JobNodeData>> = ({ data, selected }) => {
  // Use running duration hook for live updates
  const liveDuration = useRunningDuration({
    status: data.status,
    createdAt: data.createdAt,
    completedDurationMs: data.duration
  });

  const statusColors = {
    completed: {
      border: 'border-purple-500',
      accent: 'bg-purple-500',
      text: 'text-purple-600 dark:text-purple-400',
      ring: 'ring-purple-400'
    },
    failed: {
      border: 'border-red-500',
      accent: 'bg-red-500',
      text: 'text-red-600 dark:text-red-400',
      ring: 'ring-red-400'
    },
    running: {
      border: 'border-blue-500',
      accent: 'bg-blue-500',
      text: 'text-blue-600 dark:text-blue-400',
      ring: 'ring-blue-400'
    },
  };

  const hasRecursion = data.triggersInvocation;
  const isSourceJob = data.isSourceJob;
  const needsSourceHandle = hasRecursion || isSourceJob;
  const status = data.status || 'completed';
  const colors = statusColors[status as keyof typeof statusColors] || statusColors.completed;
  const isFailed = status === 'failed';
  const invocationCount = data.triggeredInvocationsCount || 0;


  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 ${colors.border}
        ${selected ? `ring-4 ${colors.ring} ring-opacity-50` : ''}
        ${needsSourceHandle ? `ring-2 ${colors.border.replace('border-', 'ring-')} ring-offset-2` : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[180px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Status-colored accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.accent} rounded-l-lg`} />

      <div className='p-3 pl-4'>
        <div className='flex items-center justify-between mb-1'>
          <span className={`text-xs font-semibold ${colors.text} uppercase tracking-wide`}>
            Job
          </span>
          <div className='flex items-center space-x-1'>
            {isFailed && (
              <svg className='w-4 h-4 text-red-500' fill='currentColor' viewBox='0 0 20 20'>
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
                  clipRule='evenodd'
                />
              </svg>
            )}
            {status === 'completed' && !isFailed && (
              <svg className='w-4 h-4 text-green-500' fill='currentColor' viewBox='0 0 20 20'>
                <path
                  fillRule='evenodd'
                  d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z'
                  clipRule='evenodd'
                />
              </svg>
            )}
            {hasRecursion && (
              <div className='relative'>
                <svg className='w-4 h-4 text-purple-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
                  />
                </svg>
                {invocationCount > 0 && (
                  <span className='absolute -top-1 -right-1 bg-purple-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold'>
                    {invocationCount}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <p className='font-medium text-gray-900 dark:text-white text-sm'>{data.jobName}</p>
        <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>{formatDuration(liveDuration)}</p>
        {hasRecursion && (
          <p className='text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium'>→ Triggers new invocation</p>
        )}
        {isSourceJob && !hasRecursion && (
          <p className='text-xs text-blue-600 dark:text-blue-400 mt-1 font-medium'>→ Source job</p>
        )}
      </div>

      {/* Always render handle for source jobs to avoid React Flow timing issues */}
      <Handle
        type='source'
        position={Position.Right}
        id='right'
        className={`w-3 h-3 ${needsSourceHandle ? '' : 'opacity-0 pointer-events-none'}`}
      />
    </motion.div>
  );
};

export default JobNode;