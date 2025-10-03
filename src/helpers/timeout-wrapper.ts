/**
 * Timeout management for serverless function execution
 *
 * This module provides timeout detection and graceful shutdown capabilities
 * for Lambda, Netlify, and other serverless environments.
 */

import { log, logError, logWarn } from './log';

/**
 * Custom error class for timeout-related errors
 */
export class TimeoutError extends Error {
  public readonly isLambdaTimeout: boolean = true;
  public readonly remainingTime?: number;

  constructor(message: string, remainingTime?: number) {
    super(message);
    this.name = 'TimeoutError';
    if (remainingTime !== undefined) {
      this.remainingTime = remainingTime;
    }
  }
}

/**
 * Configuration for timeout wrapper
 */
export interface TimeoutConfig {
  /** Function to get remaining execution time in milliseconds */
  getRemainingTimeInMillis?: () => number;
  /** Safety margin in milliseconds before timeout (default: 2000) */
  safetyMargin?: number;
  /** Whether to use fallback timer when no context is available */
  isUsingFallbackTimer?: boolean;
  /** Maximum execution time in milliseconds when using fallback timer (default: 10000 for Netlify) */
  maxExecutionTime?: number;
  /** Logger function for debugging */
  logger?: (message: string, ...args: any[]) => void;
}

/**
 * Timeout manager for serverless execution
 */
export class TimeoutManager {
  private config: Required<TimeoutConfig>;
  private startTime: number;
  private timeoutCheckInterval?: NodeJS.Timeout;
  private isTimingOut: boolean = false;
  private abortController: AbortController;

  constructor(config: TimeoutConfig = {}) {
    this.config = {
      getRemainingTimeInMillis: config.getRemainingTimeInMillis || this.getFallbackRemainingTime.bind(this),
      safetyMargin: config.safetyMargin ?? 2000, // 2 seconds default
      isUsingFallbackTimer: config.isUsingFallbackTimer ?? !config.getRemainingTimeInMillis,
      maxExecutionTime: config.maxExecutionTime ?? 10000, // 10 seconds for Netlify
      logger: config.logger ?? log,
    };

    this.startTime = Date.now();
    this.abortController = new AbortController();

    if (this.config.isUsingFallbackTimer) {
      this.config.logger('TimeoutManager: Using fallback timer mode');
    } else {
      this.config.logger('TimeoutManager: Using Lambda/Netlify context for timeout detection');
    }
  }

