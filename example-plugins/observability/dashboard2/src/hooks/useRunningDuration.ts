import { useState, useEffect } from 'react';

interface UseRunningDurationOptions {
  status: string;
  createdAt?: string;
  completedDurationMs?: number;
}

/**
 * Hook for calculating and live-updating durations for running items
 * For completed items, returns the static duration
 * For running items, calculates live duration from start time and updates every second
 */
export const useRunningDuration = ({
  status,
  createdAt,
  completedDurationMs
}: UseRunningDurationOptions): number => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  const isRunning = status === 'running';

  // Update current time every second for running items
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  // Calculate duration based on status
  if (!isRunning) {
    // For completed items, use the static duration
    return completedDurationMs || 0;
  }

  // For running items, calculate live duration
  if (!createdAt) {
    return 0;
  }

  const startTime = new Date(createdAt).getTime();
  const duration = currentTime - startTime;

  return Math.max(0, duration); // Ensure non-negative duration
};

export default useRunningDuration;