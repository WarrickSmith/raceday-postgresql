/**
 * Appwrite Real-time Service
 * Replaces custom WebSocket with Appwrite's native real-time subscriptions
 */

import React from 'react';
import { Client } from 'appwrite';
import { performanceMonitor } from '@/utils/performance';

export interface AppwriteRealtimeMessage {
  events: string[];
  channels: string[];
  timestamp: number;
  payload: any;
}

export interface AppwriteConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastConnected?: Date;
  reconnectAttempts: number;
  latency: number;
  messagesReceived: number;
  messagesPerSecond: number;
}

type MessageHandler = (message: AppwriteRealtimeMessage) => void;
type ConnectionHandler = (state: AppwriteConnectionState) => void;

export class AppwriteRealtimeService {
  private client: Client | null = null;
  private unsubscribeCallbacks = new Map<string, () => void>();
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private connectionState: AppwriteConnectionState;
  private messageBuffer: { timestamp: number }[] = [];

  constructor() {
    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      latency: 0,
      messagesReceived: 0,
      messagesPerSecond: 0
    };

    this.calculateMessageRate();
    this.initializeClient();
  }

  private initializeClient(): void {
    if (typeof window === 'undefined') return; // Server-side check

    this.client = new Client()
      .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
      .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

    this.log('Appwrite client initialized');
  }

  /**
   * Subscribe to race updates using Appwrite channels
   * Automatically unsubscribes from previous race before subscribing to new one
   */
  public subscribeToRace(raceId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Appwrite client not initialized'));
        return;
      }

      // First, unsubscribe from all existing subscriptions to prevent conflicts
      this.unsubscribeFromAllRaces();

      performanceMonitor.startMeasure('appwrite-subscription');
      this.updateConnectionState({ isConnecting: true });

      try {
        // Subscribe to all race-related channels with more specific filtering
        const channels = [
          `databases.raceday-db.collections.races.documents.${raceId}`,
          `databases.raceday-db.collections.entrants.documents`,
          `databases.raceday-db.collections.odds-history.documents`,
          `databases.raceday-db.collections.money-flow-history.documents`
        ];

        this.log('Subscribing to channels for race:', raceId, channels);

        const unsubscribe = this.client.subscribe(channels, (response) => {
          this.handleAppwriteMessage(response, raceId);
        });

        // Store unsubscribe callback
        this.unsubscribeCallbacks.set(raceId, unsubscribe);

        const connectionTime = performanceMonitor.endMeasure('appwrite-subscription');
        
        this.updateConnectionState({
          isConnected: true,
          isConnecting: false,
          lastConnected: new Date(),
          reconnectAttempts: 0,
          latency: connectionTime
        });

        this.log('Successfully subscribed to race:', raceId);
        resolve();

      } catch (error) {
        this.updateConnectionState({
          isConnected: false,
          isConnecting: false
        });
        this.log('Subscription error:', error);
        reject(error);
      }
    });
  }

  /**
   * Unsubscribe from all races - useful for navigation cleanup
   */
  public unsubscribeFromAllRaces(): void {
    this.log('Unsubscribing from all races. Active subscriptions:', this.unsubscribeCallbacks.size);
    
    for (const [raceId, unsubscribe] of this.unsubscribeCallbacks) {
      try {
        unsubscribe();
        this.log('Unsubscribed from race:', raceId);
      } catch (error) {
        this.log('Error unsubscribing from race:', raceId, error);
      }
    }
    
    this.unsubscribeCallbacks.clear();

    // Update connection state if no active subscriptions
    this.updateConnectionState({
      isConnected: false,
      isConnecting: false
    });
  }

  /**
   * Unsubscribe from race updates
   */
  public unsubscribeFromRace(raceId: string): void {
    const unsubscribe = this.unsubscribeCallbacks.get(raceId);
    if (unsubscribe) {
      unsubscribe();
      this.unsubscribeCallbacks.delete(raceId);
      this.log('Unsubscribed from race:', raceId);
    }

    // Update connection state if no active subscriptions
    if (this.unsubscribeCallbacks.size === 0) {
      this.updateConnectionState({
        isConnected: false,
        isConnecting: false
      });
    }
  }

  /**
   * Add message handler
   */
  public onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Add connection state handler
   */
  public onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): AppwriteConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Disconnect all subscriptions
   */
  public disconnect(): void {
    for (const [raceId] of this.unsubscribeCallbacks) {
      this.unsubscribeFromRace(raceId);
    }

    this.updateConnectionState({
      isConnected: false,
      isConnecting: false
    });

    this.log('All subscriptions disconnected');
  }

  private handleAppwriteMessage(response: any, raceId: string): void {
    try {
      performanceMonitor.startMeasure('appwrite-message-process');
      
      // Filter messages relevant to the current race
      const isRelevant = this.isMessageRelevantToRace(response, raceId);
      if (!isRelevant) return;

      const message: AppwriteRealtimeMessage = {
        events: response.events || [],
        channels: response.channels || [],
        timestamp: response.timestamp || Date.now(),
        payload: response.payload || response
      };
      
      // Update message rate tracking
      this.messageBuffer.push({ timestamp: Date.now() });
      this.connectionState.messagesReceived++;

      // Notify all handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          this.log('Message handler error:', error);
        }
      });

      performanceMonitor.endMeasure('appwrite-message-process');
      this.log('Appwrite message processed:', message.events);

    } catch (error) {
      this.log('Failed to process Appwrite message:', error);
    }
  }

  private isMessageRelevantToRace(response: any, raceId: string): boolean {
    // Check if the message is related to the current race
    const channels = response.channels || [];
    const payload = response.payload || {};

    // Direct race document update
    if (channels.some((channel: string) => channel.includes(`races.documents.${raceId}`))) {
      return true;
    }

    // Entrant updates - check if entrant belongs to current race
    if (channels.some((channel: string) => channel.includes('entrants.documents'))) {
      // This would need to be filtered based on the entrant's race field
      // For now, we'll process all entrant updates and let the component filter
      return true;
    }

    // Odds and money flow history - similar filtering needed
    if (channels.some((channel: string) => 
      channel.includes('odds-history.documents') || 
      channel.includes('money-flow-history.documents')
    )) {
      return true;
    }

    return false;
  }

  private calculateMessageRate(): void {
    setInterval(() => {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      
      // Filter messages from last second
      this.messageBuffer = this.messageBuffer.filter(msg => msg.timestamp > oneSecondAgo);
      
      this.updateConnectionState({
        messagesPerSecond: this.messageBuffer.length
      });
    }, 1000);
  }

  private updateConnectionState(updates: Partial<AppwriteConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    this.connectionHandlers.forEach(handler => {
      try {
        handler(this.connectionState);
      } catch (error) {
        this.log('Connection handler error:', error);
      }
    });
  }

  private log(...args: any[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.log('[AppwriteRealtime]', ...args);
    }
  }
}

