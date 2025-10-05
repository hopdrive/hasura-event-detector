import { log } from '@/helpers/log';
import { getObjectSafely } from '@/helpers/object';
import { pluginManager } from '@/plugin';
import type {
  HasuraEventPayload,
  EventName,
  JobName,
  JobFunction,
  JobOptions,
  JobResult,
  Job,
  CorrelationId
} from "./types";

export const job = <T = any>(func: JobFunction<T>, options?: JobOptions): Job<T> => {
  return options ? { func, options } : { func };
};

/**
 * Extract the job name that would be used at runtime
 * Pure function with no side effects - safe to use for testing/inspection
 *
 * @param job - Job descriptor containing function and options
 * @returns The job name that would be used (from options.jobName, func.name, or 'anonymous')
 */
export const extractJobName = (job: Job): JobName => {
  const { func, options = {} } = job;
  return (options.jobName || func?.name || 'anonymous') as JobName;
};

/**
 * Run all functions passed into the jobs array as a set
 * of async promises to run as parallel as possible.
 *
 * @param event - Name of the event that triggered the jobs
 * @param hasuraEvent - Hasura event payload
 * @param jobs - List of job definitions to execute
 * @returns Promise resolving to job execution results
 */
export const run = async (
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  jobs: Job[]
): Promise<JobResult[] | undefined> => {
  if (!Array.isArray(jobs)) return undefined;
  if (jobs.length === 0) return undefined;

  const safeJobs: Promise<JobResult>[] = [];
  for (const job of jobs) {
    const { func, options = {} } = job;

    if (!func) continue;

    safeJobs.push(safeJobWrapper(func, event, hasuraEvent, options));
  }

  log(`${event}.runJobs`, `Running ${safeJobs.length} jobs...`);

  const responses = await Promise.allSettled(safeJobs);

  log(`${event}.runJobs`, `Completed ${safeJobs.length} jobs`);

  return preparedResponse(event, jobs, responses);
};

const safeJobWrapper = async <T = any>(
  func: JobFunction<T>,
  event: EventName,
  hasuraEvent: HasuraEventPayload,
  options: JobOptions
): Promise<JobResult<T>> => {
  // Track execution start time
  const start = Date.now();

  // Get correlation ID and abort signal from hasuraEvent
  const correlationId = hasuraEvent?.__correlationId;
  const abortSignal = hasuraEvent?.__abortSignal;

  log('safeJobWrapper', 'Wrapping function', {
    optionsJobNameOverride: options.jobName,
    functionName: func?.name,
    func,
  });

  const output: JobResult<T> = {
    name: extractJobName({ func, options }),
    durationMs: 0,
    result: null as any,
    completed: false,
    startTime: new Date(),
  };

  // Check if already aborted before starting
  if (abortSignal?.aborted) {
    log(event, `Job ${output.name} aborted before start due to timeout`);
    output.result = 'Job aborted due to timeout' as any;
    output.durationMs = Date.now() - start;
    output.endTime = new Date();
    return output;
  }

  // Create enhanced options with correlation ID, job name, and abort signal
  const enhancedOptions: JobOptions = {
    ...options,
    jobName: options.jobName || output.name, // Preserve user-provided jobName if set
    ...(correlationId && { correlationId }),
    ...(abortSignal && { abortSignal }),
  };

  // Call plugin hook for job start (plugins can inject values into enhancedOptions, like jobExecutionId)
  await pluginManager.callOnJobStart(output.name, enhancedOptions, event, hasuraEvent);

  try {
    if (!func) throw new Error('Job func not defined');
    if (typeof func !== 'function') throw new Error('Job func not a function');

    // Set up timeout for individual job if configured
    const maxJobTime = options.timeout || hasuraEvent?.__maxJobExecutionTime;
    let jobTimeoutId: NodeJS.Timeout | undefined;
    let jobTimedOut = false;

    if (maxJobTime && maxJobTime > 0) {
      jobTimeoutId = setTimeout(() => {
        jobTimedOut = true;
        log(event, `Job ${output.name} exceeded max execution time of ${maxJobTime}ms`);
      }, maxJobTime);
    }

    // Execute job with potential timeout race
    const jobPromise = func(event, hasuraEvent, enhancedOptions);

    // Handle abort signal if provided
    let abortHandler: (() => void) | undefined;
    const abortPromise = new Promise<never>((_, reject) => {
      if (abortSignal) {
        abortHandler = () => reject(new Error('Job aborted due to function timeout'));
        abortSignal.addEventListener('abort', abortHandler);
      }
    });

    // Race between job completion, abort, and job timeout
    let funcRes: T;
    try {
      if (abortSignal) {
        funcRes = await Promise.race([jobPromise, abortPromise]);
      } else {
        funcRes = await jobPromise;
      }

      // Check if job timed out while running
      if (jobTimedOut) {
        throw new Error(`Job exceeded max execution time of ${maxJobTime}ms`);
      }
    } finally {
      // Clean up timeout and abort handler
      if (jobTimeoutId) clearTimeout(jobTimeoutId);
      if (abortHandler && abortSignal) {
        abortSignal.removeEventListener('abort', abortHandler);
      }
    }

    output.durationMs = Date.now() - start;
    output.result = funcRes;
    output.completed = true;
    output.endTime = new Date();

    // Call plugin hook for job completion
    await pluginManager.callOnJobEnd(output.name, output, event, hasuraEvent, output.durationMs);

    return output;
  } catch (error) {
    output.result = null as any;
    output.durationMs = Date.now() - start;
    output.completed = false;
    output.error = error as Error;
    output.endTime = new Date();

    // Call plugin hook for job completion (even for failures, so observability can record final status)
    await pluginManager.callOnJobEnd(output.name, output, event, hasuraEvent, output.durationMs);

    // Call plugin hook for error
    await pluginManager.callOnError(error as Error, 'job', hasuraEvent.__correlationId);

    log(event, `Job func crashed: ${(error as Error).message}`);
    const newError = new Error(`Job func crashed: ${(error as Error).message}`);
    (newError as any).jobResult = output;
    throw newError;
  } finally {
    // Plugin cleanup is handled automatically by plugin lifecycle hooks
  }
};

const preparedResponse = (event: EventName, jobs: Job[], responses: PromiseSettledResult<JobResult>[]): JobResult[] => {
  const jobsOutput: JobResult[] = [];

  for (let i = 0; i < responses.length; i++) {
    const jobResponse = responses[i];
    const job = jobs[i];

    if (jobResponse?.status === 'fulfilled') {
      // Successful job execution
      jobsOutput.push(jobResponse.value);
    } else {
      // Failed job execution - create a failed JobResult
      const failedResult: JobResult = {
        name: (job?.func?.name || 'anonymous') as JobName,
        durationMs: 0,
        result: jobResponse?.reason?.message || 'Unknown error',
        completed: false,
        error: jobResponse?.reason,
        startTime: new Date(),
        endTime: new Date(),
      };
      jobsOutput.push(failedResult);
    }
  }

  return jobsOutput;
};

// Exports are already handled above with export statements
