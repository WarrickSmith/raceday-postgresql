import React from 'react'
import type { RacePoolData, RaceResultsData } from '@/types/racePools'

interface Props {
  poolData?: RacePoolData
  resultsData?: RaceResultsData
  className?: string
}

const formatPoolAmount = (cents?: number) => {
  if (!cents && cents !== 0) return '—'
  const dollars = Math.round((cents as number) / 100)
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export const PoolsResultsGrid: React.FC<Props> = ({
  poolData,
  resultsData,
  className = '',
}) => {
  // helpers to find dividend by poolType
  const findDividend = (type: string) =>
    resultsData?.dividends.find(
      (d) => d.poolType.toLowerCase() === type.toLowerCase()
    )

  return (
    <div className={`${className}`}>
      <div className="grid grid-cols-4 gap-4 items-start">
        {/* Titles row */}
        <div className="col-span-2 text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Pools
        </div>
        <div className="col-span-2 text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Results
        </div>

        {/* Total row */}
        <div className="text-xs text-gray-600">Total</div>
        <div className="text-sm font-bold text-gray-900">
          {poolData ? `$${formatPoolAmount(poolData.totalRacePool)}` : '—'}
        </div>
        {/* Results block (top3 + odds) - placed to the right, aligned to top */}
        <div className="col-start-3 col-span-2 row-start-1">
          <div className="grid gap-2">
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">1st</div>
              <div className="text-sm font-bold">
                {resultsData && resultsData.results[0]
                  ? `#${resultsData.results[0].runnerNumber} ${resultsData.results[0].runnerName}`
                  : '—'}
              </div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">2nd</div>
              <div className="text-sm font-bold">
                {resultsData && resultsData.results[1]
                  ? `#${resultsData.results[1].runnerNumber} ${resultsData.results[1].runnerName}`
                  : '—'}
              </div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">3rd</div>
              <div className="text-sm font-bold">
                {resultsData && resultsData.results[2]
                  ? `#${resultsData.results[2].runnerNumber} ${resultsData.results[2].runnerName}`
                  : '—'}
              </div>
            </div>
            <div className="mt-2" />
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">Win Odds</div>
              <div className="text-sm font-bold font-tnum">
                {findDividend('win')
                  ? `${findDividend('win')!.currency}${findDividend(
                      'win'
                    )!.dividend.toFixed(2)}`
                  : '—'}
              </div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">Place Odds</div>
              <div className="text-sm font-bold font-tnum">
                {findDividend('place')
                  ? `${findDividend('place')!.currency}${findDividend(
                      'place'
                    )!.dividend.toFixed(2)}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Trifecta dividend column header slot kept for visual parity; will display below */}
        <div className="text-xs text-gray-600">Trifecta</div>
        <div className="text-sm font-bold text-gray-900 justify-self-end text-right font-tnum">
          {findDividend('trifecta')
            ? `${findDividend('trifecta')!.currency}${findDividend(
                'trifecta'
              )!.dividend.toFixed(2)}`
            : '—'}
        </div>

        {/* Win row */}
        <div className="text-xs text-gray-600">Win</div>
        <div className="text-sm font-bold text-gray-900">
          {poolData && poolData.winPoolTotal
            ? `$${formatPoolAmount(poolData.winPoolTotal)}`
            : '—'}
        </div>
        <div className="text-xs text-gray-600">Quinella (pool)</div>
        <div className="text-sm font-bold text-gray-900">
          {poolData && poolData.quinellaPoolTotal
            ? `$${formatPoolAmount(poolData.quinellaPoolTotal)}`
            : '—'}
        </div>

        {/* Place row */}
        <div className="text-xs text-gray-600">Place</div>
        <div className="text-sm font-bold text-gray-900">
          {poolData && poolData.placePoolTotal
            ? `$${formatPoolAmount(poolData.placePoolTotal)}`
            : '—'}
        </div>
        <div className="text-xs text-gray-600">Exacta (pool)</div>
        <div className="text-sm font-bold text-gray-900">
          {poolData && poolData.exactaPoolTotal
            ? `$${formatPoolAmount(poolData.exactaPoolTotal)}`
            : '—'}
        </div>

        {/* Updated row to span all columns */}
        <div className="col-span-4 mt-2 text-xs text-gray-400">
          {poolData && (
            <span>
              Updated:{' '}
              {new Date(poolData.lastUpdated).toLocaleTimeString('en-US', {
                hour12: true,
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default PoolsResultsGrid