// Singleton instance
let appwriteRealtimeInstance: AppwriteRealtimeService | null = null;

export function getAppwriteRealtimeService(): AppwriteRealtimeService {
  if (!appwriteRealtimeInstance) {
    appwriteRealtimeInstance = new AppwriteRealtimeService();
  }
  return appwriteRealtimeInstance;
}

// React hook for Appwrite real-time integration
export function useAppwriteRealtime(raceId?: string | null): {
  connectionState: AppwriteConnectionState;
  messages: AppwriteRealtimeMessage[];
  reconnect: () => void;
  isConnected: boolean;
} {
  const [connectionState, setConnectionState] = React.useState<AppwriteConnectionState>({
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0,
    latency: 0,
    messagesReceived: 0,
    messagesPerSecond: 0
  });

  const [messages, setMessages] = React.useState<AppwriteRealtimeMessage[]>([]);
  const realtimeService = React.useRef<AppwriteRealtimeService>();

  React.useEffect(() => {
    // Skip connection if raceId is null or undefined
    if (!raceId) {
      // Clear messages and reset connection state
      setMessages([]);
      setConnectionState({
        isConnected: false,
        isConnecting: false,
        reconnectAttempts: 0,
        latency: 0,
        messagesReceived: 0,
        messagesPerSecond: 0
      });
      
      // Ensure all subscriptions are cleaned up
      if (realtimeService.current) {
        realtimeService.current.unsubscribeFromAllRaces();
      }
      return;
    }

    console.log('[AppwriteRealtime] Setting up subscription for race:', raceId);
    
    realtimeService.current = getAppwriteRealtimeService();
    
    const unsubscribeConnection = realtimeService.current.onConnectionChange(setConnectionState);
    const unsubscribeMessages = realtimeService.current.onMessage((message) => {
      setMessages(prev => [...prev, message].slice(-50)); // Keep last 50 messages
    });

    // Subscribe to race - this will automatically clean up previous subscriptions
    realtimeService.current.subscribeToRace(raceId).catch(error => {
      console.error('Failed to subscribe to race:', error);
    });

    return () => {
      console.log('[AppwriteRealtime] Cleaning up subscription for race:', raceId);
      unsubscribeConnection();
      unsubscribeMessages();
      
      // Clean up all subscriptions when component unmounts or raceId changes
      if (realtimeService.current) {
        realtimeService.current.unsubscribeFromAllRaces();
      }
    };
  }, [raceId]);

  const reconnect = React.useCallback(() => {
    if (raceId && realtimeService.current) {
      realtimeService.current.unsubscribeFromRace(raceId);
      realtimeService.current.subscribeToRace(raceId).catch(error => {
        console.error('Failed to reconnect:', error);
      });
    }
  }, [raceId]);

  return {
    connectionState,
    messages,
    reconnect,
    isConnected: connectionState.isConnected
  };
}