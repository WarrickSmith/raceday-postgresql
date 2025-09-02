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
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold text-left">
          Results
        </div>

        {/* Grid: Left column - top3; Right column - Trifecta/Quinella/Exacta */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="grid gap-2">
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">1st</div>
                <div className="text-sm font-bold">—</div>
              </div>
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">2nd</div>
                <div className="text-sm font-bold">—</div>
              </div>
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">3rd</div>
                <div className="text-sm font-bold">—</div>
              </div>
            </div>
          </div>

          <div>
            <div className="grid gap-2">
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">Trifecta</div>
                <div className="text-sm font-bold">—</div>
              </div>
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">Quinella</div>
                <div className="text-sm font-bold">—</div>
              </div>
              <div className="flex justify-between">
                <div className="text-xs text-gray-400">Exacta</div>
                <div className="text-sm font-bold">—</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${className}`}>
      <div>
        <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-semibold text-left">
          Results
        </div>

        {/* Results Status Badges */}
        <div className="flex justify-center items-center space-x-1 mb-3">
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              resultsData.status === 'final'
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {resultsData.status}
          </span>
          {resultsData.photoFinish && (
            <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-700">
              Photo
            </span>
          )}
          {resultsData.stewardsInquiry && (
            <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">
              Inquiry
            </span>
          )}
        </div>

        {/* Compact results grid aligned with Pools (4-column label/value pairs) */}
        <div className="grid grid-cols-4 gap-3 text-sm mb-3">
          {/* Row 1: 1st / value, Trifecta / value */}
          <div className="text-xs text-gray-400">1st</div>
          <div className="text-sm font-bold">
            {resultsData.results[0]
              ? `#${resultsData.results[0].runnerNumber} ${resultsData.results[0].runnerName}`
              : '—'}
          </div>
          <div className="text-xs text-gray-400">Trifecta</div>
          <div className="text-sm font-bold justify-self-end text-right font-tnum">
            {resultsData.dividends.find(
              (d) => d.poolType.toLowerCase() === 'trifecta'
            )?.dividend !== undefined
              ? `${
                  resultsData.dividends.find(
                    (d) => d.poolType.toLowerCase() === 'trifecta'
                  )!.currency
                }${resultsData.dividends
                  .find((d) => d.poolType.toLowerCase() === 'trifecta')!
                  .dividend.toFixed(2)}`
              : '—'}
          </div>

          {/* Row 2: 2nd / value, Quinella / value */}
          <div className="text-xs text-gray-400">2nd</div>
          <div className="text-sm font-bold">
            {resultsData.results[1]
              ? `#${resultsData.results[1].runnerNumber} ${resultsData.results[1].runnerName}`
              : '—'}
          </div>
          <div className="text-xs text-gray-400">Quinella</div>
          <div className="text-sm font-bold justify-self-end text-right font-tnum">
            {resultsData.dividends.find(
              (d) => d.poolType.toLowerCase() === 'quinella'
            )?.dividend !== undefined
              ? `${
                  resultsData.dividends.find(
                    (d) => d.poolType.toLowerCase() === 'quinella'
                  )!.currency
                }${resultsData.dividends
                  .find((d) => d.poolType.toLowerCase() === 'quinella')!
                  .dividend.toFixed(2)}`
              : '—'}
          </div>

          {/* Row 3: 3rd / value, Exacta / value */}
          <div className="text-xs text-gray-400">3rd</div>
          <div className="text-sm font-bold">
            {resultsData.results[2]
              ? `#${resultsData.results[2].runnerNumber} ${resultsData.results[2].runnerName}`
              : '—'}
          </div>
          <div className="text-xs text-gray-400">Exacta</div>
          <div className="text-sm font-bold justify-self-end text-right font-tnum">
            {resultsData.dividends.find(
              (d) => d.poolType.toLowerCase() === 'exacta'
            )?.dividend !== undefined
              ? `${
                  resultsData.dividends.find(
                    (d) => d.poolType.toLowerCase() === 'exacta'
                  )!.currency
                }${resultsData.dividends
                  .find((d) => d.poolType.toLowerCase() === 'exacta')!
                  .dividend.toFixed(2)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Detailed Results Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2">Pos</th>
              <th className="text-left py-2">#</th>
              <th className="text-left py-2">Runner</th>
              <th className="text-left py-2">Jockey</th>
              <th className="text-right py-2">Odds</th>
              <th className="text-right py-2">Margin</th>
            </tr>
          </thead>
          <tbody>
            {resultsData.results.slice(0, 8).map((result) => (
              <tr key={result.position} className="border-b border-gray-100">
                <td className="py-2 font-medium">{result.position}</td>
                <td className="py-2">{result.runnerNumber}</td>
                <td className="py-2">{result.runnerName}</td>
                <td className="py-2 text-gray-600">{result.jockey}</td>
                <td className="py-2 text-right font-mono">
                  {result.odds.toFixed(2)}
                </td>
                <td className="py-2 text-right">{result.margin || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dividends */}
      {resultsData.dividends.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Dividends</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {resultsData.dividends.map((dividend) => (
              <div key={dividend.poolType} className="flex justify-between">
                <span className="text-gray-600 uppercase">
                  {dividend.poolType}:
                </span>
                <span className="font-mono font-medium">
                  {dividend.currency}
                  {dividend.dividend.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})
