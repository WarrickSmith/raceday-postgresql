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
    
    // First get race data to find startTime and meeting info
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
    
    // Fetch navigation data - previous, next, and next scheduled races with meeting info
    const [previousRaceQuery, nextRaceQuery, nextScheduledRaceQuery] = await Promise.all([
      // Previous race query - chronological navigation, includes all races
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.lessThan('startTime', raceData.startTime),
          Query.orderDesc('startTime'),
          Query.limit(1)
        ]
      ),
      // Next race query - chronological navigation, includes all races
      databases.listDocuments(
        'raceday-db',
        'races',
        [
          Query.greaterThan('startTime', raceData.startTime),
          Query.orderAsc('startTime'),
          Query.limit(1)
        ]
      ),
      // Next scheduled race query - find next race from NOW, regardless of current race (for "Next Scheduled" button)
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

    // Helper function to get meeting name for a race
    const getMeetingName = async (race: any): Promise<string> => {
      try {
        const meetingQuery = await databases.listDocuments(
          'raceday-db',
          'meetings',
          [Query.equal('$id', race.meeting), Query.limit(1)]
        );
        return meetingQuery.documents[0]?.meetingName || 'Unknown Meeting';
      } catch {
        return 'Unknown Meeting';
      }
    };

    // Process navigation data with meeting information
    const [previousMeetingName, nextMeetingName, nextScheduledMeetingName] = await Promise.all([
      previousRaceQuery.documents.length > 0 ? getMeetingName(previousRaceQuery.documents[0]) : Promise.resolve(''),
      nextRaceQuery.documents.length > 0 ? getMeetingName(nextRaceQuery.documents[0]) : Promise.resolve(''),
      nextScheduledRaceQuery.documents.length > 0 ? getMeetingName(nextScheduledRaceQuery.documents[0]) : Promise.resolve('')
    ]);

    const navigationData: RaceNavigationData = {
      previousRace: previousRaceQuery.documents.length > 0 ? {
        raceId: previousRaceQuery.documents[0].raceId,
        name: previousRaceQuery.documents[0].name,
        startTime: previousRaceQuery.documents[0].startTime,
        meetingName: previousMeetingName
      } : null,
      nextRace: nextRaceQuery.documents.length > 0 ? {
        raceId: nextRaceQuery.documents[0].raceId,
        name: nextRaceQuery.documents[0].name,
        startTime: nextRaceQuery.documents[0].startTime,
        meetingName: nextMeetingName
      } : null,
      nextScheduledRace: nextScheduledRaceQuery.documents.length > 0 ? {
        raceId: nextScheduledRaceQuery.documents[0].raceId,
        name: nextScheduledRaceQuery.documents[0].name,
        startTime: nextScheduledRaceQuery.documents[0].startTime,
        meetingName: nextScheduledMeetingName
      } : null
    };

    return { navigationData };
  } catch (error) {
    console.error('Error fetching navigation data:', error);
    return null;
  }
}