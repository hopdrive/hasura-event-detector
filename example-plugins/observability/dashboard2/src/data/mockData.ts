import { Node, Edge } from 'reactflow';

// Mock data for the Overview Dashboard
export const mockDashboardData = {
  totalInvocations: 12543,
  successRate: 94.3,
  avgDuration: 245,
  failedJobs: 187,
  
  hourlyMetrics: [
    { hour: '00:00', total: 450, successful: 425, failed: 25 },
    { hour: '04:00', total: 280, successful: 270, failed: 10 },
    { hour: '08:00', total: 890, successful: 840, failed: 50 },
    { hour: '12:00', total: 1250, successful: 1180, failed: 70 },
    { hour: '16:00', total: 1450, successful: 1360, failed: 90 },
    { hour: '20:00', total: 980, successful: 920, failed: 60 },
  ],
  
  slowestJobs: [
    { name: 'updateAnalytics', duration: 3200 },
    { name: 'sendEmailBatch', duration: 2800 },
    { name: 'recalculateSLA', duration: 2400 },
    { name: 'syncWithExternal', duration: 2100 },
    { name: 'generateReport', duration: 1900 },
  ],
  
  recentInvocations: [
    {
      id: '550e8400-e29b-41d4',
      sourceFunction: 'event-detector-rides',
      correlationId: 'event_detector.job.550e8400',
      userEmail: 'driver@hopdrive.com',
      duration: 245,
      status: 'completed',
      createdAt: '2 mins ago'
    },
    {
      id: '660f9500-f39c-51e5',
      sourceFunction: 'event-detector-moves',
      correlationId: 'event_detector.job.660f9500',
      userEmail: 'system@hopdrive.com',
      duration: 1850,
      status: 'failed',
      createdAt: '5 mins ago'
    },
    {
      id: '770g0600-g40d-62f6',
      sourceFunction: 'event-detector-users',
      correlationId: 'user@example.com',
      userEmail: 'user@example.com',
      duration: 120,
      status: 'completed',
      createdAt: '8 mins ago'
    },
  ]
};

