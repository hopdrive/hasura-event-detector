import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInvocationTreeFlowQuery } from '../types/generated';
import { calculateFlowSummary } from './FlowDiagram';
import { useFlowPositioning } from '../hooks/useFlowPositioning';
import FlowSummary from './FlowSummary';

export const FlowHeader: React.FC = () => {
  const [searchParams] = useSearchParams();
  const invocationId = searchParams.get('invocationId');

  // GraphQL Query for invocation tree flow
  const { data, loading, error } = useInvocationTreeFlowQuery({
    variables: { invocationId: invocationId || '' },
    skip: !invocationId,
    fetchPolicy: 'cache-first',
    errorPolicy: 'all',
  });

  // Always call hooks in the same order - prepare data or use empty array
  const invocations = data?.invocations_by_pk
    ? [data.invocations_by_pk, ...(data.invocations_by_pk.correlated_invocations || [])]
    : [];

  // Always call the positioning hook, even with empty data
  const { nodes } = useFlowPositioning(invocations);

  // Handle loading/error states after hooks are called
  if (!invocationId || loading || error || !data?.invocations_by_pk) {
    return (
      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
        {loading ? 'Loading flow data...' : 'Select an invocation to view flow details'}
      </div>
    );
  }

  // Count actual rendered invocation and job nodes from flow
  const invocationNodes = nodes.filter(node => node.type === 'invocation');
  const jobNodes = nodes.filter(node => node.type === 'job');

  // For events, count from the raw data to include all events (detected and undetected)
  let totalEvents = 0;
  let detectedEvents = 0;
  let undetectedEvents = 0;

  invocations.forEach(invocation => {
    const events = invocation.event_executions || [];
    events.forEach((event: any) => {
      totalEvents++;
      if (event.detected) {
        detectedEvents++;
      } else {
        undetectedEvents++;
      }
    });
  });

  // Calculate statistics combining rendered nodes and raw data
  const summaryData = {
    totalInvocations: invocationNodes.length,
    totalEvents: totalEvents,
    detectedEvents: detectedEvents,
    undetectedEvents: undetectedEvents,
    totalJobs: jobNodes.length,
    successfulJobs: jobNodes.filter(node => node.data.status === 'completed').length,
    failedJobs: jobNodes.filter(node => node.data.status === 'failed').length,
    runningJobs: jobNodes.filter(node => node.data.status === 'running').length
  };

  return <FlowSummary data={summaryData} />;
};

export default FlowHeader;