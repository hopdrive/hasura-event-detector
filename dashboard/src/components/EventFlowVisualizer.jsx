import React, { useCallback, useState, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ConnectionLineType,
  Handle,
  Position
} from 'reactflow';
import { Card, Select, Drawer, Descriptions, Tag, Typography, Space, Alert, Radio, Tooltip } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  LoadingOutlined,
  ThunderboltOutlined,
  BugOutlined,
  LinkOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { 
  INVOCATIONS_LIST_QUERY, 
  EVENT_FLOW_QUERY, 
  CORRELATION_CHAINS_LIST_QUERY, 
  CORRELATION_CHAIN_FLOW_QUERY 
} from '../graphql/queries';
import 'reactflow/dist/style.css';

const { Title, Text } = Typography;

// Custom Node Components
const InvocationNode = ({ data }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#52c41a';
      case 'failed': return '#ff4d4f';
      case 'running': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  return (
    <div style={{ 
      background: 'white', 
      border: `3px solid ${getStatusColor(data.status)}`,
      borderRadius: 8,
      padding: 16,
      minWidth: 200,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <ThunderboltOutlined style={{ fontSize: 16, marginRight: 8, color: '#1890ff' }} />
        <Text strong>INVOCATION</Text>
      </div>
      <Title level={5} style={{ margin: 0, marginBottom: 8 }}>{data.label}</Title>
      <Space direction="vertical" size="small">
        <div>
          <Tag color={data.status === 'completed' ? 'success' : data.status === 'failed' ? 'error' : 'processing'}>
            {data.status}
          </Tag>
          <Tag color="blue">{data.duration}ms</Tag>
        </div>
        <Text type="secondary">{data.eventsCount} events detected</Text>
      </Space>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const EventNode = ({ data }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'handling': return <LoadingOutlined style={{ color: '#1890ff' }} />;
      default: return <BugOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getBorderColor = () => {
    if (!data.detected) return '#d9d9d9';
    return data.status === 'completed' ? '#52c41a' : 
           data.status === 'failed' ? '#ff4d4f' : '#1890ff';
  };

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div style={{ 
        background: data.detected ? 'white' : '#f5f5f5', 
        border: `2px solid ${getBorderColor()}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 180,
        opacity: data.detected ? 1 : 0.6
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {getStatusIcon(data.status)}
          <Text strong style={{ marginLeft: 8 }}>EVENT</Text>
        </div>
        <Title level={5} style={{ margin: 0, marginBottom: 8 }}>{data.label}</Title>
        <Space direction="vertical" size="small">
          <div>
            <Tag color={data.detected ? 'success' : 'default'}>
              {data.detected ? 'detected' : 'not detected'}
            </Tag>
            {data.duration && <Tag color="blue">{data.duration}ms</Tag>}
          </div>
          {data.detected && (
            <Text type="secondary">{data.jobsCount || 0} jobs</Text>
          )}
        </Space>
      </div>
      {data.detected && <Handle type="source" position={Position.Bottom} />}
    </>
  );
};

const JobNode = ({ data }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'running': return <LoadingOutlined style={{ color: '#1890ff' }} />;
      default: return <BugOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#52c41a';
      case 'failed': return '#ff4d4f';
      case 'running': return '#1890ff';
      default: return '#d9d9d9';
    }
  };

  return (
    <>
      <Handle type="target" position={Position.Top} />
      <div style={{ 
        background: 'white',
        border: `2px solid ${getStatusColor(data.status)}`,
        borderRadius: 8,
        padding: 12,
        minWidth: 160,
        boxShadow: '0 1px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {getStatusIcon(data.status)}
          <Text strong style={{ marginLeft: 8 }}>JOB</Text>
        </div>
        <Title level={5} style={{ margin: 0, marginBottom: 8 }}>{data.label}</Title>
        <Space direction="vertical" size="small">
          <div>
            <Tag color={data.status === 'completed' ? 'success' : data.status === 'failed' ? 'error' : 'processing'}>
              {data.status}
            </Tag>
            {data.duration && <Tag color="blue">{data.duration}ms</Tag>}
          </div>
          {data.result && (
            <Text type="secondary" ellipsis style={{ maxWidth: 120 }}>
              {typeof data.result === 'string' ? data.result : 'Object result'}
            </Text>
          )}
        </Space>
      </div>
    </>
  );
};

// Correlation Chain Node - represents multiple linked invocations
const CorrelationChainNode = ({ data }) => {
  const getChainStatusColor = () => {
    const { chainStats } = data;
    if (!chainStats) return '#d9d9d9';
    
    const totalInvocations = chainStats.count || 0;
    const successfulInvocations = chainStats.successful || 0;
    const successRate = totalInvocations > 0 ? (successfulInvocations / totalInvocations) * 100 : 0;
    
    if (successRate >= 90) return '#52c41a';
    if (successRate >= 70) return '#faad14';
    return '#ff4d4f';
  };

  const formatDuration = (ms) => {
    if (!ms) return '0ms';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
      border: `3px solid ${getChainStatusColor()}`,
      borderRadius: 12,
      padding: 16,
      minWidth: 280,
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      color: 'white'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <LinkOutlined style={{ fontSize: 18, marginRight: 8 }} />
        <Text strong style={{ color: 'white', fontSize: 14 }}>CORRELATION CHAIN</Text>
      </div>
      
      <Tooltip title={`Correlation ID: ${data.correlationId}`}>
        <Title level={5} style={{ margin: 0, marginBottom: 12, color: 'white' }}>
          {data.label}
        </Title>
      </Tooltip>
      
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tag color="cyan">{data.chainStats?.count || 0} invocations</Tag>
          <Tag color="blue">{formatDuration(data.chainStats?.totalDuration)}</Tag>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span>Events: {data.chainStats?.totalEvents || 0}</span>
          <span>Jobs: {data.chainStats?.totalJobs || 0}</span>
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: '#52c41a' }}>✓ {data.chainStats?.successful || 0}</span>
          <span style={{ color: '#ff4d4f' }}>✗ {data.chainStats?.failed || 0}</span>
        </div>
        
        {data.timespan && (
          <div style={{ fontSize: 11, opacity: 0.8, display: 'flex', alignItems: 'center' }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {data.timespan}
          </div>
        )}
      </Space>
      
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
  correlationChain: CorrelationChainNode,
};

const EventFlowVisualizer = () => {
  const [viewMode, setViewMode] = useState('invocation'); // 'invocation' or 'correlation'
  const [selectedInvocation, setSelectedInvocation] = useState(null);
  const [selectedCorrelationId, setSelectedCorrelationId] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const { data: invocationsData } = useQuery(INVOCATIONS_LIST_QUERY, {
    variables: { limit: 50 },
    skip: viewMode !== 'invocation'
  });

  const { data: correlationChainsData } = useQuery(CORRELATION_CHAINS_LIST_QUERY, {
    variables: { limit: 50 },
    skip: viewMode !== 'correlation'
  });

  const { data: flowData, loading: flowLoading } = useQuery(EVENT_FLOW_QUERY, {
    variables: { invocationId: selectedInvocation },
    skip: !selectedInvocation || viewMode !== 'invocation'
  });

  const { data: correlationFlowData, loading: correlationFlowLoading } = useQuery(CORRELATION_CHAIN_FLOW_QUERY, {
    variables: { correlationId: selectedCorrelationId },
    skip: !selectedCorrelationId || viewMode !== 'correlation'
  });

  // Build flow nodes and edges from invocation data
  const buildFlowFromInvocation = useCallback((invocationData) => {
    const newNodes = [];
    const newEdges = [];

    if (!invocationData) return;

    // Create invocation node (root)
    const invocationNode = {
      id: `inv-${invocationData.id}`,
      type: 'invocation',
      position: { x: 300, y: 50 },
      data: {
        label: invocationData.source_function,
        invocation: invocationData,
        status: invocationData.status,
        duration: invocationData.total_duration_ms,
        eventsCount: invocationData.events_detected_count,
      },
      draggable: false,
    };
    newNodes.push(invocationNode);

    // Create event nodes
    const eventExecutions = invocationData.event_executions || [];
    const eventSpacing = 250;
    const eventStartX = 50;

    eventExecutions.forEach((event, eventIndex) => {
      const eventNode = {
        id: `event-${event.id}`,
        type: 'event',
        position: { x: eventStartX + eventIndex * eventSpacing, y: 200 },
        data: {
          label: event.event_name,
          event: event,
          detected: event.detected,
          status: event.status,
          duration: event.detection_duration_ms,
          jobsCount: event.jobs_count,
        },
        draggable: false,
      };
      newNodes.push(eventNode);

      // Edge from invocation to event
      newEdges.push({
        id: `inv-event-${event.id}`,
        source: invocationNode.id,
        target: eventNode.id,
        type: 'smoothstep',
        animated: event.detected,
        style: { 
          stroke: event.detected ? '#52c41a' : '#d9d9d9',
          strokeWidth: event.detected ? 3 : 1
        },
      });

      // Create job nodes for detected events
      if (event.detected && event.job_executions?.length > 0) {
        const jobSpacing = 180;
        const jobsPerRow = 3;
        
        event.job_executions.forEach((job, jobIndex) => {
          const row = Math.floor(jobIndex / jobsPerRow);
          const col = jobIndex % jobsPerRow;
          
          const jobNode = {
            id: `job-${job.id}`,
            type: 'job',
            position: { 
              x: eventNode.position.x - 100 + col * jobSpacing, 
              y: 350 + row * 120
            },
            data: {
              label: job.job_name,
              job: job,
              status: job.status,
              duration: job.duration_ms,
              result: job.result,
            },
            draggable: false,
          };
          newNodes.push(jobNode);

          // Edge from event to job
          newEdges.push({
            id: `event-job-${job.id}`,
            source: eventNode.id,
            target: jobNode.id,
            type: 'smoothstep',
            animated: job.status === 'running',
            style: { 
              stroke: job.status === 'completed' ? '#52c41a' : 
                     job.status === 'failed' ? '#ff4d4f' : '#1890ff',
              strokeWidth: 2
            },
          });
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [setNodes, setEdges]);

  // Build flow nodes and edges from correlation chain data
  const buildFlowFromCorrelationChain = useCallback((correlationInvocations) => {
    const newNodes = [];
    const newEdges = [];

    if (!correlationInvocations || correlationInvocations.length === 0) return;

    // Calculate chain statistics
    const chainStats = {
      count: correlationInvocations.length,
      totalDuration: correlationInvocations.reduce((sum, inv) => sum + (inv.total_duration_ms || 0), 0),
      totalEvents: correlationInvocations.reduce((sum, inv) => sum + (inv.events_detected_count || 0), 0),
      totalJobs: correlationInvocations.reduce((sum, inv) => sum + (inv.total_jobs_run || 0), 0),
      successful: correlationInvocations.filter(inv => inv.status === 'completed').length,
      failed: correlationInvocations.filter(inv => inv.status === 'failed').length,
    };

    const correlationId = correlationInvocations[0].correlation_id;
    const firstInvocation = correlationInvocations[0];
    const lastInvocation = correlationInvocations[correlationInvocations.length - 1];
    
    // Create timespan display
    const timespan = correlationInvocations.length > 1 ? 
      `${new Date(firstInvocation.created_at).toLocaleTimeString()} - ${new Date(lastInvocation.created_at).toLocaleTimeString()}` :
      new Date(firstInvocation.created_at).toLocaleTimeString();

    // Create correlation chain overview node
    const chainNode = {
      id: `chain-${correlationId}`,
      type: 'correlationChain',
      position: { x: 300, y: 50 },
      data: {
        label: `Chain: ${correlationId.split('.')[0]}`,
        correlationId: correlationId,
        chainStats: chainStats,
        timespan: timespan,
      },
      draggable: false,
    };
    newNodes.push(chainNode);

    // Create invocation nodes for each invocation in the chain
    const invocationSpacing = 300;
    const invocationStartY = 250;

    correlationInvocations.forEach((invocation, invIndex) => {
      const invocationNode = {
        id: `inv-${invocation.id}`,
        type: 'invocation',
        position: { x: 50 + invIndex * invocationSpacing, y: invocationStartY },
        data: {
          label: `${invocation.source_function}`,
          invocation: invocation,
          status: invocation.status,
          duration: invocation.total_duration_ms,
          eventsCount: invocation.events_detected_count,
          correlationId: invocation.correlation_id,
        },
        draggable: false,
      };
      newNodes.push(invocationNode);

      // Edge from chain to invocation
      newEdges.push({
        id: `chain-inv-${invocation.id}`,
        source: chainNode.id,
        target: invocationNode.id,
        type: 'smoothstep',
        animated: true,
        style: { 
          stroke: '#667eea',
          strokeWidth: 3,
          strokeDasharray: '5,5'
        },
        label: `Step ${invIndex + 1}`,
        labelStyle: { fontSize: 12, fontWeight: 'bold' },
        labelBgStyle: { fill: '#667eea', color: 'white', fontSize: 10 },
      });

      // Add edge between consecutive invocations
      if (invIndex > 0) {
        const prevInvocation = correlationInvocations[invIndex - 1];
        newEdges.push({
          id: `inv-seq-${prevInvocation.id}-${invocation.id}`,
          source: `inv-${prevInvocation.id}`,
          target: `inv-${invocation.id}`,
          type: 'smoothstep',
          animated: true,
          style: { 
            stroke: '#52c41a',
            strokeWidth: 4
          },
          label: 'triggers',
          labelStyle: { fontSize: 11, fontWeight: 'bold' },
          labelBgStyle: { fill: '#52c41a', color: 'white' },
        });
      }

      // Create simplified event and job nodes for detected events
      const eventExecutions = invocation.event_executions || [];
      const detectedEvents = eventExecutions.filter(event => event.detected);
      
      if (detectedEvents.length > 0) {
        const eventStartY = invocationStartY + 180;
        
        detectedEvents.forEach((event, eventIndex) => {
          const eventNode = {
            id: `event-${event.id}`,
            type: 'event',
            position: { 
              x: invocationNode.position.x - 50 + eventIndex * 180, 
              y: eventStartY 
            },
            data: {
              label: event.event_name,
              event: event,
              detected: event.detected,
              status: event.status,
              duration: event.detection_duration_ms,
              jobsCount: event.jobs_count,
            },
            draggable: false,
          };
          newNodes.push(eventNode);

          // Edge from invocation to event
          newEdges.push({
            id: `inv-event-${event.id}`,
            source: invocationNode.id,
            target: eventNode.id,
            type: 'smoothstep',
            style: { 
              stroke: '#52c41a',
              strokeWidth: 2
            },
          });
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [setNodes, setEdges]);

  // Update flow when data changes
  useMemo(() => {
    if (viewMode === 'invocation' && flowData?.invocations_by_pk) {
      buildFlowFromInvocation(flowData.invocations_by_pk);
    } else if (viewMode === 'correlation' && correlationFlowData?.invocations) {
      buildFlowFromCorrelationChain(correlationFlowData.invocations);
    }
  }, [viewMode, flowData, correlationFlowData, buildFlowFromInvocation, buildFlowFromCorrelationChain]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
    setDrawerVisible(true);
  }, []);

  const NodeDetailView = ({ node }) => {
    if (!node) return null;

    switch (node.type) {
      case 'invocation':
        return (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Function">{node.data.invocation.source_function}</Descriptions.Item>
            <Descriptions.Item label="Status">{node.data.invocation.status}</Descriptions.Item>
            <Descriptions.Item label="Duration">{node.data.invocation.total_duration_ms}ms</Descriptions.Item>
            <Descriptions.Item label="Events Detected">{node.data.invocation.events_detected_count}</Descriptions.Item>
            <Descriptions.Item label="Jobs Run">{node.data.invocation.total_jobs_run}</Descriptions.Item>
            <Descriptions.Item label="Success Rate">{node.data.invocation.success_rate}%</Descriptions.Item>
            {node.data.correlationId && (
              <Descriptions.Item label="Correlation ID">{node.data.correlationId}</Descriptions.Item>
            )}
            <Descriptions.Item label="Created">{new Date(node.data.invocation.created_at).toLocaleString()}</Descriptions.Item>
          </Descriptions>
        );
      
      case 'event':
        return (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Event Name">{node.data.event.event_name}</Descriptions.Item>
            <Descriptions.Item label="Detected">{node.data.event.detected ? 'Yes' : 'No'}</Descriptions.Item>
            <Descriptions.Item label="Status">{node.data.event.status}</Descriptions.Item>
            <Descriptions.Item label="Detection Duration">{node.data.event.detection_duration_ms}ms</Descriptions.Item>
            {node.data.event.handler_duration_ms && (
              <Descriptions.Item label="Handler Duration">{node.data.event.handler_duration_ms}ms</Descriptions.Item>
            )}
            <Descriptions.Item label="Jobs Count">{node.data.event.jobs_count}</Descriptions.Item>
            {node.data.event.correlation_id && (
              <Descriptions.Item label="Correlation ID">{node.data.event.correlation_id}</Descriptions.Item>
            )}
          </Descriptions>
        );
      
      case 'job':
        return (
          <div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Job Name">{node.data.job.job_name}</Descriptions.Item>
              <Descriptions.Item label="Status">{node.data.job.status}</Descriptions.Item>
              <Descriptions.Item label="Duration">{node.data.job.duration_ms}ms</Descriptions.Item>
              {node.data.job.correlation_id && (
                <Descriptions.Item label="Correlation ID">{node.data.job.correlation_id}</Descriptions.Item>
              )}
              {node.data.job.error_message && (
                <Descriptions.Item label="Error">{node.data.job.error_message}</Descriptions.Item>
              )}
            </Descriptions>
            {node.data.job.result && (
              <div style={{ marginTop: 16 }}>
                <Title level={5}>Result</Title>
                <pre style={{ background: '#f5f5f5', padding: 8, borderRadius: 4, fontSize: 12 }}>
                  {typeof node.data.job.result === 'object' 
                    ? JSON.stringify(node.data.job.result, null, 2)
                    : node.data.job.result}
                </pre>
              </div>
            )}
          </div>
        );

      case 'correlationChain':
        return (
          <div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Correlation ID">{node.data.correlationId}</Descriptions.Item>
              <Descriptions.Item label="Chain Label">{node.data.label}</Descriptions.Item>
              <Descriptions.Item label="Invocations Count">{node.data.chainStats?.count || 0}</Descriptions.Item>
              <Descriptions.Item label="Total Duration">{node.data.chainStats?.totalDuration || 0}ms</Descriptions.Item>
              <Descriptions.Item label="Total Events">{node.data.chainStats?.totalEvents || 0}</Descriptions.Item>
              <Descriptions.Item label="Total Jobs">{node.data.chainStats?.totalJobs || 0}</Descriptions.Item>
              <Descriptions.Item label="Successful Invocations">{node.data.chainStats?.successful || 0}</Descriptions.Item>
              <Descriptions.Item label="Failed Invocations">{node.data.chainStats?.failed || 0}</Descriptions.Item>
              <Descriptions.Item label="Timespan">{node.data.timespan}</Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 16 }}>
              <Title level={5}>Chain Statistics</Title>
              <Space>
                <Tag color="blue">
                  Success Rate: {node.data.chainStats?.count > 0 ? 
                    Math.round((node.data.chainStats.successful / node.data.chainStats.count) * 100) : 0}%
                </Tag>
                <Tag color="green">
                  Avg Duration: {node.data.chainStats?.count > 0 ? 
                    Math.round(node.data.chainStats.totalDuration / node.data.chainStats.count) : 0}ms
                </Tag>
              </Space>
            </div>
          </div>
        );
      
      default:
        return <div>Unknown node type</div>;
    }
  };

  const isLoading = viewMode === 'invocation' ? flowLoading : correlationFlowLoading;
  const hasSelection = viewMode === 'invocation' ? selectedInvocation : selectedCorrelationId;

  return (
    <div style={{ height: '80vh' }}>
      <Card 
        title={
          <Space>
            🌊 Event Flow Visualizer
            <Radio.Group 
              value={viewMode} 
              onChange={(e) => {
                setViewMode(e.target.value);
                setSelectedInvocation(null);
                setSelectedCorrelationId(null);
                setNodes([]);
                setEdges([]);
              }}
              size="small"
            >
              <Radio.Button value="invocation">Single Invocation</Radio.Button>
              <Radio.Button value="correlation">Correlation Chain</Radio.Button>
            </Radio.Group>
          </Space>
        }
        extra={
          viewMode === 'invocation' ? (
            <Select
              style={{ width: 400 }}
              placeholder="Select an invocation to visualize"
              onChange={(value) => setSelectedInvocation(value)}
              showSearch
              loading={!invocationsData}
              optionFilterProp="children"
              value={selectedInvocation}
            >
              {invocationsData?.invocations?.map(inv => (
                <Select.Option key={inv.id} value={inv.id}>
                  {inv.source_function} - {new Date(inv.created_at).toLocaleString()} 
                  ({inv.events_detected_count} events, {inv.total_jobs_run} jobs)
                </Select.Option>
              ))}
            </Select>
          ) : (
            <Select
              style={{ width: 400 }}
              placeholder="Select a correlation chain to visualize"
              onChange={(value) => setSelectedCorrelationId(value)}
              showSearch
              loading={!correlationChainsData}
              optionFilterProp="children"
              value={selectedCorrelationId}
            >
              {correlationChainsData?.invocations?.map(chain => (
                <Select.Option key={chain.correlation_id} value={chain.correlation_id}>
                  <div>
                    <strong>{chain.correlation_id.split('.')[0]}</strong> - {new Date(chain.created_at).toLocaleString()}
                    <br />
                    <small style={{ color: '#666' }}>
                      {chain.correlation_chain_stats?.aggregate?.count || 0} invocations, 
                      {chain.correlation_chain_stats?.aggregate?.sum?.total_jobs_run || 0} jobs
                    </small>
                  </div>
                </Select.Option>
              ))}
            </Select>
          )
        }
        bodyStyle={{ padding: 0, height: 'calc(80vh - 100px)' }}
      >
        {!hasSelection ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            flexDirection: 'column'
          }}>
            <Alert
              message={viewMode === 'invocation' ? "No Invocation Selected" : "No Correlation Chain Selected"}
              description={viewMode === 'invocation' ? 
                "Select an invocation from the dropdown above to visualize its event flow." :
                "Select a correlation chain from the dropdown above to visualize the connected invocations."
              }
              type="info"
              showIcon
            />
          </div>
        ) : isLoading ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%'
          }}>
            <LoadingOutlined style={{ fontSize: 24 }} /> 
            Loading {viewMode === 'invocation' ? 'flow' : 'correlation chain'}...
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            connectionLineType={ConnectionLineType.SmoothStep}
            fitView
            attributionPosition="bottom-left"
          >
            <Background color="#f0f2f5" gap={20} />
            <Controls />
            <MiniMap 
              nodeColor={(node) => {
                switch (node.type) {
                  case 'invocation': return '#1890ff';
                  case 'event': return node.data.detected ? '#52c41a' : '#d9d9d9';
                  case 'job': return node.data.status === 'completed' ? '#52c41a' : 
                                   node.data.status === 'failed' ? '#ff4d4f' : '#1890ff';
                  case 'correlationChain': return '#667eea';
                  default: return '#ccc';
                }
              }}
            />
          </ReactFlow>
        )}
      </Card>

      <Drawer
        title="Node Details"
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        width={600}
      >
        {selectedNode && <NodeDetailView node={selectedNode} />}
      </Drawer>
    </div>
  );
};

export default EventFlowVisualizer;