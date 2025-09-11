/**
 * Unified Race Real-time Hook
 *
 * Replaces 4 existing hooks (useAppwriteRealtime, useRealtimeRace, useRacePageRealtime, useEnhancedRealtime)
 * with a single, optimized implementation following Appwrite best practices.
 *
 * Key Features:
 * - Single WebSocket connection with multiple channels
 * - Document-specific subscriptions where possible
 * - Event-based filtering using Appwrite's events array
 * - Two-phase race-results subscription strategy
 * - Proper data merging between persistent and real-time sources
 * - Performance optimized with minimal logging
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { client, databases } from '@/lib/appwrite-client'
import { Race, Entrant, Meeting, RaceNavigationData } from '@/types/meetings'
import type { RacePoolData, RaceResultsData } from '@/types/racePools'
import { Query } from 'appwrite'

// Debug logging control - minimal for production
const DEBUG = process.env.NODE_ENV === 'development'

const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[UnifiedRaceRealtime] ${message}`, data)
  }
}

// Enhanced debug for race status changes
const debugRaceStatus = (
  message: string,
  raceId: string,
  oldStatus?: string,
  newStatus?: string,
  extra?: any
) => {
  if (DEBUG && oldStatus !== newStatus) {
    console.log(`🏆 [RaceStatus] ${message}`, {
      raceId,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  }
}

const errorLog = (message: string, error: any) => {
  console.error(`[UnifiedRaceRealtime] ${message}`, error)
}

const performanceLog = (operation: string, startTime: number) => {
  const duration = Date.now() - startTime
  if (duration > 1000) {
    console.warn(`[UnifiedRaceRealtime] ${operation} took ${duration}ms`)
  }
}

// Appwrite subscription message interface
interface AppwriteRealtimeMessage {
  events: string[]
  channels: string[]
  timestamp: string
  payload: any
}

// Hook props interface
interface UseUnifiedRaceRealtimeProps {
  raceId: string
  initialRace?: Race | null
  initialEntrants?: Entrant[]
  initialMeeting?: Meeting | null
  initialNavigationData?: RaceNavigationData | null
}

// Unified state interface
interface UnifiedRaceRealtimeState {
  // Core race data
  race: Race | null
  raceDocumentId: string | null
  raceResultsDocumentId: string | null
  entrants: Entrant[]
  meeting: Meeting | null
  navigationData: RaceNavigationData | null

  // Real-time data
  poolData: RacePoolData | null
  resultsData: RaceResultsData | null

  // Connection and freshness
  connectionState: ConnectionState
  isConnected: boolean
  connectionAttempts: number
  lastUpdate: Date | null
  updateLatency: number
  totalUpdates: number
  isInitialFetchComplete: boolean

  // Data freshness indicators
  lastRaceUpdate: Date | null
  lastPoolUpdate: Date | null
  lastResultsUpdate: Date | null
  lastEntrantsUpdate: Date | null
  moneyFlowUpdateTrigger: number
}

// Connection state machine
type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting'

// Hook actions interface
interface UnifiedRaceRealtimeActions {
  reconnect: () => void
  clearHistory: () => void
  getConnectionHealth: () => {
    isHealthy: boolean
    avgLatency: number | null
    uptime: number
  }
}

export function useUnifiedRaceRealtime({
  raceId,
  initialRace = null,
  initialEntrants = [],
  initialMeeting = null,
  initialNavigationData = null,
}: UseUnifiedRaceRealtimeProps): UnifiedRaceRealtimeState &
  UnifiedRaceRealtimeActions {
  const [state, setState] = useState<UnifiedRaceRealtimeState>({
    race: initialRace,
    raceDocumentId: initialRace?.$id || null,
    raceResultsDocumentId: null,
    entrants: initialEntrants,
    meeting: initialMeeting,
    navigationData: initialNavigationData,
    poolData: null,
    resultsData: null,
    connectionState: 'disconnected',
    isConnected: false,
    connectionAttempts: 0,
    lastUpdate: null,
    updateLatency: 0,
    totalUpdates: 0,
    isInitialFetchComplete: !!initialRace && initialEntrants.length > 0,
    lastRaceUpdate: null,
    lastPoolUpdate: null,
    lastResultsUpdate: null,
    lastEntrantsUpdate: null,
    moneyFlowUpdateTrigger: 0,
  })

  // Performance and connection tracking
  const updateStartTime = useRef<number>(0)
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null)
  const unsubscribeFunction = useRef<(() => void) | null>(null)
  const connectionStartTime = useRef<number>(Date.now())
  const latencySamples = useRef<number[]>([])
  const initialDataFetched = useRef<boolean>(false)

  // Throttling for performance optimization
  const pendingUpdates = useRef<AppwriteRealtimeMessage[]>([])
  const updateThrottleTimer = useRef<NodeJS.Timeout | null>(null)
  const THROTTLE_DELAY = 100 // 100ms for critical periods

  // Smart channel management with race status awareness
  const getChannels = useCallback(
    (raceDocId: string | null, raceResultsDocId?: string, raceStatus?: string) => {
      if (!raceDocId) return []

      const channels = [
        `databases.raceday-db.collections.races.documents.${raceDocId}`,
        'databases.raceday-db.collections.race-pools.documents',
        'databases.raceday-db.collections.money-flow-history.documents',
      ]

      // Add race-results subscription ONLY for races with interim/final status (per hybrid architecture)
      const shouldSubscribeToResults = raceStatus && ['interim', 'final'].includes(raceStatus.toLowerCase())
      if (shouldSubscribeToResults) {
        if (raceResultsDocId) {
          channels.push(
            `databases.raceday-db.collections.race-results.documents.${raceResultsDocId}`
          )
        } else {
          channels.push('databases.raceday-db.collections.race-results.documents')
        }
      }

      // Add entrant-specific subscriptions if available
      if (state.entrants && state.entrants.length > 0) {
        state.entrants.forEach((entrant) => {
          if (entrant.$id) {
            channels.push(
              `databases.raceday-db.collections.entrants.documents.${entrant.$id}`
            )
          }
        })
      } else {
        channels.push('databases.raceday-db.collections.entrants.documents')
      }

      return channels
    },
    [state.entrants]
  )

  // Fetch initial data if not provided
  const fetchInitialData = useCallback(async () => {
    if (!raceId || initialDataFetched.current) return

    debugLog('Fetching complete initial data for race', { raceId })

    try {
      // Use the comprehensive API endpoint that fetches all race data
      const response = await fetch(`/api/race/${raceId}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch race data: ${response.statusText}`)
      }

      const raceData = await response.json()
      debugLog('Complete race data fetched from API', {
        hasRace: !!raceData.race,
        hasEntrants: !!raceData.entrants?.length,
        hasMeeting: !!raceData.meeting,
        raceDocumentId: raceData.race?.$id,
        raceId: raceData.race?.raceId,
      })

      // Set complete initial state from API data
      setState((prev) => ({
        ...prev,
        race: raceData.race || null,
        raceDocumentId: raceData.race?.$id || null,
        entrants: raceData.entrants || [],
        meeting: raceData.meeting || null,
        navigationData: raceData.navigationData || null,
        isInitialFetchComplete: true,
        lastUpdate: new Date(),
        lastRaceUpdate: new Date(),
        lastEntrantsUpdate: new Date(),
      }))

      // Fetch pool data separately since API might not include it
      try {
        const poolDataResponse = await databases.listDocuments(
          'raceday-db',
          'race-pools',
          [Query.equal('raceId', raceId), Query.limit(1)]
        )

        if (poolDataResponse.documents.length > 0) {
          const poolDoc = poolDataResponse.documents[0]
          setState((prev) => ({
            ...prev,
            poolData: {
              $id: poolDoc.$id,
              $createdAt: poolDoc.$createdAt,
              $updatedAt: poolDoc.$updatedAt,
              raceId: poolDoc.raceId,
              winPoolTotal: poolDoc.winPoolTotal || 0,
              placePoolTotal: poolDoc.placePoolTotal || 0,
              quinellaPoolTotal: poolDoc.quinellaPoolTotal || 0,
              trifectaPoolTotal: poolDoc.trifectaPoolTotal || 0,
              exactaPoolTotal: poolDoc.exactaPoolTotal || 0,
              first4PoolTotal: poolDoc.first4PoolTotal || 0,
              totalRacePool: poolDoc.totalRacePool || 0,
              currency: poolDoc.currency || '$',
              lastUpdated: poolDoc.$updatedAt,
              isLive: poolDoc.isLive || false,
            },
          }))
          debugLog('Initial pool data loaded', {
            totalPool: poolDoc.totalRacePool,
          })
        }
      } catch (poolError) {
        errorLog('Failed to fetch pool data', poolError)
      }

      // Fetch race-results document ID for specific subscriptions
      if (raceData.race?.$id) {
        try {
          // First check if we already have a race-results document ID in state
          // This prevents unnecessary re-fetching when we already know the document doesn't exist
          if (!state.raceResultsDocumentId) {
            const raceResultsResponse = await databases.listDocuments(
              'raceday-db',
              'race-results',
              [Query.equal('race', raceData.race.$id), Query.limit(1)]
            )

            if (raceResultsResponse.documents.length > 0) {
              const raceResultsDoc = raceResultsResponse.documents[0]
              const raceResultsDocId = raceResultsDoc.$id

              debugLog('Found existing race-results document', {
                raceResultsDocId,
                resultStatus: raceResultsDoc.resultStatus,
                resultsAvailable: raceResultsDoc.resultsAvailable,
              })

              // Parse fixedOddsData from race-results document
              let parsedFixedOddsData = {}
              if (raceResultsDoc.fixedOddsData) {
                try {
                  parsedFixedOddsData =
                    typeof raceResultsDoc.fixedOddsData === 'string'
                      ? JSON.parse(raceResultsDoc.fixedOddsData)
                      : raceResultsDoc.fixedOddsData || {}
                } catch (error) {
                  errorLog('Failed to parse initial fixedOddsData', error)
                  parsedFixedOddsData = {}
                }
              }

              const initialResultsData = raceResultsDoc.resultsAvailable
                ? {
                    raceId,
                    results:
                      typeof raceResultsDoc.resultsData === 'string'
                        ? JSON.parse(raceResultsDoc.resultsData)
                        : raceResultsDoc.resultsData || [],
                    dividends:
                      typeof raceResultsDoc.dividendsData === 'string'
                        ? JSON.parse(raceResultsDoc.dividendsData)
                        : raceResultsDoc.dividendsData || [],
                    fixedOddsData: parsedFixedOddsData,
                    status: (raceResultsDoc.resultStatus?.toLowerCase() ||
                      'interim') as 'interim' | 'final',
                    photoFinish: raceResultsDoc.photoFinish || false,
                    stewardsInquiry: raceResultsDoc.stewardsInquiry || false,
                    protestLodged: raceResultsDoc.protestLodged || false,
                    resultTime:
                      raceResultsDoc.resultTime || new Date().toISOString(),
                  }
                : null

              setState((prev) => ({
                ...prev,
                raceResultsDocumentId: raceResultsDocId,
                resultsData: initialResultsData,
              }))
            } else {
              debugLog(
                'No race-results document found yet - will use collection-level subscription and monitor for creation'
              )
            }
          }
        } catch (resultsError) {
          errorLog('Failed to fetch race-results document ID', resultsError)
        }
      }

      initialDataFetched.current = true
      debugLog('Initial data fetch completed successfully')
    } catch (error) {
      errorLog('Failed to fetch initial data', error)
    }
  }, [raceId])

  // Reset fetch flag when race ID changes
  useEffect(() => {
    initialDataFetched.current = false
    debugLog('Race ID changed, reset fetch flag', { raceId })
  }, [raceId])

  // Fetch initial data when race ID changes
  useEffect(() => {
    if (raceId && (!state.race || !state.entrants.length)) {
      debugLog('Triggering initial data fetch', {
        raceId,
        hasRace: !!state.race,
        entrantCount: state.entrants.length,
        fetched: initialDataFetched.current,
      })
      fetchInitialData()
    }
  }, [raceId, state.race, state.entrants, fetchInitialData])

  // Periodic check for race-results document creation for active races
  useEffect(() => {
    if (!raceId || !state.raceDocumentId || state.raceResultsDocumentId) {
      return // Skip if we don't have race info or already have results document
    }

    // Only check for races that might be finishing (closed or interim status)
    const raceStatus = state.race?.status?.toLowerCase()
    if (!['closed', 'interim', 'final'].includes(raceStatus || '')) {
      return
    }

    const checkInterval = setInterval(async () => {
      try {
        const raceResultsResponse = await databases.listDocuments(
          'raceday-db',
          'race-results',
          [Query.equal('race', state.raceDocumentId!), Query.limit(1)]
        )

        if (raceResultsResponse.documents.length > 0) {
          const raceResultsDoc = raceResultsResponse.documents[0]
          debugLog('🎯 Race-results document created via periodic check', {
            raceResultsDocumentId: raceResultsDoc.$id,
            resultStatus: raceResultsDoc.resultStatus,
          })

          // Update state with the new document ID
          setState((prev) => ({
            ...prev,
            raceResultsDocumentId: raceResultsDoc.$id,
          }))

          // Clear the interval since we found the document
          clearInterval(checkInterval)
        }
      } catch (error) {
        errorLog('Failed to check for race-results document', error)
      }
    }, 5000) // Check every 5 seconds

    return () => clearInterval(checkInterval)
  }, [
    raceId,
    state.raceDocumentId,
    state.raceResultsDocumentId,
    state.race?.status,
  ])

  // Apply batched updates to state
  const applyPendingUpdates = useCallback(() => {
    if (pendingUpdates.current.length === 0) return

    // Start timing when we actually process updates
    updateStartTime.current = performance.now()

    const updates = [...pendingUpdates.current]
    pendingUpdates.current = []

    debugLog(`Processing ${updates.length} batched updates`)

    setState((prevState) => {
      const newState = { ...prevState }
      const now = new Date()
      let hasUpdates = false

      // Process all pending updates in batch
      for (const message of updates) {
        const { events, channels, payload } = message

        // Event-based filtering using Appwrite's events array
        // For race events, check both the document ID and race ID in payload
        const isRaceEvent =
          events.some((event) => {
            // Check if this is a race document event
            if (event.includes('races.')) {
              // Extract document ID from event
              const eventId = event.split('races.')[1]
              return eventId === state.raceDocumentId
            }
            return false
          }) ||
          (events.some((event) => event.includes('races.')) &&
            payload.raceId === raceId)

        const isRaceResultsEvent =
          events.some((event) => {
            if (typeof event === 'string' && event.includes('race-results')) {
              return true
            }
            return false
          }) &&
          // Document-specific subscription
          (payload.$id === state.raceResultsDocumentId ||
            // Collection-level: check if this event is for our race
            payload.race === state.raceDocumentId ||
            payload.race === raceId ||
            // Handle document creation events
            (payload.race === state.raceDocumentId && payload.resultsAvailable))

        const isPoolEvent = events.some(
          (event) => event.includes('race-pools') && payload.raceId === raceId
        )

        const isEntrantEvent = events.some(
          (event) =>
            event.includes('entrants') &&
            (payload.race === state.raceDocumentId ||
              payload.raceId === raceId ||
              (payload.entrant &&
                state.entrants.some((e) => e.$id === payload.entrant)))
        )

        const isMoneyFlowEvent = events.some(
          (event) => event.includes('money-flow-history') && payload.entrant
        )

        if (isRaceEvent && payload) {
          debugLog('Race data update received', {
            raceId: payload.raceId || payload.race,
            status: payload.status,
            payloadKeys: Object.keys(payload),
          })

          // Ensure we're updating with the correct race ID
          const payloadRaceId = payload.raceId || payload.race || raceId
          const previousStatus = newState.race?.status
          const newStatus =
            payload.status !== undefined
              ? payload.status
              : previousStatus || 'open'

          const updatedRace: Race = {
            ...newState.race,
            ...payload,
            $id: payload.$id || newState.race?.$id || state.raceDocumentId,
            raceId: payloadRaceId,
            // Critical: Always update status from payload if present
            status: newStatus,
            startTime:
              payload.startTime ||
              newState.race?.startTime ||
              new Date().toISOString(),
            resultsAvailable:
              payload.resultsAvailable !== undefined
                ? payload.resultsAvailable
                : newState.race?.resultsAvailable || false,
            resultsData:
              payload.resultsData || newState.race?.resultsData || undefined,
            dividendsData:
              payload.dividendsData ||
              newState.race?.dividendsData ||
              undefined,
            fixedOddsData:
              payload.fixedOddsData ||
              newState.race?.fixedOddsData ||
              undefined,
            resultStatus:
              payload.resultStatus || newState.race?.resultStatus || undefined,
            resultTime:
              payload.resultTime || newState.race?.resultTime || undefined,
            photoFinish:
              payload.photoFinish !== undefined
                ? payload.photoFinish
                : newState.race?.photoFinish || false,
            stewardsInquiry:
              payload.stewardsInquiry !== undefined
                ? payload.stewardsInquiry
                : newState.race?.stewardsInquiry || false,
            protestLodged:
              payload.protestLodged !== undefined
                ? payload.protestLodged
                : newState.race?.protestLodged || false,
          } as Race

          newState.race = updatedRace
          newState.lastRaceUpdate = now
          hasUpdates = true

          // Debug log for status changes
          if (payload.status && newState.race) {
            debugRaceStatus(
              'Real-time status update',
              payloadRaceId,
              previousStatus,
              newStatus,
              { source: 'race-event', payload }
            )
          }

          // When race status changes to interim or final, trigger race-results fetch
          if (
            payload.status &&
            ['interim', 'final'].includes(payload.status.toLowerCase()) &&
            payload.status.toLowerCase() !==
              (previousStatus || '').toLowerCase()
          ) {
            debugLog(
              '🏁 Race status changed to results phase, fetching race-results',
              {
                raceId: payloadRaceId,
                newStatus: payload.status,
                previousStatus,
              }
            )

            // Fetch race-results document
            const fetchRaceResults = async () => {
              try {
                const raceResultsResponse = await databases.listDocuments(
                  'raceday-db',
                  'race-results',
                  [Query.equal('race', state.raceDocumentId!), Query.limit(1)]
                )

                if (raceResultsResponse.documents.length > 0) {
                  const raceResultsDoc = raceResultsResponse.documents[0]
                  debugLog(
                    '🎯 Found race-results document after status change',
                    {
                      raceResultsDocumentId: raceResultsDoc.$id,
                      resultStatus: raceResultsDoc.resultStatus,
                      resultsAvailable: raceResultsDoc.resultsAvailable,
                    }
                  )

                  // Parse fixedOddsData from race-results document
                  let parsedFixedOddsData = {}
                  if (raceResultsDoc.fixedOddsData) {
                    try {
                      parsedFixedOddsData =
                        typeof raceResultsDoc.fixedOddsData === 'string'
                          ? JSON.parse(raceResultsDoc.fixedOddsData)
                          : raceResultsDoc.fixedOddsData || {}
                    } catch (error) {
                      errorLog(
                        'Failed to parse fixedOddsData after status change',
                        error
                      )
                      parsedFixedOddsData = {}
                    }
                  }

                  const resultsData = raceResultsDoc.resultsAvailable
                    ? {
                        raceId: payloadRaceId,
                        results:
                          typeof raceResultsDoc.resultsData === 'string'
                            ? JSON.parse(raceResultsDoc.resultsData)
                            : raceResultsDoc.resultsData || [],
                        dividends:
                          typeof raceResultsDoc.dividendsData === 'string'
                            ? JSON.parse(raceResultsDoc.dividendsData)
                            : raceResultsDoc.dividendsData || [],
                        fixedOddsData: parsedFixedOddsData,
                        status: (raceResultsDoc.resultStatus?.toLowerCase() ||
                          'interim') as 'interim' | 'final',
                        photoFinish: raceResultsDoc.photoFinish || false,
                        stewardsInquiry:
                          raceResultsDoc.stewardsInquiry || false,
                        protestLodged: raceResultsDoc.protestLodged || false,
                        resultTime:
                          raceResultsDoc.resultTime || new Date().toISOString(),
                      }
                    : null

                  // Update state with race-results data
                  setState((prev) => ({
                    ...prev,
                    raceResultsDocumentId: raceResultsDoc.$id,
                    resultsData,
                    lastResultsUpdate: new Date(),
                    race: prev.race
                      ? {
                          ...prev.race,
                          resultsAvailable: true,
                          resultsData: resultsData?.results,
                          dividendsData: resultsData?.dividends,
                          fixedOddsData: resultsData?.fixedOddsData,
                          resultStatus: resultsData?.status,
                        }
                      : prev.race,
                  }))
                } else {
                  debugLog(
                    'No race-results document found yet after status change to',
                    payload.status
                  )
                }
              } catch (error) {
                errorLog(
                  'Failed to fetch race-results after status change',
                  error
                )
              }
            }

            // Execute the fetch asynchronously
            fetchRaceResults()
          }
        } else if (isRaceResultsEvent && payload) {
          debugLog('Race results update received', {
            raceId: payload.race,
            resultStatus: payload.resultStatus,
            hasResults: !!payload.resultsData,
            payloadId: payload.$id,
            resultsAvailable: payload.resultsAvailable,
          })

          // If this is a new race-results document, store its ID
          if (payload.$id && !state.raceResultsDocumentId) {
            debugLog('🎯 New race-results document detected', {
              documentId: payload.$id,
              resultStatus: payload.resultStatus,
            })
            newState.raceResultsDocumentId = payload.$id
          }

          let parsedResultsData = payload.resultsData
          let parsedDividendsData = payload.dividendsData || []
          let parsedFixedOddsData = payload.fixedOddsData || {}

          // Parse JSON string fields if needed
          if (typeof parsedResultsData === 'string') {
            try {
              parsedResultsData = JSON.parse(parsedResultsData)
            } catch (error) {
              errorLog('Failed to parse resultsData', error)
              parsedResultsData = []
            }
          }

          if (typeof parsedDividendsData === 'string') {
            try {
              parsedDividendsData = JSON.parse(parsedDividendsData)
            } catch (error) {
              errorLog('Failed to parse dividendsData', error)
              parsedDividendsData = []
            }
          }

          if (typeof parsedFixedOddsData === 'string') {
            try {
              parsedFixedOddsData = JSON.parse(parsedFixedOddsData)
            } catch (error) {
              errorLog('Failed to parse fixedOddsData', error)
              parsedFixedOddsData = {}
            }
          }

          // Only create results data if results are available
          const updatedResultsData = payload.resultsAvailable
            ? {
                raceId,
                results: parsedResultsData || [],
                dividends: parsedDividendsData,
                fixedOddsData: parsedFixedOddsData,
                status: (payload.resultStatus?.toLowerCase() || 'interim') as
                  | 'interim'
                  | 'final',
                photoFinish: payload.photoFinish || false,
                stewardsInquiry: payload.stewardsInquiry || false,
                protestLodged: payload.protestLodged || false,
                resultTime: payload.resultTime || new Date().toISOString(),
              }
            : null

          newState.resultsData = updatedResultsData
          newState.lastResultsUpdate = now
          hasUpdates = true

          // Debug log for results status changes
          if (payload.resultStatus && payload.resultsAvailable) {
            debugRaceStatus(
              'Race results status update',
              raceId,
              state.resultsData?.status,
              payload.resultStatus?.toLowerCase(),
              { source: 'race-results', documentId: payload.$id }
            )
          }

          // Also update race object for consistency
          if (newState.race && payload.resultsAvailable) {
            newState.race = {
              ...newState.race,
              resultsAvailable: true,
              resultsData: parsedResultsData,
              dividendsData: parsedDividendsData,
              fixedOddsData: parsedFixedOddsData,
              resultStatus: payload.resultStatus?.toLowerCase() || 'interim',
              // Update race status based on result status
              status:
                payload.resultStatus === 'final'
                  ? 'final'
                  : newState.race.status,
            }
          }
        } else if (isPoolEvent && payload) {
          debugLog('Pool data update received', { raceId: payload.raceId })

          newState.poolData = {
            $id: payload.$id || '',
            $createdAt: payload.$createdAt || new Date().toISOString(),
            $updatedAt: payload.$updatedAt || new Date().toISOString(),
            raceId: payload.raceId,
            winPoolTotal: payload.winPoolTotal || 0,
            placePoolTotal: payload.placePoolTotal || 0,
            quinellaPoolTotal: payload.quinellaPoolTotal || 0,
            trifectaPoolTotal: payload.trifectaPoolTotal || 0,
            exactaPoolTotal: payload.exactaPoolTotal || 0,
            first4PoolTotal: payload.first4PoolTotal || 0,
            totalRacePool: payload.totalRacePool || 0,
            currency: payload.currency || '$',
            lastUpdated: payload.$updatedAt || new Date().toISOString(),
            isLive: payload.isLive || false,
          }
          newState.lastPoolUpdate = now
          hasUpdates = true
        } else if (isEntrantEvent && payload) {
          debugLog('Entrant update received', { entrantId: payload.$id })

          newState.entrants = updateEntrantInList(newState.entrants, payload)
          newState.lastEntrantsUpdate = now
          hasUpdates = true
        } else if (isMoneyFlowEvent && payload) {
          debugLog('Money flow update received', { entrantId: payload.entrant })

          newState.entrants = updateEntrantMoneyFlow(newState.entrants, payload)
          newState.lastEntrantsUpdate = now
          newState.moneyFlowUpdateTrigger = prevState.moneyFlowUpdateTrigger + 1
          hasUpdates = true
        }
      }

      // Update connection metrics based on the most recent update
      const latency = performance.now() - updateStartTime.current
      newState.lastUpdate = now
      newState.updateLatency = latency
      newState.totalUpdates = prevState.totalUpdates + updates.length

      // Track latency samples for connection health monitoring
      if (latency > 0 && latency < 5000) {
        // Only track reasonable latency values
        latencySamples.current.push(latency)
        // Keep only last 10 samples to avoid memory growth
        if (latencySamples.current.length > 10) {
          latencySamples.current = latencySamples.current.slice(-10)
        }
        debugLog('Latency sample added', {
          latency: Math.round(latency),
          sampleCount: latencySamples.current.length,
          avgLatency: Math.round(
            latencySamples.current.reduce((a, b) => a + b, 0) /
              latencySamples.current.length
          ),
        })
      }

      return newState
    })
  }, [raceId, state.raceDocumentId, state.raceResultsDocumentId])

  // Process incoming Appwrite real-time messages with throttling
  const processRealtimeMessage = useCallback(
    (message: AppwriteRealtimeMessage) => {
      try {
        // Add to pending updates
        pendingUpdates.current.push(message)

        // Clear existing timer and set new one for throttling
        if (updateThrottleTimer.current) {
          clearTimeout(updateThrottleTimer.current)
        }

        updateThrottleTimer.current = setTimeout(
          applyPendingUpdates,
          THROTTLE_DELAY
        )
      } catch (error) {
        errorLog('Error processing real-time message', error)
      }
    },
    [applyPendingUpdates]
  )

  // Hybrid architecture: Setup subscription ONLY after initial fetch completes
  useEffect(() => {
    // Don't setup subscription until initial fetch is complete (hybrid architecture requirement)
    if (!raceId || !state.raceDocumentId || !state.isInitialFetchComplete) {
      debugLog('⏳ Waiting for initial fetch to complete before subscription', {
        raceId,
        hasRaceDoc: !!state.raceDocumentId,
        fetchComplete: state.isInitialFetchComplete
      })
      return
    }

    let connectionRetries = 0
    const maxRetries = 5
    const connectionDrainDelay = 200 // 200ms drain period for graceful transitions

    const setupSubscription = () => {
      try {
        // Set connecting state
        setState((prev) => ({
          ...prev,
          connectionState: 'connecting',
          isConnected: false,
        }))

        const continueSetup = () => {
          debugLog(
            '🔄 Setting up unified real-time subscription for race:',
            raceId
          )

          // Get smart channels based on current state and race status
          const channels = getChannels(
            state.raceDocumentId,
            state.raceResultsDocumentId || undefined,
            state.race?.status
          )
          debugLog('Subscription channels:', channels)

          // Create unified subscription
          unsubscribeFunction.current = client.subscribe(
            channels,
            (response: any) => {
              debugLog('📡 Unified subscription event received', {
                channels: response.channels?.length || 0,
                events: response.events,
                hasPayload: !!response.payload,
              })
              processRealtimeMessage({
                ...response,
                channels: response.channels || [],
              })
            }
          )

          // Update connection state
          setState((prev) => ({
            ...prev,
            connectionState: 'connected',
            isConnected: true,
            connectionAttempts: connectionRetries,
          }))

          debugLog(
            '✅ Unified real-time subscription established for race:',
            raceId
          )
        }

        // Clear any existing subscription with drain period
        if (unsubscribeFunction.current) {
          setState((prev) => ({
            ...prev,
            connectionState: 'disconnecting',
          }))
          
          unsubscribeFunction.current()
          unsubscribeFunction.current = null
          
          // Allow connection drain period before new connection
          setTimeout(() => {
            continueSetup()
          }, connectionDrainDelay)
        } else {
          continueSetup()
        }
      } catch (error) {
        errorLog('❌ Failed to setup unified subscription:', error)

        setState((prev) => ({
          ...prev,
          connectionState: 'disconnected',
          isConnected: false,
          connectionAttempts: connectionRetries + 1,
        }))

        // Retry connection with exponential backoff
        if (connectionRetries < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, connectionRetries), 30000)
          debugLog(
            `🔄 Retrying connection in ${delay}ms (attempt ${
              connectionRetries + 1
            }/${maxRetries})`
          )

          reconnectTimeout.current = setTimeout(() => {
            connectionRetries++
            setupSubscription()
          }, delay)
        }
      }
    }

    setupSubscription()

    // Cleanup function with graceful disconnection
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current)
      }

      if (updateThrottleTimer.current) {
        clearTimeout(updateThrottleTimer.current)
      }

      if (unsubscribeFunction.current) {
        try {
          setState((prev) => ({
            ...prev,
            connectionState: 'disconnecting',
          }))
          
          unsubscribeFunction.current()
          unsubscribeFunction.current = null
          
          setTimeout(() => {
            setState((prev) => ({
              ...prev,
              connectionState: 'disconnected',
              isConnected: false,
            }))
          }, connectionDrainDelay)
        } catch (error) {
          errorLog('Error unsubscribing from unified real-time:', error)
        }
      }
    }
  }, [
    raceId,
    state.raceDocumentId,
    state.raceResultsDocumentId,
    state.isInitialFetchComplete,
    state.race?.status,
    getChannels,
    processRealtimeMessage,
  ])

  // Dynamic subscription upgrade when race-results document is discovered
  useEffect(() => {
    if (
      state.raceResultsDocumentId &&
      unsubscribeFunction.current &&
      state.isConnected
    ) {
      debugLog('🎯 Upgrading to document-specific race-results subscription', {
        raceResultsDocumentId: state.raceResultsDocumentId,
        wasUsingCollectionLevel: !state.raceResultsDocumentId,
      })

      // Recreate subscription with document-specific race-results channel
      const setupSubscription = () => {
        try {
          if (unsubscribeFunction.current) {
            unsubscribeFunction.current()
            unsubscribeFunction.current = null
          }

          const channels = getChannels(
            state.raceDocumentId,
            state.raceResultsDocumentId || undefined,
            state.race?.status
          )
          debugLog(
            '🔄 Recreated subscription with document-specific race-results channel',
            channels
          )

          // Create a new message processor for the upgraded subscription
          const handleMessage = (response: any) => {
            try {
              // Add to pending updates
              pendingUpdates.current.push({
                ...response,
                channels: response.channels || [],
              })

              // Clear existing timer and set new one for throttling
              if (updateThrottleTimer.current) {
                clearTimeout(updateThrottleTimer.current)
              }

              updateThrottleTimer.current = setTimeout(
                applyPendingUpdates,
                THROTTLE_DELAY
              )
            } catch (error) {
              errorLog(
                'Error processing real-time message in upgraded subscription',
                error
              )
            }
          }

          unsubscribeFunction.current = client.subscribe(
            channels,
            handleMessage
          )
        } catch (error) {
          errorLog('Failed to upgrade subscription:', error)
        }
      }

      // Add a small delay to ensure state is fully updated
      const timer = setTimeout(setupSubscription, 100)
      return () => clearTimeout(timer)
    }
  }, [state.raceResultsDocumentId, getChannels, applyPendingUpdates])

  // Manual reconnection function
  const reconnect = useCallback(() => {
    debugLog('🔄 Manual reconnection triggered')
    setState((prev) => ({
      ...prev,
      isConnected: false,
      connectionAttempts: 0,
    }))

    // Clear existing subscription and reconnect
    if (unsubscribeFunction.current) {
      unsubscribeFunction.current()
      unsubscribeFunction.current = null
    }
  }, [])

  // Clear update history
  const clearHistory = useCallback(() => {
    setState((prev) => ({
      ...prev,
      totalUpdates: 0,
      lastUpdate: null,
    }))
  }, [])

  // Get connection health metrics
  const getConnectionHealth = useCallback(() => {
    const uptime = Date.now() - connectionStartTime.current
    const avgLatency =
      latencySamples.current.length > 0
        ? latencySamples.current.reduce((a, b) => a + b, 0) /
          latencySamples.current.length
        : null

    debugLog('Connection health check', {
      isConnected: state.isConnected,
      connectionAttempts: state.connectionAttempts,
      latencySamples: latencySamples.current.length,
      avgLatency,
      uptime,
    })

    return {
      isHealthy: state.isConnected && state.connectionAttempts < 3,
      avgLatency,
      uptime,
    }
  }, [state.isConnected, state.connectionAttempts])

  return {
    ...state,
    reconnect,
    clearHistory,
    getConnectionHealth,
  }
}

// Helper functions
function updateEntrantInList(
  entrants: Entrant[],
  updatedEntrant: Partial<Entrant> & { $id: string }
): Entrant[] {
  return entrants.map((entrant) => {
    if (entrant.$id === updatedEntrant.$id) {
      return {
        ...entrant,
        ...updatedEntrant,
        $updatedAt: new Date().toISOString(),
      }
    }
    return entrant
  })
}

function updateEntrantMoneyFlow(
  entrants: Entrant[],
  moneyFlowData: any
): Entrant[] {
  return entrants.map((entrant) => {
    if (entrant.$id === moneyFlowData.entrant) {
      let trend: 'up' | 'down' | 'neutral' = 'neutral'

      // Update hold percentage and calculate trend
      if (moneyFlowData.holdPercentage !== undefined) {
        if (
          entrant.holdPercentage !== undefined &&
          moneyFlowData.holdPercentage !== entrant.holdPercentage
        ) {
          trend =
            moneyFlowData.holdPercentage > entrant.holdPercentage
              ? 'up'
              : 'down'
        }
      }

      return {
        ...entrant,
        holdPercentage: moneyFlowData.holdPercentage || entrant.holdPercentage,
        moneyFlowTrend: trend,
        // CONSOLIDATED ODDS DATA UPDATE (NEW in Story 4.9)
        // Update current odds from money-flow-history if available
        winOdds: moneyFlowData.fixedWinOdds !== undefined ? moneyFlowData.fixedWinOdds : entrant.winOdds,
        placeOdds: moneyFlowData.fixedPlaceOdds !== undefined ? moneyFlowData.fixedPlaceOdds : entrant.placeOdds,
        poolWinOdds: moneyFlowData.poolWinOdds !== undefined ? moneyFlowData.poolWinOdds : entrant.poolWinOdds,
        poolPlaceOdds: moneyFlowData.poolPlaceOdds !== undefined ? moneyFlowData.poolPlaceOdds : entrant.poolPlaceOdds,
        $updatedAt: new Date().toISOString(),
      }
    }
    return entrant
  })
}
