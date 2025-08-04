import { createServerClient, Query } from '@/lib/appwrite-server';
import { Meeting, Race } from '@/types/meetings';

export async function getMeetingsData(): Promise<Meeting[]> {
  try {
    const { databases } = await createServerClient();
    
    // Get today's date in ISO format
    const today = new Date().toISOString().split('T')[0];
    
    // Query meetings for current day
    const meetingsResponse = await databases.listDocuments(
      'raceday-db',
      'meetings',
      [
        Query.equal('date', today),
        Query.equal('country', ['AUS', 'NZ']),
        Query.equal('raceType', ['Thoroughbred Horse Racing', 'Harness']),
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
    const { databases } = await createServerClient();
    
    const meeting = await databases.getDocument('raceday-db', 'meetings', meetingId);
    return meeting as unknown as Meeting;
  } catch (error) {
    console.error(`Error fetching meeting ${meetingId}:`, error);
    return null;
  }
}