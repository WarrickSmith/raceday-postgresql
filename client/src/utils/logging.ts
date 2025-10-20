/**
 * Client-Side Conditional Logging Utilities for RaceDay Next.js Application
 * Mirrors server-side logging patterns with browser-specific enhancements
 *
 * Environment Variable: NEXT_PUBLIC_LOG_LEVEL
 * - DEBUG: All logging (development)
 * - INFO: Info, warnings, and errors (staging)
 * - WARN: Warnings and errors only
 * - ERROR: Critical errors only (production)
 * - SILENT: No logging
 */

const LOG_LEVELS = {
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
} as const;

type LogLevel = keyof typeof LOG_LEVELS;
type FormattedLogMessage = [string, string, ...unknown[]];

/**
 * Get current log level from environment variable
 * Defaults to INFO if not set or invalid
 */
function getCurrentLogLevel(): number {
  if (typeof window === 'undefined') {
    // SSR fallback - be conservative
    return LOG_LEVELS.ERROR;
  }

  const envLevel = process.env.NEXT_PUBLIC_LOG_LEVEL?.toUpperCase() as LogLevel;
  return LOG_LEVELS[envLevel] !== undefined ? LOG_LEVELS[envLevel] : LOG_LEVELS.INFO;
}

/**
 * Check if logging is enabled for a specific level
 */
function isLogLevelEnabled(level: LogLevel): boolean {
  const currentLevel = getCurrentLogLevel();
  const checkLevel = LOG_LEVELS[level] || LOG_LEVELS.INFO;
  return currentLevel >= checkLevel;
}

/**
 * Get React component name from error stack or component props
 */
function getComponentContext(): string {
  if (typeof window === 'undefined') return 'SSR';

  try {
    const stack = new Error().stack;
    const stackLines = stack?.split('\n') || [];

    // Look for React component patterns in stack
    for (const line of stackLines) {
      const componentMatch = line.match(/at\s+([A-Z][a-zA-Z0-9]+)/);
      if (componentMatch && !['Object', 'Array', 'Function'].includes(componentMatch[1])) {
        return componentMatch[1];
      }
    }

    return 'Unknown';
  } catch {
    return 'Unknown';
  }
}

/**
 * Format log message with context and styling
 */
function formatLogMessage(
  level: LogLevel,
  message: string,
  data?: unknown,
  component?: string
): FormattedLogMessage {
  const timestamp = new Date().toISOString().slice(11, 23); // HH:mm:ss.SSS
  const ctx = component || getComponentContext();

  // Browser console styling
  const styles: Record<LogLevel, string> = {
    SILENT: '',
    DEBUG: 'color: #9CA3AF; font-weight: normal',
    INFO: 'color: #3B82F6; font-weight: normal',
    WARN: 'color: #F59E0B; font-weight: bold',
    ERROR: 'color: #EF4444; font-weight: bold'
  };

  const prefix = `[${timestamp}] [${level}] [${ctx}]`;
  const styledPrefix = `%c${prefix}`;

  if (data !== undefined) {
    return [styledPrefix + ' ' + message, styles[level], data];
  }

  return [styledPrefix + ' ' + message, styles[level]];
}

/**
 * Conditional logging function for debug messages
 */
export function logDebug(message: string, data?: unknown, component?: string): void {
  if (isLogLevelEnabled('DEBUG')) {
    const [msg, style, ...args] = formatLogMessage('DEBUG', message, data, component);
    console.log(msg, style, ...args);
  }
}

/**
 * Conditional logging function for info messages
 */
export function logInfo(message: string, data?: unknown, component?: string): void {
  if (isLogLevelEnabled('INFO')) {
    const [msg, style, ...args] = formatLogMessage('INFO', message, data, component);
    console.log(msg, style, ...args);
  }
}

/**
 * Conditional logging function for warning messages
 */
export function logWarn(message: string, data?: unknown, component?: string): void {
  if (isLogLevelEnabled('WARN')) {
    const [msg, style, ...args] = formatLogMessage('WARN', message, data, component);
    console.warn(msg, style, ...args);
  }
}

/**
 * Conditional logging function for error messages
 * Always logs unless SILENT level is set
 */
export function logError(message: string, error?: unknown, component?: string): void {
  if (isLogLevelEnabled('ERROR')) {
    const [msg, style, ...args] = formatLogMessage('ERROR', message, error, component);
    console.error(msg, style, ...args);
  }
}

/**
 * Log performance metrics with timing (always logged unless SILENT)
 */
export function logPerformance(
  operation: string,
  start_time: number,
  metrics: Record<string, unknown> = {},
  component?: string
): void {
  if (isLogLevelEnabled('ERROR')) {
    const duration = Date.now() - start_time;
    const perfData = {
      durationMs: duration,
      ...metrics,
      timestamp: new Date().toISOString()
    };

    const [msg, style, ...args] = formatLogMessage('INFO', `PERF: ${operation}`, perfData, component);
    console.log(msg, style, ...args);
  }
}

