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
    
    // Fetch race by raceId field (not $id). Fallback to $id for backward compatibility.
    let raceData: any | null = null;
    try {
      const raceQuery = await databases.listDocuments(
        'raceday-db', 
        'races',
        [Query.equal('raceId', raceId), Query.limit(1)]
      );
      if (raceQuery.documents.length > 0) {
        raceData = raceQuery.documents[0] as any;
      }
    } catch {}

    if (!raceData) {
      try {
        raceData = (await databases.getDocument('raceday-db', 'races', raceId)) as any;
      } catch {
        return null;
      }
    }
    
    // Resolve meeting info (supports string ID or expanded object)
    let resolvedMeetingId: string | null = null;
    let resolvedMeeting: Meeting | null = null;

    if (typeof raceData.meeting === 'string' && raceData.meeting) {
      resolvedMeetingId = raceData.meeting;
    } else if (raceData.meeting?.meetingId) {
      resolvedMeetingId = raceData.meeting.meetingId;
    } else if (raceData.meeting?.$id) {
      resolvedMeetingId = raceData.meeting.$id;
    }

    if (!resolvedMeetingId) {
      return null;
    }

    if (raceData.meeting && typeof raceData.meeting === 'object' && (raceData.meeting.meetingName || raceData.meeting.meetingId)) {
      resolvedMeeting = {
        $id: raceData.meeting.$id ?? resolvedMeetingId,
        $createdAt: raceData.meeting.$createdAt ?? raceData.$createdAt,
        $updatedAt: raceData.meeting.$updatedAt ?? raceData.$updatedAt,
        meetingId: raceData.meeting.meetingId ?? resolvedMeetingId,
        meetingName: raceData.meeting.meetingName ?? 'Unknown Meeting',
        country: raceData.meeting.country ?? 'Unknown',
        raceType: raceData.meeting.raceType ?? '',
        category: raceData.meeting.category ?? '',
        date: raceData.meeting.date ?? raceData.$createdAt,
      } as Meeting;
    } else {
      try {
        const meetingDoc = await databases.getDocument('raceday-db', 'meetings', resolvedMeetingId);
        resolvedMeeting = meetingDoc as unknown as Meeting;
      } catch {
        resolvedMeeting = {
          $id: resolvedMeetingId,
          $createdAt: raceData.$createdAt,
          $updatedAt: raceData.$updatedAt,
          meetingId: resolvedMeetingId,
          meetingName: 'Unknown Meeting',
          country: 'Unknown',
          raceType: '',
          category: '',
          date: raceData.$createdAt,
        } as Meeting;
      }
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
      meeting: resolvedMeetingId!, // return meetingId string for the Race interface
      status: raceData.status,
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
    };

    const meeting: Meeting = resolvedMeeting!;

    return { 
      race, 
      meeting, 
    };
  } catch (error) {
    console.error('Error fetching basic race data:', error);
    return null;
  }
}
