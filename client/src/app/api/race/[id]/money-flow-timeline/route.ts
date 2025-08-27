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

    // Try bucketed data first (with timeInterval field)
    let response;
    try {
      response = await databases.listDocuments(
        databaseId,
        'money-flow-history',
        [
          Query.equal('entrant', entrantIds),
          // Query.equal('raceId', raceId), // Skip raceId filter if field doesn't exist yet
          Query.isNotNull('timeInterval'), // Only records with timeInterval (bucketed data)
          Query.greaterThan('timeInterval', -60), // Only last hour of data  
          Query.lessThan('timeInterval', 61), // Include 60m baseline data (using lessThan with 61)
          Query.orderAsc('timeInterval'),         // Order by time interval
          Query.limit(2000) // Enough for high-frequency data
        ]
      );
    } catch (error) {
      console.log('📊 Error querying bucketed data (likely no data exists yet):', error);
      response = { documents: [], total: 0 };
    }

    // If no bucketed data found, fall back to legacy timeToStart data
    if (response.documents.length === 0) {
      console.log('📊 No bucketed data found, falling back to legacy timeToStart data');
      
      // Try a broader query first to see if any data exists at all
      try {
        const broadResponse = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            Query.equal('entrant', entrantIds),
            Query.limit(10) // Just get a few records to see what exists
          ]
        );
        
        console.log(`📊 Broad query found ${broadResponse.documents.length} total documents for entrants`);
        if (broadResponse.documents.length > 0) {
          console.log('📊 Sample document fields:', Object.keys(broadResponse.documents[0]).filter(k => !k.startsWith('$')));
          console.log('📊 Sample document timeToStart values:', broadResponse.documents.map(d => d.timeToStart).slice(0, 5));
        }
        
        response = await databases.listDocuments(
          databaseId,
          'money-flow-history',
          [
            Query.equal('entrant', entrantIds),
            // Query.equal('raceId', raceId), // Skip raceId filter if field doesn't exist yet
            Query.isNotNull('timeToStart'), // Only records with timeToStart
            Query.greaterThan('timeToStart', -60), // Only last hour of data  
            Query.lessThan('timeToStart', 61), // Include 60m baseline data (using lessThan with 61)
            Query.orderAsc('timeToStart'),         // Order by time to start
            Query.limit(2000) // Enough for high-frequency data
          ]
        );
      } catch (legacyError) {
        console.log('📊 Error querying legacy data (likely collection is empty):', legacyError);
        response = { documents: [], total: 0 };
      }
      
      return NextResponse.json({
        success: true,
        documents: response.documents,
        total: response.total,
        raceId,
        entrantIds,
        bucketedData: false, // Indicate this is legacy data
        message: response.documents.length === 0 ? 'No timeline data available yet - collection may be empty after reinitialization' : undefined,
        queryOptimizations: [
          'Time interval filtering',
          'Legacy timeToStart data'
        ]
      });
    }

    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds,
      bucketedData: true,
      message: response.documents.length === 0 ? 'No timeline data available yet - collection may be empty after reinitialization' : undefined,
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