import { notFound } from 'next/navigation';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting, Entrant, MoneyFlowHistory, OddsHistoryData, RaceNavigationData } from '@/types/meetings';
import { RaceHeader } from '@/components/race-view/RaceHeader';
import { EntrantsGrid } from '@/components/race-view/EntrantsGrid';


const ODDS_HISTORY_QUERY_LIMIT = 500;

interface RaceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Comprehensive data fetching with batch optimization for race ecosystem
 * Fetches race, meeting, entrants, odds-history, and money-flow-history efficiently
 */
async function getComprehensiveRaceData(raceId: string): Promise<{
  race: Race; 
  meeting: Meeting; 
  entrants: Entrant[];
  navigationData: RaceNavigationData;
  dataFreshness: {
    lastUpdated: string;
    entrantsDataAge: number;
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };

} | null> {
  try {
    const { databases } = await createServerClient();
    
    // Fetch race by raceId field (not $id)
    const raceQuery = await databases.listDocuments(
      'raceday-db', 
      'races',
      [Query.equal('raceId', raceId), Query.limit(1)]
    );

    if (!raceQuery.documents.length) {
      return null;
    }

    const raceData = raceQuery.documents[0];
    
    // Validate that meeting data is populated
    if (!raceData.meeting || !raceData.meeting.meetingId) {
      return null;
    }

    // The race already has the meeting data populated as a nested object
    // Convert to our expected format
    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId,
      raceNumber: raceData.raceNumber,
      name: raceData.name,
      startTime: raceData.startTime,
      meeting: raceData.meeting.meetingId, // Extract the meetingId for the Race interface
      status: raceData.status,
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
    };

    const meeting: Meeting = {
      $id: raceData.meeting.$id,
      $createdAt: raceData.meeting.$createdAt,
      $updatedAt: raceData.meeting.$updatedAt,
      meetingId: raceData.meeting.meetingId,
      meetingName: raceData.meeting.meetingName,
      country: raceData.meeting.country,
      raceType: raceData.meeting.raceType,
      category: raceData.meeting.category,
      date: raceData.meeting.date,
    };
    
    // Fetch entrants for this race with batch optimization
    const entrantsQuery = await databases.listDocuments(
      'raceday-db',
      'entrants',
      [
        Query.equal('race', raceData.$id),
        Query.orderAsc('runnerNumber') // Order by runner number for consistent display
      ]
    );

    // Calculate data freshness metrics
    const now = new Date();
    const entrantsDataAge = entrantsQuery.documents.length > 0 
      ? Math.round((now.getTime() - new Date(entrantsQuery.documents[0].$updatedAt).getTime()) / 1000)
      : 0;

    // Fetch money flow data for all entrants efficiently using batch query
    const entrantIds = entrantsQuery.documents.map(doc => doc.$id);
    
    // Fetch navigation data - previous, next, and next scheduled races
    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] = await Promise.all([
      // Previous scheduled race query
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.lessThan('startTime', raceData.startTime),
          Query.orderDesc('startTime'),
          Query.limit(1)
        ]
      ),
      // Next scheduled race query  
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.greaterThan('startTime', raceData.startTime),
          Query.orderAsc('startTime'),
          Query.limit(1)
        ]
      ),
      // Next scheduled race query - find race nearest to current time irrespective of current race
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.greaterThan('startTime', now.toISOString()),
          Query.orderAsc('startTime'),
          Query.limit(1)
        ]
      )
    ]);

    // Only fetch history data if there are entrants (avoid empty Query.equal calls)
    const [moneyFlowQuery, oddsHistoryQuery] = entrantIds.length > 0 ? await Promise.all([
      // Money flow history batch query
      databases.listDocuments(
        'raceday-db',
        'money-flow-history',
        [
          Query.equal('entrant', entrantIds), // Batch query for all entrants at once
          Query.orderDesc('$createdAt'),
          Query.limit(200) // Increased limit for comprehensive data
        ]
      ),
      // Odds history batch query
      databases.listDocuments(
        'raceday-db',
        'odds-history',
        [
          Query.equal('entrant', entrantIds), // Batch query for all entrants at once
          Query.orderDesc('$createdAt'),
          Query.limit(ODDS_HISTORY_QUERY_LIMIT)
        ]
      )
    ]) : [{ documents: [] }, { documents: [] }]; // Return empty results if no entrants

    // Group results by entrant for processing with enhanced data structure
    const moneyFlowByEntrant = new Map<string, MoneyFlowHistory[]>();
    moneyFlowQuery.documents.forEach(doc => {
      const moneyFlowDoc = doc as unknown as MoneyFlowHistory;
      const entrantId = moneyFlowDoc.entrant;
      if (!moneyFlowByEntrant.has(entrantId)) {
        moneyFlowByEntrant.set(entrantId, []);
      }
      moneyFlowByEntrant.get(entrantId)!.push(moneyFlowDoc);
    });

    // Group odds history results by entrant for processing and map to correct format
    const oddsHistoryByEntrant = new Map<string, OddsHistoryData[]>();
    oddsHistoryQuery.documents.forEach(doc => {
      const rawDoc = doc as unknown as { entrant: string; type: string; [key: string]: unknown };
      const entrantId = rawDoc.entrant;
      
      // Only include win odds for sparklines (pool_win preferred, fixed_win as fallback)
      if (rawDoc.type !== 'pool_win' && rawDoc.type !== 'fixed_win') {
        return;
      }
      
      // Map the database fields to the expected interface format
      const oddsHistoryDoc: OddsHistoryData = {
        $id: rawDoc.$id as string,
        $createdAt: rawDoc.$createdAt as string,
        $updatedAt: rawDoc.$updatedAt as string,
        entrant: rawDoc.entrant,
        winOdds: rawDoc.odds as number, // Map 'odds' field to 'winOdds'
        timestamp: (rawDoc.eventTimestamp || rawDoc.$createdAt) as string
      };
      
      if (!oddsHistoryByEntrant.has(entrantId)) {
        oddsHistoryByEntrant.set(entrantId, []);
      }
      oddsHistoryByEntrant.get(entrantId)!.push(oddsHistoryDoc);
    });

    // Process money flow data for trend calculation
    const moneyFlowResults = entrantIds.map(entrantId => {
      const histories = moneyFlowByEntrant.get(entrantId) || [];
      // Sort by creation date descending and take only the 2 most recent
      histories.sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
      return { documents: histories.slice(0, 2) };
    });
    const moneyFlowMap = new Map();
    
    moneyFlowResults.forEach((result, index) => {
      const entrantId = entrantIds[index];
      const histories = result.documents;
      
      if (histories.length > 0) {
        const current = histories[0];
        const previous = histories[1];
        
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        if (previous && current.holdPercentage !== previous.holdPercentage) {
          trend = current.holdPercentage > previous.holdPercentage ? 'up' : 'down';
        }
        
        moneyFlowMap.set(entrantId, {
          holdPercentage: current.holdPercentage,
          previousHoldPercentage: previous?.holdPercentage,
          moneyFlowTrend: trend
        });
      }
    });

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
      const moneyFlowData = moneyFlowMap.get(doc.$id) || {};
      
      // Get odds history data for this entrant, sorted by creation date ascending for sparkline
      const oddsHistory = oddsHistoryByEntrant.get(doc.$id) || [];
      oddsHistory.sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
      
      return {
        $id: doc.$id,
        $createdAt: doc.$createdAt,
        $updatedAt: doc.$updatedAt,
        entrantId: doc.entrantId,
        name: doc.name,
        runnerNumber: doc.runnerNumber,
        jockey: doc.jockey,
        trainerName: doc.trainerName,
        weight: doc.weight,
        silkUrl: doc.silkUrl,
        isScratched: doc.isScratched,
        race: doc.race,
        winOdds: doc.poolWinOdds || doc.fixedWinOdds,
        placeOdds: doc.poolPlaceOdds || doc.fixedPlaceOdds,
        oddsHistory: oddsHistory, // Add odds history data for sparkline
        ...moneyFlowData
      };
    });
    
    // Process navigation data with meeting information
    const navigationData: RaceNavigationData = {
      previousRace: previousRaceQuery.documents.length > 0 ? {
        raceId: previousRaceQuery.documents[0].raceId,
        name: previousRaceQuery.documents[0].name,
        startTime: previousRaceQuery.documents[0].startTime,
        meetingName: previousRaceQuery.documents[0].meeting?.meetingName || 'Unknown Meeting'
      } : null,
      nextRace: nextRaceQuery.documents.length > 0 ? {
        raceId: nextRaceQuery.documents[0].raceId,
        name: nextRaceQuery.documents[0].name,
        startTime: nextRaceQuery.documents[0].startTime,
        meetingName: nextRaceQuery.documents[0].meeting?.meetingName || 'Unknown Meeting'
      } : null,
      nextScheduledRace: nextScheduledRaceQuery.documents.length > 0 ? {
        raceId: nextScheduledRaceQuery.documents[0].raceId,
        name: nextScheduledRaceQuery.documents[0].name,
        startTime: nextScheduledRaceQuery.documents[0].startTime,
        meetingName: nextScheduledRaceQuery.documents[0].meeting?.meetingName || 'Unknown Meeting'
      } : null
    };

    // Calculate comprehensive data freshness metrics
    const dataFreshness = {
      lastUpdated: now.toISOString(),
      entrantsDataAge,
      oddsHistoryCount: oddsHistoryQuery.documents.length,
      moneyFlowHistoryCount: moneyFlowQuery.documents.length
    };

    // Note: Autonomous server-side polling now handles all data updates
    // No client-side polling coordination needed

    return { 
      race, 
      meeting, 
      entrants, 
      navigationData,
      dataFreshness,

    };
  } catch (error) {
    console.error('Error fetching race details:', error);
    return null;
  }
}

export default async function RaceDetailPage({ params }: RaceDetailPageProps) {
  const { id } = await params;
  const raceData = await getComprehensiveRaceData(id);
  
  if (!raceData) {
    notFound();
  }

  const { race, meeting, entrants, navigationData, dataFreshness } = raceData;

  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className="max-w-4xl mx-auto">
        {/* Race Header */}
        <RaceHeader 
          initialRace={race} 
          meeting={meeting} 
          navigationData={navigationData}
        />

        {/* Entrants Grid with comprehensive real-time data */}
        <EntrantsGrid 
          initialEntrants={entrants} 
          raceId={race.$id}
          dataFreshness={dataFreshness}
        />
      </div>
    </main>
  );
}