import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { jsonWithCompression } from '@/lib/http/compression';

/**
 * GET /api/meetings/[meetingId]/races
 *
 * Fetches all races for a specific meeting ID
 * Server-side endpoint to eliminate CORS issues and keep Appwrite credentials secure
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;

    if (!meetingId) {
      return jsonWithCompression(
        request,
        { error: 'Meeting ID is required' },
        { status: 400 }
      );
    }

    const { databases } = await createServerClient();

    // First try: Query by meeting field directly (if it's a relationship ID)
    let response;
    try {
      response = await databases.listDocuments('raceday-db', 'races', [
        Query.equal('meeting', meetingId),
        Query.orderAsc('raceNumber'),
        Query.limit(20),
      ]);
    } catch (directError) {
      // Fallback: Get all races and filter server-side
      const allRacesResponse = await databases.listDocuments('raceday-db', 'races', [
        Query.limit(100)
      ]);

      // Filter races by meetingId on the server side
      const filteredRaces = allRacesResponse.documents.filter((race: Record<string, unknown>) => {
        // Check if meeting is a string ID
        if (typeof race.meeting === 'string') {
          return race.meeting === meetingId;
        }

        // Check if meeting is an object with meetingId property
        if (typeof race.meeting === 'object' && race.meeting && 'meetingId' in race.meeting) {
          return (race.meeting as Record<string, unknown>).meetingId === meetingId;
        }

        // Check if meeting is an object with $id property
        if (typeof race.meeting === 'object' && race.meeting && '$id' in race.meeting) {
          return (race.meeting as Record<string, unknown>).$id === meetingId;
        }

        return false;
      });

      // Sort by race number
      filteredRaces.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (a.raceNumber as number) - (b.raceNumber as number)
      );

      response = { documents: filteredRaces, total: filteredRaces.length };
    }

    return jsonWithCompression(request, {
      races: response.documents,
      total: response.total,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching races for meeting:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch races';

    return jsonWithCompression(
      request,
      { error: errorMessage },
      { status: 500 }
    );
  }
}
