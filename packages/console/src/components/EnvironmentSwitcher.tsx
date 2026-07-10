import { useEnvironment } from '../contexts/EnvironmentContext';
import type { AppEnvironment } from '../config';

const envs: { key: AppEnvironment; label: string }[] = [
  { key: 'test', label: 'Test' },
  { key: 'prod', label: 'Prod' },
];

export default function EnvironmentSwitcher() {
  const { environment, setEnvironment } = useEnvironment();

  return (
    <div className='flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden'>
      {envs.map(e => (
        <button
          key={e.key}
          onClick={() => setEnvironment(e.key)}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            environment === e.key
              ? e.key === 'prod'
                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
              : 'text-gray-500 hover:bg-gray-50 dark:text-gray-500 dark:hover:bg-gray-700'
          }`}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}
