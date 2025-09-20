'use client';

import { useState, useEffect } from 'react';
import { connectionMonitor } from '@/lib/appwrite-client';
import { showDevelopmentFeatures } from '@/utils/environment';

interface ConnectionMonitorProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function ConnectionMonitor({ isOpen, onToggle, className = '' }: ConnectionMonitorProps) {
  const [metrics, setMetrics] = useState<ReturnType<typeof connectionMonitor.getMetrics>>(null);
  const [refreshInterval, setRefreshInterval] = useState(1000);

  useEffect(() => {
    if (!showDevelopmentFeatures()) return;

    const interval = setInterval(() => {
      setMetrics(connectionMonitor.getMetrics());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Don't render if development features are disabled
  if (!showDevelopmentFeatures()) {
    return null;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      case 'disconnected': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  const getConnectionHealthColor = (totalConnections: number) => {
    if (totalConnections > 10) return 'text-red-600';
    if (totalConnections > 7) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatUptime = (uptime: number) => {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <div className={`bg-gray-50 border-t border-gray-200 ${className}`}>
      {/* Toggle Button */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b border-gray-200">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <span className="text-xs">🔧</span>
          <span>Connection Monitor</span>
          <span className="flex items-center gap-1">
            <span className={`text-xs font-mono ${metrics ? getConnectionHealthColor(metrics.totalConnections) : 'text-gray-500'}`}>
              C[{metrics?.totalConnections || 0}]
            </span>
            <span className="text-xs font-mono text-purple-600">
              Ch[{metrics?.totalChannels || 0}]
            </span>
          </span>
          <span className={`transform transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {metrics && (
          <div className="flex items-center gap-4 text-xs">
            {metrics.emergencyFallback && (
              <span className="px-2 py-1 bg-red-100 text-red-700 rounded font-medium">
                EMERGENCY FALLBACK
              </span>
            )}
            {metrics.isOverLimit && (
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded font-medium">
                OVER LIMIT
              </span>
            )}
            <span className="text-gray-600">
              Avg: {metrics.avgLatency.toFixed(1)}ms
            </span>
          </div>
        )}
      </div>

      {/* Expandable Content */}
      {isOpen && (
        <div className="p-4 space-y-4">
          {metrics ? (
            <>
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-3 bg-white rounded border">
                  <div className={`text-2xl font-bold ${getConnectionHealthColor(metrics.totalConnections)}`}>
                    {metrics.totalConnections}
                  </div>
                  <div className="text-xs text-gray-600">Connections</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-purple-600">
                    {metrics.totalChannels || 0}
                  </div>
                  <div className="text-xs text-gray-600">Channels</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-green-600">
                    {metrics.activeConnections}
                  </div>
                  <div className="text-xs text-gray-600">Active</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-blue-600">
                    {metrics.totalMessages}
                  </div>
                  <div className="text-xs text-gray-600">Messages</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-red-600">
                    {metrics.totalErrors}
                  </div>
                  <div className="text-xs text-gray-600">Errors</div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4 p-3 bg-white rounded border">
                <label className="text-sm font-medium text-gray-700">
                  Refresh Rate:
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="ml-2 text-xs border rounded px-2 py-1"
                  >
                    <option value={500}>500ms</option>
                    <option value={1000}>1s</option>
                    <option value={2000}>2s</option>
                    <option value={5000}>5s</option>
                  </select>
                </label>

                {metrics.emergencyFallback && (
                  <button
                    onClick={() => connectionMonitor.resetEmergencyFallback()}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200"
                  >
                    Reset Emergency Fallback
                  </button>
                )}
              </div>

              {/* Unique Channels List */}
              {metrics.uniqueChannels && metrics.uniqueChannels.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
                    Monitored Channels ({metrics.totalChannels})
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    <div className="px-3 py-2 text-xs">
                      {metrics.uniqueChannels.map((channel) => (
                        <span key={channel} className="inline-block mr-2 mb-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-mono">
                          {channel}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Active Connections List */}
              {metrics.connections.length > 0 && (
                <div className="bg-white rounded border">
                  <div className="px-3 py-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
                    Active Connections ({metrics.connections.length})
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {metrics.connections.map((conn) => (
                      <div key={conn.id} className="px-3 py-2 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              conn.status === 'connected' ? 'bg-green-500' :
                              conn.status === 'connecting' ? 'bg-yellow-500' :
                              conn.status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                            }`}></span>
                            <span className="text-xs font-mono text-gray-600">{conn.id}</span>
                            <span className={`text-xs font-medium ${getStatusColor(conn.status)}`}>
                              {conn.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-600">
                            <span>⏱ {formatUptime(conn.uptime)}</span>
                            <span>📨 {conn.messageCount}</span>
                            <span>⚠️ {conn.errorCount}</span>
                            <span>📶 {conn.avgLatency.toFixed(1)}ms</span>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Channels ({conn.channels.length}): {conn.channels.length > 0 ? conn.channels.join(', ') : 'None'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-sm">Connection monitoring disabled</div>
              <div className="text-xs mt-1">Only available in development mode</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}