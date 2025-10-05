/**
 * Caller Path Utilities
 *
 * Helper functions to detect the file path of the calling code,
 * enabling convention-based path resolution.
 */

import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Convert a file URL to a file path, or return the path unchanged if it's already a path.
 * Handles both ESM file URLs (file:///) and regular file paths.
 *
 * @param fileNameOrUrl - File path or file URL
 * @returns Normalized file path
 */
function normalizeFilePath(fileNameOrUrl: string): string {
  // Check if it's a file URL (starts with file://)
  if (fileNameOrUrl.startsWith('file://')) {
    try {
      return fileURLToPath(fileNameOrUrl);
    } catch (error) {
      // If conversion fails, return as-is
      return fileNameOrUrl;
    }
  }
  // Already a regular file path
  return fileNameOrUrl;
}

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

      // Skip this library's files (anything in node_modules/hasura-event-detector or the package itself)
      // This handles both regular npm installs and symlinked packages (npm link)
      if (fileName.includes('node_modules/@hopdrive/hasura-event-detector') ||
          fileName.includes('node_modules/hasura-event-detector') ||
          fileName.includes('/hasura-event-detector/dist/')) {
        continue;
      }

      // Found an external caller - normalize file URL to path and return its directory
      const normalizedPath = normalizeFilePath(fileName);
      return path.dirname(normalizedPath);
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
  let callerDir = getCallerDirectory(depth + 1); // Add 1 for this function's frame

  // Handle Netlify dev server environment
  // Netlify dev runs code from .netlify/functions-serve/[function-name]/[nested-path]
  // But source files are in functions/[function-name]/[files]
  // Transform: .netlify/functions-serve/db-ridehails-background/functions/db-ridehails-background
  //         -> functions/db-ridehails-background
  if (callerDir.includes('/.netlify/functions-serve/')) {
    const match = callerDir.match(/^(.+?)\/\.netlify\/functions-serve\/([^/]+)\/functions\/\2(.*)$/);
    if (match && match[1] && match[2]) {
      const projectRoot = match[1];
      const functionName = match[2];
      const subPath = match[3] || '';
      callerDir = path.join(projectRoot, 'functions', functionName, subPath);
    }
  }

  return path.resolve(callerDir, relativePath);
}
