const getObjectSafely = obj => {
  let safeObj = {};
  if (typeof obj !== 'object') return safeObj;

  for (const key in obj) {
    if (Object.hasOwnProperty.call(obj, key)) {
      const property = obj[key];
      try {
        if (property === null || property === undefined) {
          safeObj[key] = property;
          continue;
        }

        if (typeof property === 'object') {
          try {
            const propCount = Object.keys(property).length;
            //console.log(`getObjectSafely object.keys for property key: ${key} `, Object.keys(property))
            if (propCount < 5) {
              safeObj[key] = Object.keys(property);
            } else {
              safeObj[key] = `[Object] ${propCount} properties`;
            }
          } catch (error) {
            safeObj[key] = `[Object] unknown properties`;
          }
          continue;
        }

        if (typeof property === 'function') {
          safeObj[key] = `[Function] ${property?.name}`;
          continue;
        }

        if (Array.isArray(property)) {
          safeObj[key] = `[Array] ${property.length} entries`;
          continue;
        }

        safeObj[key] = property;
      } catch (error) {
        const { logError } = require('./log');
        logError('getObjectSafely', `Issue adding property ${key} to the safeObject`, error);
      }
    }
  }
  return safeObj;
};

module.exports = { getObjectSafely };
