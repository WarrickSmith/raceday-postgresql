/**
 * Enhanced real-time hook that integrates WebSocket with optimized performance
 * Replaces the mock real-time system with actual WebSocket connections
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Entrant } from '@/types/meetings';
import { useAppwriteRealtime, AppwriteRealtimeMessage } from '@/services/appwrite-realtime';
import { performanceMonitor, useDebouncedValue } from '@/utils/performance';
import { screenReader } from '@/utils/accessibility';

interface EnhancedRealtimeConfig {
  initialEntrants: Entrant[];
  raceId: string;
  dataFreshness?: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
  updateThrottleMs?: number;
  maxHistorySize?: number;
}

interface RealtimeUpdate {
  id: string;
  type: 'entrant' | 'moneyFlow' | 'raceStatus';
  entrantId?: string;
  data: any;
  timestamp: Date;
}

interface EnhancedConnectionState {
  isConnected: boolean;
  isReconnecting: boolean;
  connectionAttempts: number;
  lastUpdate: Date | null;
  messagesPerSecond: number;
  averageLatency: number;
  totalUpdates: number;
}

interface PerformanceMetrics {
  updatesPerMinute: number;
  averageProcessingTime: number;
  peakMemoryUsage: number;
  connectionUptime: number;
  errorRate: number;
}

export function useEnhancedRealtime({
  initialEntrants,
  raceId,
  dataFreshness,
  updateThrottleMs = 50,
  maxHistorySize = 100
}: EnhancedRealtimeConfig) {
  // Appwrite real-time connection
  const { connectionState: appwriteConnectionState, messages, reconnect, isConnected } = useAppwriteRealtime(raceId);

  // State management
  const [entrants, setEntrants] = useState<Entrant[]>(initialEntrants);
  const [recentUpdates, setRecentUpdates] = useState<RealtimeUpdate[]>([]);
  const [connectionState, setConnectionState] = useState<EnhancedConnectionState>({
    isConnected: false,
    isReconnecting: false,
    connectionAttempts: 0,
    lastUpdate: null,
    messagesPerSecond: 0,
    averageLatency: 0,
    totalUpdates: 0
  });

  // Performance tracking
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    updatesPerMinute: 0,
    averageProcessingTime: 0,
    peakMemoryUsage: 0,
    connectionUptime: 0,
    errorRate: 0
  });

  // Debounced entrants to prevent excessive re-renders
  const optimizedEntrants = useDebouncedValue(entrants, updateThrottleMs);

  // Update connection state from Appwrite
  useEffect(() => {
    setConnectionState(prev => ({
      ...prev,
      isConnected: appwriteConnectionState.isConnected,
      connectionAttempts: appwriteConnectionState.reconnectAttempts,
      messagesPerSecond: appwriteConnectionState.messagesPerSecond,
      averageLatency: appwriteConnectionState.latency
    }));
  }, [appwriteConnectionState]);

  // Process incoming Appwrite messages
  useEffect(() => {
    const latestMessages = messages.slice(-5); // Process last 5 messages
    
    latestMessages.forEach(message => {
      processAppwriteMessage(message);
    });
  }, [messages]);

  const processAppwriteMessage = useCallback((message: AppwriteRealtimeMessage) => {
    performanceMonitor.startMeasure('message-processing');

    try {
      // Determine update type from Appwrite events and channels
      const updateType = mapAppwriteEventToUpdateType(message.events, message.channels);
      const entrantId = extractEntrantIdFromPayload(message.payload);

      const update: RealtimeUpdate = {
        id: `${message.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        type: updateType,
        entrantId,
        data: message.payload,
        timestamp: new Date(message.timestamp)
      };

      // Process different types of updates
      switch (update.type) {
        case 'entrant':
          processEntrantUpdate(update);
          break;
        case 'moneyFlow':
          processMoneyFlowUpdate(update);
          break;
        case 'raceStatus':
          processRaceStatusUpdate(update);
          break;
      }

      // Add to recent updates
      setRecentUpdates(prev => {
        const newUpdates = [...prev, update].slice(-maxHistorySize);
        return newUpdates;
      });

      // Update connection state
      setConnectionState(prev => ({
        ...prev,
        lastUpdate: new Date(),
        totalUpdates: prev.totalUpdates + 1
      }));

      // Announce significant updates for accessibility
      announceUpdateForAccessibility(update);

    } catch (error) {
      console.error('Error processing Appwrite message:', error);
    } finally {
      const processingTime = performanceMonitor.endMeasure('message-processing');
      updatePerformanceMetrics(processingTime);
    }
  }, [maxHistorySize]);

  const processEntrantUpdate = useCallback((update: RealtimeUpdate) => {
    if (!update.entrantId) return;

    setEntrants(prev => prev.map(entrant => {
      if (entrant.$id === update.entrantId) {
        const updatedEntrant = {
          ...entrant,
          ...update.data,
          $updatedAt: update.timestamp.toISOString()
        };

        // Announce odds changes
        if (update.data.winOdds && entrant.winOdds && update.data.winOdds !== entrant.winOdds) {
          const direction = update.data.winOdds > entrant.winOdds ? 'up' : 'down';
          screenReader?.announceOddsUpdate(
            entrant.name,
            update.data.winOdds.toFixed(2),
            direction
          );
        }

        return updatedEntrant;
      }
      return entrant;
    }));
  }, []);

  const processMoneyFlowUpdate = useCallback((update: RealtimeUpdate) => {
    if (!update.entrantId) return;

    setEntrants(prev => prev.map(entrant => {
      if (entrant.$id === update.entrantId) {
        return {
          ...entrant,
          holdPercentage: update.data.holdPercentage,
          moneyFlowTrend: update.data.trend || entrant.moneyFlowTrend,
          $updatedAt: update.timestamp.toISOString()
        };
      }
      return entrant;
    }));
  }, []);

  const processRaceStatusUpdate = useCallback((update: RealtimeUpdate) => {
    screenReader?.announceRaceStatusChange(update.data.status);
  }, []);

  const announceUpdateForAccessibility = useCallback((update: RealtimeUpdate) => {
    // Only announce significant updates to avoid overwhelming screen readers
    if (update.type === 'entrant' && update.data.winOdds) {
      const entrant = entrants.find(e => e.$id === update.entrantId);
      if (entrant) {
        const message = `${entrant.name} odds updated to ${update.data.winOdds.toFixed(2)}`;
        screenReader?.announce(message, 'polite');
      }
    }
  }, [entrants]);

  const updatePerformanceMetrics = useCallback((processingTime: number) => {
    setPerformanceMetrics(prev => ({
      ...prev,
      averageProcessingTime: (prev.averageProcessingTime + processingTime) / 2,
      updatesPerMinute: connectionState.messagesPerSecond * 60,
      connectionUptime: isConnected ? prev.connectionUptime + 1 : 0
    }));
  }, [connectionState.messagesPerSecond, isConnected]);

  // Helper function to map Appwrite events to update types
  const mapAppwriteEventToUpdateType = (events: string[], channels: string[]): 'entrant' | 'moneyFlow' | 'raceStatus' => {
    // Check channels to determine the type of update
    for (const channel of channels) {
      if (channel.includes('collections.entrants.documents')) {
        return 'entrant';
      }
      if (channel.includes('collections.money-flow-history.documents')) {
        return 'moneyFlow';
      }
      if (channel.includes('collections.races.documents')) {
        return 'raceStatus';
      }
      if (channel.includes('collections.odds-history.documents')) {
        return 'entrant'; // Treat odds updates as entrant updates
      }
    }
    
    // Fallback to checking events
    for (const event of events) {
      if (event.includes('entrants') || event.includes('odds-history')) {
        return 'entrant';
      }
      if (event.includes('money-flow-history')) {
        return 'moneyFlow';
      }
      if (event.includes('races')) {
        return 'raceStatus';
      }
    }
    
    return 'entrant'; // Default fallback
  };

  // Helper function to extract entrant ID from Appwrite payload
  const extractEntrantIdFromPayload = (payload: any): string | undefined => {
    // For entrant documents, the payload itself contains the entrant data
    if (payload && payload.$id && payload.entrantId) {
      return payload.$id;
    }
    
    // For odds/money flow history, look for entrant field
    if (payload && payload.entrant) {
      return payload.entrant;
    }
    
    return undefined;
  };

  // Manual reconnection function
  const triggerReconnect = useCallback(() => {
    setConnectionState(prev => ({ ...prev, isReconnecting: true }));
    reconnect();
    setTimeout(() => {
      setConnectionState(prev => ({ ...prev, isReconnecting: false }));
    }, 2000);
  }, [reconnect]);

  // Clear update history
  const clearUpdateHistory = useCallback(() => {
    setRecentUpdates([]);
    performanceMonitor.clearMetrics();
  }, []);

  // Calculate update counts by type
  const updateCounts = useMemo(() => {
    const counts = { total: 0, entrant: 0, moneyFlow: 0, raceStatus: 0 };
    
    recentUpdates.forEach(update => {
      counts.total++;
      counts[update.type]++;
    });

    return counts;
  }, [recentUpdates]);

  const calculateHealthScore = useCallback((): number => {
    let score = 100;
    
    // Deduct points for connection issues
    if (!connectionState.isConnected) score -= 50;
    if (connectionState.connectionAttempts > 3) score -= 20;
    
    // Deduct points for performance issues
    if (performanceMetrics.averageProcessingTime > 50) score -= 20;
    if (performanceMetrics.errorRate > 0.1) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }, [connectionState, performanceMetrics]);

  // Enhanced performance object
  const performance = useMemo(() => ({
    ...performanceMetrics,
    connectionLatency: connectionState.averageLatency,
    messageRate: connectionState.messagesPerSecond,
    isOptimized: performanceMetrics.averageProcessingTime < 10, // Under 10ms is considered optimized
    healthScore: calculateHealthScore()
  }), [performanceMetrics, connectionState, calculateHealthScore]);

  return {
    entrants: optimizedEntrants,
    connectionState: {
      ...connectionState,
      healthScore: performance.healthScore
    },
    recentUpdates: recentUpdates.slice(-20), // Last 20 updates
    updateCounts,
    performance,
    triggerReconnect,
    clearUpdateHistory,
    // Additional debugging information
    debugInfo: {
      totalMessages: messages.length,
      queueSize: messages.length,
      lastMessageTime: messages[messages.length - 1]?.timestamp,
      dataFreshness
    }
  };
}