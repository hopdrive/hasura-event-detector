import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatDuration } from '../../utils/formatDuration';

export interface GroupedEventsNodeData {
  totalCount: number;
  detectedCount: number;
  undetectedCount: number;
  events?: Array<{
    name: string;
    detected: boolean;
    duration: number;
  }>;
  invocationId: string;
}

export const GroupedEventsNode: React.FC<NodeProps<GroupedEventsNodeData>> = ({ data, selected }) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetectedEvents = data.detectedCount > 0;
  const hasUndetectedEvents = data.undetectedCount > 0;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-400 dark:border-gray-500
        ${selected ? 'ring-4 ring-gray-400 ring-opacity-50' : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        ${expanded ? 'min-w-[280px]' : 'min-w-[200px]'}
      `}
      onClick={() => setExpanded(!expanded)}
    >
      <Handle type='target' position={Position.Top} id='top' className='w-3 h-3' />

      {/* Gray accent strip */}
      <div className='absolute left-0 top-0 bottom-0 w-1 bg-gray-400 dark:bg-gray-500 rounded-l-lg' />

      <div className='p-4 pl-5'>
        <div className='flex items-center justify-between mb-2'>
          <span className='text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider'>
            Ignored Events
          </span>
          <div className='flex items-center space-x-1'>
            {expanded ? (
              <ChevronDownIcon className='h-4 w-4 text-gray-500' />
            ) : (
              <ChevronRightIcon className='h-4 w-4 text-gray-500' />
            )}
          </div>
        </div>

        {!expanded ? (
          // Collapsed View - Compact Summary
          <div className='space-y-2'>
            <div className='flex items-center space-x-3 text-xs'>
              {hasDetectedEvents && (
                <div className='flex items-center space-x-1'>
                  <div className='w-2 h-2 bg-green-500 rounded-full' />
                  <span className='text-green-600 dark:text-green-400 font-medium'>{data.detectedCount} detected</span>
                </div>
              )}
              {hasUndetectedEvents && (
                <div className='flex items-center space-x-1'>
                  <div className='w-2 h-2 bg-gray-400 rounded-full' />
                  <span className='text-gray-500'>{data.undetectedCount} not detected</span>
                </div>
              )}
            </div>
            <div className='text-xs text-gray-500'>Click to expand</div>
          </div>
        ) : (
          // Expanded View - Show Individual Events
          <div className='space-y-3'>
            <div className='space-y-2 max-h-48 overflow-y-auto'>
              {data.events?.map((event, index) => (
                <div
                  key={index}
                  className={`p-2 rounded border-l-3 ${
                    event.detected
                      ? 'border-l-green-400 bg-green-50 dark:bg-green-900/20'
                      : 'border-l-gray-300 bg-gray-50 dark:bg-gray-900/20'
                  }`}
                >
                  <div className='flex items-center justify-between'>
                    <span className='text-xs font-medium text-gray-900 dark:text-white'>{event.name}</span>
                    <span
                      className={`text-xs ${event.detected ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}
                    >
                      {event.detected ? '✓' : '○'}
                    </span>
                  </div>
                  <div className='text-xs text-gray-600 dark:text-gray-400 mt-1'>{formatDuration(event.duration)}</div>
                </div>
              ))}
            </div>
            <div className='text-xs text-gray-500 pt-2 border-t'>Click to collapse</div>
          </div>
        )}
      </div>

      <Handle type='source' position={Position.Right} className='w-3 h-3' />
    </motion.div>
  );
};

export default GroupedEventsNode;