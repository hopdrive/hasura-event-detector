import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Handle,
  NodeProps,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
  ReactFlowInstance
} from 'reactflow';
import { motion, AnimatePresence } from 'framer-motion';
import InvocationDetailDrawer from './InvocationDetailDrawer';
import { mockFlowData } from '../data/mockData';
import {
  useCorrelationChainFlowQuery,
  useInvocationDetailQuery,
} from '../types/generated';
import 'reactflow/dist/style.css';
import JobDetailDrawer from './JobDetailDrawer';
import EventDetailDrawer from './EventDetailDrawer';

// Custom Node Components
const InvocationNode = ({ data, selected }: NodeProps) => {
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
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 border-blue-500
        ${selected ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
        shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer
        min-w-[240px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Blue accent strip */}
      <div className='absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg' />

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
            {data.duration}ms • {data.eventsCount} events
          </p>
          <p className='text-xs text-gray-500 dark:text-gray-500 font-mono truncate'>{data.correlationId}</p>
        </div>
      </div>

      <Handle type='source' position={Position.Right} id='right' className='w-3 h-3' />
      <Handle type='source' position={Position.Bottom} id='bottom' className='w-3 h-3' />
    </motion.div>
  );
};

const EventNode = ({ data, selected }: NodeProps) => {
  const isDetected = data.detected;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2
        ${isDetected ? 'border-green-500' : 'border-gray-300 opacity-60'}
        ${selected ? 'ring-4 ring-green-400 ring-opacity-50' : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[200px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Green accent strip */}
      <div className='absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-lg' />

      <div className='p-3 pl-4'>
        <div className='flex items-center justify-between mb-1'>
          <span className='text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide'>
            Event
          </span>
          {isDetected && (
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
        <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>
          {data.duration}ms • {isDetected ? `${data.jobsCount} jobs` : 'Not detected'}
        </p>
      </div>

      {isDetected && <Handle type='source' position={Position.Right} className='w-3 h-3' />}
    </motion.div>
  );
};

const JobNode = ({ data, selected }: NodeProps) => {
  const statusColors = {
    completed: 'border-green-500',
    failed: 'border-red-500',
    running: 'border-blue-500',
  };

  const hasRecursion = data.triggersInvocation;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 border-purple-500
        ${selected ? 'ring-4 ring-purple-400 ring-opacity-50' : ''}
        ${hasRecursion ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[180px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Purple accent strip */}
      <div className='absolute left-0 top-0 bottom-0 w-1 bg-purple-500 rounded-l-lg' />

      <div className='p-3 pl-4'>
        <div className='flex items-center justify-between mb-1'>
          <span className='text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide'>
            Job
          </span>
          {hasRecursion && (
            <svg className='w-4 h-4 text-purple-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'>
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15'
              />
            </svg>
          )}
        </div>

        <p className='font-medium text-gray-900 dark:text-white text-sm'>{data.jobName}</p>
        <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>{data.duration}ms</p>
        {hasRecursion && (
          <p className='text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium'>→ Triggers new invocation</p>
        )}
      </div>

      {hasRecursion && <Handle type='source' position={Position.Right} className='w-3 h-3' />}
    </motion.div>
  );
};

// Correlation Chain Overview Node
const CorrelationChainNode = ({ data, selected }: NodeProps) => {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={`
        relative bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl border-2 border-purple-400
        ${selected ? 'ring-4 ring-purple-400 ring-opacity-50 shadow-xl' : 'shadow-lg'}
        hover:shadow-xl transition-all duration-200 cursor-pointer
        min-w-[320px] text-white
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      <div className='p-6'>
        <div className='flex items-center justify-between mb-3'>
          <span className='text-xs font-semibold text-purple-200 uppercase tracking-wider'>Correlation Chain</span>
          <div className='flex items-center space-x-1'>
            <div
              className={`w-3 h-3 rounded-full ${
                data.status === 'completed' ? 'bg-green-400' : data.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
              }`}
            />
          </div>
        </div>

        <div className='space-y-2'>
          <p className='font-bold text-lg'>{data.chainId}</p>
          <p className='text-purple-100 text-sm'>
            {data.totalInvocations} invocations • {data.totalJobs} jobs
          </p>

          <div className='flex items-center justify-between text-sm'>
            <span className='text-purple-200'>Duration: {data.totalDuration}ms</span>
            <span className='text-purple-200'>
              Success: {Math.round((data.successfulJobs / data.totalJobs) * 100)}%
            </span>
          </div>

          {data.recursive && (
            <div className='mt-3 px-3 py-1 bg-purple-400/30 rounded-full'>
              <span className='text-xs font-medium'>🔄 Recursive Chain</span>
            </div>
          )}
        </div>
      </div>

      <Handle type='source' position={Position.Right} className='w-3 h-3' />
    </motion.div>
  );
};

// Grouped Events Node (for minimizing undetected events)
const GroupedEventsNode = ({ data, selected }: NodeProps) => {
  const [expanded, setExpanded] = React.useState(false);
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
            <div className='text-sm font-medium text-gray-900 dark:text-white mb-3'>Individual Events:</div>
            <div className='space-y-2 max-h-48 overflow-y-auto'>
              {data.events?.map((event: any, index: number) => (
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
                  <div className='text-xs text-gray-600 dark:text-gray-400 mt-1'>{event.duration}ms</div>
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

const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
  correlationChain: CorrelationChainNode,
  groupedEvents: GroupedEventsNode,
};

// Enhanced mock data generator for testing grouping
const generateEnhancedMockData = () => {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Mock detected events (important - show individually)
  const detectedEvents = [
    { id: 'det-1', name: 'ride.status.change', detected: true, jobs: 2 },
    { id: 'det-2', name: 'ride.pickup.successful', detected: true, jobs: 2 },
  ];

  // Main invocation node (centered on children)
  const baseX = 50;
  // Calculate total height needed for all detected events and their jobs
  const totalEventsHeight = detectedEvents.length > 1 ? (detectedEvents.length - 1) * 200 : 0;
  const invocationCenterOffset = -totalEventsHeight / 2;
  const baseY = 300 + invocationCenterOffset;

  const invocationNode: Node = {
    id: 'main-invocation',
    type: 'invocation',
    position: { x: baseX, y: baseY },
    data: {
      sourceFunction: 'event-detector-rides',
      correlationId: 'demo.correlation.123',
      status: 'completed',
      duration: 245,
      eventsCount: 8,
      jobsCount: 4,
      successfulJobs: 3,
      failedJobs: 1,
    },
  };
  nodes.push(invocationNode);

  // Mock undetected events (many - should be grouped)
  const undetectedEvents = [
    { id: 'undet-1', name: 'ride.driver.assigned', detected: false },
    { id: 'undet-2', name: 'ride.customer.notified', detected: false },
    { id: 'undet-3', name: 'ride.payment.pending', detected: false },
    { id: 'undet-4', name: 'ride.route.optimized', detected: false },
    { id: 'undet-5', name: 'ride.eta.updated', detected: false },
    { id: 'undet-6', name: 'ride.analytics.tracked', detected: false },
  ];

  // Create detected event nodes individually (fan-out positioning)
  detectedEvents.forEach((event, index) => {
    // Calculate vertical offset to center jobs under this event
    const jobCount = event.jobs;
    const jobStackHeight = jobCount > 1 ? (jobCount - 1) * 120 : 0;
    const eventCenterOffset = -jobStackHeight / 2;

    const eventNode: Node = {
      id: event.id,
      type: 'event',
      position: { x: baseX + 584, y: baseY + 16 + index * 200 + eventCenterOffset },
      data: {
        eventName: event.name,
        correlationId: 'demo.correlation.123',
        detected: event.detected,
        status: 'completed',
        detectionDuration: 15,
        handlerDuration: 12,
        jobsCount: event.jobs,
      },
    };
    nodes.push(eventNode);

    // Connect invocation to detected event
    edges.push({
      id: `inv-to-${event.id}`,
      source: 'main-invocation',
      target: event.id,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#10b981', strokeWidth: 2 },
    });

    // Create job nodes for detected events (centered on parent event)
    for (let jobIndex = 0; jobIndex < event.jobs; jobIndex++) {
      const jobId = `${event.id}-job-${jobIndex}`;
      const jobStackHeight = event.jobs > 1 ? (event.jobs - 1) * 120 : 0;
      const jobCenterOffset = -jobStackHeight / 2;

      const jobNode: Node = {
        id: jobId,
        type: 'job',
        position: { x: baseX + 584 + 350, y: baseY + 16 + index * 200 + jobCenterOffset + jobIndex * 120 },
        data: {
          jobName: jobIndex === 0 ? 'sendNotification' : 'updateAnalytics',
          functionName: jobIndex === 0 ? 'notifications.sendEmail' : 'analytics.recordEvent',
          correlationId: 'demo.correlation.123',
          status: jobIndex === 1 && index === 1 ? 'failed' : 'completed',
          duration: jobIndex === 0 ? 120 : 45,
          result: { success: true },
          error: jobIndex === 1 && index === 1 ? 'Timeout after 3s' : null,
        },
      };
      nodes.push(jobNode);

      // Connect event to job
      edges.push({
        id: `${event.id}-to-${jobId}`,
        source: event.id,
        target: jobId,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: jobNode.data.status === 'completed' ? '#10b981' : '#ef4444' },
      });
    }
  });

  // Create grouped node for undetected events (below invocation)
  const groupedNode: Node = {
    id: 'grouped-undetected',
    type: 'groupedEvents',
    position: { x: baseX + 89, y: baseY + 220 },
    data: {
      totalCount: undetectedEvents.length,
      detectedCount: 0,
      undetectedCount: undetectedEvents.length,
      events: undetectedEvents.map(e => ({
        name: e.name,
        detected: e.detected,
        duration: 8,
      })),
    },
  };
  nodes.push(groupedNode);

  // Connect invocation to grouped undetected events (bottom to top)
  edges.push({
    id: 'inv-to-grouped-undetected',
    source: 'main-invocation',
    target: 'grouped-undetected',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '5,5' },
  });

  return { generatedNodes: nodes, generatedEdges: edges };
};

// Inner component that uses ReactFlow hooks
const FlowDiagramContent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(mockFlowData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(mockFlowData.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'flow' | 'correlation'>('flow');
  const [highlightCorrelation, setHighlightCorrelation] = useState<string | null>(null);
  const [autoFocusCompleted, setAutoFocusCompleted] = useState(false);

  // URL Parameters
  const invocationId = searchParams.get('invocationId');
  const autoFocus = searchParams.get('autoFocus') === 'true';
  const correlationId = searchParams.get('correlationId');

  // GraphQL Queries for real data
  const { data: invocationData, loading: invocationLoading } = useInvocationDetailQuery({
    variables: { id: invocationId || '' },
    skip: !invocationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });

  const { data: correlationData, loading: correlationLoading } = useCorrelationChainFlowQuery({
    variables: { correlationId: correlationId || '' },
    skip: !correlationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });

  // Generate nodes and edges from real data with smart grouping
  const { generatedNodes, generatedEdges } = useMemo(() => {
    if (invocationData?.invocations_by_pk) {
      const invocation = invocationData.invocations_by_pk;
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Smart event grouping logic
      const events = invocation.event_executions || [];
      const detectedEvents = events.filter(e => e.detected);
      const undetectedEvents = events.filter(e => !e.detected);

      // Create invocation node (centered on children)
      const baseX = 50;
      // Calculate total height needed for all detected events
      const totalEventsHeight = detectedEvents.length > 1 ? (detectedEvents.length - 1) * 200 : 0;
      const invocationCenterOffset = -totalEventsHeight / 2;
      const baseY = 300 + invocationCenterOffset;

      const invocationNode: Node = {
        id: invocation.id,
        type: 'invocation',
        position: { x: baseX, y: baseY },
        data: {
          sourceFunction: invocation.source_function,
          correlationId: invocation.correlation_id,
          status: invocation.status,
          duration: invocation.total_duration_ms,
          eventsCount: invocation.events_detected_count,
          jobsCount: invocation.total_jobs_run,
          successfulJobs: invocation.total_jobs_succeeded,
          failedJobs: invocation.total_jobs_failed,
          parentJobId: invocation.source_job_id,
        },
      };
      nodes.push(invocationNode);

      // If this invocation has a parent job, create the parent job node and connect it
      if (invocation.source_job_id && invocation.source_job_execution) {
        const parentJobNode: Node = {
          id: `job-${invocation.source_job_id}`,
          type: 'job',
          position: { x: baseX - 300, y: baseY },
          data: {
            jobName: invocation.source_job_execution.job_name,
            functionName: invocation.source_job_execution.job_function_name,
            correlationId: invocation.source_job_execution.correlation_id,
            status: invocation.source_job_execution.status,
            duration: invocation.source_job_execution.duration_ms,
            triggersInvocation: true, // This job triggers this invocation
          },
        };
        nodes.push(parentJobNode);

        // Connect parent job to this invocation
        edges.push({
          id: `job-to-inv-${invocation.id}`,
          source: `job-${invocation.source_job_id}`,
          target: invocation.id,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: '#8b5cf6', strokeWidth: 2 }, // Purple for job-to-invocation connections
        });
      }
      const shouldGroupEvents = events.length > 6; // Group if more than 6 events
      const shouldGroupUndetected = undetectedEvents.length > 3; // Group undetected if more than 3

      if (shouldGroupEvents || shouldGroupUndetected) {
        // Show detected events individually (fan-out positioning)
        detectedEvents.forEach((event, eventIndex) => {
          // Calculate vertical offset to center jobs under this event
          const jobCount = event.job_executions?.length || 0;
          const jobStackHeight = jobCount > 1 ? (jobCount - 1) * 120 : 0;
          const eventCenterOffset = -jobStackHeight / 2;

          const eventNode: Node = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: baseX + 584, y: baseY + 16 + eventIndex * 200 + eventCenterOffset },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration_ms,
              handlerDuration: event.handler_duration_ms,
              jobsCount: event.jobs_count,
            },
          };
          nodes.push(eventNode);

          // Connect invocation to detected event
          edges.push({
            id: `inv-to-event-${event.id}`,
            source: invocation.id,
            target: `event-${event.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#10b981', strokeWidth: 2 }, // Green for detected
          });

          // Create job nodes for detected events (centered on parent event)
          event.job_executions?.forEach((job, jobIndex) => {
            const jobCount = event.job_executions?.length || 0;
            const jobStackHeight = jobCount > 1 ? (jobCount - 1) * 120 : 0;
            const jobCenterOffset = -jobStackHeight / 2;

            const jobNode: Node = {
              id: `job-${job.id}`,
              type: 'job',
              position: { x: baseX + 584 + 350, y: baseY + 16 + eventIndex * 200 + jobCenterOffset + jobIndex * 120 },
              data: {
                jobName: job.job_name,
                functionName: job.job_function_name,
                correlationId: job.correlation_id,
                status: job.status,
                duration: job.duration_ms,
                result: job.result,
                error: job.error_message,
              },
            };
            nodes.push(jobNode);

            // Connect event to job
            edges.push({
              id: `event-to-job-${job.id}`,
              source: `event-${event.id}`,
              target: `job-${job.id}`,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444' },
            });
          });
        });

        // Group undetected events (if any)
        if (undetectedEvents.length > 0) {
          const groupedNode: Node = {
            id: 'grouped-undetected',
            type: 'groupedEvents',
            position: {
              x: baseX + 89,
              y: baseY + 220,
            },
            data: {
              totalCount: undetectedEvents.length,
              detectedCount: 0,
              undetectedCount: undetectedEvents.length,
              events: undetectedEvents.map(e => ({
                name: e.event_name,
                detected: e.detected,
                duration: e.detection_duration_ms || 0,
              })),
            },
          };
          nodes.push(groupedNode);

          // Connect invocation to grouped undetected events (bottom to top)
          edges.push({
            id: `inv-to-grouped-undetected`,
            source: invocation.id,
            target: 'grouped-undetected',
            sourceHandle: 'bottom',
            targetHandle: 'top',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '5,5' }, // Gray dashed for undetected
          });
        }
      } else {
        // Show all events individually if count is manageable (fan-out positioning)
        events.forEach((event, eventIndex) => {
          // Calculate vertical offset to center jobs under this event
          const jobCount = event.job_executions?.length || 0;
          const jobStackHeight = jobCount > 1 ? (jobCount - 1) * 120 : 0;
          const eventCenterOffset = -jobStackHeight / 2;

          const eventNode: Node = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: baseX + 584, y: baseY + 16 + eventIndex * 200 + eventCenterOffset },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration_ms,
              handlerDuration: event.handler_duration_ms,
              jobsCount: event.jobs_count,
            },
          };
          nodes.push(eventNode);

          // Connect invocation to event
          edges.push({
            id: `inv-to-event-${event.id}`,
            source: invocation.id,
            target: `event-${event.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: event.detected ? '#10b981' : '#ef4444' },
          });

          // Create job nodes for each event (centered on parent event)
          if (event.detected) {
            event.job_executions?.forEach((job, jobIndex) => {
              const jobCount = event.job_executions?.length || 0;
              const jobStackHeight = jobCount > 1 ? (jobCount - 1) * 120 : 0;
              const jobCenterOffset = -jobStackHeight / 2;

              const jobNode: Node = {
                id: `job-${job.id}`,
                type: 'job',
                position: { x: baseX + 584 + 350, y: baseY + 16 + eventIndex * 200 + jobCenterOffset + jobIndex * 120 },
                data: {
                  jobName: job.job_name,
                  functionName: job.job_function_name,
                  correlationId: job.correlation_id,
                  status: job.status,
                  duration: job.duration_ms,
                  result: job.result,
                  error: job.error_message,
                  triggersInvocation: false, // Will be updated if we find child invocations
                },
              };
              nodes.push(jobNode);

              // Connect event to job
              edges.push({
                id: `event-to-job-${job.id}`,
                source: `event-${event.id}`,
                target: `job-${job.id}`,
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444' },
              });
            });
          }
        });
      }

      return { generatedNodes: nodes, generatedEdges: edges };
    }

    // Use correlation chain data if available
    if (correlationData?.invocations && correlationData.invocations.length > 0) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Build parent-child mapping using source_job_id
      const invocationsByParentJob = new Map<string, (typeof correlationData.invocations)[0][]>();
      const rootInvocations: (typeof correlationData.invocations)[0][] = [];
      const allJobNodes = new Map<string, Node>();

      // First pass: categorize invocations and collect all job nodes
      correlationData.invocations.forEach(inv => {
        if (inv.source_job_id && inv.source_job_execution) {
          // This invocation was triggered by a job
          const parentJobId = inv.source_job_id;
          if (!invocationsByParentJob.has(parentJobId)) {
            invocationsByParentJob.set(parentJobId, []);
          }
          invocationsByParentJob.get(parentJobId)!.push(inv);
        } else {
          // This is a root invocation (no parent job)
          rootInvocations.push(inv);
        }

        // Collect all job nodes from this invocation
        inv.event_executions?.forEach(event => {
          event.job_executions?.forEach(job => {
            const jobNodeId = `job-${job.id}`;
            allJobNodes.set(job.id, {
              id: jobNodeId,
              type: 'job',
              position: { x: 0, y: 0 }, // Will be positioned later
              data: {
                jobName: job.job_name,
                functionName: job.job_function_name,
                correlationId: job.correlation_id,
                status: job.status,
                duration: job.duration_ms,
                result: job.result,
                error: job.error_message,
                triggersInvocation: invocationsByParentJob.has(job.id), // Mark if this job triggers children
              },
            });
          });
        });
      });

      // Recursive function to build tree structure
      const buildInvocationTree = (
        invocations: typeof correlationData.invocations,
        startX: number,
        startY: number,
        level: number = 0
      ) => {
        let currentY = startY;
        const levelSpacing = 600; // Horizontal spacing between levels

        invocations.forEach((inv, invIndex) => {
          // Create invocation node
          const invocationNode: Node = {
            id: inv.id,
            type: 'invocation',
            position: { x: startX, y: currentY },
            data: {
              sourceFunction: inv.source_function,
              correlationId: inv.correlation_id,
              status: inv.status,
              duration: inv.total_duration_ms,
              eventsCount: inv.events_detected_count,
              parentJobId: inv.source_job_id,
            },
          };
          nodes.push(invocationNode);

          // If this invocation has a parent job, connect it
          if (inv.source_job_id && inv.source_job_execution) {
            const parentJobNodeId = `job-${inv.source_job_id}`;
            edges.push({
              id: `job-to-inv-${inv.id}`,
              source: parentJobNodeId,
              target: inv.id,
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: '#8b5cf6', strokeWidth: 2 },
            });
          }

          // Build events and jobs for this invocation
          let eventY = currentY + 100;
          inv.event_executions?.forEach((event, eventIndex) => {
            if (event.detected) {
              // Create event node
              const eventNode: Node = {
                id: `event-${event.id}`,
                type: 'event',
                position: { x: startX + 350, y: eventY },
                data: {
                  eventName: event.event_name,
                  correlationId: event.correlation_id,
                  detected: event.detected,
                  status: event.status,
                  detectionDuration: event.detection_duration_ms,
                  handlerDuration: event.handler_duration_ms,
                  jobsCount: event.jobs_count,
                },
              };
              nodes.push(eventNode);

              // Connect invocation to event
              edges.push({
                id: `inv-to-event-${event.id}`,
                source: inv.id,
                target: `event-${event.id}`,
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: '#10b981', strokeWidth: 2 },
              });

              // Create job nodes
              let jobY = eventY;
              event.job_executions?.forEach((job, jobIndex) => {
                const jobNode = allJobNodes.get(job.id);
                if (jobNode) {
                  // Position the job node
                  jobNode.position = { x: startX + 700, y: jobY };
                  // Update the position in the map for child invocation positioning
                  allJobNodes.set(job.id, jobNode);
                  nodes.push(jobNode);

                  // Connect event to job
                  edges.push({
                    id: `event-to-job-${job.id}`,
                    source: `event-${event.id}`,
                    target: `job-${job.id}`,
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444' },
                  });

                  jobY += 120;
                }
              });

              eventY = Math.max(eventY + 150, jobY);
            }
          });

          // Build child invocations recursively
          inv.event_executions?.forEach(event => {
            event.job_executions?.forEach((job, jobIndex) => {
              const childInvocations = invocationsByParentJob.get(job.id);
              if (childInvocations && childInvocations.length > 0) {
                // Position child invocations to the right of the job that triggers them
                const jobNodePosition = allJobNodes.get(job.id)?.position;
                const childStartX = jobNodePosition ? jobNodePosition.x + 300 : startX + levelSpacing;
                const childStartY = jobNodePosition ? jobNodePosition.y : currentY;

                buildInvocationTree(childInvocations, childStartX, childStartY, level + 1);
              }
            });
          });

          currentY = Math.max(currentY + 400, eventY + 100);
        });
      };

      // Start building from root invocations
      buildInvocationTree(rootInvocations, 50, 100);

      return { generatedNodes: nodes, generatedEdges: edges };
    }

    // Fallback to enhanced mock data with more events for testing grouping
    return generateEnhancedMockData();
  }, [invocationData, correlationData]);

  // Auto-focus functionality
  useEffect(() => {
    if (autoFocus && invocationId && reactFlowInstance && generatedNodes.length > 0 && !autoFocusCompleted) {
      const targetNode = generatedNodes.find(node => node.id === invocationId);
      if (targetNode) {
        // Center the view on the target node
        reactFlowInstance.fitView({
          nodes: [targetNode],
          padding: 0.3,
          duration: 800,
        });

        // Highlight the correlation chain
        if (correlationId) {
          setHighlightCorrelation(correlationId);
        }

        // Update URL to remove autoFocus flag
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('autoFocus');
        setSearchParams(newSearchParams, { replace: true });

        setAutoFocusCompleted(true);
      }
    }
  }, [
    autoFocus,
    invocationId,
    reactFlowInstance,
    generatedNodes,
    autoFocusCompleted,
    correlationId,
    searchParams,
    setSearchParams,
  ]);

  // Update nodes and edges when data changes
  useEffect(() => {
    if (generatedNodes.length > 0) {
      setNodes(generatedNodes);
      setEdges(generatedEdges);
    }
  }, [generatedNodes, generatedEdges, setNodes, setEdges]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  }, []);

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      console.log(
        `Node dragged - Type: ${node.type}, ID: ${node.id}, Position: x=${node.position.x}, y=${node.position.y}`
      );

      // Find the invocation node to calculate relative positioning
      const invocationNode = nodes.find(n => n.type === 'invocation');
      if (invocationNode && node.id !== invocationNode.id) {
        const relativeX = node.position.x - invocationNode.position.x;
        const relativeY = node.position.y - invocationNode.position.y;
        console.log(`Relative to invocation - Type: ${node.type}, RelativeX: ${relativeX}, RelativeY: ${relativeY}`);
      }
    },
    [nodes]
  );

  const filteredNodes = useMemo(() => {
    let filteredNodes = nodes;

    // Apply search filter
    if (searchTerm) {
      filteredNodes = nodes.map(node => ({
        ...node,
        hidden:
          !node.data.correlationId?.includes(searchTerm) &&
          !node.data.sourceFunction?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !node.data.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !node.data.jobName?.toLowerCase().includes(searchTerm.toLowerCase()),
      }));
    }

    // Apply correlation highlighting
    if (highlightCorrelation) {
      filteredNodes = filteredNodes.map(node => ({
        ...node,
        style: {
          ...node.style,
          opacity: node.data.correlationId?.includes(highlightCorrelation) ? 1 : 0.3,
        },
      }));
    }

    return filteredNodes;
  }, [nodes, searchTerm, highlightCorrelation]);

  const filteredEdges = useMemo(() => {
    if (!highlightCorrelation) return edges;

    return edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      const isHighlighted =
        sourceNode?.data.correlationId?.includes(highlightCorrelation) ||
        targetNode?.data.correlationId?.includes(highlightCorrelation);

      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isHighlighted ? 1 : 0.2,
        },
      };
    });
  }, [edges, nodes, highlightCorrelation]);

  // Extract unique correlation chains from nodes
  const correlationChains = useMemo(() => {
    const chains = new Map<string, { id: string; nodes: Node[]; totalJobs: number; status: string }>();

    nodes.forEach(node => {
      if (node.data.correlationId) {
        const baseId = node.data.correlationId.split('.')[0];
        if (!chains.has(baseId)) {
          chains.set(baseId, {
            id: baseId,
            nodes: [],
            totalJobs: 0,
            status: 'completed',
          });
        }
        const chain = chains.get(baseId)!;
        chain.nodes.push(node);
        if (node.type === 'job') {
          chain.totalJobs++;
          if (node.data.status === 'failed') {
            chain.status = 'failed';
          }
        }
      }
    });

    return Array.from(chains.values());
  }, [nodes]);

  return (
    <div className='h-full flex flex-col'>
      {/* Header */}
      <div className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>Event Flow Visualization</h2>
            <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
              Interactive correlation chain diagram with recursive invocations
            </p>
          </div>

          <div className='flex items-center space-x-4'>
            {/* View Mode Toggle */}
            <div className='flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1'>
              <button
                onClick={() => setViewMode('flow')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'flow'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                Flow View
              </button>
              <button
                onClick={() => setViewMode('correlation')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'correlation'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                Correlation Chains
              </button>
            </div>

            <input
              type='text'
              placeholder='Filter nodes...'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className='px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500'
            />

            {viewMode === 'correlation' && (
              <select
                value={highlightCorrelation || 'none'}
                onChange={e => setHighlightCorrelation(e.target.value === 'none' ? null : e.target.value)}
                className='px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              >
                <option value='none'>Show All</option>
                {correlationChains.map(chain => (
                  <option key={chain.id} value={chain.id}>
                    {chain.id} ({chain.nodes.length} nodes)
                  </option>
                ))}
              </select>
            )}

            <div className='flex items-center space-x-2 text-sm'>
              <div className='flex items-center'>
                <div className='w-3 h-3 bg-blue-500 rounded-sm mr-1' />
                <span className='text-gray-600 dark:text-gray-400'>Invocation</span>
              </div>
              <div className='flex items-center'>
                <div className='w-3 h-3 bg-green-500 rounded-sm mr-1' />
                <span className='text-gray-600 dark:text-gray-400'>Event</span>
              </div>
              <div className='flex items-center'>
                <div className='w-3 h-3 bg-purple-500 rounded-sm mr-1' />
                <span className='text-gray-600 dark:text-gray-400'>Job</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Chains Stats Panel */}
      {viewMode === 'correlation' && (
        <div className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4'>
          <div className='flex items-center justify-between'>
            <h3 className='text-sm font-medium text-gray-700 dark:text-gray-300'>Correlation Chains</h3>
            <span className='text-xs text-gray-500'>{correlationChains.length} chains found</span>
          </div>
          <div className='mt-3 flex flex-wrap gap-2'>
            {correlationChains.slice(0, 5).map(chain => (
              <button
                key={chain.id}
                onClick={() => setHighlightCorrelation(highlightCorrelation === chain.id ? null : chain.id)}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                  highlightCorrelation === chain.id
                    ? 'bg-purple-100 border-purple-300 text-purple-800 dark:bg-purple-900/30 dark:border-purple-600 dark:text-purple-400'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <div className='flex items-center space-x-1'>
                  <div
                    className={`w-2 h-2 rounded-full ${chain.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  <span className='font-medium'>{chain.id}</span>
                  <span className='text-gray-500 dark:text-gray-400'>({chain.totalJobs})</span>
                </div>
              </button>
            ))}
            {correlationChains.length > 5 && (
              <span className='px-3 py-2 text-xs text-gray-500 dark:text-gray-400'>
                +{correlationChains.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading States */}
      {(invocationLoading || correlationLoading) && (
        <div className='absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50'>
          <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg'>
            <div className='flex items-center space-x-3'>
              <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600'></div>
              <span className='text-gray-900 dark:text-white'>Loading flow diagram...</span>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {(invocationId || correlationId) && (
        <div className='bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3'>
          <nav className='flex items-center space-x-2 text-sm'>
            <button
              onClick={() => navigate('/invocations')}
              className='text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
            >
              All Invocations
            </button>
            <span className='text-gray-400 dark:text-gray-600'>/</span>
            {invocationId && (
              <>
                <span className='text-gray-700 dark:text-gray-300'>Invocation</span>
                <span className='text-gray-400 dark:text-gray-600'>/</span>
                <span className='font-medium text-gray-900 dark:text-white'>{invocationId.split('-')[0]}...</span>
              </>
            )}
            {correlationId && (
              <>
                <span className='text-gray-400 dark:text-gray-600'>/</span>
                <span className='font-medium text-purple-700 dark:text-purple-400'>Chain: {correlationId}</span>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Flow Diagram */}
      <div className='flex-1 bg-gray-50 dark:bg-gray-900'>
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          onInit={instance => {
            // Store the ReactFlow instance for later use
            // This will be used in the auto-focus effect
          }}
          defaultEdgeOptions={{
            type: 'default', // Use bezier curves for smooth connections
            animated: true,
            style: { strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20,
            },
          }}
        >
          <Background gap={20} className='bg-gray-50 dark:bg-gray-900' />
          <Controls className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700' />
          <MiniMap
            className='bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
            nodeColor={node => {
              if (node.type === 'invocation') return '#3b82f6';
              if (node.type === 'event') return '#10b981';
              if (node.type === 'job') return '#8b5cf6';
              return '#6b7280';
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail Drawer - Type-specific modals */}
      <AnimatePresence>
        {drawerOpen && selectedNode && (
          <>
            {selectedNode.type === 'invocation' && (
              <InvocationDetailDrawer node={selectedNode} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
            )}
            {selectedNode.type === 'job' && (
              <JobDetailDrawer node={selectedNode} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
            )}
            {selectedNode.type === 'event' && (
              <EventDetailDrawer node={selectedNode} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
            )}
            {selectedNode.type === 'groupedEvents' && (
              <InvocationDetailDrawer node={selectedNode} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
            )}
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// Wrapper component that provides ReactFlow context
const FlowDiagram = () => {
  return (
    <ReactFlowProvider>
      <FlowDiagramContent />
    </ReactFlowProvider>
  );
};

export default FlowDiagram;
