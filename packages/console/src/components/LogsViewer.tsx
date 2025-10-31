import React, { useState, useEffect, useRef } from 'react';
import { JSONTree } from 'react-json-tree';
import {
  MagnifyingGlassIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import type { LogEntry, LogQueryResult } from '../services/GrafanaService';

interface LogsViewerProps {
  queryFn: () => Promise<LogQueryResult>;
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds
  isJobRunning?: boolean;
}

type ViewMode = 'text' | 'json' | 'table';

const LogsViewer: React.FC<LogsViewerProps> = ({
  queryFn,
  autoRefresh = false,
  refreshInterval = 5000,
  isJobRunning = false,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('text');
  const [displayLimit, setDisplayLimit] = useState(100);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Fetch logs
  const fetchLogs = async () => {
    try {
      setError(null);
      const result = await queryFn();
      setLogs(result.logs);

      // Auto-scroll to bottom if enabled
      if (autoScrollRef.current && scrollRef.current) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }, 100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchLogs();
  }, []);

  // Auto-refresh for running jobs
  useEffect(() => {
    if (!autoRefresh && !isJobRunning) return;

    const interval = setInterval(fetchLogs, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, isJobRunning, refreshInterval]);

  // Filter logs based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredLogs(logs);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = logs.filter(
      (log) =>
        log.message.toLowerCase().includes(term) ||
        log.level.toLowerCase().includes(term) ||
        JSON.stringify(log.labels).toLowerCase().includes(term)
    );
    setFilteredLogs(filtered);
  }, [logs, searchTerm]);

  // Copy to clipboard
  const copyToClipboard = () => {
    let content = '';

    switch (viewMode) {
      case 'text':
        content = filteredLogs
          .map((log) => `${log.timestamp} [${log.level.toUpperCase()}] ${log.message}`)
          .join('\n');
        break;
      case 'json':
        content = JSON.stringify(filteredLogs, null, 2);
        break;
      case 'table':
        // CSV format for table
        content =
          'Timestamp,Level,Message\n' +
          filteredLogs
            .map((log) => `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}"`)
            .join('\n');
        break;
    }

    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Detect user scroll to disable auto-scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollRef.current = isAtBottom;
  };

  const displayedLogs = filteredLogs.slice(0, displayLimit);
  const hasMore = filteredLogs.length > displayLimit;

  // Level color mapping
  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'debug':
        return 'text-gray-500 dark:text-gray-400';
      case 'info':
      default:
        return 'text-blue-600 dark:text-blue-400';
    }
  };

  const jsonTreeTheme = {
    scheme: 'monokai',
    base00: '#1f2937',
    base01: '#374151',
    base02: '#4b5563',
    base03: '#6b7280',
    base04: '#9ca3af',
    base05: '#d1d5db',
    base06: '#e5e7eb',
    base07: '#f3f4f6',
    base08: '#ef4444',
    base09: '#f97316',
    base0A: '#eab308',
    base0B: '#10b981',
    base0C: '#06b6d4',
    base0D: '#3b82f6',
    base0E: '#8b5cf6',
    base0F: '#ec4899',
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse flex space-x-3">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mb-3" />
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Failed to Load Logs
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md">
          {error}
        </p>
        <button
          onClick={fetchLogs}
          className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4 mr-2" />
          Retry
        </button>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="text-gray-400 text-6xl mb-3">📋</div>
        <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No Logs Found
        </h4>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No logs are available for this node in the selected time range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* View mode toggle */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('text')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'text'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Text
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'json'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            JSON
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              viewMode === 'table'
                ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            Table
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Refresh logs"
          >
            <ArrowPathIcon className="h-4 w-4" />
          </button>
          <button
            onClick={copyToClipboard}
            className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Copy to clipboard"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
          </button>
          {copied && (
            <span className="text-xs text-green-600 dark:text-green-400">Copied!</span>
          )}
        </div>
      </div>

      {/* Log count */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Showing {displayedLogs.length} of {filteredLogs.length} logs
        {searchTerm && ` (filtered from ${logs.length} total)`}
        {isJobRunning && (
          <span className="ml-2 inline-flex items-center text-blue-600 dark:text-blue-400">
            <span className="animate-pulse mr-1">●</span>
            Live
          </span>
        )}
      </div>

      {/* Logs display */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-auto"
        style={{ maxHeight: '600px' }}
      >
        {viewMode === 'text' && (
          <div className="p-4 font-mono text-xs space-y-1">
            {displayedLogs.map((log, idx) => (
              <div key={idx} className="flex gap-3 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded">
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {new Date(log.timestamp).toLocaleString()}
                </span>
                <span className={`font-semibold whitespace-nowrap ${getLevelColor(log.level)}`}>
                  [{log.level.toUpperCase()}]
                </span>
                <span className="text-gray-900 dark:text-white break-all">{log.message}</span>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'json' && (
          <div className="p-4">
            <JSONTree
              data={displayedLogs}
              theme={jsonTreeTheme}
              invertTheme={false}
              hideRoot
              shouldExpandNode={(keyName, data, level) => level < 2}
            />
          </div>
        )}

        {viewMode === 'table' && (
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-800 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {displayedLogs.map((log, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    <span className={`font-semibold ${getLevelColor(log.level)}`}>
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white break-all">
                    {log.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => setDisplayLimit(displayLimit + 100)}
            className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            Load More ({filteredLogs.length - displayLimit} remaining)
          </button>
        </div>
      )}
    </div>
  );
};

export default LogsViewer;
