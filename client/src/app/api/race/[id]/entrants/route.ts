import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Entrant } from '@/types/meetings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raceId } = await params;
    
    if (!raceId) {
      return NextResponse.json({ error: 'Race ID is required' }, { status: 400 });
    }

    const entrantsData = await getEntrantsData(raceId);
    
    if (!entrantsData) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    // Set cache headers for optimal performance
    const response = NextResponse.json(entrantsData);
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return response;
  } catch (error) {
    console.error('API Error fetching entrants data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getEntrantsData(raceId: string): Promise<{
  entrants: Entrant[];
  dataFreshness: {
    entrantsDataAge: number;
  };
} | null> {
  try {
    const { databases } = await createServerClient();
    
    // First get race $id from raceId
    const raceQuery = await databases.listDocuments(
      'raceday-db', 
      'races',
      [Query.equal('raceId', raceId), Query.limit(1)]
    );

    if (!raceQuery.documents.length) {
      return null;
    }

    const raceData = raceQuery.documents[0];
    
    // Fetch entrants for this race
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

    const entrants: Entrant[] = entrantsQuery.documents.map((doc) => {
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
        // Basic entrants data - no historical data yet
        oddsHistory: [],
      };
    });

    return {
      entrants,
      dataFreshness: {
        entrantsDataAge,
      },
    };
  } catch (error) {
    console.error('Error fetching entrants data:', error);
    return null;
  }
}