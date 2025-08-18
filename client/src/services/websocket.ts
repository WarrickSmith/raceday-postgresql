/**
 * Enhanced WebSocket service for real-time race data
 * Supports automatic reconnection, message queuing, and performance monitoring
 */

import React from 'react';
import { Entrant } from '@/types/meetings';
import { performanceMonitor } from '@/utils/performance';

export interface WebSocketMessage {
  type: 'entrant_update' | 'race_status' | 'money_flow' | 'connection' | 'heartbeat';
  raceId?: string;
  entrantId?: string;
  data?: any;
  timestamp: string;
  messageId: string;
}

export interface WebSocketConfig {
  url?: string;
  heartbeatInterval?: number;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  messageQueueSize?: number;
  enableLogging?: boolean;
}

export interface ConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  lastConnected?: Date;
  reconnectAttempts: number;
  latency: number;
  messagesReceived: number;
  messagesPerSecond: number;
}

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = (state: ConnectionState) => void;

export class EnhancedWebSocketService {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketConfig>;
  private messageHandlers = new Set<MessageHandler>();
  private connectionHandlers = new Set<ConnectionHandler>();
  private messageQueue: WebSocketMessage[] = [];
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionState: ConnectionState;
  private messageBuffer: { timestamp: number }[] = [];

  constructor(config: WebSocketConfig = {}) {
    this.config = {
      url: config.url || (process.env.NODE_ENV === 'development' 
        ? 'ws://localhost:3001/ws' 
        : `wss://${window.location.host}/ws`),
      heartbeatInterval: config.heartbeatInterval || 30000,
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      messageQueueSize: config.messageQueueSize || 100,
      enableLogging: config.enableLogging ?? (process.env.NODE_ENV === 'development')
    };

    this.connectionState = {
      isConnected: false,
      isConnecting: false,
      reconnectAttempts: 0,
      latency: 0,
      messagesReceived: 0,
      messagesPerSecond: 0
    };

    this.calculateMessageRate();
  }

  /**
   * Connect to WebSocket server
   */
  public connect(raceId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connectionState.isConnected || this.connectionState.isConnecting) {
        resolve();
        return;
      }

      performanceMonitor.startMeasure('websocket-connection');
      this.updateConnectionState({ isConnecting: true });

      try {
        const url = raceId ? `${this.config.url}?raceId=${raceId}` : this.config.url;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          const connectionTime = performanceMonitor.endMeasure('websocket-connection');
          
          this.updateConnectionState({
            isConnected: true,
            isConnecting: false,
            lastConnected: new Date(),
            reconnectAttempts: 0,
            latency: connectionTime
          });

          this.startHeartbeat();
          this.processQueuedMessages();
          
          this.log('WebSocket connected successfully');
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          this.handleClose(event);
        };

