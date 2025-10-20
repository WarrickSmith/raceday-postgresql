import { NextRequest } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { jsonWithCompression } from '@/lib/http/compression';

export async function GET(request: NextRequest) {
  try {
    const { databases } = await createServerClient();
    const now = new Date();
    
    // Find the next scheduled race irrespective of current race context
    // Exclude abandoned races from next race navigation
    const nextScheduledRaceQuery = await databases.listDocuments(
      'raceday-db',
      'races',
      [
        Query.greaterThan('start_time', now.toISOString()),
        Query.notEqual('status', 'Abandoned'),
        Query.orderAsc('start_time'),
        Query.limit(1)
      ]
    );

    if (nextScheduledRaceQuery.documents.length === 0) {
      return jsonWithCompression(request, {
        nextScheduledRace: null,
        message: 'No upcoming races available',
      });
    }

    const nextRaceDoc = nextScheduledRaceQuery.documents[0];
    
    const nextScheduledRace = {
      race_id: nextRaceDoc.race_id,
      name: nextRaceDoc.name,
      start_time: nextRaceDoc.start_time,
      meeting_name: nextRaceDoc.meeting?.meeting_name || 'Unknown Meeting',
      race_number: nextRaceDoc.race_number
    };

    // Set cache headers for optimal performance
    const response = await jsonWithCompression(request, { nextScheduledRace });
    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    
    return response;
  } catch (error) {
    console.error('API Error fetching next scheduled race:', error);
    return jsonWithCompression(
      request,
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
