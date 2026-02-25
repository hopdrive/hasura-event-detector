import config, { getEnvConfig, getSharedConfig } from '../config';
import { useEnvironment } from '../contexts/EnvironmentContext';
import EnvironmentSwitcher from './EnvironmentSwitcher';

function truncate(value: string | undefined, chars = 10): string {
  if (!value) return '(not set)';
  if (value.length <= chars) return value;
  return value.substring(0, chars) + '\u2026';
}

function ConfigRow({ label, value, sensitive = false }: { label: string; value: string | undefined; sensitive?: boolean }) {
  const display = sensitive ? truncate(value) : (value || '(not set)');
  return (
    <tr className='border-b border-gray-100 dark:border-gray-700'>
      <td className='py-2 pr-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap'>{label}</td>
      <td className='py-2 text-sm text-gray-900 dark:text-gray-100 font-mono break-all'>{display}</td>
    </tr>
  );
}

const Settings = () => {
  const { environment } = useEnvironment();
  const envConfig = getEnvConfig(environment);
  const shared = getSharedConfig();

  return (
    <div className='p-6 space-y-6'>
      <h2 className='text-2xl font-semibold text-gray-900 dark:text-white'>Settings</h2>

      {/* Environment */}
      <div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>Environment</h3>
        <div className='max-w-xs'>
          <EnvironmentSwitcher />
        </div>
      </div>

      {/* GraphQL Configuration */}
      <div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>
          GraphQL ({environment})
        </h3>
        <table className='w-full'>
          <tbody>
            <ConfigRow label='Endpoint' value={envConfig?.graphqlEndpoint} />
            <ConfigRow label='Admin Secret' value={envConfig?.hasuraAdminSecret} sensitive />
          </tbody>
        </table>
      </div>

      {/* Grafana Configuration */}
      <div className='bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6'>
        <h3 className='text-lg font-medium text-gray-900 dark:text-white mb-4'>Grafana (shared)</h3>
        <table className='w-full'>
          <tbody>
            <ConfigRow label='Host' value={config.logging.grafana.host} />
            <ConfigRow label='URL' value={config.logging.grafana.url} />
            <ConfigRow label='Loki Datasource UID' value={config.logging.grafana.lokiDatasourceUid} />
            <ConfigRow label='Log Environment' value={config.logging.environment} />
            <ConfigRow label='User ID' value={shared?.grafanaUserId} />
            <ConfigRow label='Secret' value={shared?.grafanaSecret} sensitive />
            <ConfigRow label='Service Account Token' value={shared?.grafanaServiceAccountToken} sensitive />
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Settings;
