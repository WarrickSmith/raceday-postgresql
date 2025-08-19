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

    // Fetch money flow history for the specified entrants
    const response = await databases.listDocuments(
      databaseId,
      'money-flow-history',
      [
        Query.equal('entrant', entrantIds),
        Query.orderDesc('pollingTimestamp'),
        Query.limit(1000) // Reasonable limit for timeline data
      ]
    );

    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds
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