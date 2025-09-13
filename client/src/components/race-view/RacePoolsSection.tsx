'use client'
import { memo } from 'react'
import { useRacePoolData } from '@/hooks/useRacePoolData'
import type { RacePoolData } from '@/types/racePools'

interface RacePoolsSectionProps {
  raceId: string
  poolData?: RacePoolData | null
  className?: string
  lastUpdate?: Date | null
}

const formatPoolAmount = (cents: number): string => {
  const dollars = Math.round(cents / 100)
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export const RacePoolsSection = memo(function RacePoolsSection({
  raceId,
  poolData,
  className = '',
  lastUpdate,
}: RacePoolsSectionProps) {
  // Use poolData from unified subscription if available, otherwise use fallback hook for data persistence
  const {
    poolData: fallbackPoolData,
    isLoading,
    error,
  } = useRacePoolData(poolData ? '' : raceId, !!poolData) // Disable subscription when unified poolData is available
  const currentPoolData = poolData || fallbackPoolData

  if (isLoading && !poolData) {
    return (
      <div className={`${className}`}>
        <div className="animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="grid grid-cols-4 gap-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !poolData) {
    return (
      <div className={`text-red-600 text-sm ${className}`}>
        <div className="text-xs text-gray-500 mb-1">Pool Data</div>
        <div>Error loading pool data</div>
      </div>
    )
  }

  if (!currentPoolData) {
    return (
      <div className={`${className}`}>
        <div className="text-xs text-gray-500 mb-1">Pool Data</div>
        <div className="text-sm text-gray-400">No pool data available</div>
      </div>
    )
  }

  // Build layout: Three paired rows: Win <-> Quinella, Place <-> Trifecta, Total <-> FirstFour
  const leftTypes: { key: string; label: string; value?: number }[] = [
    { key: 'win', label: 'Win', value: currentPoolData.winPoolTotal },
    { key: 'place', label: 'Place', value: currentPoolData.placePoolTotal },
    { key: 'total', label: 'Total', value: currentPoolData.totalRacePool },
  ]

  const rightRowTypes: { key: string; label: string; value?: number }[] = [
    {
      key: 'quinella',
      label: 'Quinella',
      value: currentPoolData.quinellaPoolTotal,
    },
    {
      key: 'trifecta',
      label: 'Trifecta',
      value: currentPoolData.trifectaPoolTotal,
    },
    {
      key: 'first4',
      label: 'FirstFour',
      value: currentPoolData.first4PoolTotal,
    },
  ]

  // Build explicit pairs matching left/right rows (no trimming; labels always show)
  const pairs = leftTypes.map((l, i) => ({ left: l, right: rightRowTypes[i] }))

  return (
    <div className={`${className}`}>
      <div className="flex items-center mb-1">
        <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold">
          Pools
        </div>
        <div className="ml-2 text-xs text-gray-400">
          Last update:{' '}
          {lastUpdate
            ? lastUpdate.toLocaleTimeString('en-US', {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
              })
            : currentPoolData?.lastUpdated
            ? new Date(currentPoolData.lastUpdated).toLocaleTimeString(
                'en-US',
                {
                  hour12: true,
                  hour: '2-digit',
                  minute: '2-digit',
                }
              )
            : '—'}
          {lastUpdate && <span className="ml-1 text-green-500">●</span>}
        </div>
      </div>
      {/* insert a blank line or row above the <Pool breakdown rows> */}
      <div className="h-6"></div>

      {/* Pool breakdown rows rendered as consistent pairs: Win <-> Quinella, Place <-> Trifecta, Total <-> FirstFour */}

      {/* Render all rows with consistent 4-column grid formatting */}
      <div className="space-y-1 mr-8">
        {pairs.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-4 gap-1 items-baseline text-sm"
          >
            {/* Left label - spans 1 columns */}
            <div className="col-span-1 text-sm text-gray-600">
              {p.left?.label ?? ''}
            </div>

            {/* Left value (bold) - spans 1 column */}
            <div className="col-span-1 text-sm font-bold text-gray-900 leading-none text-right font-tnum pr-6">
              {p.left && p.left.value !== undefined && p.left.value > 0
                ? `$${formatPoolAmount(p.left.value)}`
                : '—'}
            </div>

            {/* Right label - spans 1 column  */}
            <div className="col-span-1 text-sm text-gray-600 truncate">
              {p.right?.label ?? ''}
            </div>

            {/* Right value (bold) - spans 1 column */}
            <div className="col-span-1 text-sm font-bold text-gray-900 leading-none text-right font-tnum pr-6">
              {p.right && p.right.value !== undefined && p.right.value > 0
                ? `$${formatPoolAmount(p.right.value)}`
                : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

export default RacePoolsSection
