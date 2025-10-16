import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, ChevronRightIcon, ChevronDownIcon, PlayIcon } from '@heroicons/react/24/outline';
import { JSONTree } from 'react-json-tree';
import { create, formatters } from 'jsondiffpatch';
import { Node } from 'reactflow';
import { formatDuration } from '../utils/formatDuration';
import { useInvocationDetailQuery } from '../types/generated';
import LogsViewer from './LogsViewer';
import { createGrafanaService } from '../services/GrafanaService';

interface InvocationDetailDrawerProps {
  node: Node | null;
  isOpen: boolean;
  onClose: () => void;
}

// JSON Diff Viewer Component
interface JsonDiffViewerProps {
  oldData: any;
  newData: any;
  jsondiff: any;
}

const JsonDiffViewer: React.FC<JsonDiffViewerProps> = ({ oldData, newData, jsondiff }) => {
  const delta = jsondiff.diff(oldData, newData);

  if (!delta) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No changes detected between old and new payloads</p>
      </div>
    );
  }

  const renderDiffValue = (key: string, value: any, type: 'added' | 'removed' | 'modified') => {
    const bgColor = type === 'added' ? 'bg-green-900/20' :
                    type === 'removed' ? 'bg-red-900/20' :
                    'bg-blue-900/20';
    const textColor = type === 'added' ? 'text-green-400' :
                      type === 'removed' ? 'text-red-400' :
                      'text-blue-400';
    const prefix = type === 'added' ? '+ ' :
                   type === 'removed' ? '- ' :
                   '~ ';

    return (
      <div key={key} className={`p-2 rounded ${bgColor} mb-1`}>
        <div className={`text-xs font-mono ${textColor}`}>
          <span className="opacity-60">{prefix}</span>
          <span className="font-medium">{key}:</span>{' '}
          <span className="text-gray-300">
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </span>
        </div>
      </div>
    );
  };

  const renderDiff = (delta: any, path = '') => {
    const elements: JSX.Element[] = [];

    Object.keys(delta).forEach(key => {
      const currentPath = path ? `${path}.${key}` : key;
      const value = delta[key];

      if (Array.isArray(value)) {
        if (value.length === 1) {
          // Added
          elements.push(renderDiffValue(currentPath, value[0], 'added'));
        } else if (value.length === 2) {
          // Modified
          elements.push(renderDiffValue(currentPath, value[0], 'removed'));
          elements.push(renderDiffValue(currentPath, value[1], 'added'));
        } else if (value.length === 3 && value[2] === 0) {
          // Deleted
          elements.push(renderDiffValue(currentPath, value[0], 'removed'));
        }
      } else if (typeof value === 'object' && value !== null) {
        // Nested object
        elements.push(
          <div key={currentPath} className="mb-2">
            <div className="text-sm font-medium text-gray-400 mb-1">{currentPath}:</div>
            <div className="ml-4 border-l border-gray-700 pl-2">
              {renderDiff(value, currentPath)}
            </div>
          </div>
        );
      }
    });

    return elements;
  };

  return (
    <div className="space-y-2">
      {renderDiff(delta)}
    </div>
  );
};

