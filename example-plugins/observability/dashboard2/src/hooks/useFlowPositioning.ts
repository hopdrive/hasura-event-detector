import { useMemo } from 'react';
import { Node, Edge } from 'reactflow';

// Constants for positioning
const HORIZONTAL_SPACING = 450; // Space between node levels
const VERTICAL_SPACING = 120; // Space between sibling nodes
const NODE_HEIGHT = 80; // Approximate height of a node
const MIN_VERTICAL_SPACING = 100; // Minimum space between nodes

interface PositioningConfig {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  nodeHeight?: number;
  minVerticalSpacing?: number;
}

interface JobExecution {
  id: string;
  job_name: string;
  job_function_name?: string;
  correlation_id: string;
  status: string;
  duration: number;
  result?: any;
  error?: string;
  triggers_invocation?: boolean;
  triggered_invocations?: Array<{
    id: string;
    correlation_id: string;
  }>;
}

interface EventExecution {
  id: string;
  event_name: string;
  correlation_id: string;
  detected: boolean;
  status: string;
  detection_duration: number;
  handler_duration?: number;
  job_executions?: JobExecution[];
}

interface Invocation {
  id: string;
  source_function: string;
  correlation_id: string;
  status: string;
  total_duration_ms: number;
  event_executions?: EventExecution[];
  source_job_id?: string;
  source_job_execution?: JobExecution;
  correlated_invocations?: Invocation[];
}

export interface PositionedNode extends Node {
  position: { x: number; y: number };
}

export interface FlowData {
  nodes: PositionedNode[];
  edges: Edge[];
}

/**
 * Hook for calculating flow diagram positions
 * Provides reusable positioning logic for flow diagrams
 */
