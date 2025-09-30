'use client';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

type Listener = (state: ConnectionState) => void;

const HEALTH_ENDPOINT = '/api/health';
const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 180_000; // 3 minutes

// Initialize to 'connected' in test environment to avoid blocking fetch requests in tests
const initialState: ConnectionState = process.env.NODE_ENV === 'test' ? 'connected' : 'connecting';
let currentState: ConnectionState = initialState;
const listeners = new Set<Listener>();
let inFlightHealthCheck: Promise<boolean> | null = null;

// Health monitoring state
let healthCheckTimer: NodeJS.Timeout | null = null;
let activeMonitoringRefs = 0; // Reference counting for multiple page instances
let lastHealthCheckTime = 0;

// Parse health monitoring configuration from environment
function getHealthMonitoringConfig() {
  const enabledEnv = process.env.NEXT_PUBLIC_ENABLE_HEALTH_MONITORING;
  const intervalEnv = process.env.NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS;

  const enabled = enabledEnv === undefined ? true : enabledEnv === 'true' || enabledEnv === '1';
  const intervalMs = intervalEnv
    ? Math.max(60_000, Number.parseInt(intervalEnv, 10)) // Minimum 1 minute
    : DEFAULT_HEALTH_CHECK_INTERVAL_MS;

  return { enabled, intervalMs: Number.isFinite(intervalMs) ? intervalMs : DEFAULT_HEALTH_CHECK_INTERVAL_MS };
}

export function getConnectionState(): ConnectionState {
  return currentState;
}

export function setConnectionState(state: ConnectionState): void {
  if (currentState === state) {
    return;
  }

  currentState = state;

  for (const listener of listeners) {
    listener(state);
  }
}

export function subscribeToConnectionState(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function isConnectionHealthy(): boolean {
  return currentState === 'connected';
}

async function runHealthCheck(): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    const body = (await response.json()) as { status?: string };

    if (body?.status === 'healthy') {
      setConnectionState('connected');
      return true;
    }

    setConnectionState('disconnected');
    return false;
  } catch (error) {
    clearTimeout(timeoutId);
    if ((error as Error)?.name !== 'AbortError') {
      console.warn('Connection health check failed', error);
    }
    setConnectionState('disconnected');
    return false;
  }
}

export async function ensureConnection(): Promise<boolean> {
  if (isConnectionHealthy()) {
    return true;
  }

  if (inFlightHealthCheck) {
    return inFlightHealthCheck;
  }

  setConnectionState('connecting');

  inFlightHealthCheck = (async () => {
    try {
      return await runHealthCheck();
    } finally {
      inFlightHealthCheck = null;
    }
  })();

  return inFlightHealthCheck;
}

/**
 * Schedules the next periodic health check
 */
function scheduleNextHealthCheck() {
  const config = getHealthMonitoringConfig();

  if (!config.enabled) {
    return;
  }

  // Clear any existing timer
  if (healthCheckTimer) {
    clearTimeout(healthCheckTimer);
    healthCheckTimer = null;
  }

  // Schedule next health check
  healthCheckTimer = setTimeout(() => {
    void performPeriodicHealthCheck();
  }, config.intervalMs);
}

/**
 * Performs a periodic health check if enough time has elapsed
 */
async function performPeriodicHealthCheck() {
  const config = getHealthMonitoringConfig();
  const now = Date.now();

  // Debounce: only run if enough time has passed since last check
  if (now - lastHealthCheckTime < config.intervalMs * 0.8) {
    // Schedule the next check
    scheduleNextHealthCheck();
    return;
  }

  lastHealthCheckTime = now;

  // Run health check (will update connection state)
  await runHealthCheck();

  // Schedule the next check
  scheduleNextHealthCheck();
}

/**
 * Starts periodic health monitoring with reference counting
 * Safe to call from multiple components - uses reference counting
 * to ensure monitoring continues while at least one component is active
 */
export function startHealthMonitoring(): void {
  const config = getHealthMonitoringConfig();

  if (!config.enabled) {
    return;
  }

  activeMonitoringRefs += 1;

  // Only start timer if this is the first reference
  if (activeMonitoringRefs === 1 && !healthCheckTimer) {
    scheduleNextHealthCheck();
  }
}

/**
 * Stops periodic health monitoring with reference counting
 * Only actually stops monitoring when all components have unmounted
 */
export function stopHealthMonitoring(): void {
  activeMonitoringRefs = Math.max(0, activeMonitoringRefs - 1);

  // Only stop timer if no more references
  if (activeMonitoringRefs === 0 && healthCheckTimer) {
    clearTimeout(healthCheckTimer);
    healthCheckTimer = null;
  }
}
