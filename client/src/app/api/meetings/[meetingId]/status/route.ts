import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params;
    const { databases } = await createServerClient();
    
    // Fetch races for this meeting with minimal data
    const racesQuery = await databases.listDocuments(
      'raceday-db',
      'races',
      [
        Query.equal('meeting', meetingId),
        Query.select(['status']), // Only fetch the status field for performance
        Query.limit(50)
      ]
    );

    if (racesQuery.documents.length === 0) {
      return NextResponse.json({ isCompleted: false });
    }

    // Check if all races are finalized
    const allRacesFinalized = racesQuery.documents.every((race: any) => 
      race.status === 'Final' || race.status === 'Abandoned'
    );

    return NextResponse.json({ 
      isCompleted: allRacesFinalized,
      totalRaces: racesQuery.documents.length,
      finalizedRaces: racesQuery.documents.filter((race: any) => 
        race.status === 'Final' || race.status === 'Abandoned'
      ).length
    });
    
  } catch (error) {
    console.error('Error checking meeting status:', error);
    return NextResponse.json({ isCompleted: false }, { status: 500 });
  }
}