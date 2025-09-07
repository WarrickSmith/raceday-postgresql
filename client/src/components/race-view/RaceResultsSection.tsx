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
  
  // CRITICAL DEBUG: Log what results data is received by the component
  if (process.env.NODE_ENV === 'development') {
    console.log('🏆 RACE RESULTS SECTION - Received Props:', {
      hasResultsData: !!resultsData,
      resultsCount: resultsData?.results?.length || 0,
      dividendsCount: resultsData?.dividends?.length || 0,
      status: resultsData?.status,
      resultTime: resultsData?.resultTime,
      lastUpdate: lastUpdate?.toISOString(),
      entrantsCount: entrants.length
    });
  }
  
  // Helper function to format runner names to proper case
  const formatRunnerName = (name: string) => {
    return name
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  // Enhanced helper function to extract runner number from various API field formats
  const getRunnerNumber = (result: any): number | undefined => {
    return result.runner_number || result.runnerNumber || result.number || result.no;
  }

  // Enhanced helper function to extract runner name from various API field formats
  const getRunnerName = (result: any): string => {
    return result.name || result.runnerName || result.horse_name || result.horseName || '';
  }

  // Helper function to determine if results are complete (final vs interim)
  const areResultsComplete = (): boolean => {
    if (!resultsData) return false;
    
    // Check if status explicitly indicates final results
    if (resultsData.status === 'final') return true;
    if (resultsData.status === 'interim') return false;
    
    // Fall back to checking if dividends are available (indicates final results)
    return resultsData.dividends && resultsData.dividends.length > 0;
  }

  // Status indicator for result type
  const getResultStatusIndicator = () => {
    if (!resultsData) return '';
    
    const isComplete = areResultsComplete();
    if (isComplete) {
      return <span className="ml-2 text-xs text-green-600 font-semibold">FINAL</span>;
    } else {
      return <span className="ml-2 text-xs text-yellow-600 font-semibold">INTERIM</span>;
    }
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

  // Helper function to get fixed odds for a specific position and bet type
  const getFixedOdds = (position: number, type: 'win' | 'place'): string => {
    if (!resultsData || !resultsData.results || resultsData.results.length === 0) {
      return '—'
    }
    
    if (!resultsData.results[position - 1] || !resultsData.fixedOddsData) {
      return '—'
    }

    const result = resultsData.results[position - 1]
    const runnerNumber = getRunnerNumber(result)?.toString()
    
    if (!runnerNumber || !resultsData.fixedOddsData[runnerNumber]) {
      return '—'
    }

    const fixedOdds = resultsData.fixedOddsData[runnerNumber]
    const oddsValue = type === 'win' ? fixedOdds.fixed_win : fixedOdds.fixed_place
    
    if (typeof oddsValue === 'number' && oddsValue > 0) {
      // Fixed odds data is already in dollar format - no conversion needed
      return `$${oddsValue.toFixed(2)}`;
    }

    return '—'
  }


  return (
    <div className={`${className}`}>
      <div className="flex items-center mb-1">
        <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold">
          Results
        </div>
        {getResultStatusIndicator()}
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
            {resultsData?.results[0] ? getRunnerNumber(resultsData.results[0]) || '—' : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[0]
              ? formatRunnerName(getRunnerName(resultsData.results[0]))
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {getFixedOdds(1, 'win')}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {getFixedOdds(1, 'place')}
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
            {resultsData?.results[1] ? getRunnerNumber(resultsData.results[1]) || '—' : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[1]
              ? formatRunnerName(getRunnerName(resultsData.results[1]))
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {getFixedOdds(2, 'place')}
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
            {resultsData?.results[2] ? getRunnerNumber(resultsData.results[2]) || '—' : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[2]
              ? formatRunnerName(getRunnerName(resultsData.results[2]))
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold leading-none text-right font-tnum">
            {getFixedOdds(3, 'place')}
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
