import { log } from '@/helpers/log.js';
import { getObjectSafely } from '@/helpers/object.js';
import { pluginManager } from '@/plugins/plugin-system.js';
import type {
  HasuraEventPayload,
  EventName,
  JobName,
  JobFunction,
  JobOptions,
  JobResult,
  Job,
  CorrelationId
} from '@/types/index.js';

export const job = <T = any>(
  func: JobFunction<T>, 
  options?: JobOptions
): Job<T> => {
  return options ? { func, options } : { func };
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
  
  // Get correlation ID from hasuraEvent
  const correlationId = hasuraEvent?.__correlationId;

  const output: JobResult<T> = {
    name: (func?.name || 'anonymous') as JobName,
    duration: 0,
    result: null as any,
    completed: false,
    startTime: new Date(),
  };

  // Call plugin hook for job start
  await pluginManager.callHook('onJobStart', output.name, options, event, hasuraEvent, correlationId);

  try {
    if (!func) throw new Error('Job func not defined');
    if (typeof func !== 'function') throw new Error('Job func not a function');

    // Add correlation ID and job name to options for job functions to use
    const enhancedOptions: JobOptions = {
      ...options,
      jobName: output.name,
      ...(correlationId && { correlationId })
    };

    // Call the job function with enhanced options
    const funcRes = await func(event, hasuraEvent, enhancedOptions);

    output.duration = Date.now() - start;
    output.result = funcRes;
    output.completed = true;
    output.endTime = new Date();

    // Call plugin hook for job completion
    await pluginManager.callHook('onJobEnd', output.name, output, event, hasuraEvent, correlationId);

    return output;
  } catch (error) {
    output.result = null as any;
    output.duration = Date.now() - start;
    output.completed = false;
    output.error = error as Error;
    output.endTime = new Date();
    
    // Call plugin hook for error
    await pluginManager.callHook('onError', error as Error, 'job', correlationId);

    log(event, `Job func crashed: ${(error as Error).message}`);
    const newError = new Error(`Job func crashed: ${(error as Error).message}`);
    (newError as any).jobResult = output;
    throw newError;
  } finally {
    // Plugin cleanup is handled automatically by plugin lifecycle hooks
  }
};

const preparedResponse = (
  event: EventName, 
  jobs: Job[], 
  responses: PromiseSettledResult<JobResult>[]
): JobResult[] => {
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
        name: ((job?.func?.name || 'anonymous') as JobName),
        duration: 0,
        result: jobResponse?.reason?.message || 'Unknown error',
        completed: false,
        error: jobResponse?.reason,
        startTime: new Date(),
        endTime: new Date()
      };
      jobsOutput.push(failedResult);
    }
  }

  return jobsOutput;
};

// Exports are already handled above with export statements
