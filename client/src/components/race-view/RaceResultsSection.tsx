'use client';

import { memo, useState } from 'react';
import type { RaceResultsData } from '@/types/racePools';

interface RaceResultsSectionProps {
  resultsData?: RaceResultsData;
  className?: string;
  showWinPlaceSelector?: boolean;
}

export const RaceResultsSection = memo(function RaceResultsSection({ 
  resultsData,
  className = '',
  showWinPlaceSelector = true
}: RaceResultsSectionProps) {
  const [selectedView, setSelectedView] = useState<'win' | 'place'>('win');

  if (!resultsData || resultsData.results.length === 0) {
    return (
      <div className={`text-center ${className}`}>
        {/* Win/Place Selector */}
        {showWinPlaceSelector && (
          <div className="flex justify-center mb-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setSelectedView('win')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedView === 'win'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Win
              </button>
              <button
                onClick={() => setSelectedView('place')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedView === 'place'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Place
              </button>
            </div>
          </div>
        )}

        <div className="text-gray-500 py-8">
          <div className="text-lg font-medium mb-2">Results</div>
          <div className="flex justify-center space-x-8">
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">1st</div>
              <div className="text-lg font-bold">—</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">2nd</div>
              <div className="text-lg font-bold">—</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">3rd</div>
              <div className="text-lg font-bold">—</div>
            </div>
          </div>
          <div className="text-sm mt-4">Results not yet available</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      {/* Win/Place Selector */}
      {showWinPlaceSelector && (
        <div className="flex justify-center mb-4">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setSelectedView('win')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedView === 'win'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Win
            </button>
            <button
              onClick={() => setSelectedView('place')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                selectedView === 'place'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Place
            </button>
          </div>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">Race Results</h3>
        <div className="flex items-center space-x-2">
          <span className={`text-xs px-2 py-1 rounded ${
            resultsData.status === 'final' 
              ? 'bg-green-100 text-green-700' 
              : 'bg-yellow-100 text-yellow-700'
          }`}>
            {resultsData.status}
          </span>
          {resultsData.photoFinish && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
              Photo Finish
            </span>
          )}
          {resultsData.stewardsInquiry && (
            <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
              Stewards Inquiry
            </span>
          )}
        </div>
      </div>

      {/* Top 3 Results Display */}
      <div className="flex justify-center space-x-8 mb-6">
        {resultsData.results.slice(0, 3).map((result, index) => (
          <div key={result.position} className="text-center">
            <div className="text-xs text-gray-400 mb-1">
              {index + 1 === 1 ? '1st' : index + 1 === 2 ? '2nd' : '3rd'}
            </div>
            <div className="text-lg font-bold mb-1">#{result.runnerNumber}</div>
            <div className="text-sm text-gray-700">{result.runnerName}</div>
            <div className="text-xs text-gray-500">{result.jockey}</div>
          </div>
        ))}
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
                <td className="py-2 text-right font-mono">{result.odds.toFixed(2)}</td>
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
                <span className="text-gray-600 uppercase">{dividend.poolType}:</span>
                <span className="font-mono font-medium">{dividend.currency}{dividend.dividend.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});