// Mock data for the Flow Diagram - including recursive correlation chains
export const mockFlowData: { nodes: Node[], edges: Edge[] } = {
  nodes: [
    // First invocation
    {
      id: 'inv-1',
      type: 'invocation',
      position: { x: 100, y: 100 },
      data: {
        sourceFunction: 'event-detector-rides',
        correlationId: 'event_detector.job.550e8400',
        status: 'completed',
        duration: 245,
        eventsCount: 2
      }
    },
    
    // Events for first invocation
    {
      id: 'event-1-1',
      type: 'event',
      position: { x: 50, y: 250 },
      data: {
        eventName: 'ride.status.change',
        detected: true,
        status: 'completed',
        duration: 15,
        jobsCount: 2
      }
    },
    {
      id: 'event-1-2',
      type: 'event',
      position: { x: 250, y: 250 },
      data: {
        eventName: 'ride.pickup.successful',
        detected: true,
        status: 'completed',
        duration: 12,
        jobsCount: 1
      }
    },
    {
      id: 'event-1-3',
      type: 'event',
      position: { x: 450, y: 250 },
      data: {
        eventName: 'ride.driver.assigned',
        detected: false,
        status: 'completed',
        duration: 8,
        jobsCount: 0
      }
    },
    
    // Jobs for detected events
    {
      id: 'job-1-1-1',
      type: 'job',
      position: { x: 0, y: 380 },
      data: {
        jobName: 'sendNotification',
        status: 'completed',
        duration: 120
      }
    },
    {
      id: 'job-1-1-2',
      type: 'job',
      position: { x: 120, y: 380 },
      data: {
        jobName: 'updateAnalytics',
        status: 'completed',
        duration: 45,
        triggersInvocation: true // This job triggers a new invocation
      }
    },
    {
      id: 'job-1-2-1',
      type: 'job',
      position: { x: 250, y: 380 },
      data: {
        jobName: 'recalculateSLA',
        status: 'failed',
        duration: 180
      }
    },
    
    // RECURSIVE: Second invocation triggered by job-1-1-2
    {
      id: 'inv-2',
      type: 'invocation',
      position: { x: 120, y: 520 },
      data: {
        sourceFunction: 'event-detector-analytics',
        correlationId: 'event_detector.updateAnalytics.660f9500',
        status: 'completed',
        duration: 180,
        eventsCount: 1
      }
    },
    
    // Events for second (recursive) invocation
    {
      id: 'event-2-1',
      type: 'event',
      position: { x: 120, y: 670 },
      data: {
        eventName: 'analytics.metric.updated',
        detected: true,
        status: 'completed',
        duration: 10,
        jobsCount: 2
      }
    },
    
    // Jobs for second invocation
    {
      id: 'job-2-1-1',
      type: 'job',
      position: { x: 70, y: 800 },
      data: {
        jobName: 'aggregateMetrics',
        status: 'completed',
        duration: 85
      }
    },
    {
      id: 'job-2-1-2',
      type: 'job',
      position: { x: 190, y: 800 },
      data: {
        jobName: 'publishToDashboard',
        status: 'completed',
        duration: 95
      }
    }
  ],
  
  edges: [
    // First invocation to events
    {
      id: 'e-inv1-event1',
      source: 'inv-1',
      target: 'event-1-1',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 }
    },
    {
      id: 'e-inv1-event2',
      source: 'inv-1',
      target: 'event-1-2',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 }
    },
    {
      id: 'e-inv1-event3',
      source: 'inv-1',
      target: 'event-1-3',
      type: 'smoothstep',
      style: { stroke: '#6b7280', strokeWidth: 1, strokeDasharray: '5,5' }
    },
    
    // Events to jobs
    {
      id: 'e-event1-job1',
      source: 'event-1-1',
      target: 'job-1-1-1',
      type: 'smoothstep',
      animated: true
    },
    {
      id: 'e-event1-job2',
      source: 'event-1-1',
      target: 'job-1-1-2',
      type: 'smoothstep',
      animated: true
    },
    {
      id: 'e-event2-job1',
      source: 'event-1-2',
      target: 'job-1-2-1',
      type: 'smoothstep',
      style: { stroke: '#ef4444', strokeWidth: 2 }
    },
    
    // RECURSIVE EDGE: Job triggers new invocation
    {
      id: 'e-job-recursive',
      source: 'job-1-1-2',
      target: 'inv-2',
      type: 'smoothstep',
      animated: true,
      style: { 
        stroke: '#8b5cf6', 
        strokeWidth: 3,
        strokeDasharray: '10,5'
      },
      label: 'Triggers',
      labelStyle: { fill: '#8b5cf6', fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff' }
    },
    
    // Second invocation to events
    {
      id: 'e-inv2-event1',
      source: 'inv-2',
      target: 'event-2-1',
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#10b981', strokeWidth: 2 }
    },
    
    // Second invocation events to jobs
    {
      id: 'e-event2-1-job1',
      source: 'event-2-1',
      target: 'job-2-1-1',
      type: 'smoothstep',
      animated: true
    },
    {
      id: 'e-event2-1-job2',
      source: 'event-2-1',
      target: 'job-2-1-2',
      type: 'smoothstep',
      animated: true
    }
  ]
};

// Mock data for the Invocations Table
export const mockInvocationsData = [
  {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceFunction: 'event-detector-rides',
    sourceTable: 'rides',
    sourceOperation: 'UPDATE',
    correlationId: 'event_detector.job.550e8400',
    userEmail: 'driver@hopdrive.com',
    userRole: 'driver',
    createdAt: '2024-01-15T10:30:00Z',
    totalDuration: 245,
    eventsDetectedCount: 2,
    totalJobsRun: 3,
    totalJobsSucceeded: 2,
    totalJobsFailed: 1,
    status: 'completed'
  },
  {
    id: '660f9500-f39c-51e5-b816-557766550001',
    sourceFunction: 'event-detector-moves',
    sourceTable: 'moves',
    sourceOperation: 'INSERT',
    correlationId: 'event_detector.job.660f9500',
    userEmail: 'system@hopdrive.com',
    userRole: 'admin',
    createdAt: '2024-01-15T10:25:00Z',
    totalDuration: 1850,
    eventsDetectedCount: 3,
    totalJobsRun: 5,
    totalJobsSucceeded: 4,
    totalJobsFailed: 1,
    status: 'failed'
  },
  {
    id: '770g0600-g40d-62f6-c927-668877660002',
    sourceFunction: 'event-detector-users',
    sourceTable: 'users',
    sourceOperation: 'UPDATE',
    correlationId: 'user@example.com',
    userEmail: 'user@example.com',
    userRole: 'user',
    createdAt: '2024-01-15T10:22:00Z',
    totalDuration: 120,
    eventsDetectedCount: 1,
    totalJobsRun: 2,
    totalJobsSucceeded: 2,
    totalJobsFailed: 0,
    status: 'completed'
  }
];
