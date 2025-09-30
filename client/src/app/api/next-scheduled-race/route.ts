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
        Query.greaterThan('startTime', now.toISOString()),
        Query.notEqual('status', 'Abandoned'),
        Query.orderAsc('startTime'),
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
      raceId: nextRaceDoc.raceId,
      name: nextRaceDoc.name,
      startTime: nextRaceDoc.startTime,
      meetingName: nextRaceDoc.meeting?.meetingName || 'Unknown Meeting',
      raceNumber: nextRaceDoc.raceNumber
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
