import { test, describe, mock } from "node:test";
import assert from "node:assert";

// Mock the main module to isolate functions for testing
// Since we can't easily import functions directly, we'll recreate the core logic for testing

/**
 * Calculate time to start in minutes (copied from main.js for testing)
 */
function calculateTimeToStart(advertised_start, now) {
  const startTime = new Date(advertised_start);
  const diffMs = startTime.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60)); // Convert to minutes
}

/**
 * Determine polling interval based on time to start (copied from main.js for testing)
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

describe("Race Data Poller Tests", () => {
  describe("calculateTimeToStart", () => {
    test("should calculate positive minutes for future race", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:30:00Z"); // 30 minutes in future

      const result = calculateTimeToStart(raceStart, now);
      assert.strictEqual(result, 30);
    });

    test("should calculate negative minutes for past race", () => {
      const now = new Date("2024-01-01T12:30:00Z");
      const raceStart = new Date("2024-01-01T12:00:00Z"); // 30 minutes in past

      const result = calculateTimeToStart(raceStart, now);
      assert.strictEqual(result, -30);
    });

    test("should calculate zero for race starting now", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:00:00Z");

      const result = calculateTimeToStart(raceStart, now);
      assert.strictEqual(result, 0);
    });

    test("should handle string date inputs", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = "2024-01-01T12:15:00Z"; // 15 minutes in future

      const result = calculateTimeToStart(raceStart, now);
      assert.strictEqual(result, 15);
    });
  });

  describe("calculatePollingInterval", () => {
    test("should return 5 minute interval for T-60m to T-20m phase", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:45:00Z"); // 45 minutes in future

      const result = calculatePollingInterval(raceStart, now);

      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "T-60m to T-20m");
      assert.strictEqual(result.minutesToStart, 45);
    });

    test("should return 2 minute interval for T-20m to T-10m phase", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:15:00Z"); // 15 minutes in future

      const result = calculatePollingInterval(raceStart, now);

      assert.strictEqual(result.intervalMinutes, 2);
      assert.strictEqual(result.phase, "T-20m to T-10m");
      assert.strictEqual(result.minutesToStart, 15);
    });

    test("should return 1 minute interval for T-10m to T-5m phase", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:08:00Z"); // 8 minutes in future

      const result = calculatePollingInterval(raceStart, now);

      assert.strictEqual(result.intervalMinutes, 1);
      assert.strictEqual(result.phase, "T-10m to T-5m");
      assert.strictEqual(result.minutesToStart, 8);
    });

    test("should return 15 second interval for T-5m to Start phase", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T12:02:00Z"); // 2 minutes in future

      const result = calculatePollingInterval(raceStart, now);

      assert.strictEqual(result.intervalMinutes, 0.25);
      assert.strictEqual(result.phase, "T-5m to Start");
      assert.strictEqual(result.minutesToStart, 2);
    });

    test("should return 5 minute interval for post-start phase", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T11:50:00Z"); // 10 minutes in past

      const result = calculatePollingInterval(raceStart, now);

      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "Post-Start to Final");
      assert.strictEqual(result.minutesToStart, -10);
    });

    test("should handle delayed start with 15 second polling", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T11:55:00Z"); // 5 minutes in past
      const race = {
        actualStart: null,
        status: "Interim",
      };

      const result = calculatePollingInterval(raceStart, now, race);

      assert.strictEqual(result.intervalMinutes, 0.25);
      assert.strictEqual(result.phase, "Delayed Start (15s polling)");
      assert.strictEqual(result.minutesToStart, -5);
      assert.strictEqual(result.isDelayed, true);
    });

    test("should not use delayed polling for Final races", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T11:55:00Z"); // 5 minutes in past
      const race = {
        actualStart: null,
        status: "Final",
      };

      const result = calculatePollingInterval(raceStart, now, race);

      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "Post-Start to Final");
      assert.strictEqual(result.minutesToStart, -5);
      assert.strictEqual(result.isDelayed, undefined);
    });

    test("should not use delayed polling when actual start exists", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-01T11:55:00Z"); // 5 minutes in past
      const race = {
        actualStart: "2024-01-01T11:57:00Z",
        status: "Interim",
      };

      const result = calculatePollingInterval(raceStart, now, race);

      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "Post-Start to Final");
      assert.strictEqual(result.minutesToStart, -5);
      assert.strictEqual(result.isDelayed, undefined);
    });

    test("should handle exact boundary conditions", () => {
      const now = new Date("2024-01-01T12:00:00Z");

      // Test exactly 20 minutes (should be T-60m to T-20m phase)
      let raceStart = new Date("2024-01-01T12:20:00Z");
      let result = calculatePollingInterval(raceStart, now);
      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "T-60m to T-20m");

      // Test exactly 10 minutes (should be T-20m to T-10m phase)
      raceStart = new Date("2024-01-01T12:10:00Z");
      result = calculatePollingInterval(raceStart, now);
      assert.strictEqual(result.intervalMinutes, 2);
      assert.strictEqual(result.phase, "T-20m to T-10m");

      // Test exactly 5 minutes (should be T-10m to T-5m phase)
      raceStart = new Date("2024-01-01T12:05:00Z");
      result = calculatePollingInterval(raceStart, now);
      assert.strictEqual(result.intervalMinutes, 1);
      assert.strictEqual(result.phase, "T-10m to T-5m");

      // Test exactly 0 minutes (should be T-5m to Start phase)
      raceStart = new Date("2024-01-01T12:00:00Z");
      result = calculatePollingInterval(raceStart, now);
      assert.strictEqual(result.intervalMinutes, 0.25);
      assert.strictEqual(result.phase, "T-5m to Start");
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("should handle invalid date inputs gracefully", () => {
      const now = new Date("2024-01-01T12:00:00Z");

      // This should throw or return NaN, but we're testing robustness
      try {
        const result = calculateTimeToStart("invalid-date", now);
        assert.ok(isNaN(result)); // Should be NaN for invalid dates
      } catch (error) {
        // Some environments might throw, which is also acceptable
        assert.ok(error instanceof Error);
      }
    });

    test("should handle very large time differences", () => {
      const now = new Date("2024-01-01T12:00:00Z");
      const raceStart = new Date("2024-01-02T12:00:00Z"); // 24 hours in future

      const result = calculatePollingInterval(raceStart, now);

      // Should still use T-60m to T-20m interval for far future races
      assert.strictEqual(result.intervalMinutes, 5);
      assert.strictEqual(result.phase, "T-60m to T-20m");
      assert.strictEqual(result.minutesToStart, 1440); // 24 hours = 1440 minutes
    });
  });
});
