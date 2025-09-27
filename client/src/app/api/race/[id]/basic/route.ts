import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting } from '@/types/meetings';
import {
  normalizeMeetingDocument,
  type MeetingDocument,
  type RaceDocument,
} from '../appwriteTypes';

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
    let raceData: RaceDocument | null = null;
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>(
        'raceday-db',
        'races',
        [Query.equal('raceId', raceId), Query.limit(1)]
      );
      if (raceQuery.documents.length > 0) {
        raceData = raceQuery.documents[0];
      }
    } catch {}

    if (!raceData) {
      try {
        raceData = await databases.getDocument<RaceDocument>(
          'raceday-db',
          'races',
          raceId
        );
      } catch {
        return null;
      }
    }

    // Resolve meeting info (supports string ID or expanded object)
    let resolvedMeetingId: string | null = null;
    let resolvedMeeting: Meeting | null = null;
    let meetingDocument: MeetingDocument | null = null;

    const raceMeetingField = raceData.meeting;
    if (typeof raceMeetingField === 'string' && raceMeetingField) {
      resolvedMeetingId = raceMeetingField;
    } else if (
      raceMeetingField &&
      typeof raceMeetingField === 'object' &&
      (raceMeetingField.meetingId || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument;
      resolvedMeetingId = castMeeting.meetingId ?? castMeeting.$id ?? null;
      meetingDocument = castMeeting;
    }

    if (!resolvedMeetingId) {
      return null;
    }

    if (meetingDocument) {
      resolvedMeeting = normalizeMeetingDocument(meetingDocument, {
        id: resolvedMeetingId,
        createdAt: raceData.$createdAt,
        updatedAt: raceData.$updatedAt,
      });
    } else {
      try {
        const meetingDoc = await databases.getDocument<MeetingDocument>(
          'raceday-db',
          'meetings',
          resolvedMeetingId
        );
        resolvedMeeting = normalizeMeetingDocument(meetingDoc, {
          id: resolvedMeetingId,
          createdAt: raceData.$createdAt,
          updatedAt: raceData.$updatedAt,
        });
      } catch {
        resolvedMeeting = normalizeMeetingDocument(null, {
          id: resolvedMeetingId,
          createdAt: raceData.$createdAt,
          updatedAt: raceData.$updatedAt,
        });
      }
    }

    // The race already has the meeting data populated as a nested object
    // Convert to our expected format
    const race: Race = {
      $id: raceData.$id,
      $createdAt: raceData.$createdAt,
      $updatedAt: raceData.$updatedAt,
      raceId: raceData.raceId ?? raceData.$id,
      raceNumber: raceData.raceNumber ?? 0,
      name: raceData.name ?? 'Unknown Race',
      startTime: raceData.startTime ?? raceData.$createdAt,
      meeting: resolvedMeetingId, // return meetingId string for the Race interface
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      trackCondition: raceData.trackCondition,
    };

    if (!resolvedMeeting) {
      return null;
    }

    const meeting: Meeting = resolvedMeeting;

    return { 
      race, 
      meeting, 
    };
  } catch (error) {
    console.error('Error fetching basic race data:', error);
    return null;
  }
}
