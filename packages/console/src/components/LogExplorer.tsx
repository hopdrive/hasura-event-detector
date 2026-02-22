import React, { useState, useCallback } from 'react';
import LogsViewer from './LogsViewer';
import { createGrafanaService } from '../services/GrafanaService';
import type { LogQueryResult } from '../services/GrafanaService';

const DEFAULT_QUERY = `{environment="test"} | json | invocationId=\`db-lanes-1771668078808-azlh78h-2a713d63\` | line_format "{{.message}}"`;

function EnvIndicator({ name, value, sensitive }: { name: string; value: string | undefined; sensitive?: boolean }) {
  const isSet = !!value;
  const masked = sensitive || name.toLowerCase().includes('secret') || name.toLowerCase().includes('service');
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${isSet ? 'bg-green-500' : 'bg-red-500'}`} />
      <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{name}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {isSet ? (masked ? '***' : value) : 'not set'}
      </span>
    </div>
  );
}

const LogExplorer: React.FC = () => {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [runCount, setRunCount] = useState(0);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grafanaHost = import.meta.env.VITE_GRAFANA_HOST;
  const grafanaId = import.meta.env.VITE_GRAFANA_USER || import.meta.env.VITE_GRAFANA_ID;
  const grafanaSecret = import.meta.env.VITE_GRAFANA_SECRET;
  const grafanaServiceToken = import.meta.env.VITE_GRAFANA_SERVICE;
  const lokiUid = import.meta.env.VITE_GRAFANA_LOKI_UID || 'grafanacloud-logs';
  const grafanaEnvironment = import.meta.env.VITE_GRAFANA_ENVIRONMENT;

  const service = createGrafanaService();

  const queryFn = useCallback(async (): Promise<LogQueryResult> => {
    if (!service) {
      throw new Error('GrafanaService not configured — check env vars above');
    }

    const now = Date.now();
    const start = (now - 24 * 60 * 60 * 1000) * 1000000; // 24h ago in nanoseconds
    const end = now * 1000000;

    const { parsed, raw } = await service.queryLogsWithRaw({
      query,
      start,
      end,
      limit: 500,
      direction: 'backward',
    });

    setRawResponse(raw);
    return parsed;
  }, [query, service]);

  const handleRunQuery = () => {
    setError(null);
    setRawResponse(null);
    setRunCount(c => c + 1);
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Log Explorer (POC)</h1>

      {/* Diagnostics Panel */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider mb-3">
          Diagnostics
        </h2>
        <EnvIndicator name="VITE_GRAFANA_ENVIRONMENT" value={grafanaEnvironment} />
        <EnvIndicator name="VITE_GRAFANA_SERVICE" value={grafanaServiceToken} />
        <EnvIndicator name="VITE_GRAFANA_LOKI_UID" value={lokiUid} />
        <EnvIndicator name="VITE_GRAFANA_HOST" value={grafanaHost} />
        <EnvIndicator name="VITE_GRAFANA_ID" value={grafanaId} />
        <EnvIndicator name="VITE_GRAFANA_SECRET" value={grafanaSecret} />
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${service ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-xs text-gray-700 dark:text-gray-300">
            GrafanaService: {service ? 'initialized' : 'not initialized'}
            {grafanaServiceToken ? ' (service account → datasource proxy)' : ' (direct Loki)'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Proxy: /api/grafana → hopdrive.grafana.net
        </div>
      </div>

      {/* Query Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
          LogQL Query
        </h2>
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          rows={4}
          className="w-full font-mono text-sm p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          spellCheck={false}
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunQuery}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Run Query
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={showRaw}
              onChange={e => setShowRaw(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Show Raw Response
          </label>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-1">Error</h3>
          <pre className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap break-all">{error}</pre>
        </div>
      )}

      {/* Results Section */}
      {runCount > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
            Results
          </h2>
          <LogsViewer key={runCount} queryFn={queryFn} />
        </div>
      )}

      {/* Raw Response */}
      {showRaw && rawResponse && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
            Raw Loki Response
          </h2>
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-auto max-h-96 text-gray-800 dark:text-gray-200">
            {JSON.stringify(rawResponse, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default LogExplorer;
