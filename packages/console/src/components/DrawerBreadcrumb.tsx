import React from 'react';
import { Node } from 'reactflow';
import { PlayIcon, BoltIcon } from '@heroicons/react/24/outline';
import { CircleStackIcon } from '@heroicons/react/24/outline';

interface DrawerBreadcrumbProps {
  node: Node;
  onSelectNode: (node: Node) => void;
}

const getNodeLabel = (node: Node): string => {
  switch (node.type) {
    case 'invocation':
      return node.data.sourceFunction || 'Invocation';
    case 'event':
      return node.data.eventName || 'Event';
    case 'job':
      return node.data.jobName || 'Job';
    default:
      return 'Unknown';
  }
};

const getNodeIcon = (node: Node) => {
  switch (node.type) {
    case 'invocation':
      return <CircleStackIcon className="h-3.5 w-3.5" />;
    case 'event':
      return <BoltIcon className="h-3.5 w-3.5" />;
    case 'job':
      return <PlayIcon className="h-3.5 w-3.5" />;
    default:
      return null;
  }
};

const DrawerBreadcrumb: React.FC<DrawerBreadcrumbProps> = ({ node, onSelectNode }) => {
  const ancestors: Node[] = node.data?.ancestors || [];
  if (ancestors.length === 0) return null;

  return (
    <div className="px-6 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-1 text-sm overflow-x-auto">
      {ancestors.map((ancestor, index) => (
        <React.Fragment key={`${ancestor.id}-${index}`}>
          <button
            onClick={() => onSelectNode(ancestor)}
            className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap flex-shrink-0"
          >
            {getNodeIcon(ancestor)}
            <span>{getNodeLabel(ancestor)}</span>
          </button>
          <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">&rsaquo;</span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default DrawerBreadcrumb;
