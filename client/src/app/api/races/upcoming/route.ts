import { NextRequest } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { jsonWithCompression } from '@/lib/http/compression';

const DATABASE_ID = 'raceday-db';
const RACES_COLLECTION_ID = 'races';

const DEFAULT_WINDOW_MINUTES = 120;
const DEFAULT_LOOKBACK_MINUTES = 5;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/races/upcoming
 *
 * Fetches upcoming races within a specified time window
 * Server-side endpoint to eliminate CORS issues and keep Appwrite credentials secure
 *
 * Query Parameters:
 * - windowMinutes: Number of minutes ahead to search (default: 120)
 * - lookbackMinutes: Number of minutes to look back (default: 5)
 * - limit: Maximum number of races to return (default: 50)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters with defaults
    const windowMinutes = Number(searchParams.get('windowMinutes')) || DEFAULT_WINDOW_MINUTES;
    const lookbackMinutes = Number(searchParams.get('lookbackMinutes')) || DEFAULT_LOOKBACK_MINUTES;
    const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, 100); // Cap at 100

    // Validate parameters
    if (windowMinutes < 0 || lookbackMinutes < 0 || limit < 1) {
      return jsonWithCompression(
        request,
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const lowerBound = new Date(now - lookbackMinutes * 60_000).toISOString();
    const upperBound = new Date(now + windowMinutes * 60_000).toISOString();

    const { databases } = await createServerClient();

    const query = [
      Query.greaterThan('start_time', lowerBound),
      Query.lessThanEqual('start_time', upperBound),
      Query.notEqual('status', 'Abandoned'),
      Query.notEqual('status', 'Final'),
      Query.notEqual('status', 'Finalized'),
      Query.orderAsc('start_time'),
      Query.limit(limit),
    ];

    const response = await databases.listDocuments(
      DATABASE_ID,
      RACES_COLLECTION_ID,
      query
    );

    return jsonWithCompression(request, {
      races: response.documents,
      total: response.total,
      timestamp: new Date().toISOString(),
      window: {
        lowerBound,
        upperBound,
        windowMinutes,
        lookbackMinutes,
      },
    });
  } catch (error) {
    console.error('Error fetching upcoming races:', error);

    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch upcoming races';

    return jsonWithCompression(
      request,
      { error: errorMessage },
      { status: 500 }
    );
  }
}
