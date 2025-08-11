import { notFound } from 'next/navigation';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting, Entrant, MoneyFlowHistory, OddsHistoryData } from '@/types/meetings';
import { RaceHeader } from '@/components/race-view/RaceHeader';
import { EntrantsGrid } from '@/components/race-view/EntrantsGrid';

interface RaceDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

async function getRaceById(raceId: string): Promise<{ race: Race; meeting: Meeting; entrants: Entrant[] } | null> {
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
    
    // Fetch entrants for this race
    const entrantsQuery = await databases.listDocuments(
      'raceday-db',
      'entrants',
      [Query.equal('race', raceData.$id)]
    );

    // Fetch money flow data for all entrants efficiently using batch query
    const entrantIds = entrantsQuery.documents.map(doc => doc.$id);
    
    // Use a single query to get all money flow history for these entrants
    const moneyFlowQuery = await databases.listDocuments(
      'raceday-db',
      'money-flow-history',
      [
        Query.equal('entrant', entrantIds), // Batch query for all entrants at once
        Query.orderDesc('$createdAt'),
        Query.limit(100) // Reasonable limit for all entrant histories combined
      ]
    );

    // Group results by entrant for processing
    const moneyFlowByEntrant = new Map<string, MoneyFlowHistory[]>();
    moneyFlowQuery.documents.forEach(doc => {
      const moneyFlowDoc = doc as unknown as MoneyFlowHistory;
      const entrantId = moneyFlowDoc.entrant;
      if (!moneyFlowByEntrant.has(entrantId)) {
        moneyFlowByEntrant.set(entrantId, []);
      }
      moneyFlowByEntrant.get(entrantId)!.push(moneyFlowDoc);
    });

    // Fetch odds history data for all entrants efficiently using batch query
    const oddsHistoryQuery = await databases.listDocuments(
      'raceday-db',
      'odds-history',
      [
        Query.equal('entrant', entrantIds), // Batch query for all entrants at once
        Query.orderDesc('$createdAt'),
        Query.limit(500) // Reasonable limit for sparkline data (all entrant histories combined)
      ]
    );

    // Group odds history results by entrant for processing
    const oddsHistoryByEntrant = new Map<string, OddsHistoryData[]>();
    oddsHistoryQuery.documents.forEach(doc => {
      const oddsHistoryDoc = doc as unknown as OddsHistoryData;
      const entrantId = oddsHistoryDoc.entrant;
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
        winOdds: doc.winOdds,
        placeOdds: doc.placeOdds,
        oddsHistory: oddsHistory, // Add odds history data for sparkline
        ...moneyFlowData
      };
    });
    
    return { race, meeting, entrants };
  } catch (error) {
    console.error('Error fetching race details:', error);
    return null;
  }
}

export default async function RaceDetailPage({ params }: RaceDetailPageProps) {
  const { id } = await params;
  const raceData = await getRaceById(id);
  
  if (!raceData) {
    notFound();
  }

  const { race, meeting, entrants } = raceData;

  return (
    <main className="container mx-auto px-4 py-8" role="main">
      <div className="max-w-4xl mx-auto">
        {/* Race Header */}
        <RaceHeader initialRace={race} meeting={meeting} />

        {/* Entrants Grid */}
        <EntrantsGrid initialEntrants={entrants} raceId={race.$id} />
      </div>
    </main>
  );
}