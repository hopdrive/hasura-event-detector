/**
 * Format duration from milliseconds to human-readable format
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return 'N/A';

  // For very small durations, show in ms
  if (ms < 1000) {
    return `${ms}ms`;
  }

  // For durations less than 60 seconds, show in seconds with 1 decimal
  if (ms < 60000) {
    const seconds = ms / 1000;
    return `${seconds.toFixed(1)}s`;
  }

  // For durations less than 60 minutes, show in minutes and seconds
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    if (seconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${seconds}s`;
  }

  // For longer durations, show hours, minutes, and seconds
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  let result = `${hours}h`;
  if (minutes > 0) result += ` ${minutes}m`;
  if (seconds > 0 && hours < 24) result += ` ${seconds}s`;

  return result;
}

/**
 * Format duration with color coding based on performance thresholds
 * @param ms - Duration in milliseconds
 * @param type - Type of operation for context-specific thresholds
 * @returns Object with formatted string and suggested color class
 */
export function formatDurationWithColor(ms: number | null | undefined, type: 'job' | 'event' | 'invocation' = 'job') {
  const formatted = formatDuration(ms);

  if (ms === null || ms === undefined) {
    return { formatted, colorClass: 'text-gray-500' };
  }

  // Define thresholds based on type
  const thresholds = {
    job: { fast: 500, normal: 2000, slow: 5000 },
    event: { fast: 100, normal: 500, slow: 1000 },
    invocation: { fast: 1000, normal: 5000, slow: 10000 }
  };

  const threshold = thresholds[type];

  let colorClass = 'text-gray-600 dark:text-gray-400';
  if (ms <= threshold.fast) {
    colorClass = 'text-green-600 dark:text-green-400';
  } else if (ms <= threshold.normal) {
    colorClass = 'text-blue-600 dark:text-blue-400';
  } else if (ms <= threshold.slow) {
    colorClass = 'text-yellow-600 dark:text-yellow-400';
  } else {
    colorClass = 'text-red-600 dark:text-red-400';
  }

  return { formatted, colorClass };
}