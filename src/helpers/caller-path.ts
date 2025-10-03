/**
 * Caller Path Utilities
 *
 * Helper functions to detect the file path of the calling code,
 * enabling convention-based path resolution.
 */

import path from 'path';

/**
 * Get the directory path of the file that called into this library.
 * Uses stack trace inspection to determine the caller's location.
 *
 * @param depth - Stack depth to check (default: 3 for typical library->caller pattern)
 * @returns The directory path of the calling file, or process.cwd() as fallback
 */
export function getCallerDirectory(depth: number = 3): string {
  const originalPrepareStackTrace = Error.prepareStackTrace;

  try {
    // Override Error.prepareStackTrace to get structured stack trace
    Error.prepareStackTrace = (_err, stack) => stack;

    // Create error to capture stack
    const err = new Error();
    const stack = err.stack as unknown as NodeJS.CallSite[];

    // Restore original prepareStackTrace immediately
    Error.prepareStackTrace = originalPrepareStackTrace;

    // Ensure stack exists and is an array
    if (!stack || !Array.isArray(stack)) {
      Error.prepareStackTrace = originalPrepareStackTrace;
      return process.cwd();
    }

    // Find the first external caller (outside this library)
    for (let i = 1; i < stack.length && i <= depth + 2; i++) {
      const callSite = stack[i];
      if (!callSite) continue;

      const fileName = callSite.getFileName();
      if (!fileName) continue;

      // Skip internal Node.js modules
      if (fileName.startsWith('node:') || fileName.startsWith('internal/')) {
        continue;
      }

      // Skip this library's files (anything in node_modules/hasura-event-detector)
      if (fileName.includes('node_modules/@hopdrive/hasura-event-detector') ||
          fileName.includes('node_modules/hasura-event-detector')) {
        continue;
      }

      // Found an external caller - return its directory
      return path.dirname(fileName);
    }
  } catch (error) {
    // If stack trace inspection fails, restore and fall through to fallback
    Error.prepareStackTrace = originalPrepareStackTrace;
  }

  // Fallback to current working directory
  return process.cwd();
}

/**
 * Resolve a path relative to the caller's directory.
 * If the path is absolute, returns it unchanged.
 * If relative, resolves it from the caller's directory.
 *
 * @param relativePath - The path to resolve
 * @param depth - Stack depth for caller detection
 * @returns Absolute path
 */
export function resolveFromCaller(relativePath: string, depth: number = 3): string {
  // If already absolute, return as-is
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }

  // Resolve relative to caller's directory
  const callerDir = getCallerDirectory(depth + 1); // Add 1 for this function's frame
  return path.resolve(callerDir, relativePath);
}
