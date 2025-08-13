# System Architecture Document: RaceDay v4.7

- **Project:** RaceDay
- **Version:** 4.7 (Enhanced Race Display Interface)
- **Author:** Winston (Architect)
- **Date:** 2025-08-13
- **Status:** Updated for Money Flow Visualization

## 1. System Overview

The RaceDay application uses a **microservices backend architecture** (Appwrite Cloud), a decoupled Next.js frontend, and real-time data synchronization. This version introduces comprehensive money flow visualization and enhanced race monitoring capabilities optimized for professional betting terminal layouts.

**Key Architectural Changes in v4.7:**
- Enhanced race display interface with money flow timeline visualization
- New money flow history tracking with time-series data aligned to polling windows
- Advanced real-time grid components with horizontal scrolling and sortable columns
- Race navigation system with contextual status and pool information
- Performance-optimized rendering for desktop-first data density requirements
- Jockey silks integration and enhanced visual indicators

---

## 2. Microservices Backend Architecture

### 2.1. Daily Data Pipeline Functions

The daily data import is now handled by three sequential functions with 10-minute spacing to prevent API rate limiting:

#### daily-meetings (17:00 UTC)
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch and store race meetings from NZ TAB API
- **Processing:** AU/NZ filtering, batch processing with error isolation
- **Output:** Meeting records in database
- **Duration:** ~60 seconds

#### daily-races (17:10 UTC)  
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch race details for all stored meetings
- **Processing:** Sequential race processing, relationship linking to meetings
- **Output:** Race records linked to meetings
- **Duration:** ~90 seconds

#### daily-entrants (17:20 UTC)
- **Specification:** s-1vcpu-1gb 
- **Purpose:** Fetch initial entrant data for all stored races
- **Processing:** Limited to 20 races with timeout protection, sequential API calls
- **Output:** Entrant records with initial odds data
- **Duration:** ~300 seconds (5 minutes max)

### 2.2. Real-time Functions

#### race-data-poller (Dynamic Schedule)
- **Specification:** s-2vcpu-2gb
- **Schedule:** Every minute during race hours
- **Purpose:** Real-time updates for active races
- **Dynamic Intervals:**
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final

#### alert-evaluator (Event-triggered)
- **Specification:** s-1vcpu-512mb
- **Trigger:** Database events on entrant updates
- **Purpose:** Process user alert configurations and create notifications
- **Processing:** Threshold evaluation, user filtering, notification creation

### 2.3. Enhanced Functions (v4.7)

#### money-flow-tracker (Event-triggered)
- **Specification:** s-1vcpu-1gb
- **Trigger:** Database events on entrant odds/pool updates
- **Purpose:** Capture and store incremental money flow changes for timeline visualization
- **Processing:** Calculate time-to-start, polling intervals, incremental amounts, pool percentages
- **Output:** Records in money-flow-history collection aligned with polling windows

#### race-pools-aggregator (Event-triggered) 
- **Specification:** s-1vcpu-512mb
- **Trigger:** Database events on entrant pool updates
- **Purpose:** Maintain race-level pool totals for footer display
- **Processing:** Aggregate win/place/quinella/trifecta pools, update race-pools collection
- **Output:** Real-time pool totals for race footer status bar

#### jockey-silks-enricher (HTTP-triggered)
- **Specification:** s-1vcpu-512mb
- **Purpose:** Fetch and cache jockey silk data from external sources
- **Processing:** API calls to racing data providers, color analysis, icon generation
- **Output:** Enriched jockey-silks collection with visual data

---

## 3. Frontend Architecture (Next.js 15+)

### 3.1. Data Fetching Strategy

**Primary Pattern: SWR + Real-time Invalidation**

```typescript
// Smart caching with real-time updates
const { meetings, isLoading } = useMeetings(filters);

// Real-time cache invalidation
useRealtime(
  'databases.raceday-db.collections.meetings.documents',
  (update) => {
    mutate(); // Invalidate SWR cache on backend updates
  }
);
```

**Benefits:**
- Initial data loads from cache (< 500ms)
- Real-time updates without polling overhead
- Automatic cache invalidation when backend functions update data
- Graceful degradation on connection issues

### 3.2. Enhanced Component Architecture (v4.7)

