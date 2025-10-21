'use client'

import { useState } from 'react'
import { useRace } from '@/contexts/RaceContext'
import { RaceDataHeader } from '@/components/race-view/RaceDataHeader'
import { EnhancedEntrantsGrid } from '@/components/race-view/EnhancedEntrantsGrid'
import { RaceFooter } from '@/components/race-view/RaceFooter'
import { PollingMonitor } from '@/components/race-view/PollingMonitor'
import AlertsConfigModal from '@/components/alerts/AlertsConfigModal'
import type { RaceStatus } from '@/types/racePools'
import { useRacePools } from '@/hooks/useRacePools'
import { usePollingMetrics } from '@/hooks/usePollingMetrics'

export function RacePageContent() {
  const { raceData, isLoading, error, pollingState } = useRace()

  // Alerts Configuration Modal state (moved from EnhancedEntrantsGrid for performance)
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false)

  // Polling metrics for monitoring (dev feature)
  const pollingMetrics = usePollingMetrics(pollingState)

  // Check if polling monitor is enabled via environment variable
  const isPollingMonitorEnabled =
    process.env.NEXT_PUBLIC_ENABLE_POLLING_MONITOR === 'true'

  // Pools data with deduped fetch and proper abort/cleanup
  const {
    poolData,
    lastUpdate: poolLastUpdated,
  } = useRacePools(raceData?.race?.race_id, pollingState.last_updated)

  if (!raceData) {
    return (
      <div className="h-screen flex flex-col overflow-hidden">
        <main className="flex-1 px-4 py-8" role="main">
          <div className="w-full">
            <div className="text-center py-8">
              <p className="text-gray-600">Loading race data...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const { dataFreshness } = raceData

  const currentRace = raceData.race
  const currentEntrants = raceData.entrants || []
  const currentMeeting = raceData.meeting
  const navigationData = raceData.navigationData
  const currentPoolData = poolData

  // Build results data from persistent race data
  const currentResultsData =
    currentRace.results_available && currentRace.results_data
      ? {
          race_id: currentRace.race_id,
          results: currentRace.results_data,
          dividends: currentRace.dividends_data || [],
          fixed_odds_data: currentRace.fixed_odds_data
            ? typeof currentRace.fixed_odds_data === 'string'
              ? JSON.parse(currentRace.fixed_odds_data)
              : currentRace.fixed_odds_data
            : {},
          status: currentRace.result_status || 'interim',
          photo_finish: currentRace.photo_finish || false,
          stewards_inquiry: currentRace.stewards_inquiry || false,
          protest_lodged: currentRace.protest_lodged || false,
          result_time: currentRace.result_time || new Date().toISOString(),
        }
      : undefined

  // Safely cast race status with fallback - case insensitive
  const validStatuses: RaceStatus[] = [
    'open',
    'closed',
    'interim',
    'final',
    'abandoned',
    'postponed',
  ]
  const normalizedStatusRaw = currentRace.status?.toLowerCase() || 'open'
  // Map common variants to canonical keys (keep in sync with getStatusConfig)
  const variantMap: Record<string, RaceStatus> = {
    finalized: 'final',
    finished: 'final',
    complete: 'final',
    completed: 'final',
    started: 'closed',
    running: 'closed',
    cancelled: 'abandoned',
    canceled: 'abandoned',
  }
  const normalizedStatus = (variantMap[normalizedStatusRaw] || normalizedStatusRaw) as RaceStatus
  const raceStatus: RaceStatus = validStatuses.includes(normalizedStatus) ? normalizedStatus : 'open'

  return (
    <div className="race-page-layout">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
            <svg
              className="animate-spin w-5 h-5 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              ></path>
            </svg>
            <span className="text-gray-700 font-medium">
              Loading race data...
            </span>
          </div>
        </div>
      )}

      {/* Consolidated Header - Displays current race details */}
      <header className="race-layout-header">
        <RaceDataHeader
          race={currentRace}
          entrants={currentEntrants}
          meeting={currentMeeting}
          navigationData={navigationData}
          onConfigureAlerts={() => setIsAlertsModalOpen(true)}
        />
      </header>

      {/* Error Message */}
      {error && (
        <div className="race-layout-error">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Error loading race data
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Body - Enhanced entrants grid with latest fetched data */}
      <main className="race-layout-content" role="main">
        {/* Polling Monitor (Development Feature) */}
        {isPollingMonitorEnabled && (
          <div className="mb-4">
            <PollingMonitor metrics={pollingMetrics} />
          </div>
        )}

        <EnhancedEntrantsGrid
          initialEntrants={currentEntrants}
          race_id={currentRace.race_id ?? ''}
          raceStartTime={currentRace.start_time}
          dataFreshness={dataFreshness}
          enableMoneyFlowTimeline={true}
          enableJockeySilks={true}
          className="h-full"
          poolData={currentPoolData}
          moneyFlowUpdateTrigger={pollingState.last_updated?.getTime()}
          results_data={currentResultsData?.results}
          raceStatus={currentRace.status}
          result_status={currentResultsData?.status || currentRace.result_status}
        />
      </main>

      {/* Footer - Summary panels based on fetched race data */}
      <footer className="race-layout-footer">
        <RaceFooter
          raceStartTime={currentRace.start_time}
          raceStatus={
            (currentRace.status?.toLowerCase() as RaceStatus) || raceStatus
          }
          poolData={currentPoolData || undefined}
          results_data={currentResultsData || undefined}
          showCountdown={true}
          showResults={true}
          race={currentRace}
          lastPoolUpdate={poolLastUpdated}
        />
      </footer>

      <style jsx global>{`
        .race-page-layout {
          display: grid;
          grid-template-rows: auto 1fr auto;
          grid-template-areas:
            'header'
            'content'
            'footer';
          height: 100vh;
          width: 100vw;
          gap: 0.5rem;
          padding: 1rem;
          background-color: #f8fafc;
          box-sizing: border-box;
        }

        .race-layout-header {
          grid-area: header;
          min-height: 140px;
          max-height: 160px;
          overflow: visible;
        }

        .race-layout-content {
          grid-area: content;
          min-height: 300px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .race-layout-footer {
          grid-area: footer;
          min-height: 160px;
          max-height: 250px;
          overflow: visible;
        }

        .race-layout-error {
          grid-area: content;
          z-index: 10;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
          .race-page-layout {
            gap: 0.375rem;
            padding: 0.75rem;
          }

          .race-layout-header {
            min-height: 120px;
            max-height: 140px;
          }

          .race-layout-footer {
            min-height: 140px;
            max-height: 200px;
          }
        }

        @media (max-width: 480px) {
          .race-page-layout {
            gap: 0.25rem;
            padding: 0.5rem;
          }
        }

        @media (max-height: 600px) {
          .race-page-layout {
            gap: 0.25rem;
            padding: 0.5rem;
          }

          .race-layout-header {
            min-height: 100px;
            max-height: 120px;
          }

          .race-layout-content {
            min-height: 200px;
          }

          .race-layout-footer {
            min-height: 100px;
            max-height: 140px;
          }
        }

        @media (max-height: 500px) {
          .race-page-layout {
            gap: 0.125rem;
            padding: 0.25rem;
          }

          .race-layout-header {
            min-height: 80px;
            max-height: 100px;
          }

          .race-layout-content {
            min-height: 150px;
          }

          .race-layout-footer {
            min-height: 60px;
            max-height: 100px;
          }
        }
      `}</style>

      {/* Alerts Configuration Modal - Rendered at page level for performance */}
      <AlertsConfigModal
        isOpen={isAlertsModalOpen}
        onClose={() => setIsAlertsModalOpen(false)}
      />
    </div>
  )
}
