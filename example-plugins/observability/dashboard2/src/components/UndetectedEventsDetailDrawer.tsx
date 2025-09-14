import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, ExclamationCircleIcon, ClockIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { Node } from 'reactflow';
import { formatDuration } from '../utils/formatDuration';

interface UndetectedEventsDetailDrawerProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
}

const TabButton = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 text-sm font-medium rounded-lg transition-all
      ${active
        ? 'bg-gray-50 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
      }
    `}
  >
    {children}
  </button>
);

const UndetectedEventsDetailDrawer: React.FC<UndetectedEventsDetailDrawerProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('summary');

  if (!node || node.type !== 'groupedEvents') return null;

  const groupedData = node.data;
  const undetectedEvents = groupedData.events || [];

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed right-0 top-0 h-full w-[700px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Undetected Events
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {groupedData.undetectedCount} event{groupedData.undetectedCount !== 1 ? 's' : ''} did not meet detection criteria
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mt-4">
          <TabButton
            active={activeTab === 'summary'}
            onClick={() => setActiveTab('summary')}
          >
            Summary
          </TabButton>
          <TabButton
            active={activeTab === 'events'}
            onClick={() => setActiveTab('events')}
          >
            Event Details
          </TabButton>
          <TabButton
            active={activeTab === 'analysis'}
            onClick={() => setActiveTab('analysis')}
          >
            Analysis
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase">
                Undetected Events Summary
              </label>
              <div className="mt-3 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {groupedData.undetectedCount}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Total Events
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {formatDuration(Math.round((undetectedEvents.reduce((sum, event) => sum + (event.duration || 0), 0) / undetectedEvents.length) || 0))}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Avg Detection Time
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                    {new Set(undetectedEvents.map(e => e.name)).size}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    Unique Event Types
                  </div>
                </div>
              </div>
            </div>

            {/* Status Banner */}
            <div className="p-4 rounded-lg border-l-4 bg-gray-50 border-l-gray-400 dark:bg-gray-900/20 dark:border-l-gray-400">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Events Not Detected
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    These events were evaluated but did not meet their detection criteria.
                    This is normal behavior when events are designed for specific conditions.
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
                  ○ Not Detected
                </span>
              </div>
            </div>

            {/* Event Type Breakdown */}
            <div className="space-y-3">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                Event Types
              </h4>
              {Array.from(new Set(undetectedEvents.map(e => e.name))).map(eventName => {
                const eventsOfType = undetectedEvents.filter(e => e.name === eventName);
                const avgDuration = eventsOfType.reduce((sum, e) => sum + (e.duration || 0), 0) / eventsOfType.length;

                return (
                  <div key={eventName} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                      <div>
                        <h5 className="font-medium text-gray-900 dark:text-white">
                          {eventName}
                        </h5>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {eventsOfType.length} occurrence{eventsOfType.length !== 1 ? 's' : ''} •
                          Avg: {formatDuration(avgDuration)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-gray-500">
                        {eventsOfType.length}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                All Undetected Events
              </h4>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {undetectedEvents.length} events
              </span>
            </div>

            {/* Event List */}
            <div className="space-y-3">
              {undetectedEvents.map((event, index) => (
                <div key={index} className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <ExclamationCircleIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <h5 className="font-medium text-gray-900 dark:text-white">
                          {event.name}
                        </h5>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Detection Time:</span>
                          <span className="ml-2 font-medium text-gray-900 dark:text-white">
                            {formatDuration(event.duration)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Status:</span>
                          <span className="ml-2 font-medium text-gray-600 dark:text-gray-400">
                            Not Detected
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <ClockIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                        {formatDuration(event.duration)}
                      </span>
                    </div>
                  </div>

                  {/* Event-specific info if available */}
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      This event module evaluated the payload but the detection conditions were not met.
                      This could be due to specific field values, payload structure, or business logic requirements.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analysis' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Detection Analysis
              </h4>

              {/* Performance Analysis */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 mb-6">
                <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-3">
                  Performance Overview
                </h5>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded text-center">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatDuration(undetectedEvents.reduce((sum, e) => sum + (e.duration || 0), 0))}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-400">
                      Total Detection Time
                    </div>
                  </div>
                  <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded text-center">
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {formatDuration(Math.round((undetectedEvents.reduce((sum, e) => sum + (e.duration || 0), 0) / undetectedEvents.length) || 0))}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-400">
                      Average per Event
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-600 dark:text-blue-400">Detection Efficiency:</span>
                    <span className="font-medium text-blue-700 dark:text-blue-400">
                      {undetectedEvents.every(e => (e.duration || 0) < 50) ? 'Excellent' :
                       undetectedEvents.every(e => (e.duration || 0) < 100) ? 'Good' : 'Needs Review'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600 dark:text-blue-400">Event Types:</span>
                    <span className="font-medium text-blue-700 dark:text-blue-400">
                      {new Set(undetectedEvents.map(e => e.name)).size} unique
                    </span>
                  </div>
                </div>
              </div>

              {/* Common Patterns */}
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                <h5 className="font-medium text-yellow-700 dark:text-yellow-400 mb-3">
                  Why Events Might Not Be Detected
                </h5>
                <ul className="text-sm text-yellow-600 dark:text-yellow-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>Payload data doesn't match the expected structure or values</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>Business logic conditions are not satisfied</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>Event is designed for specific scenarios that didn't occur</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>Required fields are missing or have unexpected values</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-500 mt-0.5">•</span>
                    <span>Timing or sequence dependencies are not met</span>
                  </li>
                </ul>
              </div>

              {/* Optimization Tips */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <h5 className="font-medium text-green-700 dark:text-green-400 mb-3">
                  Optimization Opportunities
                </h5>
                <ul className="text-sm text-green-600 dark:text-green-400 space-y-2">
                  <li className="flex items-start space-x-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Review detection logic for frequently undetected events</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Consider if detection criteria are too strict</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Add logging to understand why specific events aren't detected</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <span className="text-green-500 mt-0.5">•</span>
                    <span>Monitor detection patterns over time</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default UndetectedEventsDetailDrawer;