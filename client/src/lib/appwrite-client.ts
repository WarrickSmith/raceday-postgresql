'use client';

import { Client, Databases, Query } from 'appwrite';
import { logWarn } from '@/utils/logging';
import { isConnectionMonitorEnabled } from '@/utils/environment';

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;

if (!endpoint || !projectId) {
  logWarn('Missing Appwrite environment variables, using placeholder values', { endpoint: !!endpoint, projectId: !!projectId }, 'AppwriteClient');
}

// Connection monitoring state
interface ConnectionMetrics {
  id: string;
  channels: string[];
  startTime: number;
  lastActivity: number;
  messageCount: number;
  errorCount: number;
  avgLatency: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

class ConnectionMonitor {
  private connections = new Map<string, ConnectionMetrics>();
  private isEnabled = isConnectionMonitorEnabled();
  private maxConnections = 10;
  private emergencyFallback = false;

  public trackConnection(id: string, channels: string[]): void {
    if (!this.isEnabled) return;

    this.connections.set(id, {
      id,
      channels,
      startTime: Date.now(),
      lastActivity: Date.now(),
      messageCount: 0,
      errorCount: 0,
      avgLatency: 0,
      status: 'connecting'
    });

    // Check for connection limit
    if (this.connections.size > this.maxConnections) {
      console.warn(`Connection limit exceeded: ${this.connections.size}/${this.maxConnections}`);
      this.emergencyFallback = true;
    }
  }

  public updateConnection(id: string, updates: Partial<ConnectionMetrics>): void {
    if (!this.isEnabled) return;

    const connection = this.connections.get(id);
    if (connection) {
      Object.assign(connection, updates, { lastActivity: Date.now() });
    }
  }

  public removeConnection(id: string): void {
    if (!this.isEnabled) return;

    this.connections.delete(id);

    // Reset emergency fallback if we're back under limit
    if (this.connections.size <= this.maxConnections) {
      this.emergencyFallback = false;
    }
  }

  public getMetrics() {
    if (!this.isEnabled) return null;

    const connections = Array.from(this.connections.values());
    const totalConnections = connections.length;
    const activeConnections = connections.filter(c => c.status === 'connected').length;

    // Calculate total unique channels across all connections
    const allChannels = new Set<string>();
    connections.forEach(conn => {
      conn.channels.forEach(channel => allChannels.add(channel));
    });
    const totalChannels = allChannels.size;
    const uniqueChannels = Array.from(allChannels);

    const avgLatency = connections.length > 0
      ? connections.reduce((sum, c) => sum + c.avgLatency, 0) / connections.length
      : 0;
    const totalMessages = connections.reduce((sum, c) => sum + c.messageCount, 0);
    const totalErrors = connections.reduce((sum, c) => sum + c.errorCount, 0);

    return {
      totalConnections,
      activeConnections,
      totalChannels,
      uniqueChannels,
      avgLatency,
      totalMessages,
      totalErrors,
      emergencyFallback: this.emergencyFallback,
      isOverLimit: totalConnections > this.maxConnections,
      connections: connections.map(c => ({
        id: c.id,
        channels: c.channels,
        status: c.status,
        uptime: Date.now() - c.startTime,
        messageCount: c.messageCount,
        errorCount: c.errorCount,
        avgLatency: c.avgLatency
      }))
    };
  }

  public shouldDisableRealtime(): boolean {
    return this.emergencyFallback;
  }

  public resetEmergencyFallback(): void {
    this.emergencyFallback = false;
  }
}

// Global connection monitor instance
export const connectionMonitor = new ConnectionMonitor();

// Enhanced client with connection tracking
class TrackedClient extends Client {
  private originalSubscribe: typeof Client.prototype.subscribe;

  constructor() {
    super();
    this.originalSubscribe = this.subscribe.bind(this);
    this.subscribe = this.trackedSubscribe.bind(this) as typeof Client.prototype.subscribe;
  }

  private trackedSubscribe(channels: string | string[], callback?: (payload: unknown) => void) {
    const channelArray = Array.isArray(channels) ? channels : [channels];
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Track the connection
    connectionMonitor.trackConnection(connectionId, channelArray);

    // Wrap the callback to track activity
    const wrappedCallback = callback ? (payload: unknown) => {
      const startTime = Date.now();
      connectionMonitor.updateConnection(connectionId, {
        status: 'connected',
        messageCount: (connectionMonitor.getMetrics()?.connections.find(c => c.id === connectionId)?.messageCount || 0) + 1
      });

      try {
        callback(payload);
        const latency = Date.now() - startTime;
        connectionMonitor.updateConnection(connectionId, { avgLatency: latency });
      } catch (error) {
        connectionMonitor.updateConnection(connectionId, {
          status: 'error',
          errorCount: (connectionMonitor.getMetrics()?.connections.find(c => c.id === connectionId)?.errorCount || 0) + 1
        });
        throw error;
      }
    } : undefined;

    // Call original subscribe
    const unsubscribe = this.originalSubscribe.call(this, channels, wrappedCallback || (() => {}));

    // Wrap unsubscribe to track disconnection
    return () => {
      connectionMonitor.removeConnection(connectionId);
      return unsubscribe();
    };
  }
}

const client = new TrackedClient()
  .setEndpoint(endpoint || 'https://placeholder.appwrite.io/v1')
  .setProject(projectId || 'placeholder-project');

export const databases = new Databases(client);
export { client, Query };