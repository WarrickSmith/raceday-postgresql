import { NextRequest } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { jsonWithCompression } from '@/lib/http/compression';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meeting_id: string }> }
) {
  try {
    const { meeting_id } = await params;
    const { databases } = await createServerClient();
    
    // Fetch races for this meeting with minimal data
    const racesQuery = await databases.listDocuments(
      'raceday-db',
      'races',
      [
        Query.equal('meeting', meeting_id),
        Query.select(['status']), // Only fetch the status field for performance
        Query.limit(50)
      ]
    );

    if (racesQuery.documents.length === 0) {
      return jsonWithCompression(request, { isCompleted: false });
    }

    // Check if all races are finalized
    const allRacesFinalized = racesQuery.documents.every((race) => {
      const raceData = race as unknown as { status: string };
      return raceData.status === 'Final' || raceData.status === 'Abandoned';
    });

    return jsonWithCompression(request, {
      isCompleted: allRacesFinalized,
      totalRaces: racesQuery.documents.length,
      finalizedRaces: racesQuery.documents.filter((race) => {
        const raceData = race as unknown as { status: string };
        return raceData.status === 'Final' || raceData.status === 'Abandoned';
      }).length,
    });
    
  } catch (error) {
    console.error('Error checking meeting status:', error);
    return jsonWithCompression(
      request,
      { isCompleted: false },
      { status: 500 }
    );
  }
}
