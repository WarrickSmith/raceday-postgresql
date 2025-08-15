import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting } from '@/types/meetings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raceId } = await params;
    
    if (!raceId) {
      return NextResponse.json({ error: 'Race ID is required' }, { status: 400 });
    }

    const raceData = await getBasicRaceData(raceId);
    
    if (!raceData) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    // Set cache headers for optimal performance
    const response = NextResponse.json(raceData);
    response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    
    return response;
  } catch (error) {
    console.error('API Error fetching basic race data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getBasicRaceData(raceId: string): Promise<{
  race: Race; 
  meeting: Meeting; 
} | null> {
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

    return { 
      race, 
      meeting, 
    };
  } catch (error) {
    console.error('Error fetching basic race data:', error);
    return null;
  }
}