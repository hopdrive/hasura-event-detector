import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import { useCorrelationChainFlowQuery, useInvocationDetailQuery } from '../types/generated';
import 'reactflow/dist/style.css';

// Custom Node Components
const InvocationNode = ({ data, selected }: NodeProps) => {
  const statusColors = {
    completed: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    failed: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    running: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
  };

  const statusDots = {
    completed: 'bg-green-500',
    failed: 'bg-red-500',
    running: 'bg-blue-500 animate-pulse'
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2 
        ${statusColors[data.status as keyof typeof statusColors]}
        ${selected ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
        shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer
        min-w-[240px]
      `}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      
      {/* Blue accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 rounded-l-lg" />
      
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
            Invocation
          </span>
          <div className={`w-2 h-2 rounded-full ${statusDots[data.status as keyof typeof statusDots]}`} />
        </div>
        
        <div className="space-y-1">
          <p className="font-semibold text-gray-900 dark:text-white text-sm">
            {data.sourceFunction}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {data.duration}ms • {data.eventsCount} events
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 font-mono truncate">
            {data.correlationId}
          </p>
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
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
        ${isDetected 
          ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
          : 'border-gray-300 bg-gray-50 dark:bg-gray-900/20 opacity-60'
        }
        ${selected ? 'ring-4 ring-green-400 ring-opacity-50' : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[200px]
      `}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      
      {/* Green accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-lg" />
      
      <div className="p-3 pl-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide">
            Event
          </span>
          {isDetected && (
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        
        <p className="font-medium text-gray-900 dark:text-white text-sm">
          {data.eventName}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          {data.duration}ms • {isDetected ? `${data.jobsCount} jobs` : 'Not detected'}
        </p>
      </div>
      
      {isDetected && <Handle type="source" position={Position.Bottom} className="w-3 h-3" />}
    </motion.div>
  );
};

const JobNode = ({ data, selected }: NodeProps) => {
  const statusColors = {
    completed: 'border-green-500',
    failed: 'border-red-500',
    running: 'border-blue-500'
  };
  
  const hasRecursion = data.triggersInvocation;
  
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={`
        relative bg-white dark:bg-gray-800 rounded-lg border-2
        ${statusColors[data.status as keyof typeof statusColors]}
        ${selected ? 'ring-4 ring-purple-400 ring-opacity-50' : ''}
        ${hasRecursion ? 'ring-2 ring-purple-500 ring-offset-2' : ''}
        shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer
        min-w-[180px]
      `}
    >
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      
      {/* Purple accent strip */}
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 rounded-l-lg" />
      
      <div className="p-3 pl-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
            Job
          </span>
          {hasRecursion && (
            <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
        </div>
        
        <p className="font-medium text-gray-900 dark:text-white text-sm">
          {data.jobName}
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          {data.duration}ms
        </p>
        {hasRecursion && (
          <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 font-medium">
            → Triggers new invocation
          </p>
        )}
      </div>
      
      {hasRecursion && <Handle type="source" position={Position.Bottom} className="w-3 h-3" />}
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
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-purple-200 uppercase tracking-wider">
            Correlation Chain
          </span>
          <div className="flex items-center space-x-1">
            <div className={`w-3 h-3 rounded-full ${
              data.status === 'completed' ? 'bg-green-400' :
              data.status === 'failed' ? 'bg-red-400' : 'bg-yellow-400'
            }`} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-bold text-lg">
            {data.chainId}
          </p>
          <p className="text-purple-100 text-sm">
            {data.totalInvocations} invocations • {data.totalJobs} jobs
          </p>

          <div className="flex items-center justify-between text-sm">
            <span className="text-purple-200">Duration: {data.totalDuration}ms</span>
            <span className="text-purple-200">
              Success: {Math.round((data.successfulJobs / data.totalJobs) * 100)}%
            </span>
          </div>

          {data.recursive && (
            <div className="mt-3 px-3 py-1 bg-purple-400/30 rounded-full">
              <span className="text-xs font-medium">🔄 Recursive Chain</span>
            </div>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </motion.div>
  );
};

const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
  correlationChain: CorrelationChainNode
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
    errorPolicy: 'all'
  });

  const { data: correlationData, loading: correlationLoading } = useCorrelationChainFlowQuery({
    variables: { correlationId: correlationId || '' },
    skip: !correlationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all'
  });

  // Generate nodes and edges from real data
  const { generatedNodes, generatedEdges } = useMemo(() => {
    if (invocationData?.invocations_by_pk) {
      const invocation = invocationData.invocations_by_pk;
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // Create invocation node
      const invocationNode: Node = {
        id: invocation.id,
        type: 'invocation',
        position: { x: 400, y: 50 },
        data: {
          sourceFunction: invocation.source_function,
          correlationId: invocation.correlation_id,
          status: invocation.status,
          duration: invocation.total_duration_ms,
          eventsCount: invocation.events_detected_count,
          jobsCount: invocation.total_jobs_run,
          successfulJobs: invocation.total_jobs_succeeded,
          failedJobs: invocation.total_jobs_failed
        }
      };
      nodes.push(invocationNode);

      // Create event nodes
      invocation.event_executions?.forEach((event, eventIndex) => {
        const eventNode: Node = {
          id: `event-${event.id}`,
          type: 'event',
          position: { x: 200 + (eventIndex * 300), y: 250 },
          data: {
            eventName: event.event_name,
            correlationId: event.correlation_id,
            detected: event.detected,
            status: event.status,
            detectionDuration: event.detection_duration_ms,
            handlerDuration: event.handler_duration_ms,
            jobsCount: event.jobs_count
          }
        };
        nodes.push(eventNode);

        // Connect invocation to event
        edges.push({
          id: `inv-to-event-${event.id}`,
          source: invocation.id,
          target: `event-${event.id}`,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: event.detected ? '#10b981' : '#ef4444' }
        });

        // Create job nodes for each event
        event.job_executions?.forEach((job, jobIndex) => {
          const jobNode: Node = {
            id: `job-${job.id}`,
            type: 'job',
            position: { x: 200 + (eventIndex * 300), y: 450 + (jobIndex * 120) },
            data: {
              jobName: job.job_name,
              functionName: job.job_function_name,
              correlationId: job.correlation_id,
              status: job.status,
              duration: job.duration_ms,
              result: job.result,
              error: job.error_message
            }
          };
          nodes.push(jobNode);

          // Connect event to job
          edges.push({
            id: `event-to-job-${job.id}`,
            source: `event-${event.id}`,
            target: `job-${job.id}`,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: job.status === 'completed' ? '#10b981' : '#ef4444' }
          });
        });
      });

      return { generatedNodes: nodes, generatedEdges: edges };
    }

    // Use correlation chain data if available
    if (correlationData?.invocations && correlationData.invocations.length > 0) {
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      correlationData.invocations.forEach((inv, invIndex) => {
        const invocationNode: Node = {
          id: inv.id,
          type: 'invocation',
          position: { x: 400 + (invIndex * 500), y: 50 },
          data: {
            sourceFunction: inv.source_function,
            correlationId: inv.correlation_id,
            status: inv.status,
            duration: inv.total_duration_ms,
            eventsCount: inv.events_detected_count
          }
        };
        nodes.push(invocationNode);

        // If this is a chain, connect invocations
        if (invIndex > 0) {
          edges.push({
            id: `chain-${invIndex}`,
            source: correlationData.invocations[invIndex - 1].id,
            target: inv.id,
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: '#8b5cf6', strokeWidth: 3 }
          });
        }
      });

      return { generatedNodes: nodes, generatedEdges: edges };
    }

    // Fallback to mock data
    return { generatedNodes: mockFlowData.nodes, generatedEdges: mockFlowData.edges };
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
          duration: 800
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
  }, [autoFocus, invocationId, reactFlowInstance, generatedNodes, autoFocusCompleted, correlationId, searchParams, setSearchParams]);

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

  const filteredNodes = useMemo(() => {
    let filteredNodes = nodes;

    // Apply search filter
    if (searchTerm) {
      filteredNodes = nodes.map(node => ({
        ...node,
        hidden: !node.data.correlationId?.includes(searchTerm) &&
                !node.data.sourceFunction?.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !node.data.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) &&
                !node.data.jobName?.toLowerCase().includes(searchTerm.toLowerCase())
      }));
    }

    // Apply correlation highlighting
    if (highlightCorrelation) {
      filteredNodes = filteredNodes.map(node => ({
        ...node,
        style: {
          ...node.style,
          opacity: node.data.correlationId?.includes(highlightCorrelation) ? 1 : 0.3
        }
      }));
    }

    return filteredNodes;
  }, [nodes, searchTerm, highlightCorrelation]);

  const filteredEdges = useMemo(() => {
    if (!highlightCorrelation) return edges;

    return edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      const isHighlighted = sourceNode?.data.correlationId?.includes(highlightCorrelation) ||
                           targetNode?.data.correlationId?.includes(highlightCorrelation);

      return {
        ...edge,
        style: {
          ...edge.style,
          opacity: isHighlighted ? 1 : 0.2
        }
      };
    });
  }, [edges, nodes, highlightCorrelation]);

  // Extract unique correlation chains from nodes
  const correlationChains = useMemo(() => {
    const chains = new Map<string, { id: string, nodes: Node[], totalJobs: number, status: string }>();

    nodes.forEach(node => {
      if (node.data.correlationId) {
        const baseId = node.data.correlationId.split('.')[0];
        if (!chains.has(baseId)) {
          chains.set(baseId, {
            id: baseId,
            nodes: [],
            totalJobs: 0,
            status: 'completed'
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Event Flow Visualization
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Interactive correlation chain diagram with recursive invocations
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
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
              type="text"
              placeholder="Filter nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500"
            />

            {viewMode === 'correlation' && (
              <select
                value={highlightCorrelation || 'none'}
                onChange={(e) => setHighlightCorrelation(e.target.value === 'none' ? null : e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="none">Show All</option>
                {correlationChains.map(chain => (
                  <option key={chain.id} value={chain.id}>
                    {chain.id} ({chain.nodes.length} nodes)
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center space-x-2 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-sm mr-1" />
                <span className="text-gray-600 dark:text-gray-400">Invocation</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-sm mr-1" />
                <span className="text-gray-600 dark:text-gray-400">Event</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-purple-500 rounded-sm mr-1" />
                <span className="text-gray-600 dark:text-gray-400">Job</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Correlation Chains Stats Panel */}
      {viewMode === 'correlation' && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Correlation Chains</h3>
            <span className="text-xs text-gray-500">{correlationChains.length} chains found</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="flex items-center space-x-1">
                  <div className={`w-2 h-2 rounded-full ${
                    chain.status === 'completed' ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <span className="font-medium">{chain.id}</span>
                  <span className="text-gray-500 dark:text-gray-400">({chain.totalJobs})</span>
                </div>
              </button>
            ))}
            {correlationChains.length > 5 && (
              <span className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                +{correlationChains.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Loading States */}
      {(invocationLoading || correlationLoading) && (
        <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="text-gray-900 dark:text-white">Loading flow diagram...</span>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Navigation */}
      {(invocationId || correlationId) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-6 py-3">
          <nav className="flex items-center space-x-2 text-sm">
            <button
              onClick={() => navigate('/invocations')}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              All Invocations
            </button>
            <span className="text-gray-400 dark:text-gray-600">/</span>
            {invocationId && (
              <>
                <span className="text-gray-700 dark:text-gray-300">Invocation</span>
                <span className="text-gray-400 dark:text-gray-600">/</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {invocationId.split('-')[0]}...
                </span>
              </>
            )}
            {correlationId && (
              <>
                <span className="text-gray-400 dark:text-gray-600">/</span>
                <span className="font-medium text-purple-700 dark:text-purple-400">
                  Chain: {correlationId}
                </span>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Flow Diagram */}
      <div className="flex-1 bg-gray-50 dark:bg-gray-900">
        <ReactFlow
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          onInit={(instance) => {
            // Store the ReactFlow instance for later use
            // This will be used in the auto-focus effect
          }}
          defaultEdgeOptions={{
            type: 'smoothstep',
            animated: true,
            style: { strokeWidth: 2 },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 20,
              height: 20
            }
          }}
        >
          <Background gap={20} className="bg-gray-50 dark:bg-gray-900" />
          <Controls className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" />
          <MiniMap
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            nodeColor={(node) => {
              if (node.type === 'invocation') return '#3b82f6';
              if (node.type === 'event') return '#10b981';
              if (node.type === 'job') return '#8b5cf6';
              return '#6b7280';
            }}
          />
        </ReactFlow>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {drawerOpen && selectedNode && (
          <InvocationDetailDrawer
            node={selectedNode}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
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