  /**
   * Fallback method to calculate remaining time when no Lambda context is available
   */
  private getFallbackRemainingTime(): number {
    const elapsed = Date.now() - this.startTime;
    const remaining = this.config.maxExecutionTime - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Get the remaining execution time
   */
  public getRemainingTime(): number {
    return this.config.getRemainingTimeInMillis();
  }

  /**
   * Check if we're approaching timeout
   */
  public isApproachingTimeout(): boolean {
    const remaining = this.getRemainingTime();
    return remaining <= this.config.safetyMargin;
  }

  /**
   * Get the abort signal for cancelling operations
   */
  public getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Start monitoring for timeout
   */
  public startMonitoring(
    onTimeoutApproaching: () => Promise<void>,
    checkInterval: number = 500
  ): void {
    this.config.logger(`TimeoutManager: Starting timeout monitoring (check interval: ${checkInterval}ms)`);

    this.timeoutCheckInterval = setInterval(async () => {
      if (this.isTimingOut) {
        return; // Already handling timeout
      }

      const remaining = this.getRemainingTime();

      // Log every 5 seconds or when getting close to timeout
      if (remaining % 5000 < checkInterval || remaining <= this.config.safetyMargin * 2) {
        this.config.logger(`TimeoutManager: ${Math.round(remaining / 1000)}s remaining`);
      }

      if (remaining <= this.config.safetyMargin) {
        this.isTimingOut = true;
        this.config.logger(`TimeoutManager: Timeout approaching! ${remaining}ms remaining, initiating shutdown`);

        // Stop monitoring
        this.stopMonitoring();

        // Abort any ongoing operations
        this.abortController.abort();

        // Call the timeout handler
        try {
          await onTimeoutApproaching();
        } catch (error) {
          logError('TimeoutManager', 'Error in timeout handler', error as Error);
        }
      }
    }, checkInterval);
  }

  /**
   * Stop monitoring for timeout
   */
  public stopMonitoring(): void {
    if (this.timeoutCheckInterval) {
      clearInterval(this.timeoutCheckInterval);
      delete this.timeoutCheckInterval;
      this.config.logger('TimeoutManager: Stopped timeout monitoring');
    }
  }

  /**
   * Execute a function with timeout protection
   */
  public async executeWithTimeout<T>(
    fn: () => Promise<T>,
    onTimeout: () => Promise<void>,
    timeoutMessage: string = 'Function execution exceeded time limit'
  ): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      let isCompleted = false;

      // Start monitoring for timeout
      this.startMonitoring(async () => {
        if (!isCompleted) {
          isCompleted = true;

          // Call timeout handler
          try {
            await onTimeout();
          } catch (error) {
            logError('TimeoutManager', 'Error in timeout handler', error as Error);
          }

          // Reject with timeout error
          reject(new TimeoutError(timeoutMessage, this.getRemainingTime()));
        }
      });

      try {
        // Execute the function
        const result = await fn();

        if (!isCompleted) {
          isCompleted = true;
          this.stopMonitoring();
          resolve(result);
        }
      } catch (error) {
        if (!isCompleted) {
          isCompleted = true;
          this.stopMonitoring();

          // If it's a timeout error, pass it through
          if ((error as TimeoutError).isLambdaTimeout) {
            reject(error);
          } else {
            // For other errors, check if we're timing out
            if (this.isApproachingTimeout()) {
              await onTimeout();
              reject(new TimeoutError(`Operation failed near timeout: ${(error as Error).message}`, this.getRemainingTime()));
            } else {
              reject(error);
            }
          }
        }
      }
    });
  }

  /**
   * Create a timeout-aware wrapper for async functions
   */
  public createWrapper<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    onTimeout: () => Promise<void>
  ): T {
    return (async (...args: Parameters<T>) => {
      return this.executeWithTimeout(
        () => fn(...args),
        onTimeout,
        `Function ${fn.name || 'anonymous'} exceeded time limit`
      );
    }) as T;
  }
}

/**
 * Create a simple timeout wrapper function for backward compatibility
 */
export function createTimeoutWrapper(config: TimeoutConfig = {}) {
  return async function<T>(
    fn: () => Promise<T>,
    systemTimeoutHandler: () => Promise<void>,
    userTimeoutHandler?: () => Promise<void>
  ): Promise<T> {
    const manager = new TimeoutManager(config);

    // Combine system and user timeout handlers
    const combinedTimeoutHandler = async () => {
      // Run system handler first (update status, etc.)
      await systemTimeoutHandler();

      // Then run user handler if provided
      if (userTimeoutHandler) {
        try {
          await userTimeoutHandler();
        } catch (error) {
          logError('TimeoutWrapper', 'Error in user timeout handler', error as Error);
        }
      }
    };

    return manager.executeWithTimeout(fn, combinedTimeoutHandler);
  };
}

/**
 * Utility function to check if an error is a timeout error
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (error as TimeoutError)?.isLambdaTimeout === true;
}

/**
 * Create a delay function that can be aborted
 */
export function delayAsync(
  ms: number,
  abortSignal?: AbortSignal,
  progressCallback?: (remaining: number) => void,
  progressInterval: number = 1000
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      return reject(new Error('Delay aborted'));
    }

    const startTime = Date.now();
    let intervalId: NodeJS.Timeout | undefined;
    let timeoutId: NodeJS.Timeout;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
      clearTimeout(timeoutId);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Delay aborted'));
    };

    if (abortSignal) {
      abortSignal.addEventListener('abort', onAbort);
    }

    if (progressCallback) {
      intervalId = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, ms - elapsed);

        if (remaining <= 0) {
          if (intervalId) clearInterval(intervalId);
        } else {
          progressCallback(remaining);
        }
      }, progressInterval);
    }

    timeoutId = setTimeout(() => {
      cleanup();
      if (abortSignal) {
        abortSignal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);
  });
}