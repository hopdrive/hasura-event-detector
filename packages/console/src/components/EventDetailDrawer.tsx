import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Node } from 'reactflow';
import { formatDuration } from '../utils/formatDuration';
import LogsViewer from './LogsViewer';
import { createGrafanaService } from '../services/GrafanaService';

interface EventDetailDrawerProps {
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
        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
      }
    `}
  >
    {children}
  </button>
);

const EventDetailDrawer: React.FC<EventDetailDrawerProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('summary');

  if (!node || node.type !== 'event') return null;

  const eventData = node.data;

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="fixed right-0 top-0 h-full w-[600px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              {eventData.detected ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                <ExclamationCircleIcon className="h-5 w-5 text-gray-400" />
              )}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Event Module Details
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1">
              {eventData.eventName}
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
            active={activeTab === 'detection'}
            onClick={() => setActiveTab('detection')}
          >
            Detection Logic
          </TabButton>
          <TabButton
            active={activeTab === 'performance'}
            onClick={() => setActiveTab('performance')}
          >
            Performance
          </TabButton>
          <TabButton
            active={activeTab === 'logs'}
            onClick={() => setActiveTab('logs')}
          >
            Logs
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            {/* Event Record ID - prominently displayed */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
              <label className="text-xs font-medium text-green-600 dark:text-green-400 uppercase">
                Event Execution ID
              </label>
              <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">
                {node.id.replace('event-', '')}
              </p>
            </div>

            {/* Detection Status Banner */}
            <div className={`p-4 rounded-lg border-l-4 ${
              eventData.detected
                ? 'bg-green-50 border-l-green-500 dark:bg-green-900/20 dark:border-l-green-400'
                : 'bg-gray-50 border-l-gray-400 dark:bg-gray-900/20 dark:border-l-gray-400'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Event {eventData.detected ? 'Detected' : 'Not Detected'}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {eventData.detected ?
                      `Detection completed in ${formatDuration(eventData.detectionDuration)}` :
                      `Detection check completed in ${formatDuration(eventData.detectionDuration)}`
                    }
                  </p>
                </div>
                <span className={`
                  inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                  ${eventData.detected
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                  }
                `}>
                  {eventData.detected ? '✓ Detected' : '○ Not Detected'}
                </span>
              </div>
            </div>

            {/* Event Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Event Name
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {eventData.eventName}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {eventData.status}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Detection Time
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {formatDuration(eventData.detectionDuration)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Handler Time
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {eventData.handlerDuration ? formatDuration(eventData.handlerDuration) : 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Jobs Triggered
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {eventData.jobsCount || 0}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Correlation ID
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white font-mono truncate">
                  {eventData.correlationId}
                </p>
              </div>
            </div>

            {/* Jobs Summary */}
            {eventData.detected && eventData.jobsCount > 0 && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-purple-700 dark:text-purple-400">
                      Jobs Executed
                    </h4>
                    <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                      {eventData.jobsCount} job{eventData.jobsCount > 1 ? 's' : ''} triggered by this event
                    </p>
                  </div>
                  <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {eventData.jobsCount}
                  </span>
                </div>
              </div>
            )}

            {/* No Detection Explanation */}
            {!eventData.detected && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-start space-x-3">
                  <ExclamationCircleIcon className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-700 dark:text-yellow-400">
                      Event Not Detected
                    </h4>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      The event detection logic evaluated to false for this payload.
                      This could be due to specific conditions not being met, payload structure,
                      or the event simply not being applicable to this data change.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'detection' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Detection Logic Overview
              </h4>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <h5 className="font-medium text-gray-900 dark:text-white mb-2">
                    Event Module: {eventData.eventName}
                  </h5>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This event module analyzes incoming payload data to determine if the specific
                    conditions for "{eventData.eventName}" have been met.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center space-x-2 mb-2">
                      <ClockIcon className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        Detection Phase
                      </span>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Duration: {formatDuration(eventData.detectionDuration)}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Result: {eventData.detected ? 'Positive' : 'Negative'}
                    </p>
                  </div>

                  {eventData.detected && eventData.handlerDuration && (
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="flex items-center space-x-2 mb-2">
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          Handler Phase
                        </span>
                      </div>
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Duration: {formatDuration(eventData.handlerDuration)}
                      </p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Jobs: {eventData.jobsCount}
                      </p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-900 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-gray-300 mb-3">
                    Typical Event Detection Pattern
                  </h5>
                  <pre className="text-sm text-gray-400 font-mono overflow-x-auto">
{`// Event: ${eventData.eventName}
export default async function detect(payload, context) {
  // Analyze payload for specific conditions
  const conditions = [
    payload.data?.status === 'target_status',
    payload.data?.field_changed === true,
    // ... other conditions
  ];

  return conditions.every(Boolean);
}`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Performance Metrics
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {formatDuration(eventData.detectionDuration)}
                  </div>
                  <div className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                    Detection Time
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                    Time to evaluate detection logic
                  </div>
                </div>

                {eventData.handlerDuration && (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatDuration(eventData.handlerDuration)}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-400 font-medium">
                      Handler Time
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                      Time to process and queue jobs
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h5 className="font-medium text-gray-900 dark:text-white mb-3">
                  Performance Analysis
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Detection Efficiency:</span>
                    <span className={`font-medium ${
                      eventData.detectionDuration < 10 ? 'text-green-600 dark:text-green-400' :
                      eventData.detectionDuration < 50 ? 'text-yellow-600 dark:text-yellow-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {eventData.detectionDuration < 10 ? 'Excellent' :
                       eventData.detectionDuration < 50 ? 'Good' : 'Needs Optimization'}
                    </span>
                  </div>

                  {eventData.handlerDuration && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Handler Efficiency:</span>
                      <span className={`font-medium ${
                        eventData.handlerDuration < 20 ? 'text-green-600 dark:text-green-400' :
                        eventData.handlerDuration < 100 ? 'text-yellow-600 dark:text-yellow-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {eventData.handlerDuration < 20 ? 'Excellent' :
                         eventData.handlerDuration < 100 ? 'Good' : 'Needs Optimization'}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total Processing:</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatDuration((eventData.detectionDuration || 0) + (eventData.handlerDuration || 0))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                  Performance Tips
                </h5>
                <ul className="text-sm text-blue-600 dark:text-blue-400 space-y-1">
                  <li>• Keep detection logic simple and fast</li>
                  <li>• Avoid complex database queries in detection phase</li>
                  <li>• Use indexes for database lookups</li>
                  <li>• Consider caching frequently accessed data</li>
                  <li>• Monitor detection times across different payload types</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 mb-4">
              <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                Event Execution Logs
              </h5>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Viewing logs from Grafana Loki for this event execution and all associated jobs.
                Logs are filtered by correlationId and eventExecutionId.
              </p>
            </div>

            {(() => {
              const grafanaService = createGrafanaService();

              if (!grafanaService) {
                return (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p>Grafana is not configured.</p>
                    <p className="text-sm mt-1">
                      Set VITE_GRAFANA_HOST, VITE_GRAFANA_ID, and VITE_GRAFANA_SECRET environment variables.
                    </p>
                  </div>
                );
              }

              const correlationId = eventData.correlationId;
              const eventExecutionId = node.id.replace('event-', '');

              return (
                <LogsViewer
                  queryFn={() => grafanaService.queryEventLogs(correlationId, eventExecutionId, 15)}
                  autoRefresh={false}
                  isJobRunning={false}
                  refreshInterval={5000}
                />
              );
            })()}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default EventDetailDrawer;