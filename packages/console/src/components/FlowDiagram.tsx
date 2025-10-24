import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { nodeTypes } from './nodes';
import { useFlowPositioning } from '../hooks/useFlowPositioning';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  MarkerType,
  useReactFlow,
  NodeProps,
  ReactFlowProvider,
  ConnectionMode,
} from 'reactflow';
import { AnimatePresence } from 'framer-motion';
import { useInvocationTreeFlowQuery } from '../types/generated';
import InvocationDetailDrawer from './InvocationDetailDrawer';
import 'reactflow/dist/style.css';
import JobDetailDrawer from './JobDetailDrawer';
import EventDetailDrawer from './EventDetailDrawer';
import UndetectedEventsDetailDrawer from './UndetectedEventsDetailDrawer';

// Helper function to calculate flow summary statistics
export const calculateFlowSummary = (invocations: any[]) => {
  let totalInvocations = 0;
  let totalEvents = 0;
  let detectedEvents = 0;
  let undetectedEvents = 0;
  let totalJobs = 0;
  let successfulJobs = 0;
  let failedJobs = 0;
  let runningJobs = 0;

  invocations.forEach(invocation => {
    totalInvocations++;
    const events = invocation.event_executions || [];

    events.forEach((event: any) => {
      totalEvents++;
      if (event.detected) {
        detectedEvents++;
      } else {
        undetectedEvents++;
      }

      const jobs = event.job_executions || [];
      jobs.forEach((job: any) => {
        totalJobs++;
        switch (job.status) {
          case 'completed':
            successfulJobs++;
            break;
          case 'failed':
            failedJobs++;
            break;
          case 'running':
            runningJobs++;
            break;
          default:
            successfulJobs++; // Default to successful for unknown statuses
        }
      });
    });
  });

  return {
    totalInvocations,
    totalEvents,
    detectedEvents,
    undetectedEvents,
    totalJobs,
    successfulJobs,
    failedJobs,
    runningJobs
  };
};

// FlowDiagram now uses extracted components and positioning hook

