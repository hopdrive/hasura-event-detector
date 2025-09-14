import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { JSONTree } from 'react-json-tree';
import { create, formatters } from 'jsondiffpatch';
import { Node } from 'reactflow';

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

const InvocationDetailDrawer: React.FC<InvocationDetailDrawerProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('summary');

  if (!node) return null;

  // Create jsondiffpatch instance
  const jsondiff = create({
    objectHash: (obj: any) => obj.id || obj._id || JSON.stringify(obj),
    arrays: { detectMove: true },
    textDiff: { minLength: 60 }
  });

  // Mock data for demonstration
  const mockInvocationData = {
    id: node.id,
    sourceFunction: node.data.sourceFunction || node.data.eventName || node.data.jobName,
    correlationId: node.data.correlationId || 'event_detector.job.550e8400',
    operation: 'UPDATE',
    tableName: 'rides',
    userEmail: 'driver@hopdrive.com',
    userRole: 'driver',
    duration: node.data.duration || 245,
    status: node.data.status,
    createdAt: '2024-01-15T10:30:00Z',
    
    oldPayload: {
      id: 12345,
      status: 'scheduled',
      driver_id: null,
      pickup_time: '2024-01-15T14:00:00Z',
      dropoff_time: null,
      notes: 'Please wait at door',
      metadata: {
        source: 'mobile_app',
        version: '2.1.0'
      }
    },
    
    newPayload: {
      id: 12345,
      status: 'pickup_successful',
      driver_id: 789,
      pickup_time: '2024-01-15T14:00:00Z',
      dropoff_time: '2024-01-15T14:30:00Z',
      notes: 'Please wait at door - Pickup completed',
      metadata: {
        source: 'mobile_app',
        version: '2.1.0',
        updated_by: 'event_detector.job.550e8400'
      }
    },
    
    events: [
      { name: 'ride.status.change', detected: true, duration: 15 },
      { name: 'ride.pickup.successful', detected: true, duration: 12 },
      { name: 'ride.driver.assigned', detected: false, duration: 8 }
    ],
    
    jobs: [
      { name: 'sendNotification', status: 'completed', duration: 120 },
      { name: 'updateAnalytics', status: 'completed', duration: 45 },
      { name: 'recalculateSLA', status: 'failed', duration: 180, error: 'Timeout after 3s' }
    ]
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
              {mockInvocationData.correlationId}
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
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Source Function
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {mockInvocationData.sourceFunction}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Operation
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {mockInvocationData.operation}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Table
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {mockInvocationData.tableName}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Duration
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {mockInvocationData.duration}ms
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  User
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {mockInvocationData.userEmail}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Status
                </label>
                <p className="mt-1">
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${mockInvocationData.status === 'completed' 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                      : mockInvocationData.status === 'failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    }
                  `}>
                    {mockInvocationData.status}
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
                  <div>x-hasura-role: {mockInvocationData.userRole}</div>
                  <div>x-hasura-user-email: {mockInvocationData.userEmail}</div>
                  <div>x-request-id: {mockInvocationData.id}</div>
                </code>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'json' && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Old Payload
                </h4>
                <span className="text-xs text-gray-500">
                  {Object.keys(mockInvocationData.oldPayload).length} fields
                </span>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64">
                <JSONTree
                  data={mockInvocationData.oldPayload}
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
                  {Object.keys(mockInvocationData.newPayload).length} fields
                </span>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 overflow-auto max-h-64">
                <JSONTree
                  data={mockInvocationData.newPayload}
                  theme={jsonTreeTheme}
                  invertTheme={false}
                  hideRoot
                  shouldExpandNode={(keyName, data, level) => level < 2}
                  sortObjectKeys
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="space-y-4">
            <div className="bg-gray-900 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-3">Payload Changes</h4>
              <JsonDiffViewer
                oldData={mockInvocationData.oldPayload}
                newData={mockInvocationData.newPayload}
                jsondiff={jsondiff}
              />
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-3">
            {mockInvocationData.events.map((event, index) => (
              <div 
                key={index}
                className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {event.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Duration: {event.duration}ms
                    </p>
                  </div>
                  <span className={`
                    inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                    ${event.detected 
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                    }
                  `}>
                    {event.detected ? 'Detected' : 'Not Detected'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-3">
            {mockInvocationData.jobs.map((job, index) => (
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
                      Duration: {job.duration}ms
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
      </div>
    </motion.div>
  );
};

export default InvocationDetailDrawer;
