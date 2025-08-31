import { Client, Databases, Query } from 'node-appwrite'

/**
 * Meeting Status Poller - Targeted polling for meeting-level data changes
 * 
 * This function polls NZ TAB API for meeting-level status changes that are not captured
 * by race-specific polling functions. Focuses on:
 * - Meeting status (cancelled, postponed, delayed)
 * - Meeting-level weather and track conditions 
 * - Meeting venue information changes
 * - Meeting start time adjustments
 * 
 * Triggered by master-race-scheduler every 30 minutes during active racing periods.
 * More efficient than full daily-meetings refresh - only updates changed fields.
 */
export default async function main(context) {
  const startTime = Date.now()
  
  context.log('Meeting status poller started', {
    timestamp: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  })

  try {
    // Validate environment variables
    const requiredEnvVars = [
      'APPWRITE_ENDPOINT', 
      'APPWRITE_PROJECT_ID', 
      'APPWRITE_API_KEY'
    ]
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`)
      }
    }

    const endpoint = process.env['APPWRITE_ENDPOINT']
    const projectId = process.env['APPWRITE_PROJECT_ID']
    const apiKey = process.env['APPWRITE_API_KEY']
    const nztabBaseUrl = process.env['NZTAB_API_BASE_URL'] || 'https://api.tab.co.nz'

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey)
    
    const databases = new Databases(client)
    const databaseId = 'raceday-db'

    // Get today's date in NZ timezone
    const now = new Date()
    const nzDate = now.toLocaleDateString('en-CA', {
      timeZone: 'Pacific/Auckland',
    })

    context.log('Fetching current meetings from database...', { nzDate })

    // Get existing meetings from database for today
    const existingMeetings = await databases.listDocuments(databaseId, 'meetings', [
      Query.equal('date', nzDate),
      Query.limit(100) // Should cover all daily meetings
    ])

    if (existingMeetings.documents.length === 0) {
      context.log('No existing meetings found for today')
      return {
        success: true,
        message: 'No meetings found to poll status updates for',
        executionTimeMs: Date.now() - startTime
      }
    }

    context.log(`Found ${existingMeetings.documents.length} existing meetings to check for updates`)

    // Fetch fresh meeting data from NZ TAB API
    const freshMeetings = await fetchMeetingsFromAPI(nztabBaseUrl, nzDate, context)
    
    if (!freshMeetings || freshMeetings.length === 0) {
      context.log('No fresh meeting data returned from API')
      return {
        success: true,
        message: 'No fresh meeting data available',
        executionTimeMs: Date.now() - startTime
      }
    }

    // Process meeting status updates
    const results = await processMeetingStatusUpdates(
      databases, 
      databaseId, 
      existingMeetings.documents, 
      freshMeetings, 
      context
    )

    const executionSummary = {
      success: true,
      message: `Meeting status polling completed`,
      statistics: {
        existingMeetings: existingMeetings.documents.length,
        freshMeetingsFromAPI: freshMeetings.length,
        meetingsUpdated: results.meetingsUpdated,
        fieldsUpdated: results.totalFieldsUpdated
      },
      executionTimeMs: Date.now() - startTime,
      nzDate
    }

    context.log('Meeting status poller completed', executionSummary)
    
    return executionSummary

  } catch (error) {
    const executionTimeMs = Date.now() - startTime
    
    context.error('Meeting status poller failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      executionTimeMs,
      timestamp: new Date().toISOString()
    })
    
    return {
      success: false,
      error: 'Meeting status poller execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs
    }
  }
}

/**
 * Fetch meetings data from NZ TAB API for status updates
 * @param {string} baseUrl - Base URL for NZ TAB API
 * @param {string} nzDate - Date in YYYY-MM-DD format
 * @param {Object} context - Appwrite function context for logging
 * @returns {Array} Array of fresh meeting data
 */
async function fetchMeetingsFromAPI(baseUrl, nzDate, context) {
  try {
    const params = new URLSearchParams({
      date_from: nzDate,
      date_to: nzDate,
    })
    
    const apiUrl = `${baseUrl}/affiliates/v1/racing/meetings?${params.toString()}`
    
    context.log('Fetching fresh meeting data for status updates', {
      apiUrl,
      nzDate
    })
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RaceDay-Meeting-Status-Poller/1.0.0',
        'From': 'ws@baybox.co.nz',
        'X-Partner': 'Warrick Smith',
        'X-Partner-ID': 'Private-Developer'
      }
    })

    if (!response.ok) {
      throw new Error(`NZTAB API request failed: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.data || !Array.isArray(data.data.meetings)) {
      throw new Error('Invalid API response format: missing meetings data')
    }

    context.log('Successfully fetched fresh meeting data', {
      meetingsCount: data.data.meetings.length,
      generatedTime: data.header?.generated_time
    })
    
    return data.data.meetings

  } catch (error) {
    context.error('Failed to fetch fresh meeting data from API', {
      error: error instanceof Error ? error.message : 'Unknown error',
      baseUrl,
      nzDate
    })
    throw error
  }
}

