import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XMarkIcon, PlayIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { JSONTree } from 'react-json-tree';
import { Node } from 'reactflow';

interface JobDetailDrawerProps {
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
        ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
      }
    `}
  >
    {children}
  </button>
);

const JobDetailDrawer: React.FC<JobDetailDrawerProps> = ({
  node,
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState('summary');

  if (!node || node.type !== 'job') return null;

  const jobData = node.data;

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
            <div className="flex items-center space-x-2">
              <PlayIcon className="h-5 w-5 text-purple-500" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Job Details
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1">
              {jobData.jobName}
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
            active={activeTab === 'result'}
            onClick={() => setActiveTab('result')}
          >
            Result & Error
          </TabButton>
          <TabButton
            active={activeTab === 'context'}
            onClick={() => setActiveTab('context')}
          >
            Context
          </TabButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'summary' && (
          <div className="space-y-6">
            {/* Status Banner */}
            <div className={`p-4 rounded-lg border-l-4 ${
              jobData.status === 'completed'
                ? 'bg-green-50 border-l-green-500 dark:bg-green-900/20 dark:border-l-green-400'
                : jobData.status === 'failed'
                ? 'bg-red-50 border-l-red-500 dark:bg-red-900/20 dark:border-l-red-400'
                : 'bg-blue-50 border-l-blue-500 dark:bg-blue-900/20 dark:border-l-blue-400'
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Job {jobData.status === 'completed' ? 'Completed Successfully' :
                          jobData.status === 'failed' ? 'Failed' : 'Running'}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Execution time: {jobData.duration}ms
                  </p>
                </div>
                <span className={`
                  inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                  ${jobData.status === 'completed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : jobData.status === 'failed'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  }
                `}>
                  {jobData.status}
                </span>
              </div>
            </div>

            {/* Job Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Job Name
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {jobData.jobName}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Function Name
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white font-mono">
                  {jobData.functionName || 'N/A'}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Duration
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {jobData.duration}ms
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  Correlation ID
                </label>
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white font-mono truncate">
                  {jobData.correlationId}
                </p>
              </div>
            </div>

            {/* Recursive Chain Indicator */}
            {jobData.triggersInvocation && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-medium text-purple-700 dark:text-purple-400">
                      Recursive Chain Trigger
                    </h4>
                    <p className="text-sm text-purple-600 dark:text-purple-400 mt-1">
                      This job triggers a new invocation, creating a recursive execution chain.
                    </p>
                    <div className="mt-2">
                      <button className="inline-flex items-center text-sm text-purple-700 dark:text-purple-400 hover:underline">
                        <ArrowRightIcon className="w-4 h-4 mr-1" />
                        View triggered invocation
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {jobData.error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <h4 className="font-medium text-red-700 dark:text-red-400 mb-2">
                  Execution Error
                </h4>
                <pre className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
                  {jobData.error}
                </pre>
              </div>
            )}
          </div>
        )}

        {activeTab === 'result' && (
          <div className="space-y-4">
            {jobData.result && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                    Job Result
                  </h4>
                  <span className="text-xs text-gray-500">
                    {typeof jobData.result === 'object' ?
                      `${Object.keys(jobData.result).length} fields` :
                      'Primitive value'
                    }
                  </span>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 overflow-auto">
                  {typeof jobData.result === 'object' ? (
                    <JSONTree
                      data={jobData.result}
                      theme={jsonTreeTheme}
                      invertTheme={false}
                      hideRoot
                      shouldExpandNode={(keyName, data, level) => level < 3}
                      sortObjectKeys
                    />
                  ) : (
                    <pre className="text-green-400 font-mono text-sm">
                      {String(jobData.result)}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {jobData.error && (
              <div>
                <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                  Error Details
                </h4>
                <div className="bg-red-900 rounded-lg p-4">
                  <pre className="text-red-300 font-mono text-sm whitespace-pre-wrap break-words">
                    {jobData.error}
                  </pre>
                </div>
              </div>
            )}

            {!jobData.result && !jobData.error && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <PlayIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No result or error information available</p>
                <p className="text-sm mt-1">
                  This job may still be running or completed without returning data
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'context' && (
          <div className="space-y-4">
            <div>
              <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                Job Context
              </h4>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <dl className="space-y-3">
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Job ID</dt>
                    <dd className="text-sm font-mono text-gray-900 dark:text-white">{node.id}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Correlation ID</dt>
                    <dd className="text-sm font-mono text-gray-900 dark:text-white break-all">{jobData.correlationId}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Function</dt>
                    <dd className="text-sm font-mono text-gray-900 dark:text-white">{jobData.functionName || 'Not specified'}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Status</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{jobData.status}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Execution Time</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">{jobData.duration}ms</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-sm text-gray-600 dark:text-gray-400">Triggers Recursion</dt>
                    <dd className="text-sm text-gray-900 dark:text-white">
                      {jobData.triggersInvocation ? 'Yes' : 'No'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <h5 className="font-medium text-blue-700 dark:text-blue-400 mb-2">
                About Job Execution
              </h5>
              <p className="text-sm text-blue-600 dark:text-blue-400">
                Jobs are asynchronous functions executed in response to detected events.
                They can perform various operations like sending notifications, updating databases,
                or triggering additional workflows.
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default JobDetailDrawer;