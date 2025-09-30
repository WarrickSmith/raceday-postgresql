'use client'

import { memo, useState, useEffect } from 'react'
import type { PollingMetrics, PollingEndpointKey } from '@/types/pollingMetrics'

interface PollingMonitorProps {
  metrics: PollingMetrics
  className?: string
}

/**
 * Polling Monitor Component
 *
 * Development-only UI panel providing observability into the polling system.
 * Displays request counts, error rates, latency metrics, cadence compliance,
 * and per-endpoint performance statistics.
 *
 * Renders collapsed by default with only the title visible.
 * Click to expand and view full metrics.
 *
 * Only visible when NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true
 */
export const PollingMonitor = memo(function PollingMonitor({
  metrics,
  className = '',
}: PollingMonitorProps) {
  // Collapsed state (default: collapsed)
  const [isExpanded, setIsExpanded] = useState(false)

  // Real-time countdown state
  const [currentTime, setCurrentTime] = useState(Date.now())

  // Update countdown every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Format percentage with 1 decimal place
  const formatPercent = (value: number): string => `${value.toFixed(1)}%`

  // Format latency in milliseconds
  const formatLatency = (ms: number): string => `${Math.round(ms)}ms`

  // Format interval in seconds or minutes
  const formatInterval = (ms: number | null): string => {
    if (ms === null) return '—'
    if (ms < 1000) return `${Math.round(ms)}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  // Format duration in MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Format timestamp for display
  const formatTimestamp = (date: Date | null): string => {
    if (!date) return '—'
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Calculate next poll countdown (uses currentTime for real-time updates)
  const getNextPollCountdown = (): string => {
    if (!metrics.cadence.nextPollTimestamp) return '—'
    const remaining = Math.max(0, metrics.cadence.nextPollTimestamp - currentTime)
    if (remaining < 1000) return '<1s'
    if (remaining < 60000) return `${Math.round(remaining / 1000)}s`
    return `${Math.round(remaining / 60000)}m`
  }

  // Determine trend indicator (for now, always neutral)
  const trendIndicator = '▲'

  return (
    <div
      className={`bg-slate-50 border border-slate-300 rounded-lg shadow-sm ${className}`}
      role="region"
      aria-label="Polling Monitor"
    >
      {/* Header Section - Always Visible */}
      <div className="bg-slate-100 px-4 py-2 border-b border-slate-300 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity cursor-pointer text-left"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse polling monitor' : 'Expand polling monitor'}
        >
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            🛠️ Polling Monitor
          </h3>
          {!isExpanded && (
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-700 font-semibold">
                {formatPercent(metrics.successRate)} SUCCESS
              </span>
              <span className="text-red-700 font-semibold">
                {formatPercent(metrics.errorRate)} ERROR
              </span>
              <span className="text-slate-600 font-semibold">
                {formatLatency(metrics.avgLatency)} AVG
              </span>
              <span
                className="text-slate-500 font-semibold"
                aria-label="Trend indicator"
              >
                {trendIndicator}
              </span>
            </div>
          )}
        </button>

        {isExpanded && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
              onClick={() => window.location.reload()}
              aria-label="Refresh polling monitor"
            >
              Refresh
            </button>
            <span className="text-xs text-slate-500">1s</span>
            <button
              type="button"
              className="px-2 py-1 text-xs font-semibold text-blue-600 bg-white border border-blue-300 rounded hover:bg-blue-50 transition-colors"
              aria-label="Debug mode toggle"
            >
              Debug
            </button>
          </div>
        )}
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="polling-monitor-content">

      {/* Status Row */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-6 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Requests:</span>
          <span className="font-semibold text-slate-900">{metrics.requests}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Cadence:</span>
          <span
            className={`font-semibold ${
              metrics.cadence.status === 'on-track'
                ? 'text-green-700'
                : metrics.cadence.status === 'behind'
                  ? 'text-orange-700'
                  : 'text-blue-700'
            }`}
          >
            {metrics.cadence.status === 'on-track'
              ? 'On Track'
              : metrics.cadence.status === 'behind'
                ? 'Behind'
                : 'Ahead'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Alerts:</span>
          <span
            className={`font-semibold ${
              metrics.alerts.length > 0 ? 'text-red-700' : 'text-green-700'
            }`}
          >
            {metrics.alerts.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Target:</span>
          <span className="font-semibold text-slate-900">
            {formatInterval(metrics.cadence.targetIntervalMs)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Actual:</span>
          <span className="font-semibold text-slate-900">
            {formatInterval(metrics.cadence.actualIntervalMs)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Duration:</span>
          <span className="font-semibold text-slate-900">
            {formatDuration(metrics.cadence.durationSeconds)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Uptime:</span>
          <span className="font-semibold text-slate-900">
            {formatPercent(metrics.uptime)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500 font-bold uppercase">Next:</span>
          <span className="font-semibold text-slate-900">
            {getNextPollCountdown()}
          </span>
        </div>
      </div>

      {/* Active Alerts Section */}
      {metrics.alerts.length > 0 && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <div className="text-xs font-bold text-red-700 uppercase mb-1">
            Active Alerts
          </div>
          <div className="space-y-1">
            {metrics.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-2 text-xs ${
                  alert.severity === 'error'
                    ? 'text-red-800'
                    : alert.severity === 'warning'
                      ? 'text-orange-800'
                      : 'text-blue-800'
                }`}
              >
                <span className="font-bold">
                  {alert.severity === 'error' ? 'ERROR:' : 'WARNING:'}
                </span>
                <span>{alert.message}</span>
                {alert.metadata && (
                  <span className="text-slate-600">
                    ({JSON.stringify(alert.metadata).slice(1, -1)})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Endpoint Performance Table */}
      <div className="px-4 py-3 bg-white">
        <div className="text-xs font-bold text-slate-700 uppercase mb-2">
          Endpoint Performance
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="px-2 py-1 text-left font-bold text-slate-700 uppercase">
                  Endpoint
                </th>
                <th className="px-2 py-1 text-right font-bold text-slate-700 uppercase">
                  Req
                </th>
                <th className="px-2 py-1 text-right font-bold text-slate-700 uppercase">
                  Err%
                </th>
                <th className="px-2 py-1 text-right font-bold text-slate-700 uppercase">
                  Latency
                </th>
                <th className="px-2 py-1 text-left font-bold text-slate-700 uppercase">
                  Last Success
                </th>
                <th className="px-2 py-1 text-center font-bold text-slate-700 uppercase">
                  Status
                </th>
                <th className="px-2 py-1 text-right font-bold text-slate-700 uppercase">
                  Fallbacks
                </th>
                <th className="px-2 py-1 text-right font-bold text-slate-700 uppercase">
                  Recoveries
                </th>
                <th className="px-2 py-1 text-left font-bold text-slate-700 uppercase">
                  Last Error
                </th>
              </tr>
            </thead>
            <tbody>
              {(Object.entries(metrics.endpoints) as [PollingEndpointKey, typeof metrics.endpoints[PollingEndpointKey]][]).map(
                ([endpoint, data]) => (
                  <tr
                    key={endpoint}
                    className="border-b border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-2 py-1 font-semibold text-slate-900">
                      {endpoint}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-700">
                      {data.requests}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-semibold ${
                        data.requests > 0 && (data.errors / data.requests) * 100 > 25
                          ? 'text-red-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {data.requests > 0
                        ? formatPercent((data.errors / data.requests) * 100)
                        : '0.0%'}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-700">
                      {data.latency > 0 ? formatLatency(data.latency) : '—'}
                    </td>
                    <td className="px-2 py-1 text-slate-600 font-mono">
                      {formatTimestamp(data.lastSuccess)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                          data.status === 'OK'
                            ? 'bg-green-100 text-green-800'
                            : data.status === 'WARNING'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {data.status}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right text-slate-700">
                      {data.fallbacks > 0 ? data.fallbacks : '—'}
                    </td>
                    <td className="px-2 py-1 text-right text-slate-700">
                      {data.recoveries > 0 ? data.recoveries : '—'}
                    </td>
                    <td className="px-2 py-1 text-slate-600 text-xs truncate max-w-xs">
                      {data.lastError || '—'}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Activity Log */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
        <div className="text-xs font-bold text-slate-700 uppercase mb-2">
          Recent Activity ({metrics.recentActivity.length} events)
        </div>
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {metrics.recentActivity.slice(0, 5).map((event, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 text-xs font-mono text-slate-600"
            >
              <span className="text-slate-400">
                {formatTimestamp(event.timestamp)}
              </span>
              <span
                className={`font-bold ${
                  event.type === 'error'
                    ? 'text-red-700'
                    : event.type === 'success'
                      ? 'text-green-700'
                      : event.type === 'warning'
                        ? 'text-orange-700'
                        : 'text-blue-700'
                }`}
              >
                {event.type.toUpperCase()}
              </span>
              <span className="flex-1">{event.message}</span>
            </div>
          ))}
          {metrics.recentActivity.length === 0 && (
            <div className="text-xs text-slate-400 italic">No activity yet</div>
          )}
        </div>
      </div>
        </div>
      )}
    </div>
  )
})