import { Client, Databases } from 'node-appwrite';

interface NZTABMeeting {
  meeting: string;
  name: string;
  date: string;
  track_condition: string;
  category: string;
  category_name: string;
  country: string;
  state?: string;
  races: NZTABRace[];
}

interface NZTABRace {
  id: string;
  race_number: number;
  name: string;
  start_time: string;
  distance?: number;
  track_condition?: string;
  weather?: string;
  status: string;
  country?: string;
  state?: string;
}

interface NZTABAPIResponse {
  header: {
    title: string;
    generated_time: string;
    url: string;
  };
  params: {
    enc?: string;
    ids?: any;
    date_from: string;
    date_to: string;
    type?: string;
    country?: string;
    limit: number;
    offset?: number;
    futures?: boolean;
    meeting_numbers?: any;
  };
  data: {
    meetings: NZTABMeeting[];
  };
}

interface MeetingDocument {
  meetingId: string;
  meetingName: string;
  country: string;
  raceType: string;
  date: string;
  status: string;
}

interface RaceDocument {
  raceId: string;
  name: string;
  raceNumber: number;
  startTime: string;
  distance?: number;
  trackCondition?: string;
  weather?: string;
  status: string;
  meeting: string;
}

export default async function main(context: any) {
  try {
    // Validate environment variables
    const endpoint = process.env['APPWRITE_ENDPOINT'];
    const projectId = process.env['APPWRITE_PROJECT_ID'];
    const apiKey = process.env['APPWRITE_API_KEY'];
    const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz';

    if (!endpoint || !projectId || !apiKey) {
      throw new Error('Missing required environment variables: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, or APPWRITE_API_KEY');
    }

    context.log('Daily race import function started', {
      timestamp: new Date().toISOString(),
      nztabBaseUrl
    });

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);
    const databaseId = 'raceday-db';

    // Fetch racing data from NZTAB API
    const meetings = await fetchRacingData(nztabBaseUrl, context);
    
    // Filter for AU/NZ Horse/Harness racing only
    const filteredMeetings = filterMeetings(meetings, context);

    // Process and store the data
    const { meetingsProcessed, racesProcessed } = await processMeetingsAndRaces(
      databases,
      databaseId,
      filteredMeetings,
      context
    );

    context.log('Daily race import completed successfully', {
      timestamp: new Date().toISOString(),
      meetingsProcessed,
      racesProcessed,
      totalMeetingsFetched: meetings.length,
      filteredMeetings: filteredMeetings.length
    });

    return {
      success: true,
      message: `Successfully imported ${meetingsProcessed} meetings and ${racesProcessed} races`,
      statistics: {
        meetingsProcessed,
        racesProcessed,
        totalMeetingsFetched: meetings.length,
        filteredMeetings: filteredMeetings.length
      }
    };

  } catch (error) {
    context.error('Daily race import failed', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });

    throw error;
  }
}

