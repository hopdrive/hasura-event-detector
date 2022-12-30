const failedJobSimulator = async function failedJobSimulator(event, hasuraEvent, options) {
  console.log(`[failedJobSimulator] ${options?.message} delaying ${options?.delay} ms...`);
  await delayAsync(options?.delay);
  throw Error('failedJobSimulator failed!')
};

function delayAsync(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {failedJobSimulator};