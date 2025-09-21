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
import { client, databases, connectionMonitor } from '@/lib/appwrite-client'
import { Race, Entrant, Meeting, RaceNavigationData } from '@/types/meetings'
import type { RacePoolData, RaceResultsData } from '@/types/racePools'
import { Query } from 'appwrite'
import { useLogger } from '@/utils/logging'
import { NAVIGATION_DRAIN_DELAY } from '@/contexts/SubscriptionCleanupContext'
import type { MoneyFlowDataPoint } from '@/types/moneyFlow'

// Create logger outside component to avoid re-creation
let logger: ReturnType<typeof useLogger>;

const debugLog = (message: string, data?: unknown) => {
  if (logger) {
    logger.debug(message, data);
  }
}

// Enhanced debug for race status changes
const debugRaceStatus = (
  message: string,
  raceId: string,
  oldStatus?: string,
  newStatus?: string,
  extra?: Record<string, unknown>
) => {
  if (logger && oldStatus !== newStatus) {
    logger.debug(`RaceStatus: ${message}`, {
      raceId,
      oldStatus,
      newStatus,
      timestamp: new Date().toISOString(),
      ...extra,
    })
  }
}

const errorLog = (message: string, error: unknown) => {
  if (logger) {
    logger.error(message, error);
  }
}

type RealtimePayloadBase = Partial<Race> &
  Partial<RacePoolData> &
  Partial<RaceResultsData> &
  Partial<Entrant> &
  Partial<MoneyFlowDataPoint>;

type RealtimePayload = RealtimePayloadBase & {
  entrant?: string | { entrantId?: string; $id?: string }
  race?: string
  resultsAvailable?: boolean
  [key: string]: unknown
};

interface RawRealtimeMessage {
  events: string[]
  channels?: string[]
  timestamp: string | number
  payload?: RealtimePayload
}

interface AppwriteRealtimeMessage {
  events: string[]
  channels: string[]
  timestamp: string
  payload: RealtimePayload
}


const normalizeRealtimeMessage = (message: RawRealtimeMessage): AppwriteRealtimeMessage => ({
  events: message.events,
  channels: message.channels ?? [],
  timestamp: typeof message.timestamp === 'number' ? message.timestamp.toString() : message.timestamp,
  payload: (message.payload ?? {}) as RealtimePayload,
});

// Hook props interface
interface UseUnifiedRaceRealtimeProps {
  raceId: string
  initialRace?: Race | null
  initialEntrants?: Entrant[]
  initialMeeting?: Meeting | null
  initialNavigationData?: RaceNavigationData | null
  // New cleanup signal for navigation-triggered cleanup
  cleanupSignal?: number
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
    connectionCount?: number
    activeConnections?: number
    totalChannels?: number
    uniqueChannels?: string[]
    totalMessages?: number
    totalErrors?: number
    isOverLimit?: boolean
    emergencyFallback?: boolean
  }
}

