'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Race } from '@/types/meetings';
import { pollRace } from '@/app/actions/poll-race';

interface PerformanceMetrics {
  totalPolls: number;
  averageLatency: number;
  errorRate: number;
}

interface PollingStates {
  [raceId: string]: {
    isPolling: boolean;
    lastPolledAt: Date | null;
    errorCount: number;
  };
}

interface UseRacePollingIntegrationParams {
  races: Race[];
  isConnected: boolean;
  onPerformanceAlert: (raceId: string, latency: number) => void;
  onPollingError: (raceId: string, error: string) => void;
  enableAutoPolling: boolean;
}

interface UseRacePollingIntegrationReturn {
  pollingStates: PollingStates;
  performanceMetrics: PerformanceMetrics;
  triggerManualPoll: (raceId: string) => Promise<void>;
  isPerformanceWithinThreshold: boolean;
}

/**
 * Hook for managing race polling integration across multiple races
 */
export function useRacePollingIntegration({
  races,
  isConnected,
  onPerformanceAlert,
  onPollingError,
  enableAutoPolling
}: UseRacePollingIntegrationParams): UseRacePollingIntegrationReturn {
  const [pollingStates, setPollingStates] = useState<PollingStates>({});
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    totalPolls: 0,
    averageLatency: 0,
    errorRate: 0,
  });

  const latencyHistoryRef = useRef<number[]>([]);
  const errorCountRef = useRef(0);

  /**
   * Trigger manual polling for a specific race
   */
  const triggerManualPoll = useCallback(async (raceId: string): Promise<void> => {
    if (!isConnected) {
      onPollingError(raceId, 'Not connected');
      return;
    }

    // Update polling state
    setPollingStates(prev => ({
      ...prev,
      [raceId]: {
        isPolling: true,
        lastPolledAt: new Date(),
        errorCount: prev[raceId]?.errorCount || 0,
      }
    }));

    const startTime = performance.now();

    try {
      const result = await pollRace(raceId);
      const latency = performance.now() - startTime;
      
      // Update latency history
      latencyHistoryRef.current = [...latencyHistoryRef.current, latency].slice(-10);
      
      if (result.success) {
        // Update polling state - success
        setPollingStates(prev => ({
          ...prev,
          [raceId]: {
            isPolling: false,
            lastPolledAt: new Date(),
            errorCount: 0,
          }
        }));
        
        // Check for performance issues
        if (latency > 2000) {
          onPerformanceAlert(raceId, latency);
        }
      } else {
        errorCountRef.current += 1;
        onPollingError(raceId, result.error || 'Polling failed');
        
        // Update polling state - error
        setPollingStates(prev => ({
          ...prev,
          [raceId]: {
            isPolling: false,
            lastPolledAt: new Date(),
            errorCount: (prev[raceId]?.errorCount || 0) + 1,
          }
        }));
      }
      
      // Update performance metrics
      const avgLatency = latencyHistoryRef.current.reduce((sum, l) => sum + l, 0) / latencyHistoryRef.current.length;
      const totalPolls = performanceMetrics.totalPolls + 1;
      const errorRate = errorCountRef.current / totalPolls;
      
      setPerformanceMetrics({
        totalPolls,
        averageLatency: avgLatency,
        errorRate,
      });
      
    } catch (error) {
      errorCountRef.current += 1;
      
      const errorMessage = error instanceof Error ? error.message : 'Network error';
      onPollingError(raceId, errorMessage);
      
      // Update polling state - error
      setPollingStates(prev => ({
        ...prev,
        [raceId]: {
          isPolling: false,
          lastPolledAt: new Date(),
          errorCount: (prev[raceId]?.errorCount || 0) + 1,
        }
      }));
      
      // Update performance metrics
      const totalPolls = performanceMetrics.totalPolls + 1;
      const errorRate = errorCountRef.current / totalPolls;
      
      setPerformanceMetrics(prev => ({
        totalPolls,
        averageLatency: prev.averageLatency, // Don't include error latency
        errorRate,
      }));
    }
  }, [isConnected, onPerformanceAlert, onPollingError, performanceMetrics.totalPolls]);

  /**
   * Check if performance is within acceptable thresholds
   */
  const isPerformanceWithinThreshold = useCallback((): boolean => {
    return performanceMetrics.averageLatency < 2000 && performanceMetrics.errorRate < 0.1;
  }, [performanceMetrics]);

  // Auto-polling effect (simplified for now)
  useEffect(() => {
    if (!enableAutoPolling || !isConnected || races.length === 0) {
      return;
    }

    // For now, just initialize polling states for races
    const newStates: PollingStates = {};
    races.forEach(race => {
      if (!pollingStates[race.raceId]) {
        newStates[race.raceId] = {
          isPolling: false,
          lastPolledAt: null,
          errorCount: 0,
        };
      }
    });

    if (Object.keys(newStates).length > 0) {
      setPollingStates(prev => ({ ...prev, ...newStates }));
    }
  }, [races, enableAutoPolling, isConnected, pollingStates]);

  return {
    pollingStates,
    performanceMetrics,
    triggerManualPoll,
    isPerformanceWithinThreshold: isPerformanceWithinThreshold(),
  };
}