```
src/
├── app/                    # Next.js App Router
│   ├── (main)/page.tsx    # Dashboard with meetings list
│   └── race/[id]/page.tsx # Enhanced race detail with money flow grid
├── components/
│   ├── dashboard/         # MeetingsList, FilterControls
│   ├── race/             # Enhanced race components
│   │   ├── RaceHeader.tsx         # Navigation + status + pools
│   │   ├── EnhancedEntrantsGrid.tsx # Money flow timeline grid
│   │   ├── MoneyFlowColumns.tsx   # Horizontal scrolling time columns
│   │   ├── PoolToggle.tsx         # Win/Place/Odds view switcher
│   │   ├── JockeySilks.tsx        # Silk color/pattern display
│   │   ├── SortableColumns.tsx    # Interactive column sorting
│   │   └── RaceFooter.tsx         # Pool totals + results + status
│   ├── alerts/           # AlertsModal, NotificationToast
│   └── ui/               # Shared UI primitives
│       ├── DataTable.tsx          # High-performance data grid
│       ├── MoneyFlowIndicator.tsx # Change visualization
│       └── StatusIndicator.tsx    # Race status with timing
├── hooks/                # Enhanced real-time hooks
│   ├── useRealtime.ts             # Base real-time subscription
│   ├── useMoneyFlowData.ts        # Money flow history queries
│   ├── useRaceNavigation.ts       # Race switching logic
│   ├── useGridSorting.ts          # Column sorting state
│   └── usePoolToggle.ts           # Pool view switching
├── services/             # API service layer
│   ├── moneyFlowService.ts        # Money flow data queries
│   ├── racePoolsService.ts        # Pool totals service
│   └── jockeySilksService.ts      # Silk data service
└── types/                # Enhanced type definitions
    ├── moneyFlow.ts               # Money flow data types
    ├── racePools.ts               # Pool data types
    └── jockeySilks.ts             # Silk data types
```

### 3.3. Enhanced Race Interface Implementation (v4.7)

#### Data Fetching Strategy

**Server-Side Rendering (SSR) First Paint:**
```typescript
// /race/[id]/page.tsx
export default async function RacePage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  
  // Parallel data fetching for first paint
  const [raceData, entrants, moneyFlowHistory, racePools] = await Promise.all([
    supabase.from('races').select('*').eq('raceId', params.id).single(),
    supabase.from('entrants').select('*, jockey_silks(*)').eq('race', params.id),
    supabase.from('money-flow-history')
      .select('*')
      .eq('entrant.race', params.id)
      .gte('pollingTimestamp', /* T-60m */)
      .order('pollingTimestamp', { ascending: true }),
    supabase.from('race-pools').select('*').eq('race', params.id).single()
  ]);

  return <EnhancedRaceView initialData={{ raceData, entrants, moneyFlowHistory, racePools }} />;
}
```

**Client-Side Real-Time Updates:**
```typescript
// Enhanced real-time subscription with money flow tracking
function useEnhancedRaceData(raceId: string, initialData: InitialRaceData) {
  const [data, setData] = useState(initialData);
  
  useEffect(() => {
    const subscriptions = [
      // Real-time entrant updates
      supabase.channel(`race:${raceId}:entrants`)
        .on('postgres_changes', 
          { event: '*', schema: 'public', table: 'entrants', filter: `race=eq.${raceId}` },
          handleEntrantUpdate
        ),
      
      // Money flow history updates  
      supabase.channel(`race:${raceId}:money-flow`)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'money-flow-history' },
          handleMoneyFlowUpdate
        ),
        
      // Race pools updates
      supabase.channel(`race:${raceId}:pools`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'race-pools', filter: `race=eq.${raceId}` },
          handlePoolsUpdate
        )
    ];
    
    subscriptions.forEach(sub => sub.subscribe());
    return () => subscriptions.forEach(sub => sub.unsubscribe());
  }, [raceId]);
  
  return data;
}
```

#### Enhanced Grid Component Architecture

