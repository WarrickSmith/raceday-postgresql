'use client'

import { memo } from 'react'
import type { RaceResultsData } from '@/types/racePools'

interface RaceResultsSectionProps {
  resultsData?: RaceResultsData
  fixedOddsData?: Record<string, {fixed_win: number | null, fixed_place: number | null, runner_name: string | null, entrant_id: string | null}>
  className?: string
}

export const RaceResultsSection = memo(function RaceResultsSection({
  resultsData,
  fixedOddsData,
  className = '',
}: RaceResultsSectionProps) {
  // Helper function to format runner names to proper case
  const formatRunnerName = (name: string) => {
    return name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (!resultsData || resultsData.results.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
          Results
        </div>

        {/* Column Headers - Pos, No, Runner, Win, Place + blank columns for bet types */}
        <div className="grid grid-cols-8 gap-2 mb-2 text-sm">
          <div className="col-span-1 text-blue-500 font-semibold">Pos</div>
          <div className="col-span-1 text-blue-500 font-semibold">No</div>
          <div className="col-span-2 text-blue-500 font-semibold">Runner</div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">Win</div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">Place</div>
          <div className="col-span-1"></div> {/* Blank header for bet type labels */}
          <div className="col-span-1"></div> {/* Blank header for bet type values */}
        </div>

        {/* Results Data Rows - Fallback */}
        <div className="space-y-1">
          {/* Row 1: 1st position + Trifecta */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">1st</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">Trifecta</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
          
          {/* Row 2: 2nd position + Quinella */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">2nd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right"></div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">Quinella</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
          
          {/* Row 3: 3rd position + FirstFour */}
          <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">3rd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-2 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right"></div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">FirstFour</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to find dividend by poolType - handles NZTAB product_name format
  const findDividend = (type: string) =>
    resultsData?.dividends.find(
      (d) => {
        // Handle different possible field names from NZTAB API
        const poolTypeField = d.poolType || d.product_name || d.product_type || d.pool_type || d.type;
        if (!poolTypeField) return false;
        
        const fieldLower = poolTypeField.toLowerCase();
        const typeLower = type.toLowerCase();
        
        // Handle NZTAB product_name format mappings
        const nztabMappings: Record<string, string[]> = {
          'win': ['pool win', 'win'],
          'place': ['pool place', 'place'],
          'quinella': ['pool quinella', 'quinella'],
          'trifecta': ['pool trifecta', 'trifecta'],
          'first4': ['pool first4', 'first4', 'first 4', 'firstfour', 'first four'],
          'firstfour': ['pool first4', 'first4', 'first 4', 'firstfour', 'first four']
        };
        
        // Check if the field matches any of the expected formats for this type
        const expectedFormats = nztabMappings[typeLower] || [typeLower];
        return expectedFormats.some((format: string) => fieldLower === format);
      }
    )

  // Helper function to find place dividend for a specific runner number
  const findPlaceDividend = (runnerNumber: number) =>
    resultsData?.dividends.find(
      (d) => {
        // Check if it's a place dividend
        const poolTypeField = d.poolType || d.product_name || d.product_type || d.pool_type || d.type;
        if (!poolTypeField) return false;
        
        const fieldLower = poolTypeField.toLowerCase();
        const isPlace = fieldLower === 'pool place' || fieldLower === 'place';
        
        if (!isPlace) return false;
        
        // Check if this dividend is for the specific runner number
        return d.positions?.some(pos => pos.runner_number === runnerNumber);
      }
    )

  // Helper function to get fixed odds for a specific runner number
  const getFixedWinOdds = (runnerNumber: number): number | null => {
    if (!fixedOddsData) return null;
    const runnerOdds = fixedOddsData[runnerNumber.toString()];
    return runnerOdds?.fixed_win || null;
  }

  // Helper function to get fixed place odds for a specific runner number
  const getFixedPlaceOdds = (runnerNumber: number): number | null => {
    if (!fixedOddsData) return null;
    const runnerOdds = fixedOddsData[runnerNumber.toString()];
    return runnerOdds?.fixed_place || null;
  }

  return (
    <div className={`${className}`}>
      <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
        Results
      </div>

      {/* Column Headers - Pos, No, Runner, Win, Place + blank columns for bet types */}
      <div className="grid grid-cols-8 gap-2 mb-2 text-sm">
        <div className="col-span-1 text-blue-500 font-semibold">Pos</div>
        <div className="col-span-1 text-blue-500 font-semibold">No</div>
        <div className="col-span-2 text-blue-500 font-semibold">Runner</div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">Win</div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">Place</div>
        <div className="col-span-1"></div> {/* Blank header for bet type labels */}
        <div className="col-span-1"></div> {/* Blank header for bet type values */}
      </div>

      {/* Results Data Rows */}
      <div className="space-y-1">
        {/* Row 1: 1st position + Trifecta */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">1st</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[0] ? resultsData.results[0].runner_number || resultsData.results[0].runnerNumber : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[0] ? formatRunnerName(resultsData.results[0].name || resultsData.results[0].runnerName || '') : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {(() => {
              if (resultsData?.results[0]) {
                const runnerNumber = resultsData.results[0].runner_number || resultsData.results[0].runnerNumber;
                const fixedWinOdds = runnerNumber ? getFixedWinOdds(runnerNumber) : null;
                if (fixedWinOdds) {
                  return `$${fixedWinOdds.toFixed(2)}`;
                }
              }
              return '—';
            })()}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {(() => {
              if (resultsData?.results[0]) {
                const runnerNumber = resultsData.results[0].runner_number || resultsData.results[0].runnerNumber;
                const fixedPlaceOdds = runnerNumber ? getFixedPlaceOdds(runnerNumber) : null;
                if (fixedPlaceOdds) {
                  return `$${fixedPlaceOdds.toFixed(2)}`;
                }
              }
              return '—';
            })()}
          </div>
          <div className="col-span-1 text-blue-500 font-semibold">Trifecta</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('trifecta')
              ? `$${findDividend('trifecta')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
        
        {/* Row 2: 2nd position + Quinella */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">2nd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[1] ? resultsData.results[1].runner_number || resultsData.results[1].runnerNumber : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[1] ? formatRunnerName(resultsData.results[1].name || resultsData.results[1].runnerName || '') : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {(() => {
              if (resultsData?.results[1]) {
                const runnerNumber = resultsData.results[1].runner_number || resultsData.results[1].runnerNumber;
                const fixedPlaceOdds = runnerNumber ? getFixedPlaceOdds(runnerNumber) : null;
                if (fixedPlaceOdds) {
                  return `$${fixedPlaceOdds.toFixed(2)}`;
                }
              }
              return '—';
            })()}
          </div>
          <div className="col-span-1 text-blue-500 font-semibold">Quinella</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('quinella')
              ? `$${findDividend('quinella')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
        
        {/* Row 3: 3rd position + FirstFour */}
        <div className="grid grid-cols-8 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">3rd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[2] ? resultsData.results[2].runner_number || resultsData.results[2].runnerNumber : '—'}
          </div>
          <div className="col-span-2 text-gray-900">
            {resultsData?.results[2] ? formatRunnerName(resultsData.results[2].name || resultsData.results[2].runnerName || '') : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {(() => {
              if (resultsData?.results[2]) {
                const runnerNumber = resultsData.results[2].runner_number || resultsData.results[2].runnerNumber;
                const fixedPlaceOdds = runnerNumber ? getFixedPlaceOdds(runnerNumber) : null;
                if (fixedPlaceOdds) {
                  return `$${fixedPlaceOdds.toFixed(2)}`;
                }
              }
              return '—';
            })()}
          </div>
          <div className="col-span-1 text-blue-500 font-semibold">FirstFour</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('first4')
              ? `$${findDividend('first4')!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
      </div>
    </div>
  )
})
