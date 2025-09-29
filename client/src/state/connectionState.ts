'use client';

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

type Listener = (state: ConnectionState) => void;

const HEALTH_ENDPOINT = '/api/health';

let currentState: ConnectionState = 'connecting';
const listeners = new Set<Listener>();
let inFlightHealthCheck: Promise<boolean> | null = null;

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
  try {
    const response = await fetch(HEALTH_ENDPOINT, { cache: 'no-store' });

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
    console.warn('Connection health check failed', error);
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
