import { createServerClient, Query } from '@/lib/appwrite-server';
import { Meeting, Race } from '@/types/meetings';
import { SUPPORTED_RACE_TYPE_CODES } from '@/constants/raceTypes';

export async function getMeetingsData(): Promise<Meeting[]> {
  try {
    // Check if we're in a build environment without proper env vars
    if (!process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || !process.env.APPWRITE_API_KEY) {
      console.warn('Appwrite environment variables not available, returning empty meetings data');
      return [];
    }
    
    const { databases } = await createServerClient();
    
    // Get today's date using New Zealand timezone (consistent with server functions)
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Pacific/Auckland',
    });
    
    // Convert to datetime format to match database storage format
    const todayDateTime = `${today}T00:00:00.000+00:00`;
    // Query meetings for current day using datetime format
    const meetingsResponse = await databases.listDocuments(
      'raceday-db',
      'meetings',
      [
        Query.equal('date', todayDateTime),
        Query.equal('country', ['AUS', 'NZ']),
        Query.equal('category', SUPPORTED_RACE_TYPE_CODES),
        Query.orderAsc('$createdAt'),
      ]
    );

    const meetings = meetingsResponse.documents as unknown as Meeting[];
    
    // Get first race time for each meeting to enable chronological sorting
    const meetingsWithFirstRace = await Promise.all(
      meetings.map(async (meeting) => {
        try {
          const racesResponse = await databases.listDocuments(
            'raceday-db',
            'races',
            [
              Query.equal('meeting', meeting.meetingId),
              Query.orderAsc('startTime'),
              Query.limit(1),
            ]
          );

          const races = racesResponse.documents as unknown as Race[];
          const firstRace = races[0];
          
          return {
            ...meeting,
            firstRaceTime: firstRace?.startTime || meeting.$createdAt,
          };
        } catch (error) {
          console.error(`Error fetching races for meeting ${meeting.meetingId}:`, error);
          return {
            ...meeting,
            firstRaceTime: meeting.$createdAt,
          };
        }
      })
    );

    // Sort meetings chronologically by first race time
    meetingsWithFirstRace.sort((a, b) => {
      return new Date(a.firstRaceTime!).getTime() - new Date(b.firstRaceTime!).getTime();
    });

    return meetingsWithFirstRace;
  } catch (error) {
    console.error('Error fetching meetings data:', error);
    return [];
  }
}

export async function getMeetingById(meetingId: string): Promise<Meeting | null> {
  try {
    // Check if we're in a build environment without proper env vars
    if (!process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || !process.env.APPWRITE_API_KEY) {
      console.warn('Appwrite environment variables not available, returning null');
      return null;
    }
    
    const { databases } = await createServerClient();
    
    const meeting = await databases.getDocument('raceday-db', 'meetings', meetingId);
    return meeting as unknown as Meeting;
  } catch (error) {
    console.error(`Error fetching meeting ${meetingId}:`, error);
    return null;
  }
}