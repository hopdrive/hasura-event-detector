const log = (p, m, ...a) => {
  console.log(`[${p}] ${m}`, ...a);
};

module.exports = { log };
