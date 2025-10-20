'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRace } from '@/contexts/RaceContext';
import { RacePageContent } from '@/components/race-view/RacePageContent';
import { useLogger } from '@/utils/logging';
import {
  startHealthMonitoring,
  stopHealthMonitoring,
  getConnectionState,
  subscribeToConnectionState,
  ensureConnection,
  type ConnectionState,
} from '@/state/connectionState';
import { ConnectionStatusPanel } from '@/components/dashboard/ConnectionStatusPanel';

interface ClientRaceViewProps {
  race_id: string;
}

export function ClientRaceView({ race_id }: ClientRaceViewProps) {
  const logger = useLogger('ClientRaceView');
  const { raceData, isLoading: contextLoading, loadRaceData, error: contextError } = useRace();
  const [error, setError] = useState<string | null>(null);
  const scheduledRef = useRef<number | null>(null);

  // Connection state management
  const [connectionState, setConnectionState] = useState<ConnectionState>(() => getConnectionState());
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const AUTO_RETRY_INTERVAL_MS = 60_000; // 1 minute

  // Start health monitoring when component mounts
  useEffect(() => {
    startHealthMonitoring();

    return () => {
      stopHealthMonitoring();
    };
  }, []);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = subscribeToConnectionState((state) => {
      setConnectionState(state);
    });

    return unsubscribe;
  }, []);

  // Clear retry timers helper
  const clearRetryTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (autoRetryTimeoutRef.current) {
      clearTimeout(autoRetryTimeoutRef.current);
      autoRetryTimeoutRef.current = null;
    }
  }, []);

  // Attempt to reconnect and load race data
  const attemptReconnect = useCallback(async (): Promise<void> => {
    logger.info('Attempting to reconnect and load race data', { race_id });
    setConnectionAttempts((prev) => prev + 1);

    const isHealthy = await ensureConnection();

    if (isHealthy && race_id) {
      // Connection restored, try loading race data
      try {
        await loadRaceData(race_id);
        setConnectionAttempts(0);
        setRetryCountdown(null);
        clearRetryTimers();
      } catch (err) {
        logger.error('Failed to load race data after reconnection', err);
      }
    }
  }, [race_id, loadRaceData, logger, clearRetryTimers]);

  // Manual retry handler
  const handleRetry = useCallback(() => {
    clearRetryTimers();
    void attemptReconnect();
  }, [attemptReconnect, clearRetryTimers]);

  // Automatic retry countdown and execution
  useEffect(() => {
    if (connectionState !== 'disconnected') {
      setRetryCountdown(null);
      clearRetryTimers();
      return;
    }

    // Start countdown
    setRetryCountdown(Math.ceil(AUTO_RETRY_INTERVAL_MS / 1000));

    countdownIntervalRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Schedule automatic retry
    autoRetryTimeoutRef.current = setTimeout(() => {
      void attemptReconnect();
    }, AUTO_RETRY_INTERVAL_MS);

    return () => {
      clearRetryTimers();
    };
  }, [connectionState, attemptReconnect, clearRetryTimers, AUTO_RETRY_INTERVAL_MS]);

  // Detect connection recovery and load race data if we don't have it
  useEffect(() => {
    // Only act when connection becomes healthy and we don't have race data yet
    if (connectionState === 'connected' && race_id && !raceData) {
      logger.info('Connection restored, loading race data', { race_id });

      // Clear any retry state since connection is restored
      setConnectionAttempts(0);
      setRetryCountdown(null);

      // Load race data
      loadRaceData(race_id).catch((err) => {
        logger.error('Failed to load race data after connection recovery', err);
      });
    }
  }, [connectionState, race_id, raceData, loadRaceData, logger]);

  useEffect(() => {
    if (!race_id) return;

    const currentRaceId = raceData?.race?.race_id;
    
    logger.debug('ClientRaceView effect - URL race_id:', { race_id, currentRaceId, contextLoading });

    // If we don't have race data or it doesn't match the requested race ID, load it
    if (!raceData || currentRaceId !== race_id) {
      logger.info('Loading race data for:', { race_id });
      setError(null);
      // Schedule load on next frame to avoid dev StrictMode double-mount abort churn
      if (scheduledRef.current !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(scheduledRef.current);
        } else {
          clearTimeout(scheduledRef.current as unknown as number);
        }
        scheduledRef.current = null;
      }

      const run = () => {
        loadRaceData(race_id).catch((err) => {
          logger.error('Failed to load race data in ClientRaceView:', err);
          setError(err instanceof Error ? err.message : 'Failed to load race data');
        });
      };

      if (typeof requestAnimationFrame !== 'undefined') {
        scheduledRef.current = requestAnimationFrame(() => {
          scheduledRef.current = null;
          run();
        });
      } else {
        const id = setTimeout(() => {
          scheduledRef.current = null;
          run();
        }, 0) as unknown as number;
        scheduledRef.current = id;
      }
    } else if (raceData && currentRaceId === race_id) {
      logger.debug('Race data already matches URL, clearing any errors');
      setError(null);
    }
    return () => {
      if (scheduledRef.current !== null) {
        if (typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(scheduledRef.current);
        } else {
          clearTimeout(scheduledRef.current as unknown as number);
        }
        scheduledRef.current = null;
      }
    };
  }, [race_id, raceData, contextLoading, loadRaceData, logger]);

  // Show connection status panel when connection is not established or has issues
  // Priority: Show ConnectionStatusPanel if disconnected OR if we have no data and are not loading
  if (connectionState !== 'connected' && (!raceData || !contextLoading)) {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <ConnectionStatusPanel
            state={connectionState}
            retryCountdown={retryCountdown}
            connectionAttempts={connectionAttempts}
            onRetry={handleRetry}
          />
        </div>
      </div>
    );
  }

  // Handle errors (prefer context error over local error)
  const displayError = contextError || error;
  if (displayError && displayError !== 'Connection unavailable - please check your connection') {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Race</h2>
            <p className="text-red-700">{displayError}</p>
            <button
              onClick={handleRetry}
              className="mt-4 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              Retry Loading Race
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state only when connected and loading
  if (contextLoading && connectionState === 'connected') {
    return (
      <div className="w-full px-4 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <div className="flex items-center justify-center space-x-3">
              <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span className="text-blue-700 font-medium">Loading race data...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If we have race data and it matches the requested race, render the page content
  if (raceData && raceData.race.race_id === race_id) {
    return <RacePageContent />;
  }

  // While loading or if race data doesn't match, return null - the Suspense fallback will show
  return null;
}
