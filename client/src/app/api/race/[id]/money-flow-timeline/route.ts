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
          Query.equal('raceId', raceId), // CRITICAL FIX: Enable raceId filter now that field exists
          Query.equal('type', 'bucketed_aggregation'), // Only bucketed aggregation records with pre-calculated increments
          Query.isNotNull('timeInterval'), // Only records with timeInterval (bucketed data)
          Query.greaterThan('timeInterval', -65), // Extended range to capture more pre/post race data  
          Query.lessThan('timeInterval', 66), // Include 65m baseline data (using lessThan with 66)
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
            Query.equal('raceId', raceId), // CRITICAL FIX: Enable raceId filter now that field exists
            Query.isNotNull('timeToStart'), // Only records with timeToStart
            Query.greaterThan('timeToStart', -65), // Extended range to capture more pre/post race data  
            Query.lessThan('timeToStart', 66), // Include 65m baseline data (using lessThan with 66)
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

    // Add interval coverage analysis for debugging
    const intervalCoverage = analyzeIntervalCoverage(response.documents, entrantIds);
    
    console.log('📊 Timeline interval coverage analysis:', intervalCoverage);
    
    return NextResponse.json({
      success: true,
      documents: response.documents,
      total: response.total,
      raceId,
      entrantIds,
      bucketedData: true,
      intervalCoverage,
      message: response.documents.length === 0 ? 'No timeline data available yet - collection may be empty after reinitialization' : undefined,
      queryOptimizations: [
        'Time interval filtering',
        'Bucketed storage',
        'Pre-calculated incrementals',
        'Extended range (-65 to +66)'
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

/**
 * Analyze interval coverage to identify gaps in timeline data
 */
function analyzeIntervalCoverage(documents: any[], entrantIds: string[]) {
  if (!documents || documents.length === 0) {
    return {
      totalDocuments: 0,
      entrantsCovered: 0,
      intervalsCovered: [],
      criticalPeriodGaps: [],
      coverageReport: 'No documents to analyze'
    };
  }

  // Expected critical timeline intervals (5m-0s period focus)
  const criticalIntervals = [60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 4, 3, 2, 1, 0];
  // Note: Post-start intervals like [-0.5, -1, -1.5, -2, -2.5, -3] handled dynamically

  // Analyze coverage per entrant
  const entrantCoverage = new Map();
  
  entrantIds.forEach(entrantId => {
    const entrantDocs = documents.filter(doc => {
      const docEntrantId = typeof doc.entrant === 'string' ? doc.entrant : 
                          (doc.entrant?.entrantId || doc.entrant?.$id || 'unknown');
      return docEntrantId === entrantId;
    });
    
    const intervals = entrantDocs.map(doc => doc.timeInterval ?? doc.timeToStart ?? -999)
                                 .filter(interval => interval !== -999);
    
    entrantCoverage.set(entrantId, {
      documentCount: entrantDocs.length,
      intervalsCovered: [...new Set(intervals)].sort((a, b) => b - a),
      criticalPeriodCoverage: criticalIntervals.filter(interval => intervals.includes(interval)),
      missingCriticalIntervals: criticalIntervals.filter(interval => !intervals.includes(interval))
    });
  });

  // Identify gaps in critical 5m-0s period
  const criticalGaps = [];
  entrantCoverage.forEach((coverage, entrantId) => {
    const missing5mTo0s = coverage.missingCriticalIntervals.filter(interval => interval >= 0 && interval <= 5);
    if (missing5mTo0s.length > 0) {
      criticalGaps.push({
        entrantId: entrantId.slice(-8), // Show last 8 chars for privacy
        missingIntervals: missing5mTo0s
      });
    }
  });

  return {
    totalDocuments: documents.length,
    entrantsCovered: entrantCoverage.size,
    intervalsCovered: [...new Set(documents.map(doc => doc.timeInterval ?? doc.timeToStart).filter(i => i !== undefined))].sort((a, b) => b - a),
    criticalPeriodGaps: criticalGaps,
    entrantSampleCoverage: entrantIds.slice(0, 2).map(id => ({
      entrantId: id.slice(-8),
      ...entrantCoverage.get(id) || { documentCount: 0, intervalsCovered: [] }
    })),
    coverageReport: `${entrantCoverage.size}/${entrantIds.length} entrants have timeline data, ${criticalGaps.length} have 5m-0s gaps`
  };
}