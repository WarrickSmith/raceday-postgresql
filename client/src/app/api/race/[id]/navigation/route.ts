import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { RaceNavigationData } from '@/types/meetings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raceId } = await params;
    
    if (!raceId) {
      return NextResponse.json({ error: 'Race ID is required' }, { status: 400 });
    }

    const navigationData = await getNavigationData(raceId);
    
    if (!navigationData) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    // Set cache headers for optimal performance
    const response = NextResponse.json(navigationData);
    response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    
    return response;
  } catch (error) {
    console.error('API Error fetching navigation data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getNavigationData(raceId: string): Promise<{
  navigationData: RaceNavigationData;
} | null> {
  try {
    const { databases } = await createServerClient();
    
    // First get race data to find startTime
    const raceQuery = await databases.listDocuments(
      'raceday-db', 
      'races',
      [Query.equal('raceId', raceId), Query.limit(1)]
    );

    if (!raceQuery.documents.length) {
      return null;
    }

    const raceData = raceQuery.documents[0];
    const now = new Date();
    
    // Fetch navigation data - previous, next, and next scheduled races
    // Exclude abandoned races from all navigation queries
    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] = await Promise.all([
      // Previous scheduled race query
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.lessThan('startTime', raceData.startTime),
          Query.notEqual('status', 'Abandoned'),
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
          Query.notEqual('status', 'Abandoned'),
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
          Query.notEqual('status', 'Abandoned'),
          Query.orderAsc('startTime'),
          Query.limit(1)
        ]
      )
    ]);

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

    return { navigationData };
  } catch (error) {
    console.error('Error fetching navigation data:', error);
    return null;
  }
}