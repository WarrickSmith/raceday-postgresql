'use client'

import { memo } from 'react'
import type { RaceResultsData } from '@/types/racePools'

interface RaceResultsSectionProps {
  resultsData?: RaceResultsData
  className?: string
  lastUpdate?: Date | null
  // Add entrants data to lookup actual odds for finishing runners
  entrants?: Array<{
    $id: string
    runnerNumber: number
    name: string
    winOdds?: number
    placeOdds?: number
  }>
}

export const RaceResultsSection = memo(function RaceResultsSection({
  resultsData,
  className = '',
  lastUpdate,
  entrants = [],
}: RaceResultsSectionProps) {
  // Helper function to format runner names to proper case
  const formatRunnerName = (name: string) => {
    return name
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (!resultsData || resultsData.results.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
          Results
        </div>

        {/* Column Headers - Pos, No, Runner, Win, Place + blank columns for bet types */}
        <div className="grid grid-cols-8 gap-2 mb-1 text-sm">
          <div className="col-span-1 text-blue-500 font-semibold">Pos</div>
          <div className="col-span-1 text-blue-500 font-semibold">No</div>
          <div className="col-span-2 text-blue-500 font-semibold">Runner</div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">
            Win
          </div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">
            Place
          </div>
          <div className="col-span-1"></div>{' '}
          {/* Blank header for bet type labels */}
          <div className="col-span-1"></div>{' '}
          {/* Blank header for bet type values */}
        </div>

        {/* Results Data Rows - Fallback */}
        <div className="space-y-1">
          {/* Row 1: 1st position + Quinella */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">1st</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900">—</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
            <div className="col-span-1 text-gray-600">Quinella</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
          </div>

          {/* Row 2: 2nd position + Trifecta */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">2nd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900">—</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
            <div className="col-span-1 text-gray-600">Trifecta</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
          </div>

          {/* Row 3: 3rd position + FirstFour */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">3rd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900">—</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
            <div className="col-span-1 text-gray-600">FirstFour</div>
            <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
              —
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to get win/place odds for a specific runner number from entrants data
  const getRunnerOdds = (runnerNumber: number, oddsType: 'win' | 'place') => {
    const entrant = entrants.find(e => e.runnerNumber === runnerNumber)
    if (!entrant) return null
    
    const odds = oddsType === 'win' ? entrant.winOdds : entrant.placeOdds
    return odds || null
  }

  // Helper function to find dividend by poolType - handles NZTAB product_name format
  const findDividend = (type: string) => {
    return resultsData?.dividends.find((d) => {
      // Handle different possible field names from NZTAB API
      const poolTypeField =
        d.poolType || d.product_name || d.product_type || d.pool_type || d.type
      if (!poolTypeField) return false

      const fieldLower = poolTypeField.toLowerCase()
      const typeLower = type.toLowerCase()

      // Handle NZTAB product_name format mappings
      const nztabMappings: Record<string, string[]> = {
        win: ['pool win', 'win'],
        place: ['pool place', 'place'],
        quinella: ['pool quinella', 'quinella'],
        trifecta: ['pool trifecta', 'trifecta'],
        first4: ['pool first4', 'first4', 'first 4', 'firstfour', 'first four'],
        firstfour: [
          'pool first4',
          'first4',
          'first 4',
          'firstfour',
          'first four',
        ],
      }

      // Check if the field matches any of the expected formats for this type
      const expectedFormats = nztabMappings[typeLower] || [typeLower]
      return expectedFormats.some((format: string) => fieldLower === format)
    })
  }


  return (
    <div className={`${className}`}>
      <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
        Results
      </div>

      {/* Column Headers - Pos, No, Runner, Win, Place + blank columns for bet types */}
      <div className="grid grid-cols-8 gap-2 mb-1 text-sm">
        <div className="col-span-1 text-blue-500 font-semibold">Pos</div>
        <div className="col-span-1 text-blue-500 font-semibold">No</div>
        <div className="col-span-2 text-blue-500 font-semibold">Runner</div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">
          Win
        </div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">
          Place
        </div>
        <div className="col-span-1"></div>{' '}
        {/* Blank header for bet type labels */}
        <div className="col-span-1"></div>{' '}
        {/* Blank header for bet type values */}
      </div>

      {/* Results Data Rows */}
      <div className="space-y-1">
        {/* Row 1: 1st position + Quinella */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">1st</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[0]
              ? resultsData.results[0].runner_number ||
                resultsData.results[0].runnerNumber
              : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[0]
              ? formatRunnerName(
                  resultsData.results[0].name ||
                    resultsData.results[0].runnerName ||
                    ''
                )
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {(() => {
              if (resultsData?.results[0]) {
                const runnerNumber =
                  resultsData.results[0].runner_number ||
                  resultsData.results[0].runnerNumber
                const winOdds = runnerNumber ? getRunnerOdds(runnerNumber, 'win') : null
                if (winOdds) {
                  return `$${winOdds.toFixed(2)}`
                }
              }
              return '—'
            })()}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {(() => {
              if (resultsData?.results[0]) {
                const runnerNumber =
                  resultsData.results[0].runner_number ||
                  resultsData.results[0].runnerNumber
                const placeOdds = runnerNumber ? getRunnerOdds(runnerNumber, 'place') : null
                if (placeOdds) {
                  return `$${placeOdds.toFixed(2)}`
                }
              }
              return '—'
            })()}
          </div>
          <div className="col-span-1 text-gray-600">Quinella</div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {findDividend('quinella')
              ? `$${findDividend('quinella')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>

        {/* Row 2: 2nd position + Trifecta */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">2nd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[1]
              ? resultsData.results[1].runner_number ||
                resultsData.results[1].runnerNumber
              : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[1]
              ? formatRunnerName(
                  resultsData.results[1].name ||
                    resultsData.results[1].runnerName ||
                    ''
                )
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {(() => {
              if (resultsData?.results[1]) {
                const runnerNumber =
                  resultsData.results[1].runner_number ||
                  resultsData.results[1].runnerNumber
                const placeOdds = runnerNumber ? getRunnerOdds(runnerNumber, 'place') : null
                if (placeOdds) {
                  return `$${placeOdds.toFixed(2)}`
                }
              }
              return '—'
            })()}
          </div>
          <div className="col-span-1 text-gray-600">Trifecta</div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {findDividend('trifecta')
              ? `$${findDividend('trifecta')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>

        {/* Row 3: 3rd position + FirstFour */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">3rd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[2]
              ? resultsData.results[2].runner_number ||
                resultsData.results[2].runnerNumber
              : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[2]
              ? formatRunnerName(
                  resultsData.results[2].name ||
                    resultsData.results[2].runnerName ||
                    ''
                )
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {(() => {
              if (resultsData?.results[2]) {
                const runnerNumber =
                  resultsData.results[2].runner_number ||
                  resultsData.results[2].runnerNumber
                const placeOdds = runnerNumber ? getRunnerOdds(runnerNumber, 'place') : null
                if (placeOdds) {
                  return `$${placeOdds.toFixed(2)}`
                }
              }
              return '—'
            })()}
          </div>
          <div className="col-span-1 text-gray-600">FirstFour</div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {findDividend('first4')
              ? `$${findDividend('first4')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Last updated from real-time subscription */}
      {(lastUpdate || resultsData?.resultTime) && (
        <div className="mt-2 text-xs text-gray-400">
          Updated:{' '}
          {lastUpdate ? 
            lastUpdate.toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
            : resultsData?.resultTime ? 
              new Date(resultsData.resultTime).toLocaleTimeString('en-US', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit',
              })
              : '—'
          }
          {lastUpdate && (
            <span className="ml-1 text-green-500">●</span>
          )}
        </div>
      )}
    </div>
  )
})
