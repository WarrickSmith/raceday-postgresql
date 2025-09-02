'use client'

import { memo } from 'react'
import type { RaceResultsData } from '@/types/racePools'

interface RaceResultsSectionProps {
  resultsData?: RaceResultsData
  className?: string
}

export const RaceResultsSection = memo(function RaceResultsSection({
  resultsData,
  className = '',
}: RaceResultsSectionProps) {
  if (!resultsData || resultsData.results.length === 0) {
    return (
      <div className={`${className}`}>
        <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
          Results
        </div>

        {/* Column Headers - Pos, No., Results, Win, Place + blank columns for bet types */}
        <div className="grid grid-cols-7 gap-2 mb-2 text-sm">
          <div className="col-span-1 text-blue-500 font-semibold">POS</div>
          <div className="col-span-1 text-blue-500 font-semibold">NO.</div>
          <div className="col-span-1 text-blue-500 font-semibold">RESULTS</div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">WIN</div>
          <div className="col-span-1 text-blue-500 font-semibold text-right">PLACE</div>
          <div className="col-span-1"></div> {/* Blank header for bet type labels */}
          <div className="col-span-1"></div> {/* Blank header for bet type values */}
        </div>

        {/* Results Data Rows - Fallback */}
        <div className="space-y-1">
          {/* Row 1: 1st position + Trifecta */}
          <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">1st</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">Trifecta</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
          
          {/* Row 2: 2nd position + Quinella */}
          <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">2nd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right"></div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">Quinella</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
          
          {/* Row 3: 3rd position + Exacta */}
          <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
            <div className="col-span-1 text-blue-500 font-bold">3rd</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold">—</div>
            <div className="col-span-1 text-gray-900 font-bold text-right"></div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
            <div className="col-span-1 text-blue-500 font-semibold">Exacta</div>
            <div className="col-span-1 text-gray-900 font-bold text-right">—</div>
          </div>
        </div>
      </div>
    )
  }

  // Helper function to find dividend by poolType
  const findDividend = (type: string) =>
    resultsData?.dividends.find(
      (d) => d.poolType.toLowerCase() === type.toLowerCase()
    )

  return (
    <div className={`${className}`}>
      <div className="text-sm text-gray-500 uppercase tracking-wide font-semibold mb-1">
        Results
      </div>

      {/* Column Headers - Pos, No., Results, Win, Place + blank columns for bet types */}
      <div className="grid grid-cols-7 gap-2 mb-2 text-sm">
        <div className="col-span-1 text-blue-500 font-semibold">POS</div>
        <div className="col-span-1 text-blue-500 font-semibold">NO.</div>
        <div className="col-span-1 text-blue-500 font-semibold">RESULTS</div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">WIN</div>
        <div className="col-span-1 text-blue-500 font-semibold text-right">PLACE</div>
        <div className="col-span-1"></div> {/* Blank header for bet type labels */}
        <div className="col-span-1"></div> {/* Blank header for bet type values */}
      </div>

      {/* Results Data Rows */}
      <div className="space-y-1">
        {/* Row 1: 1st position + Trifecta */}
        <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">1st</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[0] ? resultsData.results[0].runnerNumber : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold uppercase">
            {resultsData?.results[0] ? resultsData.results[0].runnerName : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('win')
              ? `${findDividend('win')!.currency}${findDividend(
                  'win'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('place')
              ? `${findDividend('place')!.currency}${findDividend(
                  'place'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
          <div className="col-span-1 text-blue-500 font-semibold">Trifecta</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('trifecta')
              ? `${findDividend('trifecta')!.currency}${findDividend(
                  'trifecta'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
        
        {/* Row 2: 2nd position + Quinella */}
        <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">2nd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[1] ? resultsData.results[1].runnerNumber : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold uppercase">
            {resultsData?.results[1] ? resultsData.results[1].runnerName : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('place')
              ? `${findDividend('place')!.currency}${findDividend(
                  'place'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
          <div className="col-span-1 text-blue-500 font-semibold">Quinella</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('quinella')
              ? `${findDividend('quinella')!.currency}${findDividend(
                  'quinella'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
        
        {/* Row 3: 3rd position + Exacta */}
        <div className="grid grid-cols-7 gap-2 items-baseline text-sm">
          <div className="col-span-1 text-blue-500 font-bold">3rd</div>
          <div className="col-span-1 text-gray-900 font-bold">
            {resultsData?.results[2] ? resultsData.results[2].runnerNumber : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold uppercase">
            {resultsData?.results[2] ? resultsData.results[2].runnerName : '—'}
          </div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum"></div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">—</div>
          <div className="col-span-1 text-blue-500 font-semibold">Exacta</div>
          <div className="col-span-1 text-gray-900 font-bold text-right font-tnum">
            {findDividend('exacta')
              ? `${findDividend('exacta')!.currency}${findDividend(
                  'exacta'
                )!.dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
      </div>
    </div>
  )
})
