module.exports = {
  jobSimulator: async (event, hasuraEvent, options) => {
    console.log(`[jobSimulator] ${options?.message} delaying ${options?.delay} ms...`);
    await delayAsync(options?.delay);
    console.log(`[jobSimulator] ${options?.message} complete!`);
    return options?.message + ' complete!';
  },
};

function delayAsync(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
