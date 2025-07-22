import { Client, Databases, Query } from "node-appwrite";

export default async function main(context) {
  try {
    // Environment variable validation
    const endpoint = process.env["APPWRITE_ENDPOINT"];
    const projectId = process.env["APPWRITE_PROJECT_ID"];
    const apiKey = process.env["APPWRITE_API_KEY"];
    const nztabBaseUrl =
      process.env["NZTAB_API_BASE_URL"] || "https://api.tab.co.nz";

    if (!endpoint || !projectId || !apiKey) {
      throw new Error(
        "Missing required environment variables: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, or APPWRITE_API_KEY",
      );
    }

    context.log("Race data poller function started", {
      timestamp: new Date().toISOString(),
      nztabBaseUrl,
    });

    // Initialize Appwrite client
    const client = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);

    const databases = new Databases(client);
    const databaseId = "raceday-db";

    // Main polling logic will be implemented here
    const stats = await processRacePolling(
      databases,
      databaseId,
      nztabBaseUrl,
      context,
    );

    context.log("Race data polling completed successfully", {
      timestamp: new Date().toISOString(),
      ...stats,
    });

    return {
      success: true,
      message: "Race data polling completed",
      statistics: stats,
    };
  } catch (error) {
    context.error("Race data polling failed", {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

async function processRacePolling(
  databases,
  databaseId,
  nztabBaseUrl,
  context,
) {
  // Get current time in NZ timezone for consistent calculation
  const now = new Date();

  // Query races that need polling (within 60 minutes of start time, not Final)
  const racesToPoll = await getRacesRequiringPolling(
    databases,
    databaseId,
    now,
    context,
  );

  let racesProcessed = 0;
  let entrantsUpdated = 0;
  let oddsHistoryRecords = 0;
  let moneyFlowRecords = 0;

  context.log(`Found ${racesToPoll.length} races requiring polling`);

  // Process each race based on its polling schedule
  for (const race of racesToPoll) {
    const pollingInterval = calculatePollingInterval(race.startTime, now, race);
    const shouldPoll = shouldPollRace(race, now, pollingInterval, context);

    if (shouldPoll) {
      const stats = await pollRaceData(
        databases,
        databaseId,
        nztabBaseUrl,
        race,
        context,
      );
      racesProcessed++;
      entrantsUpdated += stats.entrantsUpdated;
      oddsHistoryRecords += stats.oddsHistoryRecords;
      moneyFlowRecords += stats.moneyFlowRecords;
    }
  }

  return {
    racesProcessed,
    entrantsUpdated,
    oddsHistoryRecords,
    moneyFlowRecords,
  };
}

/**
 * Calculate time to start in minutes
 * @param {string|Date} advertised_start - Race start time
 * @param {Date} now - Current time
 * @returns {number} Minutes to start (negative if race has started)
 */
function calculateTimeToStart(advertised_start, now) {
  const startTime = new Date(advertised_start);
  const diffMs = startTime.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60)); // Convert to minutes
}

/**
 * Determine polling interval based on time to start
 * @param {string|Date} advertised_start - Race start time
 * @param {Date} now - Current time
 * @param {object} race - Race document (for checking actual start status)
 * @returns {object} Polling schedule information
 */
function calculatePollingInterval(advertised_start, now, race = null) {
  const minutesToStart = calculateTimeToStart(advertised_start, now);

  // Handle delayed starts: continue 15-second polling until actual start confirmed
  // If race is past advertised start time but no actual start detected, keep polling at 15s
  if (
    minutesToStart < 0 &&
    race &&
    !race.actualStart &&
    race.status !== "Final"
  ) {
    return {
      intervalMinutes: 0.25,
      phase: "Delayed Start (15s polling)",
      minutesToStart,
      isDelayed: true,
    };
  }

  // Dynamic polling schedule per brief requirements:
  if (minutesToStart >= 20) {
    // T-60m to T-20m: Poll every 5 minutes
    return { intervalMinutes: 5, phase: "T-60m to T-20m", minutesToStart };
  } else if (minutesToStart >= 10) {
    // T-20m to T-10m: Poll every 2 minutes
    return { intervalMinutes: 2, phase: "T-20m to T-10m", minutesToStart };
  } else if (minutesToStart >= 5) {
    // T-10m to T-5m: Poll every 1 minute
    return { intervalMinutes: 1, phase: "T-10m to T-5m", minutesToStart };
  } else if (minutesToStart >= 0) {
    // T-5m to Start: Poll every 15 seconds (0.25 minutes)
    return { intervalMinutes: 0.25, phase: "T-5m to Start", minutesToStart };
  } else {
    // Post-Start to Final: Poll every 5 minutes until results confirmed
    return { intervalMinutes: 5, phase: "Post-Start to Final", minutesToStart };
  }
}

/**
 * Get races that need polling within the 60-minute window
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {Date} now - Current time
 * @param {object} context - Function context for logging
 * @returns {Array} Array of race documents requiring polling
 */
async function getRacesRequiringPolling(databases, databaseId, now, context) {
  try {
    // Calculate time range for polling (60 minutes before to post-race)
    const sixtyMinutesFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const response = await databases.listDocuments(databaseId, "races", [
      Query.greaterThanEqual("startTime", twoHoursAgo.toISOString()),
      Query.lessThanEqual("startTime", sixtyMinutesFromNow.toISOString()),
      Query.notEqual("status", "Final"),
      Query.orderAsc("startTime"),
    ]);

    context.log("Queried races for polling", {
      racesFound: response.documents.length,
      timeRange: {
        from: twoHoursAgo.toISOString(),
        to: sixtyMinutesFromNow.toISOString(),
      },
    });

    return response.documents;
  } catch (error) {
    context.error("Failed to query races requiring polling", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

/**
 * Determine if a race should be polled based on its schedule
 * @param {object} race - Race document
 * @param {Date} now - Current time
 * @param {object} pollingInterval - Polling interval information
 * @param {object} context - Function context for logging
 * @returns {boolean} Whether the race should be polled now
 */
function shouldPollRace(race, now, pollingInterval, context) {
  // For this implementation, we'll poll all eligible races
  // In a production system, this would check last poll time vs interval

  context.log(`Race polling decision`, {
    raceId: race.raceId,
    raceName: race.name,
    startTime: race.startTime,
    status: race.status,
    phase: pollingInterval.phase,
    minutesToStart: pollingInterval.minutesToStart,
    intervalMinutes: pollingInterval.intervalMinutes,
  });

  return true; // Poll all eligible races for now
}

/**
 * Poll race data from NZTAB API and update database
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} nztabBaseUrl - NZTAB API base URL
 * @param {object} race - Race document to poll
 * @param {object} context - Function context for logging
 * @returns {object} Statistics about updates made
 */
async function pollRaceData(
  databases,
  databaseId,
  nztabBaseUrl,
  race,
  context,
) {
  try {
    context.log(`Polling race data for race ${race.raceId}`, {
      raceId: race.raceId,
      raceName: race.name,
      startTime: race.startTime,
      status: race.status,
    });

    // Fetch race event data from NZTAB API
    const raceEventData = await fetchRaceEventFromNZTAB(
      nztabBaseUrl,
      race.raceId,
      context,
    );

    if (!raceEventData) {
      context.log(`No race data received for ${race.raceId}`);
      return { entrantsUpdated: 0, oddsHistoryRecords: 0, moneyFlowRecords: 0 };
    }

    // Update race status and actual start time if changed
    const raceUpdateStats = await updateRaceStatus(
      databases,
      databaseId,
      race,
      raceEventData,
      context,
    );

    // Update entrants with latest odds and money flow data
    const entrantStats = await updateEntrantsData(
      databases,
      databaseId,
      race.raceId,
      raceEventData,
      context,
    );

    context.log(`Race polling completed for ${race.raceId}`, {
      raceId: race.raceId,
      ...entrantStats,
    });

    return entrantStats;
  } catch (error) {
    context.error(`Failed to poll race data for ${race.raceId}`, {
      raceId: race.raceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      entrantsUpdated: 0,
      oddsHistoryRecords: 0,
      moneyFlowRecords: 0,
    };
  }
}

/**
 * Fetch race event data from NZTAB API
 * @param {string} nztabBaseUrl - NZTAB API base URL
 * @param {string} raceId - Race ID to fetch
 * @param {object} context - Function context for logging
 * @returns {object|null} Race event data or null if failed
 */
async function fetchRaceEventFromNZTAB(nztabBaseUrl, raceId, context) {
  try {
    const apiUrl = `${nztabBaseUrl}/affiliates/v1/racing/events/${raceId}`;

    context.log("Fetching race event data from NZTAB API", {
      apiUrl,
      raceId,
    });

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "RaceDay-Data-Poller/1.0.0",
        From: "ws@baybox.co.nz",
        "X-Partner": "Warrick Smith",
        "X-Partner-ID": "Private Developer",
      },
    });

    if (!response.ok) {
      context.error(`NZTAB API request failed for race ${raceId}`, {
        status: response.status,
        statusText: response.statusText,
        raceId,
      });

      // Handle rate limiting
      if (response.status === 429) {
        context.log("Rate limit encountered, will retry on next poll cycle", {
          raceId,
        });
      }

      return null;
    }

    const data = await response.json();

    if (!data.data || !data.data.race) {
      context.error("Invalid API response format for race event", {
        raceId,
        hasData: !!data.data,
        hasRace: !!(data.data && data.data.race),
      });
      return null;
    }

    context.log("Successfully fetched race event data from NZTAB API", {
      raceId,
      entrantsCount: data.data.entrants ? data.data.entrants.length : 0,
      raceStatus: data.data.race.status,
      generatedTime: data.header ? data.header.generated_time : "unknown",
    });

    return data.data;
  } catch (error) {
    context.error("Failed to fetch race event data from NZTAB API", {
      raceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

/**
 * Update race status and actual start time if changed
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {object} race - Current race document
 * @param {object} raceEventData - NZTAB race event data
 * @param {object} context - Function context for logging
 * @returns {object} Update statistics
 */
async function updateRaceStatus(
  databases,
  databaseId,
  race,
  raceEventData,
  context,
) {
  try {
    const updatedFields = {};
    let hasChanges = false;

    // Check for status changes
    if (
      raceEventData.race.status &&
      raceEventData.race.status !== race.status
    ) {
      updatedFields.status = raceEventData.race.status;
      hasChanges = true;
      context.log(`Race status changed for ${race.raceId}`, {
        raceId: race.raceId,
        oldStatus: race.status,
        newStatus: raceEventData.race.status,
      });
    }

    // Check for actual start time (if race has started)
    if (raceEventData.race.actual_start && !race.actualStart) {
      updatedFields.actualStart = raceEventData.race.actual_start;
      hasChanges = true;
      context.log(`Actual start time detected for ${race.raceId}`, {
        raceId: race.raceId,
        actualStart: raceEventData.race.actual_start,
      });
    }

    if (hasChanges) {
      await databases.updateDocument(
        databaseId,
        "races",
        race.raceId,
        updatedFields,
      );
      context.log(`Updated race document ${race.raceId}`, updatedFields);
    }

    return { raceUpdated: hasChanges };
  } catch (error) {
    context.error(`Failed to update race status for ${race.raceId}`, {
      raceId: race.raceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { raceUpdated: false };
  }
}

/**
 * Update entrants data with latest odds and money flow information
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {object} raceEventData - NZTAB race event data
 * @param {object} context - Function context for logging
 * @returns {object} Update statistics
 */
async function updateEntrantsData(
  databases,
  databaseId,
  raceId,
  raceEventData,
  context,
) {
  let entrantsUpdated = 0;
  let oddsHistoryRecords = 0;
  let moneyFlowRecords = 0;

  try {
    if (!raceEventData.entrants || !Array.isArray(raceEventData.entrants)) {
      context.log(`No entrants data found for race ${raceId}`);
      return { entrantsUpdated: 0, oddsHistoryRecords: 0, moneyFlowRecords: 0 };
    }

    // Create a map for money flow data by entrant ID
    const moneyFlowMap = new Map();
    if (
      raceEventData.money_flow &&
      raceEventData.money_flow.entrant_liabilities
    ) {
      for (const liability of raceEventData.money_flow.entrant_liabilities) {
        moneyFlowMap.set(liability.entrant_id, liability.hold_percentage);
      }
    }

    // Process each entrant
    for (const entrant of raceEventData.entrants) {
      const stats = await updateSingleEntrant(
        databases,
        databaseId,
        raceId,
        entrant,
        moneyFlowMap.get(entrant.entrant_id),
        context,
      );

      entrantsUpdated += stats.updated ? 1 : 0;
      oddsHistoryRecords += stats.oddsRecords;
      moneyFlowRecords += stats.moneyFlowRecords;
    }

    context.log(`Entrants update completed for race ${raceId}`, {
      raceId,
      entrantsUpdated,
      oddsHistoryRecords,
      moneyFlowRecords,
    });

    return { entrantsUpdated, oddsHistoryRecords, moneyFlowRecords };
  } catch (error) {
    context.error(`Failed to update entrants data for race ${raceId}`, {
      raceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { entrantsUpdated: 0, oddsHistoryRecords: 0, moneyFlowRecords: 0 };
  }
}

/**
 * Update a single entrant with latest data
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} raceId - Race ID
 * @param {object} entrantData - NZTAB entrant data
 * @param {number} holdPercentage - Money flow hold percentage
 * @param {object} context - Function context for logging
 * @returns {object} Update statistics
 */
async function updateSingleEntrant(
  databases,
  databaseId,
  raceId,
  entrantData,
  holdPercentage,
  context,
) {
  let oddsRecords = 0;
  let moneyFlowRecords = 0;

  try {
    // Get current entrant data to detect changes
    const currentEntrant = await getCurrentEntrant(
      databases,
      databaseId,
      entrantData.entrant_id,
      context,
    );

    // Prepare entrant data for upsert
    const entrantDoc = {
      entrantId: entrantData.entrant_id,
      name: entrantData.name,
      runnerNumber: entrantData.runner_number,
      isScratched: entrantData.is_scratched || false,
      race: raceId,
    };

    // Add optional fields if present
    if (entrantData.jockey) {
      entrantDoc.jockey = entrantData.jockey;
    }
    if (entrantData.trainer_name) {
      entrantDoc.trainerName = entrantData.trainer_name;
    }

    // Handle odds data
    if (entrantData.odds) {
      if (entrantData.odds.fixed_win !== undefined) {
        entrantDoc.winOdds = entrantData.odds.fixed_win;
      }
      if (entrantData.odds.fixed_place !== undefined) {
        entrantDoc.placeOdds = entrantData.odds.fixed_place;
      }
    }

    // Handle money flow data
    if (holdPercentage !== undefined) {
      entrantDoc.holdPercentage = holdPercentage;
    }

    // Perform entrant upsert
    const entrantUpdated = await performEntrantUpsert(
      databases,
      databaseId,
      entrantData.entrant_id,
      entrantDoc,
      context,
    );

    if (entrantUpdated) {
      // Create odds history records if odds changed
      if (currentEntrant && entrantData.odds) {
        const oddsStats = await createOddsHistoryIfChanged(
          databases,
          databaseId,
          entrantData.entrant_id,
          currentEntrant,
          entrantData.odds,
          context,
        );
        oddsRecords = oddsStats.recordsCreated;
      }

      // Create money flow history records if hold percentage changed
      if (currentEntrant && holdPercentage !== undefined) {
        const flowStats = await createMoneyFlowHistoryIfChanged(
          databases,
          databaseId,
          entrantData.entrant_id,
          currentEntrant,
          holdPercentage,
          context,
        );
        moneyFlowRecords = flowStats.recordsCreated;
      }
    }

    context.log(`Updated entrant ${entrantData.entrant_id}`, {
      entrantId: entrantData.entrant_id,
      name: entrantData.name,
      updated: entrantUpdated,
      oddsRecords,
      moneyFlowRecords,
    });

    return {
      updated: entrantUpdated,
      oddsRecords,
      moneyFlowRecords,
    };
  } catch (error) {
    context.error(`Failed to update entrant ${entrantData.entrant_id}`, {
      entrantId: entrantData.entrant_id,
      raceId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      updated: false,
      oddsRecords: 0,
      moneyFlowRecords: 0,
    };
  }
}

/**
 * Get current entrant data from database
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {object} context - Function context for logging
 * @returns {object|null} Current entrant data or null if not found
 */
async function getCurrentEntrant(databases, databaseId, entrantId, context) {
  try {
    const response = await databases.getDocument(
      databaseId,
      "entrants",
      entrantId,
    );
    return response;
  } catch (error) {
    // Document doesn't exist yet, which is fine for new entrants
    if (error.code === 404) {
      return null;
    }

    context.error(`Failed to get current entrant ${entrantId}`, {
      entrantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

/**
 * Perform entrant upsert operation (update or create)
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {object} entrantDoc - Entrant document data
 * @param {object} context - Function context for logging
 * @returns {boolean} True if successful
 */
async function performEntrantUpsert(
  databases,
  databaseId,
  entrantId,
  entrantDoc,
  context,
) {
  try {
    // Try to update first (most common case for existing entrants)
    await databases.updateDocument(
      databaseId,
      "entrants",
      entrantId,
      entrantDoc,
    );
    return true;
  } catch (updateError) {
    if (updateError.code === 404) {
      // Document doesn't exist, create it
      try {
        await databases.createDocument(
          databaseId,
          "entrants",
          entrantId,
          entrantDoc,
        );
        return true;
      } catch (createError) {
        context.error(`Failed to create entrant document ${entrantId}`, {
          entrantId,
          error:
            createError instanceof Error
              ? createError.message
              : "Unknown error",
        });
        return false;
      }
    } else {
      context.error(`Failed to update entrant document ${entrantId}`, {
        entrantId,
        error:
          updateError instanceof Error ? updateError.message : "Unknown error",
      });
      return false;
    }
  }
}

/**
 * Create odds history records if odds have changed
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {object} currentEntrant - Current entrant data
 * @param {object} newOdds - New odds data from API
 * @param {object} context - Function context for logging
 * @returns {object} Statistics about records created
 */
async function createOddsHistoryIfChanged(
  databases,
  databaseId,
  entrantId,
  currentEntrant,
  newOdds,
  context,
) {
  let recordsCreated = 0;
  const timestamp = new Date().toISOString();

  try {
    // Check for win odds changes
    if (
      newOdds.fixed_win !== undefined &&
      newOdds.fixed_win !== currentEntrant.winOdds
    ) {
      await databases.createDocument(databaseId, "odds-history", "unique()", {
        entrant: entrantId,
        odds: newOdds.fixed_win,
        eventTimestamp: timestamp,
        type: "win",
      });
      recordsCreated++;
    }

    // Check for place odds changes
    if (
      newOdds.fixed_place !== undefined &&
      newOdds.fixed_place !== currentEntrant.placeOdds
    ) {
      await databases.createDocument(databaseId, "odds-history", "unique()", {
        entrant: entrantId,
        odds: newOdds.fixed_place,
        eventTimestamp: timestamp,
        type: "place",
      });
      recordsCreated++;
    }

    if (recordsCreated > 0) {
      context.log(
        `Created ${recordsCreated} odds history records for entrant ${entrantId}`,
      );
    }

    return { recordsCreated };
  } catch (error) {
    context.error(`Failed to create odds history for entrant ${entrantId}`, {
      entrantId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return { recordsCreated: 0 };
  }
}

/**
 * Create money flow history records if hold percentage has changed
 * @param {Databases} databases - Appwrite databases client
 * @param {string} databaseId - Database ID
 * @param {string} entrantId - Entrant ID
 * @param {object} currentEntrant - Current entrant data
 * @param {number} newHoldPercentage - New hold percentage
 * @param {object} context - Function context for logging
 * @returns {object} Statistics about records created
 */
async function createMoneyFlowHistoryIfChanged(
  databases,
  databaseId,
  entrantId,
  currentEntrant,
  newHoldPercentage,
  context,
) {
  let recordsCreated = 0;
  const timestamp = new Date().toISOString();

  try {
    // Check for hold percentage changes
    if (newHoldPercentage !== currentEntrant.holdPercentage) {
      await databases.createDocument(
        databaseId,
        "money-flow-history",
        "unique()",
        {
          entrant: entrantId,
          holdPercentage: newHoldPercentage,
          eventTimestamp: timestamp,
        },
      );
      recordsCreated++;

      context.log(
        `Created money flow history record for entrant ${entrantId}`,
        {
          entrantId,
          oldHoldPercentage: currentEntrant.holdPercentage,
          newHoldPercentage,
        },
      );
    }

    return { recordsCreated };
  } catch (error) {
    context.error(
      `Failed to create money flow history for entrant ${entrantId}`,
      {
        entrantId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    );
    return { recordsCreated: 0 };
  }
}
