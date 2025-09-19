/**
 * Optimized real-time updates hook with performance enhancements
 * Includes throttling, batching, and memory management
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Entrant } from '@/types/meetings';
import { performanceMonitor, useDebouncedValue, useThrottledCallback } from '@/utils/performance';

interface OptimizedRealtimeConfig {
  initialEntrants: Entrant[];
  raceId: string;
  updateThrottleMs?: number;
  maxHistorySize?: number;
  enableBatching?: boolean;
  batchDelayMs?: number;
}

interface RealtimeUpdate {
  type: 'entrant' | 'moneyFlow' | 'raceStatus';
  entrantId?: string;
  data: Partial<Entrant>;
  timestamp: Date;
  id: string;
}

interface OptimizedConnectionState {
  isConnected: boolean;
  lastUpdate: Date | null;
  connectionAttempts: number;
  averageLatency: number;
  updateRate: number; // updates per second
}

export function useOptimizedRealtime({
  initialEntrants,
  raceId,
  updateThrottleMs = 100,
  maxHistorySize = 50,
  enableBatching = true,
  batchDelayMs = 50
}: OptimizedRealtimeConfig) {
  // State management
  const [entrants, setEntrants] = useState<Entrant[]>(initialEntrants);
  const [updates, setUpdates] = useState<RealtimeUpdate[]>([]);
  const [connectionState, setConnectionState] = useState<OptimizedConnectionState>({
    isConnected: false,
    lastUpdate: null,
    connectionAttempts: 0,
    averageLatency: 0,
    updateRate: 0
  });

  // Performance tracking
  const updateQueue = useRef<RealtimeUpdate[]>([]);
  const latencyBuffer = useRef<number[]>([]);
  const updateCountBuffer = useRef<{ timestamp: number; count: number }[]>([]);
  const lastProcessTime = useRef<number>(Date.now());

  // Debounced entrants to prevent excessive re-renders
  const debouncedEntrants = useDebouncedValue(entrants, 16); // ~60fps

  // Throttled connection state updates
  const throttledConnectionUpdate = useThrottledCallback(
    (newState: Partial<OptimizedConnectionState>) => {
      setConnectionState(prev => ({ ...prev, ...newState }));
    },
    200
  );

  // Optimized entrant update function
  const updateEntrant = useCallback((entrantId: string, updates: Partial<Entrant>) => {
    performanceMonitor.startMeasure('entrant-update');
    
    setEntrants(prevEntrants => {
      const newEntrants = prevEntrants.map(entrant => {
        if (entrant.$id === entrantId) {
          return { ...entrant, ...updates, $updatedAt: new Date().toISOString() };
        }
        return entrant;
      });
      
      performanceMonitor.endMeasure('entrant-update');
      return newEntrants;
    });
  }, []);

  // Batch processing for multiple updates
  const processBatch = useCallback(() => {
    if (updateQueue.current.length === 0) return;

    performanceMonitor.startMeasure('batch-process');
    
    const batch = updateQueue.current.splice(0, updateQueue.current.length);
    const updateMap = new Map<string, Partial<Entrant>>();

    // Group updates by entrant ID
    batch.forEach(update => {
      if (update.entrantId) {
        const existing = updateMap.get(update.entrantId) || {};
        updateMap.set(update.entrantId, { ...existing, ...update.data });
      }
    });

    // Apply all updates in a single state change
    setEntrants(prevEntrants => {
      const newEntrants = prevEntrants.map(entrant => {
        const updates = updateMap.get(entrant.$id);
        if (updates) {
          return { ...entrant, ...updates, $updatedAt: new Date().toISOString() };
        }
        return entrant;
      });

      performanceMonitor.endMeasure('batch-process');
      return newEntrants;
    });

    // Update history
    setUpdates(prevUpdates => {
      const newUpdates = [...prevUpdates, ...batch].slice(-maxHistorySize);
      return newUpdates;
    });

    // Update performance metrics
    updateConnectionMetrics(batch.length);
  }, [maxHistorySize, updateConnectionMetrics]);

  // Performance metrics calculation
  const updateConnectionMetrics = useCallback((updateCount: number) => {
    const now = Date.now();
    
    // Track update rate
    updateCountBuffer.current.push({ timestamp: now, count: updateCount });
    updateCountBuffer.current = updateCountBuffer.current.filter(
      entry => now - entry.timestamp < 60000 // Keep last minute
    );

    const totalUpdates = updateCountBuffer.current.reduce((sum, entry) => sum + entry.count, 0);
    const updateRate = totalUpdates / 60; // updates per second over last minute

    // Update latency tracking
    const processingTime = now - lastProcessTime.current;
    latencyBuffer.current.push(processingTime);
    latencyBuffer.current = latencyBuffer.current.slice(-20); // Keep last 20 measurements

    const averageLatency = latencyBuffer.current.reduce((sum, lat) => sum + lat, 0) / latencyBuffer.current.length;

    throttledConnectionUpdate({
      lastUpdate: new Date(),
      averageLatency,
      updateRate
    });

    lastProcessTime.current = now;
  }, [throttledConnectionUpdate]);

  // Simulated WebSocket connection (replace with actual WebSocket implementation)
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let connectionTimeout: NodeJS.Timeout;

    const connect = () => {
      performanceMonitor.startMeasure('websocket-connect');
      
      setConnectionState(prev => ({ 
        ...prev, 
        connectionAttempts: prev.connectionAttempts + 1 
      }));

      // Simulate connection delay
      connectionTimeout = setTimeout(() => {
        setConnectionState(prev => ({ 
          ...prev, 
          isConnected: true 
        }));

        performanceMonitor.endMeasure('websocket-connect');

        // Simulate periodic updates
        intervalId = setInterval(() => {
          // Generate realistic updates based on market volatility
          const numUpdates = Math.floor(Math.random() * 3) + 1;
          
          for (let i = 0; i < numUpdates; i++) {
            const randomEntrant = entrants[Math.floor(Math.random() * entrants.length)];
            if (!randomEntrant) continue;

            const update: RealtimeUpdate = {
              id: `update-${Date.now()}-${i}`,
              type: Math.random() > 0.7 ? 'moneyFlow' : 'entrant',
              entrantId: randomEntrant.$id,
              data: {
                winOdds: Math.max(1.1, (randomEntrant.winOdds || 2.0) + (Math.random() - 0.5) * 0.2),
                placeOdds: Math.max(1.05, (randomEntrant.placeOdds || 1.5) + (Math.random() - 0.5) * 0.1),
                holdPercentage: Math.max(0, Math.min(100, (randomEntrant.holdPercentage || 5.0) + (Math.random() - 0.5) * 2)),
                moneyFlowTrend: Math.random() > 0.5 ? 'up' : 'down'
              },
              timestamp: new Date()
            };

            if (enableBatching) {
              updateQueue.current.push(update);
            } else {
              updateEntrant(update.entrantId!, update.data);
              setUpdates(prev => [...prev, update].slice(-maxHistorySize));
            }
          }
        }, updateThrottleMs);

        // Process batches periodically if batching is enabled
        if (enableBatching) {
          const batchInterval = setInterval(processBatch, batchDelayMs);
          return () => clearInterval(batchInterval);
        }
      }, 500 + Math.random() * 1000); // Simulate realistic connection time
    };

    connect();

    return () => {
      clearInterval(intervalId);
      clearTimeout(connectionTimeout);
      setConnectionState(prev => ({ ...prev, isConnected: false }));
    };
  }, [raceId, updateThrottleMs, enableBatching, batchDelayMs, processBatch, updateEntrant, maxHistorySize, entrants]);

  // Memoized performance stats
  const performanceStats = useMemo(() => {
    const metrics = performanceMonitor.getMetrics();
    
    return {
      averageUpdateTime: metrics['entrant-update']?.avg || 0,
      averageBatchTime: metrics['batch-process']?.avg || 0,
      totalUpdates: updates.length,
      updatesPerMinute: connectionState.updateRate * 60,
      memoryUsage: {
        entrants: entrants.length,
        updates: updates.length,
        queueSize: updateQueue.current.length
      }
    };
  }, [updates, connectionState.updateRate, entrants.length]);

  // Manual reconnection
  const reconnect = useCallback(() => {
    setConnectionState(prev => ({ 
      ...prev, 
      isConnected: false, 
      connectionAttempts: prev.connectionAttempts + 1 
    }));
    
    // Connection logic would be triggered by the useEffect dependency change
  }, []);

  // Clear update history
  const clearHistory = useCallback(() => {
    setUpdates([]);
    updateQueue.current = [];
    performanceMonitor.clearMetrics();
  }, []);

  // Get recent significant updates (for UI notifications)
  const significantUpdates = useMemo(() => {
    return updates.filter(update => {
      const isRecent = Date.now() - update.timestamp.getTime() < 30000; // Last 30 seconds
      const isSignificant = update.type === 'entrant' && update.data.winOdds; // Odds changes
      return isRecent && isSignificant;
    }).slice(-10); // Last 10 significant updates
  }, [updates]);

  return {
    entrants: debouncedEntrants,
    connectionState,
    recentUpdates: updates.slice(-20), // Last 20 updates
    significantUpdates,
    performanceStats,
    reconnect,
    clearHistory
  };
}