export const useFlowPositioning = (
  invocations: Invocation[],
  config: PositioningConfig = {}
): FlowData => {
  const {
    horizontalSpacing = HORIZONTAL_SPACING,
    verticalSpacing = VERTICAL_SPACING,
    nodeHeight = NODE_HEIGHT,
    minVerticalSpacing = MIN_VERTICAL_SPACING
  } = config;

  return useMemo(() => {
    const nodes: PositionedNode[] = [];
    const edges: Edge[] = [];
    const processedInvocations = new Set<string>();

    // Calculate vertical position for centered child nodes
    const calculateChildPositions = (childCount: number, parentY: number, spacing?: number): number[] => {
      if (childCount === 0) return [];

      const actualSpacing = spacing || verticalSpacing;

      // For single child, align with parent
      if (childCount === 1) return [parentY];

      const totalHeight = (childCount - 1) * actualSpacing;
      const startY = parentY - totalHeight / 2;

      return Array.from({ length: childCount }, (_, i) => startY + (i * actualSpacing));
    };

    // Calculate spacing requirements for event groups
    const calculateEventSpacing = (events: EventExecution[]) => {
      return events.map(event => {
        const jobCount = event.job_executions?.length || 0;
        const jobSpacing = jobCount > 3 ? verticalSpacing * 1.2 : verticalSpacing;
        const jobsHeight = jobCount > 1 ? (jobCount - 1) * jobSpacing : 0;
        const minSpacing = 160;
        const requiredSpacing = Math.max(minSpacing, jobsHeight + 80);

        return { event, requiredSpacing };
      });
    };

    // Helper function to process a single invocation with custom positioning
    const processInvocation = (invocation: Invocation, baseX: number, baseY: number) => {
      if (processedInvocations.has(invocation.id)) return;
      processedInvocations.add(invocation.id);

      const events = invocation.event_executions || [];
      const detectedEvents = events.filter(e => e.detected);
      const undetectedEvents = events.filter(e => !e.detected);

      // Create invocation node
      const invocationNode: PositionedNode = {
        id: invocation.id,
        type: 'invocation',
        position: { x: baseX, y: baseY },
        data: {
          sourceFunction: invocation.source_function,
          correlationId: invocation.correlation_id,
          status: invocation.status,
          duration: invocation.total_duration_ms,
          eventsCount: detectedEvents.length,
          events: events,
          detectedEvents: detectedEvents,
          undetectedEvents: undetectedEvents
        }
      };
      nodes.push(invocationNode);

      // Add source job if it exists
      if (invocation.source_job_id && invocation.source_job_execution) {
        const sourceJobNode: PositionedNode = {
          id: `job-${invocation.source_job_id}`,
          type: 'job',
          position: { x: baseX - horizontalSpacing, y: baseY },
          data: {
            jobName: invocation.source_job_execution.job_name,
            functionName: invocation.source_job_execution.job_function_name,
            correlationId: invocation.source_job_execution.correlation_id,
            status: invocation.source_job_execution.status,
            duration: invocation.source_job_execution.duration,
            result: invocation.source_job_execution.result,
            error: invocation.source_job_execution.error,
            triggersInvocation: invocation.source_job_execution.triggers_invocation,
            isSourceJob: true
          }
        };
        nodes.push(sourceJobNode);

        // Edge from source job to invocation (invocation colored - blue)
        edges.push({
          id: `job-${invocation.source_job_id}-to-${invocation.id}`,
          source: `job-${invocation.source_job_id}`,
          sourceHandle: 'right',
          target: invocation.id,
          targetHandle: 'left',
          type: 'default',
          animated: true,
          style: { stroke: '#3b82f6', strokeWidth: 2 }, // Blue for invocations
          markerEnd: {
            type: 'arrowclosed',
            width: 20,
            height: 20,
          }
        });
      }

      // Always create undetected events group node for all invocations
      const groupedEventsNode: PositionedNode = {
        id: `grouped-${invocation.id}`,
        type: 'groupedEvents',
        position: {
          x: baseX,
          y: baseY + verticalSpacing * 1.5
        },
        data: {
          totalCount: events.length,
          detectedCount: detectedEvents.length,
          undetectedCount: undetectedEvents.length,
          events: undetectedEvents.length > 0 ? undetectedEvents : events,
          invocationId: invocation.id
        }
      };
      nodes.push(groupedEventsNode);

      // Edge from invocation to grouped events (always show, gray for undetected content)
      edges.push({
        id: `${invocation.id}-to-grouped-${invocation.id}`,
        source: invocation.id,
        sourceHandle: 'right',
        target: `grouped-${invocation.id}`,
        targetHandle: 'top',
        type: 'default',
        animated: true,
        style: { stroke: '#6b7280', strokeWidth: 2, strokeDasharray: '5,5' }, // Gray color for grouped events
        markerEnd: {
          type: 'arrowclosed',
          width: 20,
          height: 20,
        }
      });

      // Position detected events
      if (detectedEvents.length > 0) {
        const eventSpacingData = calculateEventSpacing(detectedEvents);

        let currentEventY = baseY;
        if (eventSpacingData.length > 1) {
          const totalHeight = eventSpacingData.reduce((sum, data, index) =>
            sum + (index < eventSpacingData.length - 1 ? data.requiredSpacing : 0), 0
          );
          currentEventY = baseY - totalHeight / 2;
        }

        eventSpacingData.forEach((eventData, eventIndex) => {
          const eventY = currentEventY;
          const eventX = baseX + horizontalSpacing + 80;
          const { event } = eventData;

          // Create event node
          const eventNode: PositionedNode = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: eventX, y: eventY },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration,
              handlerDuration: event.handler_duration,
              jobsCount: event.job_executions?.length || 0,
              hasFailedJobs: (event.job_executions || []).some((job: JobExecution) => job.status === 'failed')
            }
          };
          nodes.push(eventNode);

          // Edge from invocation to event (event colored - green)
          edges.push({
            id: `${invocation.id}-to-event-${event.id}`,
            source: invocation.id,
            sourceHandle: 'right',
            target: `event-${event.id}`,
            type: 'default',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2 }, // Green for events
            markerEnd: {
              type: 'arrowclosed',
              width: 20,
              height: 20,
            }
          });

          // Position jobs for this event
          const jobs = event.job_executions || [];
          if (jobs.length > 0) {
            const jobSpacing = jobs.length > 3 ? verticalSpacing * 1.2 : verticalSpacing;
            const jobPositions = calculateChildPositions(jobs.length, eventY, jobSpacing);

            jobs.forEach((job, jobIndex) => {
              const jobY = jobPositions[jobIndex];
              const jobX = eventX + horizontalSpacing;

              const jobNode: PositionedNode = {
                id: `job-${job.id}`,
                type: 'job',
                position: { x: jobX, y: jobY },
                data: {
                  jobName: job.job_name,
                  functionName: job.job_function_name,
                  correlationId: job.correlation_id,
                  status: job.status,
                  duration: job.duration,
                  result: job.result,
                  error: job.error,
                  triggersInvocation: job.triggers_invocation || (job.triggered_invocations && job.triggered_invocations.length > 0),
                  triggeredInvocationsCount: job.triggered_invocations?.length || 0
                }
              };
              nodes.push(jobNode);

              // Edge from event to job (job colored - purple)
              edges.push({
                id: `event-${event.id}-to-job-${job.id}`,
                source: `event-${event.id}`,
                target: `job-${job.id}`,
                type: 'default',
                animated: true,
                style: { stroke: '#8b5cf6', strokeWidth: 2 }, // Purple for jobs
                markerEnd: {
                  type: 'arrowclosed',
                  width: 20,
                  height: 20,
                }
              });

              // Process triggered invocations recursively - position them to the right of the job
              if (job.triggered_invocations && job.triggered_invocations.length > 0) {
                job.triggered_invocations.forEach((triggeredRef: any, triggerIndex: number) => {
                  // Find the full invocation data from the invocations array
                  const fullTriggeredInvocation = invocations.find(inv => inv.id === triggeredRef.id);

                  if (fullTriggeredInvocation) {
                    // Position child invocations closer to the triggering job
                    const childX = jobX + horizontalSpacing; // Use standard horizontal spacing
                    const childY = jobY + (triggerIndex * 200); // Reduced vertical spacing between multiple child invocations

                    // Process the child invocation recursively with full data
                    processInvocation(fullTriggeredInvocation, childX, childY);

                    // Create edge from job to triggered invocation (invocation colored - blue)
                    edges.push({
                      id: `job-${job.id}-to-invocation-${fullTriggeredInvocation.id}`,
                      source: `job-${job.id}`,
                      sourceHandle: 'right',
                      target: fullTriggeredInvocation.id,
                      targetHandle: 'left',
                      type: 'default',
                      animated: true,
                      style: { stroke: '#3b82f6', strokeWidth: 2 }, // Blue for invocations
                      markerEnd: {
                        type: 'arrowclosed',
                        width: 20,
                        height: 20,
                      }
                    });
                  }
                });
              }
            });
          }

          // Update current Y position for next event
          if (eventIndex < eventSpacingData.length - 1) {
            currentEventY += eventData.requiredSpacing;
          }
        });
      }

      // Handle case where all events are undetected
      if (detectedEvents.length === 0 && undetectedEvents.length > 0) {
        const eventSpacingData = calculateEventSpacing(undetectedEvents);

        let currentEventY = baseY;
        if (eventSpacingData.length > 1) {
          const totalHeight = eventSpacingData.reduce((sum, data, index) =>
            sum + (index < eventSpacingData.length - 1 ? data.requiredSpacing : 0), 0
          );
          currentEventY = baseY - totalHeight / 2;
        }

        eventSpacingData.forEach((eventData, eventIndex) => {
          const eventY = currentEventY;
          const eventX = baseX + horizontalSpacing + 80;
          const { event } = eventData;

          const eventNode: PositionedNode = {
            id: `event-${event.id}`,
            type: 'event',
            position: { x: eventX, y: eventY },
            data: {
              eventName: event.event_name,
              correlationId: event.correlation_id,
              detected: event.detected,
              status: event.status,
              detectionDuration: event.detection_duration,
              handlerDuration: event.handler_duration,
              jobsCount: 0,
              hasFailedJobs: false
            }
          };
          nodes.push(eventNode);

          // Edge from invocation to undetected event (event colored - green, dashed)
          edges.push({
            id: `${invocation.id}-to-event-${event.id}`,
            source: invocation.id,
            sourceHandle: 'right',
            target: `event-${event.id}`,
            type: 'default',
            animated: true,
            style: { stroke: '#10b981', strokeWidth: 2, strokeDasharray: '5,5' }, // Green for events, dashed for undetected
            markerEnd: {
              type: 'arrowclosed',
              width: 20,
              height: 20,
            }
          });

          // Update current Y position for next event
          if (eventIndex < eventSpacingData.length - 1) {
            currentEventY += eventData.requiredSpacing;
          }
        });
      }
    };

    // Process invocations - prioritize root invocations (without source_job_id) but include all
    // This handles cases where invocations might be passed directly without parent context
    const rootInvocations = invocations.filter(inv => !inv.source_job_id);
    const childInvocations = invocations.filter(inv => inv.source_job_id);

    // Process root invocations first with standard positioning
    rootInvocations.forEach((invocation, invocationIndex) => {
      const baseX = 200;
      const baseY = 100 + (invocationIndex * 600); // Vertical separation between root invocations only
      processInvocation(invocation, baseX, baseY);
    });

    // Process any remaining child invocations that weren't processed recursively
    // This handles edge cases where child invocations are passed directly
    childInvocations.forEach((invocation, invocationIndex) => {
      if (!processedInvocations.has(invocation.id)) {
        const baseX = 200;
        const baseY = 100 + ((rootInvocations.length + invocationIndex) * 600);
        processInvocation(invocation, baseX, baseY);
      }
    });

    // Deduplicate edges to prevent duplicate key warnings
    const uniqueEdges = edges.filter((edge, index, self) =>
      index === self.findIndex(e => e.id === edge.id)
    );

    return { nodes: nodes, edges: uniqueEdges };
  }, [invocations, horizontalSpacing, verticalSpacing, nodeHeight, minVerticalSpacing]);
};