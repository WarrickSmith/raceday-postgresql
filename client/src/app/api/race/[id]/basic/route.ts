import { NextRequest } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { Race, Meeting } from '@/types/meetings';
import {
  normalizeMeetingDocument,
  type MeetingDocument,
  type RaceDocument,
} from '../appwriteTypes';
import { jsonWithCompression } from '@/lib/http/compression';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: race_id } = await params;
    
    if (!race_id) {
      return jsonWithCompression(
        request,
        { error: 'Race ID is required' },
        { status: 400 }
      );
    }

    const raceData = await getBasicRaceData(race_id);
    
    if (!raceData) {
      return jsonWithCompression(
        request,
        { error: 'Race not found' },
        { status: 404 }
      );
    }

    // Set cache headers for optimal performance
    const response = await jsonWithCompression(request, raceData);
    response.headers.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    
    return response;
  } catch (error) {
    console.error('API Error fetching basic race data:', error);
    return jsonWithCompression(
      request,
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getBasicRaceData(race_id: string): Promise<{
  race: Race; 
  meeting: Meeting; 
} | null> {
  try {
    const { databases } = await createServerClient();
    
    // Fetch race by race_id field (not $id). Fallback to $id for backward compatibility.
    let raceData: RaceDocument | null = null;
    try {
      const raceQuery = await databases.listDocuments<RaceDocument>(
        'raceday-db',
        'races',
        [Query.equal('race_id', race_id), Query.limit(1)]
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
          race_id
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
      (raceMeetingField.meeting_id || raceMeetingField.$id)
    ) {
      const castMeeting = raceMeetingField as MeetingDocument;
      resolvedMeetingId = castMeeting.meeting_id ?? castMeeting.$id ?? null;
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
      race_id: raceData.race_id ?? raceData.$id,
      race_number: raceData.race_number ?? 0,
      name: raceData.name ?? 'Unknown Race',
      start_time: raceData.start_time ?? raceData.$createdAt,
      meeting: resolvedMeetingId, // return meeting_id string for the Race interface
      status: raceData.status ?? 'Unknown',
      distance: raceData.distance,
      track_condition: raceData.track_condition,
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