export function useUnifiedRaceRealtime({
  raceId,
  initialRace = null,
  initialEntrants = [],
  initialMeeting = null,
  initialNavigationData = null,
  cleanupSignal = 0,
}: UseUnifiedRaceRealtimeProps): UnifiedRaceRealtimeState &
  UnifiedRaceRealtimeActions {
  // Initialize logger inside component
  logger = useLogger('useUnifiedRaceRealtime');

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
  const initialPoolDataAttempted = useRef<boolean>(false)
  const poolDataFetchInProgress = useRef<boolean>(false)
  const lastCleanupSignal = useRef<number>(0)
  const [isCleaningUp, setIsCleaningUp] = useState<boolean>(false)

  // Throttling for performance optimization
  const pendingUpdates = useRef<AppwriteRealtimeMessage[]>([])
  const updateThrottleTimer = useRef<NodeJS.Timeout | null>(null)
  const THROTTLE_DELAY = 100 // 100ms for critical periods
  const CONNECTION_DRAIN_DELAY = NAVIGATION_DRAIN_DELAY

  const poolDocumentId = state.poolData?.$id?.trim() || null

  // Smart channel management with race status awareness
  const getChannels = useCallback(
    (raceDocId: string | null, raceResultsDocId?: string) => {
      if (!raceDocId) return []

      const channels = new Set<string>()

      // Always subscribe to the primary race document
      channels.add(`databases.raceday-db.collections.races.documents.${raceDocId}`)

      // Prefer document-specific pool channel when the ID is known
      if (poolDocumentId) {
        channels.add(
          `databases.raceday-db.collections.race-pools.documents.${poolDocumentId}`
        )
      } else {
        channels.add('databases.raceday-db.collections.race-pools.documents')
      }

      // TASK 5 RESTORED: Use race-specific channel subscriptions for optimal performance
      // Both entrants and money-flow-history collections have raceId attributes for filtering
      channels.add(`databases.raceday-db.collections.entrants.documents.raceId.${raceId}`)
      channels.add(`databases.raceday-db.collections.money-flow-history.documents.raceId.${raceId}`)

      // TASK 5 RESTORED: Use race-specific subscription for race-results
      if (raceResultsDocId) {
        // Use document-specific channel when we have the specific document ID
        channels.add(
          `databases.raceday-db.collections.race-results.documents.${raceResultsDocId}`
        )
      } else {
        // Use race-specific channel filtering instead of collection-wide subscription
        channels.add(`databases.raceday-db.collections.race-results.documents.raceId.${raceId}`)
      }

      return Array.from(channels)
    },
    [poolDocumentId, raceId]
  )

  // Fetch initial data if not provided
  const fetchPoolDataForRace = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (!raceId) return
      if (poolDataFetchInProgress.current) return
      if (!force && initialPoolDataAttempted.current) return

      poolDataFetchInProgress.current = true
      initialPoolDataAttempted.current = true

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
            lastPoolUpdate: new Date(),
          }))

          debugLog('Initial pool data loaded', {
            totalPool: poolDoc.totalRacePool,
          })
        } else {
          debugLog('No pool data document found for race', { raceId })
          setState((prev) => ({
            ...prev,
            poolData: null,
            lastPoolUpdate: prev.lastPoolUpdate || new Date(),
          }))
        }
      } catch (poolError) {
        errorLog('Failed to fetch pool data', poolError)
      } finally {
        poolDataFetchInProgress.current = false
      }
    },
    [raceId]
  )

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
      await fetchPoolDataForRace({ force: true })

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
  }, [raceId, fetchPoolDataForRace, state.raceResultsDocumentId])

  // Reset fetch flag when race ID changes
  useEffect(() => {
    initialDataFetched.current = false
    initialPoolDataAttempted.current = false
    poolDataFetchInProgress.current = false

    setState((prev) => ({
      ...prev,
      poolData: null,
      lastPoolUpdate: null,
    }))
    debugLog('Race ID changed, reset fetch flag', { raceId })
  }, [raceId])

  // Handle cleanup signal for navigation-triggered cleanup
  useEffect(() => {
    if (cleanupSignal > 0 && cleanupSignal !== lastCleanupSignal.current) {
      debugLog('🧹 Navigation cleanup signal received', { cleanupSignal, raceId })
      lastCleanupSignal.current = cleanupSignal
      setIsCleaningUp(true)

      // Force immediate subscription cleanup
      if (unsubscribeFunction.current) {
        setState((prev) => ({
          ...prev,
          connectionState: 'disconnecting',
          isConnected: false,
        }))

        try {
          unsubscribeFunction.current()
          unsubscribeFunction.current = null
          debugLog('✅ Forced subscription cleanup completed')
        } catch (error) {
          errorLog('Error during forced cleanup', error)
        }
      }

      // Clear pending updates and timers
      if (updateThrottleTimer.current) {
        clearTimeout(updateThrottleTimer.current)
        updateThrottleTimer.current = null
      }
      pendingUpdates.current = []

      // Reset cleanup flag after drain period
      setTimeout(() => {
        setIsCleaningUp(false)
        setState((prev) => ({
          ...prev,
          connectionState: 'disconnected',
        }))
      }, CONNECTION_DRAIN_DELAY)
    }
  }, [cleanupSignal, raceId, CONNECTION_DRAIN_DELAY])

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

  // Ensure pool data is fetched at least once per race when unified hook is active
  useEffect(() => {
    if (!raceId) return
    if (state.poolData) return
    if (initialPoolDataAttempted.current) return

    fetchPoolDataForRace()
  }, [raceId, state.poolData, fetchPoolDataForRace])

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

      // Process all pending updates in batch
      for (const message of updates) {
        const { events, payload } = message

        // TASK 5 RESTORED: Debug race-specific subscription events
        debugLog('Realtime event received', {
          events: events.slice(0, 3), // Show first 3 events to avoid spam
          payloadType: payload?.$collectionId || 'unknown',
          payloadRaceId: payload?.raceId || payload?.race || 'none',
          targetRaceId: raceId
        })

        const currentRaceDocumentId =
          newState.raceDocumentId ?? prevState.raceDocumentId
        const currentRaceResultsDocumentId =
          newState.raceResultsDocumentId ?? prevState.raceResultsDocumentId

        // Event-based filtering using Appwrite's events array
        // For race events, check both the document ID and race ID in payload
        const isRaceEvent =
          events.some((event) => {
            // Check if this is a race document event
            if (event.includes('races.')) {
              // Extract document ID from event
              const eventId = event.split('races.')[1]
              return eventId === currentRaceDocumentId
            }
            return false
          }) ||
          (events.some((event) => event.includes('races.')) &&
            (payload.raceId === raceId || payload.race === currentRaceDocumentId))

        // TASK 5 RESTORED: Simplified race-results event detection (race-specific channel ensures relevance)
        const isRaceResultsEvent =
          events.some((event) => event.includes('race-results')) && payload

        const isPoolEvent = events.some(
          (event) => event.includes('race-pools') && payload.raceId === raceId
        )

        // TASK 5 RESTORED: Simplified entrant event detection (race-specific channel ensures relevance)
        const isEntrantEvent = events.some((event) => event.includes('entrants')) && payload

        // TASK 5 RESTORED: Simplified money-flow event detection (race-specific channel ensures relevance)
        const isMoneyFlowEvent =
          events.some((event) => event.includes('money-flow-history')) &&
          payload &&
          !!payload.entrant

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
            $id: payload.$id || newState.race?.$id || currentRaceDocumentId,
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

            // Fetch race-results document with retry mechanism
            const fetchRaceResults = async (retryCount = 0) => {
              try {
                const raceResultsResponse = await databases.listDocuments(
                  'raceday-db',
                  'race-results',
                  [Query.equal('race', currentRaceDocumentId!), Query.limit(1)]
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
                    `No race-results document found yet after status change to ${payload.status}`,
                    { retryCount, maxRetries: 3 }
                  )

                  // Retry up to 3 times with increasing delays for race-results document creation
                  if (retryCount < 3) {
                    const retryDelay = (retryCount + 1) * 2000 // 2s, 4s, 6s delays
                    debugLog(`Retrying race-results fetch in ${retryDelay}ms (attempt ${retryCount + 1}/3)`)
                    setTimeout(() => {
                      fetchRaceResults(retryCount + 1)
                    }, retryDelay)
                  } else {
                    debugLog('Max retries reached for race-results fetch - will rely on periodic check and subscription')
                  }
                }
              } catch (error) {
                errorLog(
                  'Failed to fetch race-results after status change',
                  error
                )
              }
            }

            // Execute the fetch asynchronously (starts with retryCount = 0)
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
          if (payload.$id && !currentRaceResultsDocumentId) {
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

          // Debug log for results status changes
          if (payload.resultStatus && payload.resultsAvailable) {
            debugRaceStatus(
              'Race results status update',
              raceId,
              prevState.resultsData?.status,
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
              resultStatus: (payload.resultStatus?.toLowerCase() || 'interim') as 'interim' | 'final',
              // Update race status based on result status
              status:
                payload.resultStatus === 'final'
                  ? 'final'
                  : newState.race.status,
            }
          }
        } else if (isPoolEvent && payload) {
          debugLog('Pool data update received', { raceId: payload.raceId })

          const existingPoolId = newState.poolData?.$id || ''
          const resolvedPoolId = payload.$id || existingPoolId || ''

          newState.poolData = {
            $id: resolvedPoolId,
            $createdAt: payload.$createdAt || new Date().toISOString(),
            $updatedAt: payload.$updatedAt || new Date().toISOString(),
            raceId: payload.raceId || raceId,
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
        } else if (isEntrantEvent && payload) {
          debugLog('Entrant update received (TASK 5 race-specific)', {
            entrantId: payload.$id,
            raceId: payload.raceId || payload.race
          })

          if (payload.$id) {
            newState.entrants = updateEntrantInList(newState.entrants, payload as Partial<Entrant> & { $id: string })
          }
          newState.lastEntrantsUpdate = now
        } else if (isMoneyFlowEvent && payload) {
          debugLog('Money flow update received (TASK 5 race-specific)', {
            entrantId: resolveEntrantId(payload.entrant),
            raceId: payload.raceId || payload.race
          })

          newState.entrants = updateEntrantMoneyFlow(newState.entrants, payload)
          newState.lastEntrantsUpdate = now
          newState.moneyFlowUpdateTrigger = prevState.moneyFlowUpdateTrigger + 1
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
  }, [raceId])

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
    if (!raceId || !state.raceDocumentId || !state.isInitialFetchComplete || isCleaningUp) {
      debugLog('⏳ Waiting for initial fetch to complete before subscription', {
        raceId,
        hasRaceDoc: !!state.raceDocumentId,
        fetchComplete: state.isInitialFetchComplete,
        isCleaningUp
      })
      return
    }

    let connectionRetries = 0
    const maxRetries = 5

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
            state.raceResultsDocumentId || undefined
          )
          debugLog('Subscription channels:', channels)

          // Create unified subscription
          unsubscribeFunction.current = client.subscribe(
            channels,
            (response: RawRealtimeMessage) => {
              debugLog('📡 Unified subscription event received', {
                channels: response.channels?.length || 0,
                events: response.events,
                hasPayload: !!response.payload,
              })
              processRealtimeMessage(normalizeRealtimeMessage(response))
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
          }, CONNECTION_DRAIN_DELAY)
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
          }, CONNECTION_DRAIN_DELAY)
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
    isCleaningUp,
    getChannels,
    processRealtimeMessage,
    CONNECTION_DRAIN_DELAY,
  ])

  // REMOVED: Dynamic subscription upgrade logic that caused connection leaks
  // Now using single subscription approach with event filtering instead

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

    // Get connection monitoring metrics
    const monitorMetrics = connectionMonitor.getMetrics()

    debugLog('Connection health check', {
      isConnected: state.isConnected,
      connectionAttempts: state.connectionAttempts,
      latencySamples: latencySamples.current.length,
      avgLatency,
      uptime,
      monitorMetrics,
    })

    return {
      isHealthy: state.isConnected && state.connectionAttempts < 3 && !connectionMonitor.shouldDisableRealtime(),
      avgLatency,
      uptime,
      connectionCount: monitorMetrics?.totalConnections,
      activeConnections: monitorMetrics?.activeConnections,
      totalChannels: monitorMetrics?.totalChannels,
      uniqueChannels: monitorMetrics?.uniqueChannels,
      totalMessages: monitorMetrics?.totalMessages,
      totalErrors: monitorMetrics?.totalErrors,
      isOverLimit: monitorMetrics?.isOverLimit,
      emergencyFallback: monitorMetrics?.emergencyFallback,
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

function resolveEntrantId(entrant: RealtimePayload['entrant']): string | null {
  if (!entrant) {
    return null
  }

  if (typeof entrant === 'string') {
    return entrant
  }

  if (typeof entrant === 'object' && entrant !== null) {
    return (entrant as { entrantId?: string; $id?: string }).entrantId ||
           (entrant as { entrantId?: string; $id?: string }).$id || null
  }

  return null
}

function updateEntrantMoneyFlow(
  entrants: Entrant[],
  moneyFlowData: RealtimePayload
): Entrant[] {
  const targetEntrantId = resolveEntrantId(moneyFlowData.entrant)

  return entrants.map((entrant) => {
    if (targetEntrantId && entrant.$id === targetEntrantId) {
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
