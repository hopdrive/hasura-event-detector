import { logError } from './log.js';

/**
 * Safely convert an object to a serializable representation for logging
 * @param obj - Object to safely convert
 * @returns Safe object representation
 */
export const getObjectSafely = (obj: unknown): Record<string, any> => {
  const safeObj: Record<string, any> = {};
  if (typeof obj !== 'object' || obj === null) return safeObj;

  for (const key in obj as Record<string, any>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const property = (obj as Record<string, any>)[key];
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
          safeObj[key] = `[Function] ${property?.name || 'anonymous'}`;
          continue;
        }

        if (Array.isArray(property)) {
          safeObj[key] = `[Array] ${property.length} entries`;
          continue;
        }

        safeObj[key] = property;
      } catch (error) {
        logError('getObjectSafely', `Issue adding property ${key} to the safeObject`, error as Error);
      }
    }
  }
  return safeObj;
};

