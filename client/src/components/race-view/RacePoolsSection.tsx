'use client'
import { memo } from 'react'
import { useRacePoolData } from '@/hooks/useRacePoolData'
import type { RacePoolData } from '@/types/racePools'

interface RacePoolsSectionProps {
  raceId: string
  poolData?: RacePoolData
  className?: string
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
}: RacePoolsSectionProps) {
  const { poolData: livePoolData, isLoading, error } = useRacePoolData(raceId)

  const currentPoolData = livePoolData || poolData

  if (isLoading) {
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

  if (error) {
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

  // Build layout: Total row will include Trifecta on the right.
  // Then two paired rows: Win <-> Quinella, Place <-> Exacta.
  const leftTypes: { key: string; label: string; value?: number }[] = [
    { key: 'win', label: 'Win', value: currentPoolData.winPoolTotal },
    { key: 'place', label: 'Place', value: currentPoolData.placePoolTotal },
  ]

  const rightRowTypes: { key: string; label: string; value?: number }[] = [
    {
      key: 'quinella',
      label: 'Quinella',
      value: currentPoolData.quinellaPoolTotal,
    },
    { key: 'exacta', label: 'Exacta', value: currentPoolData.exactaPoolTotal },
  ]

  // Build explicit pairs matching left/right rows (no trimming; labels always show)
  const pairs = leftTypes.map((l, i) => ({ left: l, right: rightRowTypes[i] }))

  return (
    <div className={`${className}`}>
      <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
        Pools
      </div>

      {/* Total row above the pool breakdown - put value in same column as Win/Place values
          and show Trifecta in the right column */}
      <div className="grid grid-cols-4 items-baseline gap-2 mb-2">
        <div className="text-sm text-gray-600">Total</div>
        <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          ${formatPoolAmount(currentPoolData.totalRacePool)}
        </div>
        <div className="text-sm text-gray-600">Trifecta</div>
        <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {currentPoolData.trifectaPoolTotal &&
          currentPoolData.trifectaPoolTotal > 0
            ? `$${formatPoolAmount(currentPoolData.trifectaPoolTotal)}`
            : '—'}
        </div>
      </div>

      {/* Render rows so Win pairs with Trifecta, Place with Quinella, etc. Labels and values share the same font-size; values remain bold. */}
      <div className="space-y-1">
        {pairs.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-4 gap-3 items-baseline text-sm"
          >
            {/* Left label */}
            <div className="text-sm text-gray-600">{p.left?.label ?? ''}</div>

            {/* Left value (bold) */}
            <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
              {p.left && p.left.value && p.left.value > 0
                ? `$${formatPoolAmount(p.left.value)}`
                : '—'}
            </div>

            {/* Right label */}
            <div className="text-sm text-gray-600">{p.right?.label ?? ''}</div>

            {/* Right value (bold) */}
            <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
              {p.right && p.right.value && p.right.value > 0
                ? `$${formatPoolAmount(p.right.value)}`
                : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Last updated small */}
      <div className="mt-2 text-xs text-gray-400">
        Updated:{' '}
        {new Date(currentPoolData.lastUpdated).toLocaleTimeString('en-US', {
          hour12: true,
          hour: 'numeric',
          minute: '2-digit',
        })}
      </div>
    </div>
  )
})

export default RacePoolsSection
