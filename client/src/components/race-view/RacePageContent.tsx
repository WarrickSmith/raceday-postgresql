'use client';

import { useRace } from '@/contexts/RaceContext';
import { NavigationHeader } from '@/components/race-view/NavigationHeader';
import { RaceDataHeader } from '@/components/race-view/RaceDataHeader';
import { EntrantsGrid } from '@/components/race-view/EntrantsGrid';
import { EnhancedEntrantsGrid } from '@/components/race-view/EnhancedEntrantsGrid';
import { RaceFooter } from '@/components/race-view/RaceFooter';
import type { RaceStatus } from '@/types/racePools';

export function RacePageContent() {
  const { raceData, isLoading, error } = useRace();

  if (!raceData) {
    return (
      <main className="container mx-auto px-4 py-8" role="main">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-8">
            <p className="text-gray-600">Loading race data...</p>
          </div>
        </div>
      </main>
    );
  }

  const { race, meeting, entrants, navigationData, dataFreshness } = raceData;

  // Feature flag for enhanced interface (can be controlled via env var or user preference)
  const useEnhancedInterface = process.env.NEXT_PUBLIC_USE_ENHANCED_INTERFACE === 'true' || true; // Default to true for demo
  
  // Mock race status and pool data for enhanced components
  // Safely cast race status with fallback
  const validStatuses: RaceStatus[] = ['open', 'closed', 'interim', 'final', 'abandoned', 'postponed'];
  const raceStatus: RaceStatus = validStatuses.includes(race.status as RaceStatus) 
    ? race.status as RaceStatus 
    : 'open';
  
  // Debug logging for race status
  if (!validStatuses.includes(race.status as RaceStatus)) {
    console.log(`Race ${race.raceId} has status: "${race.status}". Using fallback: "open"`);
  }
  
  // Mock pool data (in real implementation, this would come from the database)
  const mockPoolData = {
    $id: race.$id,
    $createdAt: race.$createdAt,
    $updatedAt: race.$updatedAt,
    raceId: race.raceId,
    winPoolTotal: 45000,
    placePoolTotal: 23000,
    quinellaPoolTotal: 9000,
    trifectaPoolTotal: 15000,
    exactaPoolTotal: 7000,
    first4PoolTotal: 3000,
    totalRacePool: 102000,
    currency: '$',
    lastUpdated: new Date().toISOString(),
    isLive: true
  };

  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className={useEnhancedInterface ? "max-w-7xl mx-auto" : "max-w-4xl mx-auto"}>
        
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

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
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
        )}

        {/* Navigation Header - Sticky, doesn't change */}
        <NavigationHeader 
          navigationData={navigationData}
          currentRaceId={race.raceId}
        />

        {/* Race Data Header - Updates from context */}
        <RaceDataHeader />

        {/* Enhanced or Original Entrants Grid */}
        {useEnhancedInterface ? (
          <>
            <EnhancedEntrantsGrid 
              initialEntrants={entrants} 
              raceId={race.$id}
              raceStartTime={race.startTime}
              dataFreshness={dataFreshness}
              enableMoneyFlowTimeline={true}
              enableJockeySilks={true}
              stickyHeader={true}
              className="mb-6"
            />
            
            {/* Enhanced Race Footer */}
            <RaceFooter 
              raceId={race.raceId}
              raceStartTime={race.startTime}
              raceStatus={raceStatus}
              poolData={mockPoolData}
              showCountdown={true}
              showPoolBreakdown={true}
              showResults={false}
            />
          </>
        ) : (
          <EntrantsGrid 
            initialEntrants={entrants} 
            raceId={race.$id}
            dataFreshness={dataFreshness}
          />
        )}
      </div>
    </main>
  );
}