import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/appwrite-server';
import { Query } from 'node-appwrite';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const entrantIds = searchParams.get('entrants')?.split(',') || [];
    const { id: raceId } = await params;

    if (!raceId) {
      return NextResponse.json(
        { error: 'Race ID is required' },
        { status: 400 }
      );
    }

    if (entrantIds.length === 0) {
      return NextResponse.json(
        { error: 'Entrant IDs are required' },
        { status: 400 }
      );
    }

    const { databases } = await createServerClient();
    const databaseId = 'raceday-db';

    // Fetch bucketed money flow history with optimized queries
    const response = await databases.listDocuments(
      databaseId,
      'money-flow-history',
      [
        Query.equal('entrant', entrantIds),
        Query.greaterThan('timeInterval', -60), // Only last hour of data
        Query.lessThan('timeInterval', 60),     // Only next hour of data
        Query.orderAsc('timeInterval'),         // Order by time interval
        Query.limit(2000) // Enough for high-frequency data
      ]
    );

    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds,
      bucketedData: true,
      queryOptimizations: [
        'Time interval filtering',
        'Bucketed storage',
        'Pre-calculated incrementals'
      ]
    });

  } catch (error) {
    console.error('Error fetching money flow timeline:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch money flow timeline data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}