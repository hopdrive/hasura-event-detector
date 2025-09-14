export { EventNode, type EventNodeData } from './EventNode';
export { JobNode, type JobNodeData } from './JobNode';
export { InvocationNode, type InvocationNodeData } from './InvocationNode';
export { GroupedEventsNode, type GroupedEventsNodeData } from './GroupedEventsNode';

// Re-export all components as default nodeTypes for ReactFlow
import { EventNode } from './EventNode';
import { JobNode } from './JobNode';
import { InvocationNode } from './InvocationNode';
import { GroupedEventsNode } from './GroupedEventsNode';

export const nodeTypes = {
  invocation: InvocationNode,
  event: EventNode,
  job: JobNode,
  groupedEvents: GroupedEventsNode,
};