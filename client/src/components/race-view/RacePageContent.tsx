'use client'

import { useRace } from '@/contexts/RaceContext'
import { RaceDataHeader } from '@/components/race-view/RaceDataHeader'
import { EnhancedEntrantsGrid } from '@/components/race-view/EnhancedEntrantsGrid'
import { RaceFooter } from '@/components/race-view/RaceFooter'
import { useRacePageRealtime } from '@/hooks/useRacePageRealtime'
import type { RaceStatus } from '@/types/racePools'

export function RacePageContent() {
  const { raceData, isLoading, error } = useRace()

  // Unified real-time subscription for all race page data
  const realtimeData = useRacePageRealtime({
    raceId: raceData?.race?.raceId || '',
    initialRace: raceData?.race || null,
    initialEntrants: raceData?.entrants || [],
    initialMeeting: raceData?.meeting || null,
    initialNavigationData: raceData?.navigationData || null,
  })

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

  // Use real-time data from unified subscription
  const currentRace = realtimeData.race || raceData.race
  const currentEntrants = realtimeData.entrants || raceData.entrants || []
  const currentMeeting = realtimeData.meeting || raceData.meeting
  const currentPoolData = realtimeData.poolData
  
  // Build results data from persistent race data or real-time updates
  // Allow interim results to display even without dividends data
  const currentResultsData = realtimeData.resultsData || 
    (currentRace.resultsAvailable && currentRace.resultsData ? {
      raceId: currentRace.raceId,
      results: currentRace.resultsData,
      dividends: currentRace.dividendsData || [], // Dividends optional for interim results
      // Parse fixedOddsData from race data (critical for win/place display)
      fixedOddsData: currentRace.fixedOddsData 
        ? (typeof currentRace.fixedOddsData === 'string' 
            ? JSON.parse(currentRace.fixedOddsData) 
            : currentRace.fixedOddsData)
        : {},
      status: currentRace.resultStatus || 'interim', // Default to interim for early results
      photoFinish: currentRace.photoFinish || false,
      stewardsInquiry: currentRace.stewardsInquiry || false,
      protestLodged: currentRace.protestLodged || false,
      resultTime: currentRace.resultTime || new Date().toISOString()
    } : undefined)

  // CRITICAL DEBUG: Log results data flow to UI
  if (process.env.NODE_ENV === 'development') {
    console.log('🏆 RACE PAGE CONTENT - Results Data Analysis:', {
      raceId: currentRace.raceId,
      raceStatus: currentRace.status,
      raceResultStatus: currentRace.resultStatus,
      raceResultsAvailable: currentRace.resultsAvailable,
      hasRaceResultsData: !!currentRace.resultsData,
      hasRealtimeResultsData: !!realtimeData.resultsData,
      finalResultsData: !!currentResultsData,
      realtimeLastUpdate: realtimeData.lastResultsUpdate,
      resultDataSource: realtimeData.resultsData ? 'REALTIME' : currentRace.resultsAvailable ? 'PERSISTENT' : 'NONE'
    });
  }

  // Safely cast race status with fallback - case insensitive
  const validStatuses: RaceStatus[] = [
    'open',
    'closed',
    'interim',
    'final',
    'abandoned',
    'postponed',
  ]
  const normalizedStatus = currentRace.status?.toLowerCase() as RaceStatus
  const raceStatus: RaceStatus = validStatuses.includes(normalizedStatus)
    ? normalizedStatus
    : 'open'

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

      {/* Consolidated Header - Single unified header component with real-time data */}
      <header className="race-layout-header">
        <RaceDataHeader 
          race={currentRace}
          entrants={currentEntrants}
          meeting={currentMeeting}
          navigationData={realtimeData.navigationData}
          connectionHealth={realtimeData.getConnectionHealth()}
          lastUpdate={realtimeData.lastRaceUpdate}
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

      {/* Body - Enhanced entrants grid with real-time data */}
      <main className="race-layout-content" role="main">
        <EnhancedEntrantsGrid
          initialEntrants={currentEntrants}
          raceId={currentRace.$id}
          raceStartTime={currentRace.startTime}
          dataFreshness={dataFreshness}
          enableMoneyFlowTimeline={true}
          enableJockeySilks={true}
          className="h-full"
          realtimeEntrants={currentEntrants}
          lastUpdate={realtimeData.lastEntrantsUpdate || realtimeData.lastUpdate}
          poolData={currentPoolData}
        />
      </main>

      {/* Footer - Enhanced with real-time data */}
      <footer className="race-layout-footer">
        <RaceFooter
          raceId={currentRace.raceId}
          raceStartTime={currentRace.startTime}
          raceStatus={raceStatus}
          poolData={currentPoolData || undefined}
          resultsData={currentResultsData || undefined}
          entrants={currentEntrants}
          showCountdown={true}
          showResults={true}
          lastPoolUpdate={realtimeData.lastPoolUpdate}
          lastResultsUpdate={realtimeData.lastResultsUpdate}
          connectionHealth={realtimeData.getConnectionHealth()}
          race={currentRace}
        />
      </footer>

      <style jsx>{`
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
    </div>
  )
}