// Inner component that uses ReactFlow hooks
const FlowDiagramContent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const reactFlowInstance = useReactFlow();

  // Remove useNodesState and useEdgesState to avoid conflicts
  // We'll use direct props instead
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [autoFocusCompleted, setAutoFocusCompleted] = useState(false);

  // URL Parameters
  const invocationId = searchParams.get('invocationId');
  const autoFocus = searchParams.get('autoFocus') === 'true';

  // GraphQL Query for invocation tree flow
  const { data, loading, error } = useInvocationTreeFlowQuery({
    variables: { invocationId: invocationId || '' },
    skip: !invocationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });

  // Use the positioning hook to generate nodes and edges
  // Combine the main invocation with its correlated invocations for recursive rendering
  const invocations = data?.invocations_by_pk
    ? [data.invocations_by_pk, ...(data.invocations_by_pk.correlated_invocations || [])]
    : [];
  const { nodes: generatedNodes, edges: generatedEdges } = useFlowPositioning(invocations);


  // Auto-focus functionality
  useEffect(() => {
    if (autoFocus && invocationId && reactFlowInstance && generatedNodes.length > 0 && !autoFocusCompleted) {
      const targetNode = generatedNodes.find(node => node.id === invocationId);
      if (targetNode) {
        // Center the view on the target node
        reactFlowInstance.setCenter(targetNode.position.x, targetNode.position.y, { zoom: 1.2 });

        // Mark auto-focus as completed to prevent repeated execution
        setAutoFocusCompleted(true);

        // Remove autoFocus parameter from URL after focusing
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.delete('autoFocus');
        navigate(
          {
            pathname: location.pathname,
            search: newSearchParams.toString(),
          },
          { replace: true }
        );
      }
    }
  }, [
    autoFocus,
    invocationId,
    reactFlowInstance,
    generatedNodes,
    autoFocusCompleted,
    searchParams,
    navigate,
    location.pathname,
  ]);

  // No longer need to set nodes/edges state since we're using direct props

  // Auto-fit view to show all nodes
  useEffect(() => {
    if (generatedNodes.length > 0 && reactFlowInstance) {
      // Auto-fit view to show all nodes with proper padding
      setTimeout(() => {
        reactFlowInstance.fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          maxZoom: 1.5,
          minZoom: 0.1,
        });
      }, 100);
    }
  }, [generatedNodes.length, reactFlowInstance]);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setDrawerOpen(true);

    // Center and zoom on the selected node, accounting for the 600px drawer on the right
    setTimeout(() => {
      if (reactFlowInstance) {
        const flowBounds = document.querySelector('.react-flow')?.getBoundingClientRect();

        if (flowBounds) {
          const drawerWidth = 600;
          const zoom = 1.5;
          const totalWidth = flowBounds.width;
          const visibleWidth = totalWidth - drawerWidth;

          // FLIPPED: To shift the viewport so the node appears LEFT (in visible area),
          // we actually need to move the CENTER POINT to the RIGHT in flow coordinates
          // This is because setCenter positions what FLOW POINT appears at screen center

          // We want the node to appear at the center of the visible area
          // which is visibleWidth/2 from the left edge of the screen
          // In terms of offset from total screen center: -(drawerWidth/2)
          // But since we're moving the flow coordinate that appears at screen center,
          // we need to ADD (positive) to shift viewport left
          const shiftRight = (drawerWidth / 2);

          // Convert to flow coordinates
          const centerShiftInFlowCoords = shiftRight / zoom;

          // Position the node in the center of the visible area
          reactFlowInstance.setCenter(
            node.position.x + 120 + centerShiftInFlowCoords,
            node.position.y,
            {
              zoom: zoom,
              duration: 800
            }
          );
        }
      }
    }, 100);
  }, [reactFlowInstance]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setDrawerOpen(false);
  }, []);

  // Node dragging will work automatically with direct props

  // Filter nodes based on search - memoized to prevent re-renders
  const flowData = useMemo(() => {
    const filteredNodes = generatedNodes.filter((node) => {
      if (!searchTerm) return true;
      const searchLower = searchTerm.toLowerCase();

      // Search in node data based on node type
      switch (node.type) {
        case 'invocation':
          return (
            node.data.sourceFunction?.toLowerCase().includes(searchLower) ||
            node.data.correlationId?.toLowerCase().includes(searchLower)
          );
        case 'event':
          return (
            node.data.eventName?.toLowerCase().includes(searchLower) ||
            node.data.correlationId?.toLowerCase().includes(searchLower)
          );
        case 'job':
          return (
            node.data.jobName?.toLowerCase().includes(searchLower) ||
            node.data.functionName?.toLowerCase().includes(searchLower) ||
            node.data.correlationId?.toLowerCase().includes(searchLower)
          );
        case 'groupedEvents':
          return node.data.events?.some((event: any) =>
            event.event_name?.toLowerCase().includes(searchLower)
          );
        default:
          return true;
      }
    });

    // Mark the selected node
    const nodesWithSelection = filteredNodes.map(node => ({
      ...node,
      selected: selectedNode?.id === node.id
    }));

    // Filter edges to only include those connecting visible nodes
    const filteredNodeIds = new Set(filteredNodes.map(node => node.id));
    const filteredEdges = generatedEdges.filter(edge =>
      filteredNodeIds.has(edge.source) && filteredNodeIds.has(edge.target)
    );

    return { nodes: nodesWithSelection, edges: filteredEdges };
  }, [generatedNodes, generatedEdges, searchTerm, selectedNode]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Error loading flow diagram: {error.message}</div>
      </div>
    );
  }

  if (!data?.invocations_by_pk) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">No invocation data found</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative" style={{ minHeight: '600px' }}>
      {/* Search Bar - Floating overlay */}
      <div className="absolute top-4 left-4 z-10">
        <input
          type="text"
          placeholder="Search nodes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm w-64"
        />
      </div>

      <ReactFlow
        key={`flow-${flowData.nodes.length}`}
        nodes={flowData.nodes}
        edges={flowData.edges}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
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

// Main component that provides ReactFlow context
const FlowDiagram = () => {
  return (
    <ReactFlowProvider>
      <FlowDiagramContent />
    </ReactFlowProvider>
  );
};

export default FlowDiagram;