/**
 * Process meeting status updates by comparing existing vs fresh data
 * @param {Object} databases - Appwrite Databases instance
 * @param {string} databaseId - Database ID
 * @param {Array} existingMeetings - Current meetings from database
 * @param {Array} freshMeetings - Fresh meetings from API
 * @param {Object} context - Appwrite function context for logging
 * @returns {Object} Update results
 */
async function processMeetingStatusUpdates(databases, databaseId, existingMeetings, freshMeetings, context) {
  let meetingsUpdated = 0
  let totalFieldsUpdated = 0

  // Create a map of fresh meetings by meetingId for efficient lookup
  const freshMeetingsMap = new Map()
  freshMeetings.forEach(meeting => {
    if (meeting.meeting) {
      freshMeetingsMap.set(meeting.meeting, meeting)
    }
  })

  // Process each existing meeting to check for updates
  const updatePromises = existingMeetings.map(async (existingMeeting) => {
    try {
      const freshMeeting = freshMeetingsMap.get(existingMeeting.meetingId)
      
      if (!freshMeeting) {
        context.log(`No fresh data found for meeting ${existingMeeting.meetingId}`)
        return { updated: false, fieldsUpdated: 0 }
      }

      // Compare meeting-level fields that can change during the day
      const updates = {}
      let fieldsUpdated = 0

      // Meeting status
      if (freshMeeting.status && freshMeeting.status !== existingMeeting.status) {
        updates.status = freshMeeting.status
        fieldsUpdated++
        context.log(`Status change detected for meeting ${existingMeeting.meetingId}`, {
          old: existingMeeting.status,
          new: freshMeeting.status
        })
      }

      // Track condition
      if (freshMeeting.track_condition && freshMeeting.track_condition !== existingMeeting.trackCondition) {
        updates.trackCondition = safeStringField(freshMeeting.track_condition, 50)
        fieldsUpdated++
        context.log(`Track condition change for meeting ${existingMeeting.meetingId}`, {
          old: existingMeeting.trackCondition,
          new: freshMeeting.track_condition
        })
      }

      // Weather
      if (freshMeeting.weather && freshMeeting.weather !== existingMeeting.weather) {
        updates.weather = safeStringField(freshMeeting.weather, 50)
        fieldsUpdated++
        context.log(`Weather change for meeting ${existingMeeting.meetingId}`, {
          old: existingMeeting.weather,
          new: freshMeeting.weather
        })
      }

      // Rail position
      if (freshMeeting.rail_position && freshMeeting.rail_position !== existingMeeting.railPosition) {
        updates.railPosition = safeStringField(freshMeeting.rail_position, 100)
        fieldsUpdated++
        context.log(`Rail position change for meeting ${existingMeeting.meetingId}`, {
          old: existingMeeting.railPosition,
          new: freshMeeting.rail_position
        })
      }

      // Track direction
      if (freshMeeting.track_direction && freshMeeting.track_direction !== existingMeeting.trackDirection) {
        updates.trackDirection = safeStringField(freshMeeting.track_direction, 20)
        fieldsUpdated++
      }

      // Track surface
      if (freshMeeting.track_surface && freshMeeting.track_surface !== existingMeeting.trackSurface) {
        updates.trackSurface = safeStringField(freshMeeting.track_surface, 50)
        fieldsUpdated++
      }

      // Update lastUpdated timestamp if any changes were detected
      if (fieldsUpdated > 0) {
        updates.lastUpdated = new Date().toISOString()
        updates.apiGeneratedTime = freshMeeting.generated_time || new Date().toISOString()
        
        // Apply updates to database
        await databases.updateDocument(databaseId, 'meetings', existingMeeting.$id, updates)
        
        context.log(`Updated meeting ${existingMeeting.meetingId}`, {
          meetingName: existingMeeting.meetingName,
          fieldsUpdated,
          updates: Object.keys(updates)
        })
        
        return { updated: true, fieldsUpdated }
      }

      return { updated: false, fieldsUpdated: 0 }

    } catch (error) {
      context.error(`Failed to update meeting ${existingMeeting.meetingId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        meetingName: existingMeeting.meetingName
      })
      return { updated: false, fieldsUpdated: 0 }
    }
  })

  // Execute all updates in parallel
  const results = await Promise.allSettled(updatePromises)
  
  results.forEach(result => {
    if (result.status === 'fulfilled') {
      if (result.value.updated) {
        meetingsUpdated++
      }
      totalFieldsUpdated += result.value.fieldsUpdated
    }
  })

  context.log('Meeting status update processing completed', {
    meetingsChecked: existingMeetings.length,
    meetingsUpdated,
    totalFieldsUpdated
  })

  return {
    meetingsUpdated,
    totalFieldsUpdated
  }
}

/**
 * Safely convert and truncate a field to string with max length
 * @param {any} value - The value to process
 * @param {number} maxLength - Maximum allowed length
 * @returns {string|undefined} Processed string or undefined if no value
 */
function safeStringField(value, maxLength) {
  if (value === null || value === undefined) {
    return undefined
  }
  
  let stringValue
  if (typeof value === 'string') {
    stringValue = value
  } else if (typeof value === 'object') {
    stringValue = JSON.stringify(value)
  } else {
    stringValue = String(value)
  }
  
  return stringValue.length > maxLength ? stringValue.substring(0, maxLength) : stringValue
}