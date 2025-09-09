/**
 * Hook for fetching and managing race pool data with real-time updates
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { RacePoolData } from '@/types/racePools'
import { client } from '@/lib/appwrite-client'

interface UseRacePoolDataResult {
  poolData: RacePoolData | null
  isLoading: boolean
  error: string | null
  lastUpdate: Date | null
  refreshPoolData: () => Promise<void>
}

export function useRacePoolData(raceId: string): UseRacePoolDataResult {
  const [poolData, setPoolData] = useState<RacePoolData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Fetch pool data from Appwrite database
  const fetchPoolData = useCallback(async () => {
    if (!raceId) return

    setIsLoading(true)
    setError(null)

    try {
      const { databases } = await import('@/lib/appwrite-client')
      const { Query } = await import('appwrite')

      const response = await databases.listDocuments(
        'raceday-db',
        'race-pools',
        [Query.equal('raceId', raceId), Query.limit(1)]
      )

      if (response.documents.length > 0) {
        const poolDoc = response.documents[0]
        const poolData: RacePoolData = {
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
        }
        setPoolData(poolData)
      } else {
        setPoolData(null)
      }

      setLastUpdate(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      console.error('Error fetching pool data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [raceId])

  // Set up real-time subscription for pool updates
  useEffect(() => {
    if (!raceId) return

    // Initial fetch
    fetchPoolData()

    // Set up real-time subscription
    let unsubscribe: (() => void) | null = null

    try {
      // Subscribe to race-pools collection updates
      unsubscribe = client.subscribe(
        'databases.raceday-db.collections.race-pools.documents',
        (response: any) => {
          // Only process if it's for our race
          if (response.payload && response.payload.raceId === raceId) {
            console.log('📡 Pool data update received:', response)

            const updatedPoolData: RacePoolData = {
              $id: response.payload.$id,
              $createdAt: response.payload.$createdAt,
              $updatedAt: response.payload.$updatedAt,
              raceId: response.payload.raceId,
              winPoolTotal: response.payload.winPoolTotal || 0,
              placePoolTotal: response.payload.placePoolTotal || 0,
              quinellaPoolTotal: response.payload.quinellaPoolTotal || 0,
              trifectaPoolTotal: response.payload.trifectaPoolTotal || 0,
              exactaPoolTotal: response.payload.exactaPoolTotal || 0,
              first4PoolTotal: response.payload.first4PoolTotal || 0,
              totalRacePool: response.payload.totalRacePool || 0,
              currency: response.payload.currency || '$',
              lastUpdated: response.payload.$updatedAt,
              isLive: true,
            }

            setPoolData(updatedPoolData)
            setLastUpdate(new Date())
          }
        }
      )

      console.log(
        '✅ Pool data real-time subscription established for race:',
        raceId
      )
    } catch (subscriptionError) {
      console.warn(
        'Failed to establish pool data real-time subscription:',
        subscriptionError
      )
      // Continue with periodic updates if real-time fails - reduce frequency to prevent excessive re-renders
      const interval = setInterval(fetchPoolData, 60000) // Update every 60 seconds as fallback

      return () => {
        clearInterval(interval)
      }
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe()
        } catch (error) {
          console.warn('Error unsubscribing from pool data updates:', error)
        }
      }
    }
  }, [raceId, fetchPoolData])

  const refreshPoolData = useCallback(async () => {
    await fetchPoolData()
  }, [fetchPoolData])

  return {
    poolData,
    isLoading,
    error,
    lastUpdate,
    refreshPoolData,
  }
}
