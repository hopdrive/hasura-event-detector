import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { formatDuration } from '../utils/formatDuration';
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
import { useInvocationFlowQuery } from '../types/generated';
import 'reactflow/dist/style.css';
import JobDetailDrawer from './JobDetailDrawer';
import EventDetailDrawer from './EventDetailDrawer';
import UndetectedEventsDetailDrawer from './UndetectedEventsDetailDrawer';

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
            {formatDuration(data.duration)} • {data.eventsCount} events
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

const EventNode = ({ data, selected }: NodeProps) => {
  const isDetected = data.detected;
  const hasFailedJobs = data.hasFailedJobs;
  const hasErrors = isDetected && hasFailedJobs;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2
        ${hasErrors ? 'border-red-500' : isDetected ? 'border-green-500' : 'border-gray-300 opacity-60'}
        ${selected ? `ring-4 ${hasErrors ? 'ring-red-400' : 'ring-green-400'} ring-opacity-50` : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[220px]
      `}
    >
      <Handle type='target' position={Position.Left} className='w-3 h-3' />

      {/* Status-colored accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${hasErrors ? 'bg-red-500' : 'bg-green-500'} rounded-l-lg`} />

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
            title={`Detection took ${formatDuration(data.detectionDuration)}`}
          >
            {formatDuration(data.detectionDuration)}
            <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50'>
              Detection took {formatDuration(data.detectionDuration)}
              <div className='absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900'></div>
            </div>
          </span>
          {isDetected && data.handlerDuration && (
            <span
              className='relative inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors group'
              title={`Handler took ${formatDuration(data.handlerDuration)}`}
            >
              {formatDuration(data.handlerDuration)}
              <div className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50'>
                Handler took {formatDuration(data.handlerDuration)}
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

const JobNode = ({ data, selected }: NodeProps) => {
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
  const status = data.status || 'completed';
  const colors = statusColors[status as keyof typeof statusColors] || statusColors.completed;
  const isFailed = status === 'failed';

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 ${colors.border}
        ${selected ? `ring-4 ${colors.ring} ring-opacity-50` : ''}
        ${hasRecursion ? `ring-2 ${colors.border.replace('border-', 'ring-')} ring-offset-2` : ''}
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
        </div>

        <p className='font-medium text-gray-900 dark:text-white text-sm'>{data.jobName}</p>
        <p className='text-xs text-gray-600 dark:text-gray-400 mt-1'>{formatDuration(data.duration)}</p>
        {hasRecursion && (
          <p className='text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium'>→ Triggers new invocation</p>
        )}
      </div>

      {hasRecursion && <Handle type='source' position={Position.Right} className='w-3 h-3' />}
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

const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
  groupedEvents: GroupedEventsNode,
};


// Inner component that uses ReactFlow hooks
const FlowDiagramContent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoFocusCompleted, setAutoFocusCompleted] = useState(false);

  // URL Parameters
  const invocationId = searchParams.get('invocationId');
  const autoFocus = searchParams.get('autoFocus') === 'true';

  // GraphQL Query for invocation flow
  const { data, loading, error } = useInvocationFlowQuery({
    variables: { invocationId: invocationId || '' },
    skip: !invocationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });


  // Reusable positioning system with predictable calculations
  const HORIZONTAL_SPACING = 450; // Space between node levels (increased to prevent overlap)
  const VERTICAL_SPACING = 120; // Space between sibling nodes (adjusted for better job spacing)
  const NODE_HEIGHT = 80; // Approximate height of a node
  const MIN_VERTICAL_SPACING = 100; // Minimum space between nodes to prevent overlap

  // Calculate vertical position for centered child nodes
  const calculateChildPositions = (childCount: number, parentY: number, spacing?: number) => {
    if (childCount === 0) return [];

    // Use custom spacing or default
    const verticalSpacing = spacing || VERTICAL_SPACING;

    // For single child, align with parent
    if (childCount === 1) return [parentY];

    const totalHeight = (childCount - 1) * verticalSpacing;
    const startY = parentY - totalHeight / 2;

    return Array.from({ length: childCount }, (_, i) =>
      startY + i * verticalSpacing
    );
  };

  // Calculate required spacing between events based on their job counts
  const calculateEventSpacing = (events: any[]) => {
    return events.map(event => {
      const jobCount = event.job_executions?.length || 0;
      // Calculate the total height needed for this event's jobs
      const jobSpacing = jobCount > 3 ? VERTICAL_SPACING * 1.2 : VERTICAL_SPACING;
      const jobsHeight = jobCount > 1 ? (jobCount - 1) * jobSpacing : 0;

      // Add padding to prevent overlap with sibling events
      const minSpacing = 160; // Minimum space between events
      const requiredSpacing = Math.max(minSpacing, jobsHeight + 80); // 80px buffer

      return {
        event,
        requiredSpacing,
        jobCount
      };
    });
  };

  // Generate nodes and edges from invocation data with smart grouping
  const { generatedNodes, generatedEdges } = useMemo(() => {
    if (data?.invocations_by_pk) {
      const invocation = data.invocations_by_pk;
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Starting position for the invocation
      const baseX = 50;
      const baseY = 300;

      // Smart event grouping logic
      const events = invocation.event_executions || [];
      const detectedEvents = events.filter(e => e.detected);
      const undetectedEvents = events.filter(e => !e.detected);

      // Create invocation node
      const invocationNode: Node = {
        id: invocation.id,
        type: 'invocation',
        position: { x: baseX, y: baseY },
        data: {
          sourceFunction: invocation.source_function,
          correlationId: invocation.correlation_id,
          status: invocation.status,
          duration: invocation.total_duration_ms,
          eventsCount: detectedEvents.length,
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
          position: { x: baseX - HORIZONTAL_SPACING, y: baseY },
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
        // Calculate dynamic spacing for detected events based on their job counts
        const eventSpacingData = calculateEventSpacing(detectedEvents);

        // Calculate positions with dynamic spacing
        let currentEventY = baseY;
        if (eventSpacingData.length > 1) {
          // Calculate total height needed and center all events
          const totalHeight = eventSpacingData.reduce((sum, data, index) =>
            sum + (index < eventSpacingData.length - 1 ? data.requiredSpacing : 0), 0
          );
          currentEventY = baseY - totalHeight / 2;
        }

        // Show detected events individually with dynamic spacing
        eventSpacingData.forEach((eventData, eventIndex) => {
          const eventY = currentEventY;
          const eventX = baseX + HORIZONTAL_SPACING + 150;
          const { event } = eventData;

          const eventNode: Node = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: eventX, y: eventY },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration_ms,
              handlerDuration: event.handler_duration_ms,
              jobsCount: event.jobs_count,
              hasFailedJobs: (event.job_executions || []).some((job: any) => job.status === 'failed'),
            },
          };
          nodes.push(eventNode);

          // Connect invocation to detected event
          edges.push({
            id: `inv-to-event-${event.id}`,
            source: invocation.id,
            target: `event-${event.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#3b82f6', strokeWidth: 2 }, // Blue to match invocation node
          });

          // Calculate positions for jobs (centered on their parent event)
          const jobs = event.job_executions || [];
          // Use larger spacing for jobs if there are many
          const jobSpacing = jobs.length > 3 ? VERTICAL_SPACING * 1.2 : VERTICAL_SPACING;
          const jobPositions = calculateChildPositions(jobs.length, eventY, jobSpacing);

          // Create job nodes for detected events (centered on parent event)
          jobs.forEach((job, jobIndex) => {
            const jobY = jobPositions[jobIndex];
            const jobX = eventX + HORIZONTAL_SPACING;

            const jobNode: Node = {
              id: `job-${job.id}`,
              type: 'job',
              position: { x: jobX, y: jobY },
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
              style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444', strokeWidth: 2 },
            });
          });

          // Move to next event position using dynamic spacing
          currentEventY += eventData.requiredSpacing;
        });

        // Group undetected events (if any) - position below the invocation
        if (undetectedEvents.length > 0) {
          const groupedNode: Node = {
            id: 'grouped-undetected',
            type: 'groupedEvents',
            position: {
              x: baseX,
              y: baseY + VERTICAL_SPACING * 1.5, // Position below invocation
            },
            data: {
              totalCount: undetectedEvents.length,
              detectedCount: 0,
              undetectedCount: undetectedEvents.length,
              events: undetectedEvents.map(e => ({
                name: e.event_name,
                detected: e.detected,
                duration: e.detection_duration_ms || 0,
                correlationId: e.correlation_id,
                status: e.status,
                eventId: e.id,
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
            style: { stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '5,5' }, // Blue dashed to match invocation node
          });
        }
      } else {
        // Calculate dynamic spacing for all events based on their job counts
        const eventSpacingData = calculateEventSpacing(events);

        // Calculate positions with dynamic spacing
        let currentEventY = baseY;
        if (eventSpacingData.length > 1) {
          // Calculate total height needed and center all events
          const totalHeight = eventSpacingData.reduce((sum, data, index) =>
            sum + (index < eventSpacingData.length - 1 ? data.requiredSpacing : 0), 0
          );
          currentEventY = baseY - totalHeight / 2;
        }

        // Show all events individually with dynamic spacing
        eventSpacingData.forEach((eventData, eventIndex) => {
          const eventY = currentEventY;
          const eventX = baseX + HORIZONTAL_SPACING + 80;
          const { event } = eventData;

          const eventNode: Node = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: eventX, y: eventY },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration_ms,
              handlerDuration: event.handler_duration_ms,
              jobsCount: event.jobs_count,
              hasFailedJobs: (event.job_executions || []).some((job: any) => job.status === 'failed'),
            },
          };
          nodes.push(eventNode);

          // Connect invocation to event
          edges.push({
            id: `inv-to-event-${event.id}`,
            source: invocation.id,
            target: `event-${event.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#3b82f6', strokeWidth: 2 }, // Blue to match invocation node
          });

          // Create job nodes for detected events only
          if (event.detected) {
            const jobs = event.job_executions || [];
            // Use larger spacing for jobs if there are many
            const jobSpacing = jobs.length > 3 ? VERTICAL_SPACING * 1.2 : VERTICAL_SPACING;
            const jobPositions = calculateChildPositions(jobs.length, eventY, jobSpacing);

            jobs.forEach((job, jobIndex) => {
              const jobY = jobPositions[jobIndex];
              const jobX = eventX + HORIZONTAL_SPACING;

              const jobNode: Node = {
                id: `job-${job.id}`,
                type: 'job',
                position: { x: jobX, y: jobY },
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
                style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444', strokeWidth: 2 },
              });
            });
          }

          // Move to next event position using dynamic spacing
          currentEventY += eventData.requiredSpacing;
        });
      }

      return { generatedNodes: nodes, generatedEdges: edges };
    }


    // Return empty if no data
    return { generatedNodes: [], generatedEdges: [] };
  }, [data]);

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
    searchParams,
    setSearchParams,
  ]);

  // Update nodes and edges when data changes and auto-fit view
  useEffect(() => {
    if (generatedNodes.length > 0) {
      setNodes(generatedNodes);
      setEdges(generatedEdges);

      // Auto-fit view to show all nodes with padding
      setTimeout(() => {
        reactFlowInstance?.fitView({
          padding: 0.2,
          duration: 800,
          maxZoom: 1.5,
          minZoom: 0.1
        });
      }, 100);
    }
  }, [generatedNodes, generatedEdges, setNodes, setEdges, reactFlowInstance]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setDrawerOpen(true);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setDrawerOpen(false);
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

    return filteredNodes;
  }, [nodes, searchTerm]);



  return (
    <div className='h-full flex flex-col'>
      {/* Header */}
      <div className='bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4'>
        <div className='flex items-center justify-between'>
          <div>
            <h2 className='text-xl font-semibold text-gray-900 dark:text-white'>Invocation Flow</h2>
            <p className='mt-1 text-sm text-gray-600 dark:text-gray-400'>
              {invocationId ? `Viewing flow for invocation ${invocationId.substring(0, 8)}...` : 'No invocation selected'}
            </p>
          </div>

          <div className='flex items-center space-x-4'>
            <input
              type='text'
              placeholder='Filter nodes...'
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className='px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500'
            />

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

      {/* Loading States */}
      {loading && (
        <div className='absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50'>
          <div className='bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg'>
            <div className='flex items-center space-x-3'>
              <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600'></div>
              <span className='text-gray-900 dark:text-white'>Loading invocation flow...</span>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {invocationId && (
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
          </nav>
        </div>
      )}

      {/* Flow Diagram */}
      <div className='flex-1 bg-gray-50 dark:bg-gray-900'>
        <ReactFlow
          nodes={filteredNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{
            padding: 0.2,
            includeHiddenNodes: false,
            maxZoom: 1.5,
            minZoom: 0.1
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
              <UndetectedEventsDetailDrawer node={selectedNode} isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />
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
