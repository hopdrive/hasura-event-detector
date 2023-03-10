const { log } = require('./helpers/log');
const { getObjectSafely } = require('./helpers/object');

const job = (func, options) => {
  return { func, options };
};

/**
 * Run all functions passed into the jobs array as a set
 * of asyc promisses to run as parallel as possible.
 *
 * @param {Function[]} jobs List of function calls
 * @returns
 */
const run = async (event, hasuraEvent, jobs) => {
  if (!Array.isArray(jobs)) return;
  if (!jobs.length === 0) return;

  let safeJobs = [];
  for (const key in jobs) {
    const job = jobs[key];
    let { func, options = {} } = job;

    if (!func) continue;
    if (!options) options = {};

    safeJobs.push(safeJobWrapper(func, event, hasuraEvent, options));
  }

  log(`${event}.runJobs`, `Running ${safeJobs.length} jobs...`);

  const responses = await Promise.allSettled(safeJobs);

  log(`${event}.runJobs`, `Completed ${safeJobs.length} jobs`);

  return preparedResponse(event, jobs, responses);
};

const safeJobWrapper = async (func, event, hasuraEvent, options) => {
  // Use the urnary (+) to get starting time as milliseconds
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Unary_plus
  let start = +new Date();

  let output = {
    event,
    name: func?.name,
    duration: 0,
    result: null,
  };

  try {
    if (!func) throw Error('Job func not defined');
    if (typeof func !== 'function') throw Error('Job func not a function');

    // Call the job function
    const funcRes = await func(event, hasuraEvent, options);

    output.duration = +new Date() - start;
    output.result = funcRes;

    return output;
  } catch (error) {
    output.result = error.message;
    output.duration = +new Date() - start;
    log(event, `Job func crashed: ${error.message}`);
    let newError = new Error(`Job func crashed: ${error.message}`);
    newError.stack = output;
    throw newError;
  }
};

const preparedResponse = (event, jobs, responses) => {
  let jobsOutput = [];

  for (const responseIndex in responses) {
    const jobResponse = responses[responseIndex];
    const jobResponseDetails = jobResponse?.value || jobResponse?.reason;
    const job = jobs[responseIndex];
    const jobOutput = jobResponse?.status === 'fulfilled' ? jobResponse?.value : jobResponseDetails?.stack;

    jobsOutput.push({
      name: jobOutput?.name,
      options: getObjectSafely(job?.options),
      completed: jobResponse?.status === 'fulfilled',
      duration: jobOutput?.duration,
      result: jobOutput?.result,
    });
  }

  return jobsOutput;
};

module.exports = { job, run };
