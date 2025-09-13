import React from 'react';
import { useQuery } from '@apollo/client';
import { Row, Col, Card, Statistic, Timeline, Table, Tag, Progress } from 'antd';
import { Line, Pie } from '@ant-design/charts';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  ClockCircleOutlined,
  ThunderboltOutlined,
  BugOutlined
} from '@ant-design/icons';
import { OVERVIEW_DASHBOARD_QUERY } from '../graphql/queries';

const OverviewDashboard = () => {
  const { data, loading, error } = useQuery(OVERVIEW_DASHBOARD_QUERY, {
    variables: { 
      timeRange: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
    },
    pollInterval: 30000 // Refresh every 30 seconds
  });

  if (loading) return <div>Loading dashboard...</div>;
  if (error) return <div>Error loading dashboard: {error.message}</div>;

  const stats = data?.invocations_aggregate?.aggregate;
  const successRate = stats?.sum?.total_jobs_succeeded && stats?.sum?.total_jobs_run 
    ? (stats.sum.total_jobs_succeeded / stats.sum.total_jobs_run * 100) 
    : 0;

  // Performance chart configuration
  const performanceConfig = {
    data: data?.dashboard_stats?.map(stat => ({
      hour: new Date(stat.hour_bucket).toLocaleTimeString(),
      avgDuration: stat.avg_duration_ms,
      function: stat.source_function
    })) || [],
    xField: 'hour',
    yField: 'avgDuration',
    seriesField: 'function',
    smooth: true,
    animation: { appear: { animation: 'path-in', duration: 1000 } }
  };

  // Event distribution chart
  const eventDistribution = data?.event_executions_aggregate?.reduce((acc, item) => {
    const existing = acc.find(entry => entry.event === item.nodes[0]?.event_name);
    if (existing) {
      existing.count += item.aggregate.count;
    } else {
      acc.push({
        event: item.nodes[0]?.event_name || 'Unknown',
        count: item.aggregate.count
      });
    }
    return acc;
  }, []) || [];

  const eventDistributionConfig = {
    data: eventDistribution,
    angleField: 'count',
    colorField: 'event',
    radius: 0.8,
    label: {
      type: 'spider',
      labelHeight: 28,
      content: '{name}\n{percentage}'
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'failed': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'running': return <ClockCircleOutlined style={{ color: '#1890ff' }} />;
      default: return <BugOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const recentInvocationsColumns = [
    {
      title: 'Function',
      dataIndex: 'source_function',
      key: 'source_function',
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span>
          {getStatusIcon(status)} {status}
        </span>
      )
    },
    {
      title: 'Events',
      dataIndex: 'events_detected_count',
      key: 'events_detected_count',
      render: (count) => <Tag color="green">{count}</Tag>
    },
    {
      title: 'Jobs',
      key: 'jobs',
      render: (_, record) => (
        <span>
          <Tag color="success">{record.total_jobs_succeeded || 0}</Tag>
          <Tag color="error">{(record.total_jobs_run || 0) - (record.total_jobs_succeeded || 0)}</Tag>
        </span>
      )
    },
    {
      title: 'Duration',
      dataIndex: 'total_duration_ms',
      key: 'duration',
      render: (duration) => `${duration}ms`
    },
    {
      title: 'Success Rate',
      dataIndex: 'success_rate',
      key: 'success_rate',
      render: (rate) => (
        <Progress 
          percent={rate} 
          size="small" 
          status={rate > 90 ? 'success' : rate > 70 ? 'normal' : 'exception'}
        />
      )
    },
    {
      title: 'Time',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time) => new Date(time).toLocaleString()
    }
  ];

  return (
    <div style={{ padding: '20px' }}>
      {/* Key Metrics Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Total Invocations (24h)" 
              value={stats?.count || 0} 
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Overall Success Rate" 
              value={successRate} 
              suffix="%" 
              prefix={successRate > 90 ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
              valueStyle={{ 
                color: successRate > 90 ? '#3f8600' : successRate > 70 ? '#d48806' : '#cf1322' 
              }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Avg Response Time" 
              value={Math.round(stats?.avg?.total_duration_ms || 0)} 
              suffix="ms"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Jobs Executed (24h)" 
              value={stats?.sum?.total_jobs_run || 0} 
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Charts Row */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={16}>
          <Card title="📈 Performance Trends" style={{ height: 400 }}>
            {performanceConfig.data.length > 0 ? (
              <Line {...performanceConfig} />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px' }}>
                No performance data available for the selected time range
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card title="🎯 Event Distribution" style={{ height: 400 }}>
            {eventDistribution.length > 0 ? (
              <Pie {...eventDistributionConfig} />
            ) : (
              <div style={{ textAlign: 'center', padding: '50px' }}>
                No events detected in the selected time range
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* Recent Activity */}
      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="📋 Recent Invocations">
            <Table
              dataSource={data?.invocations || []}
              columns={recentInvocationsColumns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default OverviewDashboard;