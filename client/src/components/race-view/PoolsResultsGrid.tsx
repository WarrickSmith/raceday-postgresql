import React from 'react'
import type { RacePoolData, RaceResultsData } from '@/types/racePools'

interface Props {
  poolData?: RacePoolData
  results_data?: RaceResultsData
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
  results_data,
  className = '',
}) => {
  // helpers to find dividend by poolType (handle different API field names)
  const findDividend = (type: string) =>
    results_data?.dividends.find((d) => {
      const poolTypeField =
        d.poolType || d.product_name || d.product_type || d.pool_type || d.type
      if (!poolTypeField) return false
      return poolTypeField.toString().toLowerCase() === type.toLowerCase()
    })

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

        {/* Results block (top3 + odds) - placed to the right, aligned to top */}
        <div className="col-start-3 col-span-2 row-start-1">
          <div className="grid gap-2">
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">1st</div>
              <div className="text-sm font-bold">
                {results_data && results_data.results[0]
                  ? `#${results_data.results[0].runner_number} ${results_data.results[0].runnerName}`
                  : '—'}
              </div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">2nd</div>
              <div className="text-sm font-bold">
                {results_data && results_data.results[1]
                  ? `#${results_data.results[1].runner_number} ${results_data.results[1].runnerName}`
                  : '—'}
              </div>
            </div>
            <div className="flex justify-between">
              <div className="text-xs text-gray-400">3rd</div>
              <div className="text-sm font-bold">
                {results_data && results_data.results[2]
                  ? `#${results_data.results[2].runner_number} ${results_data.results[2].runnerName}`
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

        {/* Right-side bet columns should read: Quinella, Trifecta (pool), FirstFour (pool) */}
        <div className="text-xs text-gray-600">Quinella</div>
  <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {findDividend('quinella')
            ? `${findDividend('quinella')!.currency}${findDividend(
                'quinella'
              )!.dividend.toFixed(2)}`
            : '—'}
        </div>

        {/* Win row */}
        <div className="text-xs text-gray-600">Win</div>
        <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {poolData && poolData.winPoolTotal
            ? `$${formatPoolAmount(poolData.winPoolTotal)}`
            : '—'}
        </div>
        <div className="text-xs text-gray-600">Trifecta (pool)</div>
  <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {poolData && poolData.trifectaPoolTotal
            ? `$${formatPoolAmount(poolData.trifectaPoolTotal)}`
            : '—'}
        </div>

        {/* Place row */}
        <div className="text-xs text-gray-600">Place</div>
        <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {poolData && poolData.placePoolTotal
            ? `$${formatPoolAmount(poolData.placePoolTotal)}`
            : '—'}
        </div>
        <div className="text-xs text-gray-600">Total</div>
        <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {poolData ? `$${formatPoolAmount(poolData.totalRacePool)}` : '—'}
        </div>
        <div className="text-xs text-gray-600">FirstFour (pool)</div>
  <div className="text-sm font-bold text-gray-900 leading-none justify-self-end text-right font-tnum">
          {poolData && poolData.first4PoolTotal
            ? `$${formatPoolAmount(poolData.first4PoolTotal)}`
            : '—'}
        </div>

        {/* Updated row to span all columns */}
        <div className="col-span-4 mt-2 text-xs text-gray-400">
          {poolData && (
            <span>
              Updated:{' '}
              {new Date(poolData.last_updated).toLocaleTimeString('en-US', {
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
