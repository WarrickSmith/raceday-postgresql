'use client'

import { memo, useState, useEffect, useCallback, useMemo } from 'react'
import { getStatusConfig } from '@/utils/raceStatusConfig'
import type { RaceStatus } from '@/types/racePools'
import type { Race } from '@/types/meetings'

interface RaceTimingSectionProps {
  raceStartTime?: string
  raceStatus?: RaceStatus
  className?: string
  showCountdown?: boolean
  // Real-time race data from unified subscription
  race?: Race | null
}

export const RaceTimingSection = memo(function RaceTimingSection({
  raceStartTime,
  raceStatus,
  className = '',
  showCountdown = true,
  race = null,
}: RaceTimingSectionProps) {
  const [timeRemaining, setTimeRemaining] = useState<{
    total: number
    hours: number
    minutes: number
    seconds: number
  }>({ total: 0, hours: 0, minutes: 0, seconds: 0 })

  const [delayedTime, setDelayedTime] = useState<string | null>(null)

  // Use real-time race data from unified subscription with fallbacks
  const currentStartTime = race?.startTime || raceStartTime
  const currentStatus =
    (race?.status?.toLowerCase() as RaceStatus) || raceStatus || 'open'
  const actualStartTime = race?.actualStart

  const calculateTimeRemaining = useCallback(() => {
    if (!currentStartTime) return

    try {
      const now = new Date()
      const target = new Date(currentStartTime)
      if (isNaN(target.getTime())) return

      const difference = target.getTime() - now.getTime()

      if (difference <= 0) {
        // Calculate delayed time past the scheduled start
        const delayMs = Math.abs(difference)
        const delayMinutes = Math.floor(delayMs / (1000 * 60))
        const delaySeconds = Math.floor((delayMs % (1000 * 60)) / 1000)

        if (currentStatus === 'open' && delayMs > 0) {
          setDelayedTime(
            `DELAYED ${delayMinutes}:${delaySeconds
              .toString()
              .padStart(2, '0')}`
          )
        } else {
          setDelayedTime(null)
        }

        setTimeRemaining({ total: 0, hours: 0, minutes: 0, seconds: 0 })
        return
      }

      const hours = Math.floor(difference / (1000 * 60 * 60))
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((difference % (1000 * 60)) / 1000)

      setTimeRemaining({ total: difference, hours, minutes, seconds })

      // Clear delayed time if race countdown is positive
      setDelayedTime(null)
    } catch {
      setTimeRemaining({ total: 0, hours: 0, minutes: 0, seconds: 0 })
    }
  }, [currentStartTime, currentStatus])

  useEffect(() => {
    calculateTimeRemaining()
    const interval = setInterval(calculateTimeRemaining, 1000)
    return () => clearInterval(interval)
  }, [calculateTimeRemaining])

  const formatTime = useMemo(() => {
    const { hours, minutes, seconds } = timeRemaining

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}`
    }

    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [timeRemaining])

  const urgencyClass = useMemo(() => {
    const { total } = timeRemaining

    if (total <= 60000) return 'text-red-600 font-bold animate-pulse' // 1 minute
    if (total <= 300000) return 'text-orange-600 font-semibold' // 5 minutes
    if (total <= 900000) return 'text-yellow-600' // 15 minutes

    return 'text-gray-700'
  }, [timeRemaining])

  const statusConfig = getStatusConfig(currentStatus || 'open')
  const showTimer =
    showCountdown && currentStatus === 'open' && timeRemaining.total > 0

  return (
    <div
      className={`text-left space-y-2 h-full flex flex-col justify-center ${className}`}
    >
      {/* Race Status - prominent */}
      <div
        className={`inline-flex items-center space-x-2 px-3 py-2 rounded-lg ${statusConfig.bgColor} shadow`}
      >
        <span className="text-lg">{statusConfig.icon}</span>
        <span className={`text-lg font-extrabold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Countdown Timer - large */}
      {showTimer && (
        <div>
          <div
            className={`text-3xl lg:text-4xl font-extrabold ${urgencyClass}`}
          >
            {formatTime}
          </div>
        </div>
      )}

      {/* Delayed Time Display - prominent red */}
      {delayedTime && currentStatus === 'open' && (
        <div>
          <div className="text-xl font-extrabold text-red-600 animate-pulse">
            {delayedTime}
          </div>
        </div>
      )}

      {/* Actual Start Time (Closed Time) - side-by-side layout with matching blue font */}
      {(currentStatus === 'closed' ||
        currentStatus === 'interim' ||
        currentStatus === 'final') && (
        <div>
          <div className="flex items-center justify-start space-x-2">
            <div className="text-lg font-extrabold text-blue-600 uppercase tracking-wide">
              Closed @
            </div>
            <div className="text-lg font-extrabold text-blue-600">
              {new Date(
                actualStartTime || currentStartTime || new Date()
              ).toLocaleTimeString('en-US', {
                hour12: true,
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Start Time - side-by-side layout */}
      {currentStartTime && (
        <div>
          <div className="flex items-center justify-start space-x-2">
            <div className="text-lg font-extrabold text-gray-500 uppercase tracking-wide">
              Scheduled
            </div>
            <time
              dateTime={currentStartTime}
              className="text-lg font-extrabold text-gray-500"
            >
              {new Date(currentStartTime || new Date()).toLocaleTimeString(
                'en-US',
                {
                  hour12: true,
                  hour: 'numeric',
                  minute: '2-digit',
                }
              )}
            </time>
          </div>
        </div>
      )}
    </div>
  )
})