const TabButton = ({ active, onClick, children }: any) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 text-sm font-medium rounded-lg transition-all
      ${active 
        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
      }
    `}
  >
    {children}
  </button>
);

// Expandable Event Tree Component
const EventTreeNode = ({ event, eventIndex, expandedEvents, toggleEvent }: any) => {
  const isExpanded = expandedEvents[eventIndex];
  const hasJobs = event.jobs && event.jobs.length > 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Event Header */}
      <div
        className={`
          p-4 cursor-pointer transition-colors
          ${event.detected
            ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
            : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
          }
          ${hasJobs ? 'hover:bg-opacity-80' : ''}
        `}
        onClick={() => hasJobs && toggleEvent(eventIndex)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {hasJobs && (
              <div className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronDownIcon className="h-5 w-5 text-gray-500 transition-transform" />
                ) : (
                  <ChevronRightIcon className="h-5 w-5 text-gray-500 transition-transform" />
                )}
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-white">
                {event.name}
              </p>
              <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span className="whitespace-nowrap">Detection time: {formatDuration(event.duration)}</span>
                {hasJobs && <span className="whitespace-nowrap">{event.jobs.length} jobs</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`
              inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
              ${event.detected
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
              }
            `}>
              {event.detected ? '✓ Detected' : '○ Not Detected'}
            </span>
          </div>
        </div>
      </div>

      {/* Expandable Jobs Section */}
      {hasJobs && isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
        >
          <div className="p-4 space-y-3">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Jobs executed for this event:
            </div>
            {event.jobs.map((job: any, jobIndex: number) => (
              <div
                key={jobIndex}
                className="ml-6 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border-l-4 border-l-purple-400"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <PlayIcon className="h-4 w-4 text-purple-500" />
                      <p className="font-medium text-gray-900 dark:text-white">
                        {job.name}
                      </p>
                    </div>
                    <div className="ml-6 mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center space-x-4">
                        <span>Duration: {formatDuration(job.duration)}</span>
                        {job.function && <span>Function: {job.function}</span>}
                      </div>
                      {job.error && (
                        <p className="text-red-600 dark:text-red-400 mt-2">
                          ❌ Error: {job.error}
                        </p>
                      )}
                      {job.result && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
                            View Result
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                            {JSON.stringify(job.result, null, 2)}
                          </pre>
                        </details>
                      )}
                      {job.triggersInvocation && (
                        <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
                          <div className="flex items-center space-x-2 text-purple-700 dark:text-purple-400">
                            <span className="text-xs">🔄 Recursive Chain</span>
                            <button className="text-xs underline hover:no-underline">
                              → View triggered invocation
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <span className={`
                    ml-4 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium flex-shrink-0
                    ${job.status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : job.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  `}>
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const InvocationDetailDrawer: React.FC<InvocationDetailDrawerProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('summary');
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});

  // Fetch real invocation data using GraphQL
  const { data: invocationData, loading, error } = useInvocationDetailQuery({
    variables: { id: node?.id || '' },
    skip: !node?.id
  });

  const toggleEvent = (eventIndex: number) => {
    setExpandedEvents(prev => ({
      ...prev,
      [eventIndex]: !prev[eventIndex]
    }));
  };

  const expandAllEvents = () => {
    const newExpandedState: Record<number, boolean> = {};
    invocationData?.invocations_by_pk?.event_executions.forEach((_, index) => {
      newExpandedState[index] = true;
    });
    setExpandedEvents(newExpandedState);
  };

  const collapseAllEvents = () => {
    setExpandedEvents({});
  };

  if (!node) return null;

  if (loading) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[600px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">Loading invocation details...</div>
        </div>
      </motion.div>
    );
  }

  if (error || !invocationData?.invocations_by_pk) {
    return (
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-full w-[600px] bg-white dark:bg-gray-800 shadow-2xl z-50 flex flex-col"
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-red-500">Failed to load invocation details</div>
        </div>
      </motion.div>
    );
  }

  const invocation = invocationData.invocations_by_pk;

  // Create jsondiffpatch instance
  const jsondiff = create({
    objectHash: (obj: any) => obj.id || obj._id || JSON.stringify(obj),
    arrays: { detectMove: true },
    textDiff: { minLength: 60 }
  });

  // Extract old and new payloads from source_event_payload
  const sourceEventPayload = invocation.source_event_payload as any;
  const oldPayload = sourceEventPayload?.event?.data?.old || sourceEventPayload?.data?.old || {};
  const newPayload = sourceEventPayload?.event?.data?.new || sourceEventPayload?.data?.new || {};

  // Extract additional information from the Hasura event payload if database fields are missing
  const hasuraEvent = sourceEventPayload?.event || sourceEventPayload;
  const hasuraTable = hasuraEvent?.table || {};
  const hasuraSessionVars = hasuraEvent?.session_variables || {};

  // Try to extract operation from the event and format it properly
  const rawOperation = hasuraEvent?.op || invocation.source_operation || 'UNKNOWN';
  const extractedOperation = rawOperation.toUpperCase();

  // Try to extract table information
  const extractedTable = hasuraTable?.name || invocation.source_table || 'unknown';
  const extractedSchema = hasuraTable?.schema || 'public';

  // Try to extract user information from session variables
  const extractedUserEmail = hasuraSessionVars?.['x-hasura-user-email'] ||
                             hasuraSessionVars?.['x-hasura-user-id'] ||
                             invocation.source_user_email ||
                             'system';
  const extractedUserRole = hasuraSessionVars?.['x-hasura-role'] ||
                           invocation.source_user_role ||
                           'system';

  // Try to get delivery info if available
  const deliveryInfo = hasuraEvent?.delivery_info || {};
  const triggerId = hasuraEvent?.id || invocation.source_event_id;
  const triggerName = hasuraEvent?.trigger?.name || '';

  // Transform real data into the structure expected by the UI
  const invocationDisplayData = {
    id: invocation.id,
    sourceFunction: invocation.source_function || triggerName || 'event-detector',
    correlationId: invocation.correlation_id || '',
    operation: extractedOperation,
    tableName: extractedSchema !== 'public' ? `${extractedSchema}.${extractedTable}` : extractedTable,
    userEmail: extractedUserEmail,
    userRole: extractedUserRole,
    duration: invocation.total_duration_ms || 0,
    status: invocation.status,
    createdAt: invocation.created_at,
    triggerId,

    oldPayload,
    newPayload,

    events: invocation.event_executions.map(event => ({
      name: event.event_name,
      detected: event.detected,
      duration: event.detection_duration_ms ?? 0,  // Use nullish coalescing to preserve 0 values
      jobs: event.job_executions.map(job => ({
        name: job.job_name,
        status: job.status,
        duration: job.duration_ms || 0,
        function: job.job_function_name,
        result: job.result,
        error: job.error_message,
        triggersInvocation: false // TODO: implement detection for recursive invocations
      }))
    })),

    jobs: invocation.event_executions.flatMap(event =>
      event.job_executions.map(job => ({
        name: job.job_name,
        status: job.status,
        duration: job.duration_ms || 0,
        error: job.error_message
      }))
    )
  };

  const jsonTreeTheme = {
    scheme: 'monokai',
    base00: '#1f2937',
    base01: '#374151',
    base02: '#4b5563',
    base03: '#6b7280',
    base04: '#9ca3af',
    base05: '#d1d5db',
    base06: '#e5e7eb',
    base07: '#f3f4f6',
    base08: '#ef4444',
    base09: '#f97316',
    base0A: '#eab308',
    base0B: '#10b981',
    base0C: '#06b6d4',
    base0D: '#3b82f6',
    base0E: '#8b5cf6',
    base0F: '#ec4899'
  };

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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {node.type === 'invocation' ? 'Invocation' : node.type === 'event' ? 'Event' : 'Job'} Details
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1">
              {invocationDisplayData.correlationId}
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
            active={activeTab === 'json'} 
            onClick={() => setActiveTab('json')}
          >
            Raw JSON
          </TabButton>
          <TabButton 
            active={activeTab === 'diff'} 
            onClick={() => setActiveTab('diff')}
          >
            Diff
          </TabButton>
          <TabButton 
            active={activeTab === 'events'} 
            onClick={() => setActiveTab('events')}
          >
            Events
          </TabButton>
          <TabButton
            active={activeTab === 'jobs'}
            onClick={() => setActiveTab('jobs')}
          >
            Jobs
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
            {/* Record ID - prominently displayed */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Invocation ID
              </label>
              <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">
                {invocation.id}
              </p>
              {invocationDisplayData.triggerId && (
                <>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mt-3 block">
                    Event Trigger ID
                  </label>
                  <p className="mt-1 text-sm font-mono text-gray-900 dark:text-white">
                    {invocationDisplayData.triggerId}
                  </p>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Source Function
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {invocationDisplayData.sourceFunction}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Operation
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {invocationDisplayData.operation}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Table
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {invocationDisplayData.tableName}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Duration
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {formatDuration(invocationDisplayData.duration)}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  User
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {invocationDisplayData.userEmail}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </label>
                <p className="mt-1">
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${invocationDisplayData.status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : invocationDisplayData.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  `}>
                    {invocationDisplayData.status}
                  </span>
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Headers & Context
              </label>
              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <code className="text-xs text-gray-700 dark:text-gray-300">
                  <div>x-hasura-role: {invocationDisplayData.userRole}</div>
                  <div>x-hasura-user-email: {invocationDisplayData.userEmail}</div>
                  <div>x-request-id: {invocationDisplayData.id}</div>
                  {invocation.source_system && (
                    <div>source-system: {invocation.source_system}</div>
                  )}
                </code>
              </div>
            </div>

            {/* Additional debug info */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Execution Summary
              </label>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Events Detected:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invocation.events_detected_count || 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Jobs Run:</span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invocation.total_jobs_run || 0}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Jobs Succeeded:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {invocation.total_jobs_succeeded || 0}
                  </span>
                </div>
                {(invocation.total_jobs_failed || 0) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Jobs Failed:</span>
                    <span className="font-medium text-red-600 dark:text-red-400">
                      {invocation.total_jobs_failed || 0}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-4">
            {/* Show old/new if they exist */}
            {Object.keys(invocationDisplayData.oldPayload).length > 0 || Object.keys(invocationDisplayData.newPayload).length > 0 ? (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Old Payload
                    </h4>
                    <span className="text-xs text-gray-500">
                      {Object.keys(invocationDisplayData.oldPayload).length} fields
                    </span>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64">
                    <JSONTree
                      data={invocationDisplayData.oldPayload}
                      theme={jsonTreeTheme}
                      invertTheme={false}
                      hideRoot
                      shouldExpandNode={(keyName, data, level) => level < 2}
                      sortObjectKeys
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      New Payload
                    </h4>
                    <span className="text-xs text-gray-500">
                      {Object.keys(invocationDisplayData.newPayload).length} fields
                    </span>
                  </div>
                  <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64">
                    <JSONTree
                      data={invocationDisplayData.newPayload}
                      theme={jsonTreeTheme}
                      invertTheme={false}
                      hideRoot
                      shouldExpandNode={(keyName, data, level) => level < 2}
                      sortObjectKeys
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Show full source event payload if no old/new structure */
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Source Event Payload
                  </h4>
                  <span className="text-xs text-gray-500">
                    Full event data
                  </span>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-96">
                  <JSONTree
                    data={sourceEventPayload}
                    theme={jsonTreeTheme}
                    invertTheme={false}
                    hideRoot
                    shouldExpandNode={(keyName, data, level) => level < 2}
                    sortObjectKeys
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Payload Changes</h4>
              {Object.keys(invocationDisplayData.oldPayload).length > 0 || Object.keys(invocationDisplayData.newPayload).length > 0 ? (
                <JsonDiffViewer
                  oldData={invocationDisplayData.oldPayload}
                  newData={invocationDisplayData.newPayload}
                  jsondiff={jsondiff}
                />
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <p>No old/new data comparison available for this event type</p>
                  <p className="text-sm mt-2">View the Raw JSON tab to see the full event payload</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-4">
            {/* Header with controls */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                  Event Execution Hierarchy
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {invocationDisplayData.events.length} events detected • Click to expand and view jobs
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={expandAllEvents}
                  className="px-3 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400"
                >
                  Expand All
                </button>
                <button
                  onClick={collapseAllEvents}
                  className="px-3 py-1 text-xs bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Event Tree */}
            <div className="space-y-3">
              {invocationDisplayData.events.map((event, index) => (
                <EventTreeNode
                  key={index}
                  event={event}
                  eventIndex={index}
                  expandedEvents={expandedEvents}
                  toggleEvent={toggleEvent}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-3">
            {invocationDisplayData.jobs.map((job, index) => (
              <div
                key={index}
                className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {job.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Duration: {formatDuration(job.duration)}
                    </p>
                    {job.error && (
                      <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                        Error: {job.error}
                      </p>
                    )}
                  </div>
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${job.status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : job.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  `}>
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800 mb-4">
              <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                Invocation Logs
              </h5>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Viewing all logs from Grafana Loki for this entire invocation, including all events and jobs.
                Logs are filtered by invocationId.
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

              const invocationId = node.id;

              return (
                <LogsViewer
                  queryFn={() => grafanaService.queryInvocationLogs(invocationId, 15)}
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

export default InvocationDetailDrawer;
