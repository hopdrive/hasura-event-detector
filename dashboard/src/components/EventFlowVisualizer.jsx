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
import { Card, Select, Drawer, Descriptions, Tag, Typography, Space, Alert } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  LoadingOutlined,
  ThunderboltOutlined,
  BugOutlined
} from '@ant-design/icons';
import { INVOCATIONS_LIST_QUERY, EVENT_FLOW_QUERY } from '../graphql/queries';
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

const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
};

const EventFlowVisualizer = () => {
  const [selectedInvocation, setSelectedInvocation] = useState(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const { data: invocationsData } = useQuery(INVOCATIONS_LIST_QUERY, {
    variables: { limit: 50 }
  });

  const { data: flowData, loading: flowLoading } = useQuery(EVENT_FLOW_QUERY, {
    variables: { invocationId: selectedInvocation },
    skip: !selectedInvocation
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

  // Update flow when data changes
  useMemo(() => {
    if (flowData?.invocations_by_pk) {
      buildFlowFromInvocation(flowData.invocations_by_pk);
    }
  }, [flowData, buildFlowFromInvocation]);

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
          </Descriptions>
        );
      
      case 'job':
        return (
          <div>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="Job Name">{node.data.job.job_name}</Descriptions.Item>
              <Descriptions.Item label="Status">{node.data.job.status}</Descriptions.Item>
              <Descriptions.Item label="Duration">{node.data.job.duration_ms}ms</Descriptions.Item>
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
      
      default:
        return <div>Unknown node type</div>;
    }
  };

  return (
    <div style={{ height: '80vh' }}>
      <Card 
        title="🌊 Event Flow Visualizer" 
        extra={
          <Select
            style={{ width: 400 }}
            placeholder="Select an invocation to visualize"
            onChange={(value) => setSelectedInvocation(value)}
            showSearch
            loading={!invocationsData}
            optionFilterProp="children"
          >
            {invocationsData?.invocations?.map(inv => (
              <Select.Option key={inv.id} value={inv.id}>
                {inv.source_function} - {new Date(inv.created_at).toLocaleString()} 
                ({inv.events_detected_count} events, {inv.total_jobs_run} jobs)
              </Select.Option>
            ))}
          </Select>
        }
        bodyStyle={{ padding: 0, height: 'calc(80vh - 100px)' }}
      >
        {!selectedInvocation ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%',
            flexDirection: 'column'
          }}>
            <Alert
              message="No Invocation Selected"
              description="Select an invocation from the dropdown above to visualize its event flow."
              type="info"
              showIcon
            />
          </div>
        ) : flowLoading ? (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            height: '100%'
          }}>
            <LoadingOutlined style={{ fontSize: 24 }} /> Loading flow...
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