        this.ws.onerror = (error) => {
          this.log('WebSocket error:', error);
          this.updateConnectionState({
            isConnected: false,
            isConnecting: false
          });
          reject(error);
        };

      } catch (error) {
        this.updateConnectionState({
          isConnected: false,
          isConnecting: false
        });
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  public disconnect(): void {
    this.stopHeartbeat();
    this.stopReconnectTimer();
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }

    this.updateConnectionState({
      isConnected: false,
      isConnecting: false
    });

    this.log('WebSocket disconnected');
  }

  /**
   * Subscribe to race updates
   */
  public subscribeToRace(raceId: string): void {
    this.sendMessage({
      type: 'connection',
      data: { action: 'subscribe', raceId },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    });
  }

  /**
   * Unsubscribe from race updates
   */
  public unsubscribeFromRace(raceId: string): void {
    this.sendMessage({
      type: 'connection',
      data: { action: 'unsubscribe', raceId },
      timestamp: new Date().toISOString(),
      messageId: this.generateMessageId()
    });
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
  public getConnectionState(): ConnectionState {
    return { ...this.connectionState };
  }

  /**
   * Force reconnection
   */
  public reconnect(): void {
    this.disconnect();
    setTimeout(() => this.connect(), 100);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      performanceMonitor.startMeasure('websocket-message-process');
      
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Update message rate tracking
      this.messageBuffer.push({ timestamp: Date.now() });
      this.connectionState.messagesReceived++;

      // Handle heartbeat response
      if (message.type === 'heartbeat') {
        const latency = Date.now() - new Date(message.timestamp).getTime();
        this.updateConnectionState({ latency });
        return;
      }

      // Notify all handlers
      this.messageHandlers.forEach(handler => {
        try {
          handler(message);
        } catch (error) {
          this.log('Message handler error:', error);
        }
      });

      performanceMonitor.endMeasure('websocket-message-process');
      this.log('Message processed:', message.type);

    } catch (error) {
      this.log('Failed to parse message:', error);
    }
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();
    
    this.updateConnectionState({
      isConnected: false,
      isConnecting: false
    });

    this.log('WebSocket closed:', event.code, event.reason);

    // Attempt reconnection if not manually closed
    if (event.code !== 1000 && this.connectionState.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.connectionState.reconnectAttempts),
      30000 // Max 30 seconds
    );

    this.log(`Reconnecting in ${delay}ms (attempt ${this.connectionState.reconnectAttempts + 1})`);

    this.reconnectTimer = setTimeout(() => {
      this.connectionState.reconnectAttempts++;
      this.connect().catch(error => {
        this.log('Reconnection failed:', error);
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        messageId: this.generateMessageId()
      });
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private stopReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        this.log('Message sent:', message.type);
      } catch (error) {
        this.log('Failed to send message:', error);
        this.queueMessage(message);
      }
    } else {
      this.queueMessage(message);
    }
  }

  private queueMessage(message: WebSocketMessage): void {
    this.messageQueue.push(message);
    
    // Limit queue size
    if (this.messageQueue.length > this.config.messageQueueSize) {
      this.messageQueue.shift();
    }
  }

  private processQueuedMessages(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendMessage(message);
      }
    }
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

  private updateConnectionState(updates: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...updates };
    this.connectionHandlers.forEach(handler => {
      try {
        handler(this.connectionState);
      } catch (error) {
        this.log('Connection handler error:', error);
      }
    });
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private log(...args: any[]): void {
    if (this.config.enableLogging) {
      console.log('[WebSocket]', ...args);
    }
  }
}

// Singleton instance
let websocketInstance: EnhancedWebSocketService | null = null;

export function getWebSocketService(config?: WebSocketConfig): EnhancedWebSocketService {
  if (!websocketInstance) {
    websocketInstance = new EnhancedWebSocketService(config);
  }
  return websocketInstance;
}

// React hook for WebSocket integration
export function useWebSocket(raceId?: string) {
  const [connectionState, setConnectionState] = React.useState<ConnectionState>({
    isConnected: false,
    isConnecting: false,
    reconnectAttempts: 0,
    latency: 0,
    messagesReceived: 0,
    messagesPerSecond: 0
  });

  const [messages, setMessages] = React.useState<WebSocketMessage[]>([]);
  const wsService = React.useRef<EnhancedWebSocketService | null>(null);

  React.useEffect(() => {
    // Skip WebSocket connection if raceId is null (disabled)
    if (!raceId) {
      setConnectionState({
        isConnected: false,
        isConnecting: false,
        reconnectAttempts: 0,
        latency: 0,
        messagesReceived: 0,
        messagesPerSecond: 0
      });
      return;
    }

    wsService.current = getWebSocketService();
    
    const unsubscribeConnection = wsService.current.onConnectionChange(setConnectionState);
    const unsubscribeMessages = wsService.current.onMessage((message) => {
      setMessages(prev => [...prev, message].slice(-50)); // Keep last 50 messages
    });

    // Connect to WebSocket
    wsService.current.connect(raceId).catch(error => {
      console.error('Failed to connect to WebSocket:', error);
    });

    // Subscribe to race if provided
    if (raceId) {
      wsService.current.subscribeToRace(raceId);
    }

    return () => {
      unsubscribeConnection();
      unsubscribeMessages();
      
      if (raceId) {
        wsService.current?.unsubscribeFromRace(raceId);
      }
    };
  }, [raceId]);

  const reconnect = React.useCallback(() => {
    wsService.current?.reconnect();
  }, []);

  const sendMessage = React.useCallback((message: Omit<WebSocketMessage, 'messageId' | 'timestamp'>) => {
    const fullMessage: WebSocketMessage = {
      ...message,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
    
    // This would send the message through the WebSocket service
    // For now, we'll add it to local messages for demo
    setMessages(prev => [...prev, fullMessage].slice(-50));
  }, []);

  return {
    connectionState,
    messages,
    reconnect,
    sendMessage,
    isConnected: connectionState.isConnected
  };
}