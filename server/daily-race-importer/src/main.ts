import { Client, Databases } from 'node-appwrite';
import { ensureDatabaseSetup } from './database-setup.js';

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

    // Ensure database and collections exist before proceeding
    await ensureDatabaseSetup({
      endpoint,
      projectId,
      apiKey,
      databaseId
    }, context);

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
  const allowedCountries = ['AUS', 'NZ'];  // API uses 'NZ' for New Zealand, not 'NZL'
  const allowedCategories = ['Thoroughbred Horse Racing', 'Harness Horse Racing'];  // API uses full names


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

  // Helper function for performant upsert using the manual approach
  const performantUpsert = async (
    collectionId: string,
    documentId: string,
    data: any,
    context: any
  ): Promise<boolean> => {
    try {
      // Try to update existing document first (faster for existing documents)
      await databases.updateDocument(databaseId, collectionId, documentId, data);
      return true;
    } catch (error) {
      // If update fails (document doesn't exist), create new document
      try {
        await databases.createDocument(databaseId, collectionId, documentId, data);
        return true;
      } catch (createError) {
        context.error(`Failed to create ${collectionId} document`, {
          documentId,
          error: createError instanceof Error ? createError.message : 'Unknown error'
        });
        return false;
      }
    }
  };

  // Process all meetings concurrently  
  const meetingPromises = meetings.map(async (meeting) => {
    try {
      // Prepare meeting document - following recommendations from docs/nztab/1-Initial-Data-review-reccomendations.txt
      const meetingDoc: MeetingDocument = {
        meetingId: meeting.meeting,
        meetingName: meeting.name,
        country: meeting.country,
        raceType: meeting.category_name, // Using more descriptive category_name per recommendations
        date: meeting.date,
        status: 'active'
      };

      const success = await performantUpsert('meetings', meeting.meeting, meetingDoc, context);
      if (success) {
        context.log('Upserted meeting', { meetingId: meeting.meeting, name: meeting.name });
        return { success: true, meetingId: meeting.meeting };
      } else {
        return { success: false, meetingId: meeting.meeting };
      }

    } catch (error) {
      context.error('Failed to process meeting', {
        meetingId: meeting.meeting,
        meetingName: meeting.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return { success: false, meetingId: meeting.meeting, error };
    }
  });

  // Process all meetings concurrently
  const meetingResults = await Promise.all(meetingPromises);
  meetingsProcessed = meetingResults.filter(result => result.success).length;

  // Prepare all race documents for batch processing
  const allRaces: Array<{ meeting: string; race: NZTABRace }> = [];
  meetings.forEach(meeting => {
    meeting.races.forEach(race => {
      allRaces.push({ meeting: meeting.meeting, race });
    });
  });

  // Process races in batches for better performance and error handling
  const batchSize = 15; // Process 15 races at a time for optimal performance
  for (let i = 0; i < allRaces.length; i += batchSize) {
    const batch = allRaces.slice(i, i + batchSize);
    
    const racePromises = batch.map(async ({ meeting, race }) => {
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
          meeting: meeting
        };

        const success = await performantUpsert('races', race.id, raceDoc, context);
        if (success) {
          context.log('Upserted race', { raceId: race.id, name: race.name });
          return { success: true, raceId: race.id };
        } else {
          return { success: false, raceId: race.id };
        }

      } catch (error) {
        context.error('Failed to process race', {
          raceId: race.id,
          raceName: race.name,
          meetingId: meeting,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return { success: false, raceId: race.id, error };
      }
    });

    // Process this batch concurrently
    const batchResults = await Promise.all(racePromises);
    const successfulRaces = batchResults.filter(result => result.success).length;
    racesProcessed += successfulRaces;

    // Log batch progress
    context.log('Processed race batch', {
      batchNumber: Math.floor(i / batchSize) + 1,
      batchSize: batch.length,
      successful: successfulRaces,
      failed: batch.length - successfulRaces,
      totalProcessed: racesProcessed
    });
  }

  return { meetingsProcessed, racesProcessed };
}