async function fetchRacingData(baseUrl: string, context: any): Promise<NZTABMeeting[]> {
  try {
    // Use the meetings endpoint - default date is today when not specified
    const apiUrl = `${baseUrl}/affiliates/v1/racing/meetings`;
    
    context.log('Fetching racing data from NZTAB API', { apiUrl });

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RaceDay-Daily-Importer/1.0.0'
      }
    });

    if (!response.ok) {
      throw new Error(`NZTAB API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as NZTABAPIResponse;

    if (!data.data || !Array.isArray(data.data.meetings)) {
      throw new Error('Invalid API response format: missing meetings data');
    }

    context.log('Successfully fetched racing data from NZTAB API', {
      meetingsCount: data.data.meetings.length,
      generatedTime: data.header.generated_time
    });

    return data.data.meetings;

  } catch (error) {
    context.error('Failed to fetch racing data from NZTAB API', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}


function filterMeetings(meetings: NZTABMeeting[], context: any): NZTABMeeting[] {
  const allowedCountries = ['AUS', 'NZ'];  // NZ uses 'NZ' not 'NZL'
  const allowedCategories = ['Thoroughbred Horse Racing', 'Harness Horse Racing'];  // Harness is 'Harness Horse Racing'


  const filtered = meetings.filter(meeting => {
    // Filter by country (Australia and New Zealand only)
    if (!allowedCountries.includes(meeting.country)) {
      return false;
    }

    // Filter by race type (Horse and Harness only, exclude Greyhounds)
    if (!allowedCategories.includes(meeting.category_name)) {
      return false;
    }

    return true;
  });

  context.log('Filtered meetings for AU/NZ Horse/Harness racing only', {
    originalCount: meetings.length,
    filteredCount: filtered.length,
    allowedCountries,
    allowedCategories
  });

  return filtered;
}

async function processMeetingsAndRaces(
  databases: Databases,
  databaseId: string,
  meetings: NZTABMeeting[],
  context: any
): Promise<{ meetingsProcessed: number; racesProcessed: number }> {
  let meetingsProcessed = 0;
  let racesProcessed = 0;

  for (const meeting of meetings) {
    try {
      // Upsert meeting document - following recommendations from docs/nztab/1-Initial-Data-review-reccomendations.txt
      const meetingDoc: MeetingDocument = {
        meetingId: meeting.meeting,
        meetingName: meeting.name,
        country: meeting.country,
        raceType: meeting.category_name, // Using more descriptive category_name per recommendations
        date: meeting.date,
        status: 'active'
      };

      await upsertMeeting(databases, databaseId, meetingDoc, context);
      meetingsProcessed++;

      // Process races for this meeting
      for (const race of meeting.races) {
        try {
          // Following field mapping recommendations from docs/nztab/1-Initial-Data-review-reccomendations.txt
          const raceDoc: RaceDocument = {
            raceId: race.id, // Changed from raceIdentifier per recommendations
            name: race.name,
            raceNumber: race.race_number,
            startTime: race.start_time, // Using advertised_start_string per recommendations
            ...(race.distance !== undefined && { distance: race.distance }), // Type corrected to Integer per recommendations
            ...(race.track_condition !== undefined && { trackCondition: race.track_condition }), // Changed from 'track' per recommendations
            ...(race.weather !== undefined && { weather: race.weather }),
            status: race.status,
            meeting: meeting.meeting
          };

          await upsertRace(databases, databaseId, raceDoc, context);
          racesProcessed++;

        } catch (error) {
          context.error('Failed to process race', {
            raceId: race.id,
            raceName: race.name,
            meetingId: meeting.meeting,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

    } catch (error) {
      context.error('Failed to process meeting', {
        meetingId: meeting.meeting,
        meetingName: meeting.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return { meetingsProcessed, racesProcessed };
}

async function upsertMeeting(
  databases: Databases,
  databaseId: string,
  meeting: MeetingDocument,
  context: any
): Promise<void> {
  try {
    // Try to update existing meeting first
    await databases.updateDocument(databaseId, 'meetings', meeting.meetingId, meeting);
    context.log('Updated existing meeting', { meetingId: meeting.meetingId, name: meeting.meetingName });
  } catch (error) {
    // If update fails (document doesn't exist), create new meeting
    try {
      await databases.createDocument(databaseId, 'meetings', meeting.meetingId, meeting);
      context.log('Created new meeting', { meetingId: meeting.meetingId, name: meeting.meetingName });
    } catch (createError) {
      context.error('Failed to create meeting', {
        meetingId: meeting.meetingId,
        error: createError instanceof Error ? createError.message : 'Unknown error'
      });
      throw createError;
    }
  }
}

async function upsertRace(
  databases: Databases,
  databaseId: string,
  race: RaceDocument,
  context: any
): Promise<void> {
  try {
    // Try to update existing race first
    await databases.updateDocument(databaseId, 'races', race.raceId, race);
    context.log('Updated existing race', { raceId: race.raceId, name: race.name });
  } catch (error) {
    // If update fails (document doesn't exist), create new race
    try {
      await databases.createDocument(databaseId, 'races', race.raceId, race);
      context.log('Created new race', { raceId: race.raceId, name: race.name });
    } catch (createError) {
      context.error('Failed to create race', {
        raceId: race.raceId,
        error: createError instanceof Error ? createError.message : 'Unknown error'
      });
      throw createError;
    }
  }
}