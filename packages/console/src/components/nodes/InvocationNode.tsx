import React from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, NodeProps } from 'reactflow';
import { formatDuration } from '../../utils/formatDuration';
import { useRunningDuration } from '../../hooks/useRunningDuration';

export interface InvocationNodeData {
  sourceFunction: string;
  correlationId: string;
  status: string;
  duration: number;
  eventsCount: number;
  events?: any[];
  detectedEvents?: any[];
  undetectedEvents?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export const InvocationNode: React.FC<NodeProps<InvocationNodeData>> = ({ data, selected }) => {
  // Use running duration hook for live updates
  const liveDuration = useRunningDuration({
    status: data.status,
    createdAt: data.createdAt,
    completedDurationMs: data.duration
  });

  const statusColors = {
    completed: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    failed: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    running: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
  };

  const statusDots = {
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500 animate-pulse',
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: selected ? 1.05 : 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2
        ${selected ? 'border-blue-600 ring-4 ring-blue-500 ring-opacity-75 shadow-2xl' : 'border-blue-500 shadow-lg'}
        hover:shadow-xl transition-all duration-200 cursor-pointer
        min-w-[240px]
      `}
    >
      <Handle type='target' position={Position.Left} id='left' className='w-3 h-3' />

      {/* Blue accent strip - thicker when selected */}
      <div className={`absolute left-0 top-0 bottom-0 ${selected ? 'w-2' : 'w-1'} bg-blue-500 rounded-l-lg transition-all duration-200`} />

      <div className='p-4 pl-5'>
        <div className='flex items-center justify-between mb-2'>
          <span className='text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide'>
            Invocation
          </span>
          <div className={`w-2 h-2 rounded-full ${statusDots[data.status as keyof typeof statusDots]}`} />
        </div>

        <div className='space-y-1'>
          <p className='font-semibold text-gray-900 dark:text-white text-sm'>{data.sourceFunction}</p>
          <p className='text-xs text-gray-600 dark:text-gray-400'>
            {formatDuration(liveDuration)} • {data.eventsCount} events
          </p>
          <p className='text-xs text-gray-500 dark:text-gray-500 font-mono truncate'>{data.correlationId}</p>
        </div>
      </div>

      <Handle type='source' position={Position.Right} id='right' className='w-3 h-3' />

      {/* Event count badge positioned near the right connector */}
      {data.eventsCount > 0 && (
        <div className='absolute -right-2 top-1/2 transform -translate-y-1/2 translate-x-full'>
          <span className='inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-700 shadow-sm'>
            {data.eventsCount} events
          </span>
        </div>
      )}

      <Handle type='source' position={Position.Bottom} id='bottom' className='w-3 h-3' />
    </motion.div>
  );
};

export default InvocationNode;