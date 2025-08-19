'use client';

import { useRace } from '@/contexts/RaceContext';
import { NavigationHeader } from '@/components/race-view/NavigationHeader';
import { RaceDataHeader } from '@/components/race-view/RaceDataHeader';
import { EntrantsGrid } from '@/components/race-view/EntrantsGrid';
import { EnhancedEntrantsGrid } from '@/components/race-view/EnhancedEntrantsGrid';
import { RaceFooter } from '@/components/race-view/RaceFooter';
import { useRacePoolData } from '@/hooks/useRacePoolData';
import type { RaceStatus } from '@/types/racePools';

export function RacePageContent() {
  const { raceData, isLoading, error } = useRace();
  
  // Get real-time pool data
  const { poolData, isLoading: poolLoading, error: poolError } = useRacePoolData(
    raceData?.race?.raceId || ''
  );

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
    );
  }

  const { race, entrants, navigationData, dataFreshness } = raceData;

  // Feature flag for enhanced interface (can be controlled via env var or user preference)
  const useEnhancedInterface = process.env.NEXT_PUBLIC_USE_ENHANCED_INTERFACE === 'true' || true; // Default to true for demo
  
  // Use latest race data from context - this ensures real-time updates
  const currentRace = raceData.race;
  
  // Mock race status and pool data for enhanced components
  // Safely cast race status with fallback - case insensitive
  const validStatuses: RaceStatus[] = ['open', 'closed', 'interim', 'final', 'abandoned', 'postponed'];
  const normalizedStatus = currentRace.status?.toLowerCase() as RaceStatus;
  const raceStatus: RaceStatus = validStatuses.includes(normalizedStatus) 
    ? normalizedStatus 
    : 'open';
  
  // Debug logging for race status
  if (!validStatuses.includes(normalizedStatus)) {
    console.log(`Race ${currentRace.raceId} has status: "${currentRace.status}". Using fallback: "open"`);
  }
  
  // Pool data error handling
  if (poolError) {
    console.warn('Pool data error:', poolError);
  }

  return (
    <div className="race-page-layout">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex items-center space-x-3">
            <svg className="animate-spin w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            <span className="text-gray-700 font-medium">Loading race data...</span>
          </div>
        </div>
      )}

      {/* Navigation Header - Fixed height */}
      <header className="race-layout-navigation">
        <NavigationHeader 
          navigationData={navigationData}
          currentRaceId={currentRace.raceId}
        />
      </header>

      {/* Race Data Header - Fixed height */}
      <header className="race-layout-header">
        <RaceDataHeader />
      </header>

      {/* Error Message */}
      {error && (
        <div className="race-layout-error">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
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

      {/* Main Content Area - Fills remaining space */}
      <main className="race-layout-content" role="main">
        {/* Enhanced or Original Entrants Grid */}
        {useEnhancedInterface ? (
          <EnhancedEntrantsGrid 
            initialEntrants={entrants} 
            raceId={currentRace.$id}
            raceStartTime={currentRace.startTime}
            dataFreshness={dataFreshness}
            enableMoneyFlowTimeline={true}
            enableJockeySilks={true}
            className="h-full"
          />
        ) : (
          <EntrantsGrid 
            initialEntrants={entrants} 
            raceId={race.$id}
            dataFreshness={dataFreshness}
          />
        )}
      </main>

      {/* Enhanced Race Footer - Fixed height */}
      {useEnhancedInterface && (
        <footer className="race-layout-footer">
          <RaceFooter 
            raceId={currentRace.raceId}
            raceStartTime={currentRace.startTime}
            raceStatus={raceStatus}
            poolData={poolData || undefined}
            showCountdown={true}
            showPoolBreakdown={true}
            showResults={false}
          />
        </footer>
      )}

      <style jsx>{`
        .race-page-layout {
          display: grid;
          grid-template-rows: auto auto 1fr auto;
          grid-template-areas:
            "navigation"
            "header"
            "content"
            "footer";
          height: 100vh;
          width: 100vw;
          gap: 1rem;
          padding: 1rem;
          background-color: #f8fafc;
          box-sizing: border-box;
        }

        .race-layout-navigation {
          grid-area: navigation;
          min-height: 80px;
          max-height: 120px;
          overflow: visible;
        }

        .race-layout-header {
          grid-area: header;
          min-height: 120px;
          max-height: 200px;
          overflow: visible;
        }

        .race-layout-content {
          grid-area: content;
          min-height: 0;
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
            gap: 0.75rem;
            padding: 0.75rem;
          }
          
          .race-layout-navigation {
            min-height: 60px;
            max-height: 100px;
          }
          
          .race-layout-header {
            min-height: 100px;
            max-height: 160px;
          }
          
          .race-layout-footer {
            min-height: 140px;
            max-height: 200px;
          }
        }

        @media (max-width: 480px) {
          .race-page-layout {
            gap: 0.5rem;
            padding: 0.5rem;
          }
        }

        @media (max-height: 600px) {
          .race-layout-navigation {
            min-height: 50px;
            max-height: 80px;
          }
          
          .race-layout-header {
            min-height: 80px;
            max-height: 120px;
          }
          
          .race-layout-footer {
            min-height: 120px;
            max-height: 160px;
          }
        }
      `}</style>
    </div>
  );
}