/**
 * Log React component render with render count tracking
 */
export function logRender(componentName: string, props?: Record<string, unknown>): void {
  if (isLogLevelEnabled('DEBUG')) {
    const renderData = {
      timestamp: new Date().toISOString(),
      props: props ? Object.keys(props) : undefined
    };

    const [msg, style, ...args] = formatLogMessage('DEBUG', `RENDER: ${componentName}`, renderData, componentName);
    console.log(msg, style, ...args);
  }
}

/**
 * Log real-time connection events
 */
export function logRealtime(
  event: 'connect' | 'disconnect' | 'update' | 'error',
  details?: unknown,
  component?: string
): void {
  const level = event === 'error' ? 'ERROR' : 'DEBUG';

  if (isLogLevelEnabled(level)) {
    const message = `REALTIME: ${event.toUpperCase()}`;
    const [msg, style, ...args] = formatLogMessage(level, message, details, component);

    if (level === 'ERROR') {
      console.error(msg, style, ...args);
    } else {
      console.log(msg, style, ...args);
    }
  }
}

/**
 * Log API requests and responses
 */
export function logAPI(
  method: string,
  url: string,
  status?: number,
  timing?: number,
  component?: string
): void {
  if (isLogLevelEnabled('DEBUG')) {
    const apiData = {
      method,
      url,
      status,
      timing: timing ? `${timing}ms` : undefined,
      timestamp: new Date().toISOString()
    };

    const [msg, style, ...args] = formatLogMessage('DEBUG', `API: ${method} ${url}`, apiData, component);
    console.log(msg, style, ...args);
  }
}

/**
 * Group related logs for better organization
 */
export function logGroup(
  groupName: string,
  callback: () => void,
  collapsed: boolean = true
): void {
  if (isLogLevelEnabled('DEBUG')) {
    if (collapsed) {
      console.groupCollapsed(`🔍 ${groupName}`);
    } else {
      console.group(`🔍 ${groupName}`);
    }

    callback();
    console.groupEnd();
  } else {
    // Still execute callback even if logging is disabled
    callback();
  }
}

/**
 * Log memory usage and cleanup events
 */
export function logMemory(
  operation: string,
  memoryInfo?: Record<string, unknown>,
  component?: string
): void {
  if (isLogLevelEnabled('DEBUG')) {
    const memoryData = {
      operation,
      timestamp: new Date().toISOString(),
      ...memoryInfo
    };

    const [msg, style, ...args] = formatLogMessage('DEBUG', `MEMORY: ${operation}`, memoryData, component);
    console.log(msg, style, ...args);
  }
}

/**
 * Create a logger instance bound to a specific component
 */
export function createComponentLogger(componentName: string) {
  return {
    debug: (message: string, data?: unknown) => logDebug(message, data, componentName),
    info: (message: string, data?: unknown) => logInfo(message, data, componentName),
    warn: (message: string, data?: unknown) => logWarn(message, data, componentName),
    error: (message: string, error?: unknown) => logError(message, error, componentName),
    render: (props?: Record<string, unknown>) => logRender(componentName, props),
    performance: (operation: string, start_time: number, metrics?: Record<string, unknown>) =>
      logPerformance(operation, start_time, metrics, componentName),
    realtime: (event: 'connect' | 'disconnect' | 'update' | 'error', details?: unknown) =>
      logRealtime(event, details, componentName),
    api: (method: string, url: string, status?: number, timing?: number) =>
      logAPI(method, url, status, timing, componentName),
    memory: (operation: string, memoryInfo?: Record<string, unknown>) =>
      logMemory(operation, memoryInfo, componentName)
  };
}

/**
 * Hook for React components to get a bound logger
 * Ensures a stable reference across renders for a given component name.
 */
import { useMemo } from 'react'

export function useLogger(componentName?: string) {
  const name = componentName || getComponentContext();
  return useMemo(() => createComponentLogger(name), [name]);
}

export type ComponentLogger = ReturnType<typeof createComponentLogger>;

/**
 * Development utilities
 */
export const LoggingUtils = {
  /**
   * Get current logging configuration
   */
  getConfig: () => ({
    level: process.env.NEXT_PUBLIC_LOG_LEVEL || 'INFO',
    numericLevel: getCurrentLogLevel(),
    isSSR: typeof window === 'undefined'
  }),

  /**
   * Test all logging levels
   */
  testAllLevels: () => {
    logDebug('Debug message test', { test: true });
    logInfo('Info message test', { test: true });
    logWarn('Warning message test', { test: true });
    logError('Error message test', { test: true });
  },

  /**
   * Check if specific level is enabled (for conditional expensive operations)
   */
  isDebugEnabled: () => isLogLevelEnabled('DEBUG'),
  isInfoEnabled: () => isLogLevelEnabled('INFO'),
  isWarnEnabled: () => isLogLevelEnabled('WARN'),
  isErrorEnabled: () => isLogLevelEnabled('ERROR')
};

// Export log levels for external use
export { LOG_LEVELS };
export type { LogLevel };
