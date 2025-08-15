import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, Query } from '@/lib/appwrite-server';
import { MoneyFlowHistory, OddsHistoryData } from '@/types/meetings';

const ODDS_HISTORY_QUERY_LIMIT = 500;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: raceId } = await params;
    
    if (!raceId) {
      return NextResponse.json({ error: 'Race ID is required' }, { status: 400 });
    }

    const historicalData = await getHistoricalData(raceId);
    
    if (!historicalData) {
      return NextResponse.json({ error: 'Race not found' }, { status: 404 });
    }

    // Set cache headers for optimal performance
    const response = NextResponse.json(historicalData);
    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    
    return response;
  } catch (error) {
    console.error('API Error fetching historical data:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

interface MoneyFlowData {
  holdPercentage?: number;
  previousHoldPercentage?: number;
  moneyFlowTrend?: 'up' | 'down' | 'neutral';
}

async function getHistoricalData(raceId: string): Promise<{
  oddsHistory: { [entrantId: string]: OddsHistoryData[] };
  moneyFlow: { [entrantId: string]: MoneyFlowData };
  dataFreshness: {
    oddsHistoryCount: number;
    moneyFlowHistoryCount: number;
  };
} | null> {
  try {
    const { databases } = await createServerClient();
    
    // First get race data and entrants
    const raceQuery = await databases.listDocuments(
      'raceday-db', 
      'races',
      [Query.equal('raceId', raceId), Query.limit(1)]
    );

    if (!raceQuery.documents.length) {
      return null;
    }

    const raceData = raceQuery.documents[0];
    
    // Get entrants for this race
    const entrantsQuery = await databases.listDocuments(
      'raceday-db',
      'entrants',
      [Query.equal('race', raceData.$id)]
    );

    const entrantIds = entrantsQuery.documents.map(doc => doc.$id);

    if (entrantIds.length === 0) {
      return {
        oddsHistory: {},
        moneyFlow: {},
        dataFreshness: {
          oddsHistoryCount: 0,
          moneyFlowHistoryCount: 0,
        },
      };
    }

    // Fetch historical data in parallel
    const [moneyFlowQuery, oddsHistoryQuery] = await Promise.all([
      // Money flow history batch query
      databases.listDocuments(
        'raceday-db',
        'money-flow-history',
        [
          Query.equal('entrant', entrantIds),
          Query.orderDesc('$createdAt'),
          Query.limit(200)
        ]
      ),
      // Odds history batch query
      databases.listDocuments(
        'raceday-db',
        'odds-history',
        [
          Query.equal('entrant', entrantIds),
          Query.orderDesc('$createdAt'),
          Query.limit(ODDS_HISTORY_QUERY_LIMIT)
        ]
      )
    ]);

    // Process money flow data
    const moneyFlowByEntrant = new Map<string, MoneyFlowHistory[]>();
    moneyFlowQuery.documents.forEach(doc => {
      const moneyFlowDoc = doc as unknown as MoneyFlowHistory;
      const entrantId = moneyFlowDoc.entrant;
      if (!moneyFlowByEntrant.has(entrantId)) {
        moneyFlowByEntrant.set(entrantId, []);
      }
      moneyFlowByEntrant.get(entrantId)!.push(moneyFlowDoc);
    });

    // Process odds history data
    const oddsHistoryByEntrant = new Map<string, OddsHistoryData[]>();
    oddsHistoryQuery.documents.forEach(doc => {
      const rawDoc = doc as unknown as { entrant: string; type: string; [key: string]: unknown };
      const entrantId = rawDoc.entrant;
      
      // Only include win odds for sparklines (pool_win preferred, fixed_win as fallback)
      if (rawDoc.type !== 'pool_win' && rawDoc.type !== 'fixed_win') {
        return;
      }
      
      const oddsHistoryDoc: OddsHistoryData = {
        $id: rawDoc.$id as string,
        $createdAt: rawDoc.$createdAt as string,
        $updatedAt: rawDoc.$updatedAt as string,
        entrant: rawDoc.entrant,
        winOdds: rawDoc.odds as number,
        timestamp: (rawDoc.eventTimestamp || rawDoc.$createdAt) as string
      };
      
      if (!oddsHistoryByEntrant.has(entrantId)) {
        oddsHistoryByEntrant.set(entrantId, []);
      }
      oddsHistoryByEntrant.get(entrantId)!.push(oddsHistoryDoc);
    });

    // Process money flow trends
    const moneyFlowMap: { [entrantId: string]: MoneyFlowData } = {};
    entrantIds.forEach(entrantId => {
      const histories = moneyFlowByEntrant.get(entrantId) || [];
      histories.sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
      
      if (histories.length > 0) {
        const current = histories[0];
        const previous = histories[1];
        
        let trend: 'up' | 'down' | 'neutral' = 'neutral';
        if (previous && current.holdPercentage !== previous.holdPercentage) {
          trend = current.holdPercentage > previous.holdPercentage ? 'up' : 'down';
        }
        
        moneyFlowMap[entrantId] = {
          holdPercentage: current.holdPercentage,
          previousHoldPercentage: previous?.holdPercentage,
          moneyFlowTrend: trend
        };
      }
    });

    // Convert odds history to final format
    const oddsHistoryMap: { [entrantId: string]: OddsHistoryData[] } = {};
    entrantIds.forEach(entrantId => {
      const oddsHistory = oddsHistoryByEntrant.get(entrantId) || [];
      oddsHistory.sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
      oddsHistoryMap[entrantId] = oddsHistory;
    });

    return {
      oddsHistory: oddsHistoryMap,
      moneyFlow: moneyFlowMap,
      dataFreshness: {
        oddsHistoryCount: oddsHistoryQuery.documents.length,
        moneyFlowHistoryCount: moneyFlowQuery.documents.length,
      },
    };
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return null;
  }
}