'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { Race } from '@/types/meetings'
import { fetchUpcomingRaces } from '@/services/upcomingRacesService'

const DEFAULT_AUDIO_SRC = '/audio/race_start.mp3'

export interface UseAudibleRaceAlertsOptions {
  enabled: boolean
  filterRace?: (race: Race) => boolean
  audioSrc?: string
  refreshIntervalMs?: number
}

const DEFAULT_REFRESH_INTERVAL_MS = 30_000

const isRaceFinalized = (race: Race) => {
  const status = race.status?.toLowerCase?.() ?? ''
  return status.includes('final') || status === 'abandoned'
}

const hasRaceStarted = (race: Race) => {
  const startTime = new Date(race.startTime).getTime()
  if (Number.isNaN(startTime)) {
    return true
  }
  return Date.now() >= startTime
}

export const useAudibleRaceAlerts = ({
  enabled,
  filterRace,
  audioSrc = DEFAULT_AUDIO_SRC,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: UseAudibleRaceAlertsOptions) => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const triggeredRacesRef = useRef<Set<string>>(new Set())
  const enabledRef = useRef(enabled)
  const filterRef = useRef<(race: Race) => boolean>(filterRace ?? (() => true))
  const primeTokenRef = useRef<{ cancelled: boolean } | null>(null)

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  useEffect(() => {
    filterRef.current = filterRace ?? (() => true)
  }, [filterRace])

  // Initialize audio element and preload asset
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    if (!audioRef.current) {
      const audio = new Audio(audioSrc)
      audio.preload = 'auto'
      audioRef.current = audio
    } else if (audioRef.current.src !== new URL(audioSrc, window.location.href).toString()) {
      audioRef.current.pause()
      audioRef.current.src = audioSrc
      audioRef.current.load()
    }
  }, [audioSrc])

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current.clear()
  }, [])

  const playAudio = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (primeTokenRef.current) {
        primeTokenRef.current.cancelled = true
        primeTokenRef.current = null
      }

      audio.pause()
      audio.currentTime = 0
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((error) => {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('Failed to play race alert audio', error)
          }
        })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Error triggering race alert audio', error)
      }
    }
  }, [])

  const primeAudio = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return

    try {
      await audio.play()
      audio.pause()
      audio.currentTime = 0
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to prime race alert audio', error)
      }
    }
  }, [])

  const primeAudioDuringGesture = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    try {
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.then === 'function') {
        const token = { cancelled: false }
        primeTokenRef.current = token
        playPromise
          .then(() => {
            if (token.cancelled) {
              return
            }
            audio.pause()
            audio.currentTime = 0
            if (primeTokenRef.current === token) {
              primeTokenRef.current = null
            }
          })
          .catch((error) => {
            if (process.env.NODE_ENV !== 'production') {
              console.warn('Failed to prime race alert audio during gesture', error)
            }
          })
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Failed to initiate race alert audio during gesture', error)
      }
    }
  }, [])

  const triggerAlert = useCallback((race: Race) => {
    if (!enabledRef.current) {
      return
    }

    if (triggeredRacesRef.current.has(race.raceId)) {
      return
    }

    if (!filterRef.current(race)) {
      return
    }

    if (isRaceFinalized(race) || hasRaceStarted(race)) {
      return
    }

    triggeredRacesRef.current.add(race.raceId)
    playAudio()
  }, [playAudio])

  const scheduleRace = useCallback((race: Race) => {
    const startTime = new Date(race.startTime).getTime()
    if (Number.isNaN(startTime)) {
      return
    }

    const triggerTime = startTime - 60_000 // 1 minute before start
    const now = Date.now()

    if (triggerTime <= now) {
      triggerAlert(race)
      return
    }

    const delay = triggerTime - now

    const existingTimer = timersRef.current.get(race.raceId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      timersRef.current.delete(race.raceId)
      triggerAlert(race)
    }, delay)

    timersRef.current.set(race.raceId, timer)
  }, [triggerAlert])

  useEffect(() => {
    if (!enabled) {
      clearAllTimers()
      return
    }

    let cancelled = false

    const refreshSchedules = async () => {
      const races = await fetchUpcomingRaces({ filter: filterRef.current })
      if (cancelled) {
        return
      }

      const upcomingIds = new Set(races.map((race) => race.raceId))

      // Clear timers for races no longer upcoming
      timersRef.current.forEach((timer, raceId) => {
        if (!upcomingIds.has(raceId)) {
          clearTimeout(timer)
          timersRef.current.delete(raceId)
          triggeredRacesRef.current.delete(raceId)
        }
      })

      races.forEach((race) => {
        triggeredRacesRef.current.delete(race.raceId)
        scheduleRace(race)
      })
    }

    refreshSchedules()
    const interval = setInterval(refreshSchedules, refreshIntervalMs)

    return () => {
      cancelled = true
      clearInterval(interval)
      clearAllTimers()
    }
  }, [enabled, refreshIntervalMs, clearAllTimers, scheduleRace])
  return { primeAudio, primeAudioDuringGesture }
}
