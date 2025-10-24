import React from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, NodeProps } from 'reactflow';
import { formatDuration } from '../../utils/formatDuration';
import { useRunningDuration } from '../../hooks/useRunningDuration';

export interface EventNodeData {
  eventName: string;
  correlationId: string;
  detected: boolean;
  status: string;
  detectionDuration: number;
  handlerDuration?: number;
  jobsCount: number;
  hasFailedJobs: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const EventNode: React.FC<NodeProps<EventNodeData>> = ({ data, selected }) => {
  const isDetected = data.detected;
  const hasFailedJobs = data.hasFailedJobs;
  const hasErrors = isDetected && hasFailedJobs;

  // Use running duration hook for detection duration
  const liveDetectionDuration = useRunningDuration({
    status: data.status,
    createdAt: data.createdAt,
    completedDurationMs: data.detectionDuration
  });

  // Use running duration hook for handler duration (if applicable)
  const liveHandlerDuration = data.handlerDuration ? useRunningDuration({
    status: data.status,
    createdAt: data.createdAt,
    completedDurationMs: data.handlerDuration
  }) : undefined;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: selected ? 1.05 : 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2
        ${hasErrors ? 'border-red-500' : isDetected ? 'border-green-500' : 'border-gray-300 opacity-60'}
        ${selected ? `ring-4 ${hasErrors ? 'ring-red-500 ring-opacity-75 shadow-2xl' : 'ring-green-500 ring-opacity-75 shadow-2xl'}` : 'shadow-md'}
        hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[220px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Status-colored accent strip - thicker when selected */}
      <div className={`absolute left-0 top-0 bottom-0 ${selected ? 'w-2' : 'w-1'} ${hasErrors ? 'bg-red-500' : 'bg-green-500'} rounded-l-lg transition-all duration-200`} />

      <div className='p-3 pl-4'>
        <div className='flex items-center justify-between mb-1'>
          <span className={`text-xs font-semibold ${hasErrors ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'} uppercase tracking-wide`}>
            Event
          </span>
          {isDetected && hasErrors && (
            <svg className='w-4 h-4 text-red-500' fill='currentColor' viewBox='0 0 20 20'>
              <path
                fillRule='evenodd'
                d='M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z'
                clipRule='evenodd'
              />
            </svg>
          )}
          {isDetected && !hasErrors && (
            <svg className='w-4 h-4 text-green-500' fill='currentColor' viewBox='0 0 20 20'>
              <path
                fillRule='evenodd'
                d='M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z'
                clipRule='evenodd'
              />
            </svg>
          )}
        </div>

        <p className='font-medium text-gray-900 dark:text-white text-sm'>{data.eventName}</p>

        <div className='mt-1 flex items-center space-x-2'>
          <span
            className='relative inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors group'
            title={`Detection took ${formatDuration(liveDetectionDuration)}`}
          >
            {formatDuration(liveDetectionDuration)}
            <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50'>
              Detection took {formatDuration(liveDetectionDuration)}
              <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900'></div>
            </div>
          </span>

          {isDetected && liveHandlerDuration !== undefined && (
            <span
              className='relative inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors group'
              title={`Handler took ${formatDuration(liveHandlerDuration)}`}
            >
              {formatDuration(liveHandlerDuration)}
              <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50'>
                Handler took {formatDuration(liveHandlerDuration)}
                <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900'></div>
              </div>
            </span>
          )}

          {!isDetected && (
            <span className='text-xs text-gray-500'>Not detected</span>
          )}
        </div>
      </div>

      {isDetected && (
        <>
          <Handle type='source' position={Position.Right} className='w-3 h-3' />
          {/* Job count badge positioned near the right connector */}
          <div className='absolute -right-2 top-1/2 transform -translate-y-1/2 translate-x-full'>
            <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-700 shadow-sm'>
              {data.jobsCount} jobs
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
};

export default EventNode;