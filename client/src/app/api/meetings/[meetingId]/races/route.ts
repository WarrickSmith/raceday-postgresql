import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { jsonWithCompression } from '@/lib/http/compression';

/**
 * GET /api/meetings/[meeting_id]/races
 *
 * Fetches all races for a specific meeting ID
 * Server-side endpoint to eliminate CORS issues and keep Appwrite credentials secure
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meeting_id: string }> }
) {
  try {
    const { meeting_id } = await params;

    if (!meeting_id) {
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
        Query.equal('meeting', meeting_id),
        Query.orderAsc('race_number'),
        Query.limit(20),
      ]);
    } catch (directError) {
      // Fallback: Get all races and filter server-side
      const allRacesResponse = await databases.listDocuments('raceday-db', 'races', [
        Query.limit(100)
      ]);

      // Filter races by meeting_id on the server side
      const filteredRaces = allRacesResponse.documents.filter((race: Record<string, unknown>) => {
        // Check if meeting is a string ID
        if (typeof race.meeting === 'string') {
          return race.meeting === meeting_id;
        }

        // Check if meeting is an object with meeting_id property
        if (typeof race.meeting === 'object' && race.meeting && 'meeting_id' in race.meeting) {
          return (race.meeting as Record<string, unknown>).meeting_id === meeting_id;
        }

        // Check if meeting is an object with $id property
        if (typeof race.meeting === 'object' && race.meeting && '$id' in race.meeting) {
          return (race.meeting as Record<string, unknown>).$id === meeting_id;
        }

        return false;
      });

      // Sort by race number
      filteredRaces.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        (a.race_number as number) - (b.race_number as number)
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
