/**
 * Centralized logging utility for the renderer process.
 * 
 * Behavior varies by environment:
 * - Development: All log levels (debug, info, warn, error) are output to the console.
 * - Production: Only errors are logged, and they are sanitized to avoid exposing
 *   sensitive internal state or stack traces to end users.
 */
const isDev = import.meta.env.DEV

function truncateString(value: string, maxLength = 400): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength)}...<truncated>`
}

function sanitizeConsoleValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return truncateString(value)
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: truncateString(value.message),
      ...(isDev && value.stack ? { stack: truncateString(value.stack, 2_000) } : {})
    }
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return `[array(${value.length})]`
    }
    return value.slice(0, 10).map((item) => sanitizeConsoleValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    if (depth >= 2) {
      return '[object]'
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 20)) {
      sanitized[key] = sanitizeConsoleValue(entry, depth + 1)
    }
    return sanitized
  }

  return String(value)
}

/**
 * Logger instance with support for varied log levels.
 * Uses `unknown[]` for broad compatibility while maintaining type safety.
 */
export const logger = {
  /**
   * Logs low-level debugging information.
   * Suppressed in production environments.
   * 
   * @param args - Data or messages to log
   */
  debug: (...args: unknown[]) => {
    if (isDev) console.debug('[DEBUG]', ...args)
  },

  /**
   * Logs warning messages for non-critical issues.
   * Suppressed in production environments.
   * 
   * @param args - Data or messages to log
   */
  warn: (...args: unknown[]) => {
    if (isDev) console.warn('[WARN]', ...args)
  },

  /**
   * Logs critical error messages.
   * In production, error context is sanitized before being written to the console.
   * 
   * @param msg - Human-readable error description
   * @param error - Optional error object or context (sanitized in production)
   */
  error: (msg: string, error?: unknown) => {
    if (error === undefined) {
      console.error('[ERROR]', msg)
      return
    }

    if (isDev) {
      console.error('[ERROR]', msg, error)
    } else {
      console.error('[ERROR]', msg, sanitizeConsoleValue(error))
    }
  },

  /**
   * Logs general information about application state or flow.
   * Suppressed in production environments.
   * 
   * @param args - Data or messages to log
   */
  info: (...args: unknown[]) => {
    if (isDev) console.log('[INFO]', ...args)
  }
}