**Money Flow Timeline Grid:**
```typescript
// High-performance grid with virtualization for desktop data density
interface MoneyFlowGridProps {
  entrants: EntrantWithHistory[];
  timeColumns: TimeColumn[];
  poolView: 'win' | 'place' | 'odds';
  sortConfig: SortConfig;
  onSort: (column: string) => void;
}

function EnhancedEntrantsGrid({ entrants, timeColumns, poolView, sortConfig, onSort }: MoneyFlowGridProps) {
  const virtualizer = useVirtualizer({
    count: entrants.length,
    getScrollElement: () => gridRef.current,
    estimateSize: () => 60, // Fixed row height for performance
    overscan: 5
  });

  return (
    <div className="relative">
      {/* Sticky header with sortable columns */}
      <GridHeader 
        timeColumns={timeColumns}
        sortConfig={sortConfig}
        onSort={onSort}
        poolView={poolView}
      />
      
      {/* Virtualized grid body */}
      <div ref={gridRef} className="h-[600px] overflow-auto">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <GridRow
              key={virtualItem.key}
              entrant={entrants[virtualItem.index]}
              timeColumns={timeColumns}
              poolView={poolView}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Horizontal Scrolling Time Columns:**
```typescript
// Optimized horizontal scroll for time period columns
function MoneyFlowColumns({ entrant, timeColumns, poolView }: MoneyFlowColumnsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Smooth scrolling with momentum
  const { scrollX, scrollXProgress } = useScroll({ container: scrollRef });
  
  return (
    <div ref={scrollRef} className="flex overflow-x-auto snap-x snap-mandatory">
      {timeColumns.map((column, index) => {
        const moneyData = entrant.moneyFlowHistory.find(
          h => h.timeToStart === column.timeToStart
        );
        
        return (
          <motion.div
            key={column.id}
            className="min-w-[80px] snap-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: index * 0.02 }}
          >
            <MoneyFlowCell
              data={moneyData}
              poolView={poolView}
              timeColumn={column}
              isRecentChange={moneyData?.pollingTimestamp > Date.now() - 30000}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
```

---

## 4. Database Schema (Appwrite)

### 4.1. Core Collections

```sql
-- meetings: Race meeting information
meetingId (string, unique), meetingName (string), country (string, indexed),
raceType (string, indexed), date (datetime, indexed), status (string)

-- races: Individual races linked to meetings  
raceId (string, unique), name (string), raceNumber (integer, indexed),
startTime (datetime, indexed), status (string), actualStart (datetime),
meeting (relationship → meetings)

-- entrants: Horse entries linked to races
entrantId (string, unique), name (string), runnerNumber (integer, indexed),
winOdds (float), placeOdds (float), holdPercentage (float),
isScratched (boolean), race (relationship → races)

-- odds-history: Time-series odds data for sparklines
odds (float), eventTimestamp (datetime, indexed), type (string),
entrant (relationship → entrants)

-- money-flow-history: NEW - Time-series money flow data for timeline visualization
winPoolAmount (float), placePoolAmount (float), totalPoolAmount (float),
poolPercentage (float), incrementalAmount (float), pollingTimestamp (datetime, indexed),
timeToStart (integer), pollingInterval (string), entrant (relationship → entrants)

-- race-pools: NEW - Race-level pool totals tracking
winPoolTotal (float), placePoolTotal (float), quinellaPoolTotal (float),
trifectaPoolTotal (float), lastUpdated (datetime), race (relationship → races)

-- jockey-silks: NEW - Jockey silk color and pattern data
silkId (string, unique), primaryColor (string), secondaryColor (string),
pattern (string), iconUrl (string), jockeyName (string, indexed)

-- user-alert-configs: User notification preferences  
userId (string, indexed), alertType (string), threshold (float),
enabled (boolean), entrant (relationship → entrants)

-- notifications: Real-time alert delivery
userId (string, indexed), title (string), message (string),
type (string), read (boolean), raceId (string), entrantId (string)
```

### 4.2. Optimized Indexes

- **meetings:** idx_date, idx_country, idx_race_type, idx_meeting_id (unique)
- **races:** idx_race_id (unique), idx_start_time, idx_status
- **entrants:** idx_entrant_id (unique), idx_runner_number
- **odds-history:** idx_timestamp, idx_entrant_timestamp (compound)
- **money-flow-history:** idx_polling_timestamp, idx_entrant_polling (compound), idx_time_to_start
- **race-pools:** idx_race_id (unique), idx_last_updated
- **jockey-silks:** idx_silk_id (unique), idx_jockey_name
- **user-alert-configs:** idx_user_id, idx_user_entrant (compound)

---

## 5. Key Architectural Improvements

### 5.1. Resource Management

**Previous Issues (v1.4):**
- Single monolithic function trying to do everything
- Resource contention and memory exhaustion
- Functions hanging for hours during entrant processing
- No timeout protection on external API calls

**Solutions (v2.0):**
- Right-sized compute resources per function type
- Sequential processing with 1-second delays between API calls
- 15-second timeouts on all external API calls
- Explicit memory management with garbage collection hints
- Limited batch processing (max 20 races for daily-entrants)

### 5.2. Error Handling & Resilience

```javascript
// Individual error isolation - continue processing on failures
for (const race of races) {
  try {
    await processRace(race);
  } catch (error) {
    context.error(`Failed to process race ${race.id}`, { error: error.message });
    // Continue with next race - don't fail entire batch
  }
}

// Timeout protection for all API calls
const raceData = await Promise.race([
  fetchRaceEventData(nztabBaseUrl, raceId, context),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`Timeout for race ${raceId}`)), 15000)
  )
]);
```

### 5.3. Real-time Performance

- **Frontend:** WebSocket subscriptions with throttled updates (max 10/second)
- **Backend:** Event-driven alert evaluation triggered by database changes
- **Latency:** Sub-2-second updates from backend to frontend
- **Connection Health:** Automatic reconnection and health monitoring

---

## 6. Deployment Architecture

### 6.1. Function Specifications

```json
{
  "functions": [
    {
      "$id": "daily-meetings",
      "specification": "s-1vcpu-512mb",
      "schedule": "0 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-races", 
      "specification": "s-1vcpu-512mb",
      "schedule": "10 17 * * *",
      "timeout": 300
    },
    {
      "$id": "daily-entrants",
      "specification": "s-1vcpu-1gb",
      "schedule": "20 17 * * *", 
      "timeout": 300
    },
    {
      "$id": "race-data-poller",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300
    },
    {
      "$id": "alert-evaluator",
      "specification": "s-1vcpu-512mb",
      "events": ["databases.*.collections.entrants.documents.*.update"],
      "timeout": 60
    }
  ]
}
```

### 6.2. Deployment Pipeline

- **Frontend:** Vercel deployment with automatic builds on main branch
- **Backend:** Individual function deployment via Appwrite CLI
- **Database:** Idempotent schema setup via client/scripts/appwrite-setup.ts
- **Monitoring:** Built-in Appwrite Console + structured logging

---

## 7. Performance Characteristics

### 7.1. Function Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| race-data-poller | 120s | 1.5GB | >99.5% |
| alert-evaluator | 30s | 100MB | >99.9% |

### 7.2. Enhanced Frontend Performance Targets (v4.7)

**Core Performance Requirements:**
- **Initial Load:** < 200ms for cached race data (SSR first paint)
- **Real-time Updates:** < 100ms latency for money flow changes
- **Race Switching:** < 300ms total transition time
- **Grid Rendering:** < 50ms for 20+ runners with full money flow data
- **Horizontal Scroll:** 60fps smooth scrolling for time columns

**Desktop-Optimized Targets:**
- **Data Density:** Support 12+ time columns without performance degradation
- **Sorting Performance:** < 100ms sort time for any column with 20+ rows
- **Memory Usage:** < 100MB for single race view with full history
- **Bundle Size:** < 350KB initial (increased for enhanced grid components)

**Real-Time Performance:**
- **WebSocket Latency:** < 50ms from backend update to grid re-render
- **Update Batching:** Max 10 updates/second to prevent UI thrashing
- **Change Indicators:** < 16ms animation frame updates for ⚡ indicators

---

## 8. Migration to v4.7 Enhanced Race Interface

### 8.1. New Features & Components

**Enhanced Database Schema:**
- New `money-flow-history` collection for timeline visualization data
- New `race-pools` collection for real-time pool totals tracking  
- New `jockey-silks` collection for visual silk data
- Additional indexes for optimized money flow queries

**New Backend Functions:**
- `money-flow-tracker` - Event-triggered money flow history capture
- `race-pools-aggregator` - Real-time pool totals maintenance
- `jockey-silks-enricher` - HTTP-triggered silk data enrichment

**Enhanced Frontend Components:**
- `EnhancedEntrantsGrid` with virtualization and money flow timeline
- `MoneyFlowColumns` with horizontal scrolling time periods
- `RaceHeader` with navigation and contextual status
- `RaceFooter` with pool totals and race results

### 8.2. Data Migration Strategy

**Backward Compatibility:**
- All existing collections and data preserved
- New collections added alongside existing schema
- Existing race pages continue to work during migration
- Progressive enhancement approach for new features

**Historical Data Population:**
- Money flow history will be populated from next polling cycle
- Existing odds-history data can be converted to money flow format
- Jockey silks data populated on-demand via enricher function

### 8.3. Deployment Steps (v4.7)

1. **Database Schema Updates:**
   - Deploy new collections: `money-flow-history`, `race-pools`, `jockey-silks`
   - Add optimized indexes for time-series queries
   - Maintain existing collections unchanged

2. **Backend Function Deployment:**
   - Deploy `money-flow-tracker` event-triggered function  
   - Deploy `race-pools-aggregator` for pool totals
   - Deploy `jockey-silks-enricher` HTTP endpoint
   - Update existing `race-data-poller` to populate new collections

3. **Frontend Component Deployment:**
   - Deploy enhanced components with feature flags
   - Implement progressive enhancement strategy
   - A/B test enhanced grid vs existing grid
   - Monitor performance metrics during rollout

4. **Validation & Monitoring:**
   - Verify money flow data population aligns with polling windows
   - Confirm real-time updates work across all new collections
   - Monitor performance targets: <200ms first paint, <100ms updates
   - Validate horizontal scrolling and sorting performance

---

## 9. Success Metrics

### 9.1. Technical Metrics

- **Zero hanging functions:** All functions complete within timeout limits
- **Pipeline reliability:** >99% daily pipeline success rate
- **Data completeness:** >95% of races have complete entrant data
- **Real-time latency:** <2s from backend update to frontend display

### 9.2. Enhanced Business Metrics (v4.7)

**User Experience Metrics:**
- **Race page load:** <200ms initial paint for enhanced grid interface
- **Money flow visualization:** Users can identify significant changes within 5 seconds
- **Race switching efficiency:** <300ms transition preserves user context
- **Data scanning accuracy:** 95% reduction in time to spot unusual money patterns

**Professional Interface Metrics:**
- **Desktop optimization:** Support for 12+ time columns without performance degradation
- **Information density:** 20+ runners with full money flow history displayable simultaneously  
- **Real-time responsiveness:** <100ms latency for money flow change indicators
- **Multi-race monitoring:** Seamless navigation between races maintains analytical flow

**Data Richness Metrics:**
- **Historical completeness:** >90% of money flow data captured across polling windows
- **Pool tracking accuracy:** Real-time pool totals updated within 2 seconds of backend changes
- **Visual enhancement:** Jockey silks displayed for >85% of active runners
- **Sort/filter performance:** <100ms response time for any grid operation

---

## 10. Client Integration

### 10.1. Real-Time Data Architecture

The RaceDay client application leverages Appwrite's real-time subscriptions to provide live betting market visualization with comprehensive historical trend analysis.

**Key Integration Features:**
- **Real-time subscriptions** to `entrants` collection for live odds updates
- **Historical data queries** to `odds-history` collection for trend charts
- **Sub-second latency** for market movements and status changes
- **Seamless race switching** with preserved historical context

### 10.2. Implementation Guide

For detailed client integration patterns, data access strategies, and React implementation examples, see:

📖 **[Client Real-Time Data Integration Guide](./client-real-time-data-integration.md)**

This guide provides:
- Complete subscription patterns for live data
- Historical data querying strategies
- React hooks and component examples
- Performance optimization techniques
- Trend calculation utilities

---

## 11. Conclusion

The RaceDay v4.7 enhanced race interface architecture builds upon the proven v2.0 microservices foundation to deliver professional-grade betting terminal capabilities with comprehensive money flow visualization. The new architecture introduces sophisticated time-series data tracking, high-performance grid rendering, and desktop-optimized data density while maintaining the system's reliability and real-time responsiveness.

**Key v4.7 Achievements:**
- **Professional Interface:** Desktop-first design supporting 12+ time columns with horizontal scrolling
- **Money Flow Intelligence:** Real-time tracking and visualization of betting patterns aligned with polling windows  
- **Performance Excellence:** <200ms first paint, <100ms real-time updates, <300ms race switching
- **Enhanced Data Model:** New collections for money flow history, pool tracking, and jockey silks
- **Backward Compatibility:** Seamless integration with existing v2.0 architecture without breaking changes

The enhanced architecture delivers Bloomberg Terminal-style information density and real-time capabilities while maintaining the robust microservices foundation. This design is production-ready and optimized for immediate deployment with progressive enhancement strategy to minimize risk.

**Next Phase:** Document sharding recommended for specialized team focus areas - frontend components, backend functions, and database optimization can now be developed independently while maintaining architectural coherence.