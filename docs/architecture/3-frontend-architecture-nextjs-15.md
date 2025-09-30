# 3. Frontend Architecture (Next.js 15+)

## 3.1. Data Fetching Strategy

**Primary Pattern: Coordinated Client-Side Polling**

```typescript
// Race data polling with dynamic cadence
const { race, entrants, isPolling, error, lastUpdate } = useRacePolling(raceId);

// Meeting list polling with connection health checks
const { meetings, isLoading, connectionState } = useMeetingsPolling();

// Pool data fetching coordinated with race polling
const { pools, isLoading: poolsLoading } = useRacePools(raceId);

// Money flow history with incremental loading
const { timeline, isLoading: timelineLoading } = useMoneyFlowTimeline(raceId);
```

**Benefits:**
- Dynamic polling intervals based on race timing (T-65m+: 30min, T-60m to T-5m: 2.5min, T-5m to T-3m: 30s, T-3m to Start: 30s, Post-start: 30s)
- Health monitoring prevents requests when backend unavailable
- Request deduplication avoids stacked API calls
- Response compression reduces payload sizes 60-70%
- Graceful degradation with error handling and retry logic
- Staleness indicators show data freshness

## 3.2. Enhanced Component Architecture (v4.7)

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
├── hooks/                # Polling and data management hooks
│   ├── useRacePolling.ts          # Coordinated race data polling with dynamic cadence
│   ├── useMeetingsPolling.tsx     # Meeting list polling with connection health checks
│   ├── useRacePools.ts            # Pool data fetching synchronized with race polling
│   ├── useMoneyFlowTimeline.ts    # Money flow history with incremental loading
│   ├── usePollingMetrics.ts       # Polling observability and metrics tracking
│   ├── useEndpointMetrics.ts      # Request-level metrics for monitoring
│   ├── useRaceNavigation.ts       # Race switching logic
│   ├── useValueFlash.ts           # Value change animations
│   └── useGridIndicators.ts       # Grid visual indicators
├── services/             # API service layer
│   ├── moneyFlowService.ts        # Money flow data queries
│   ├── racePoolsService.ts        # Pool totals service
│   └── jockeySilksService.ts      # Silk data service
└── types/                # Enhanced type definitions
    ├── moneyFlow.ts               # Money flow data types
    ├── racePools.ts               # Pool data types
    └── jockeySilks.ts             # Silk data types
```

## 3.3. Enhanced Race Interface Implementation

### Data Fetching Strategy

**Server-Side Rendering (SSR) First Paint:**
```typescript
// /race/[id]/page.tsx
export default async function RacePage({ params }: { params: { id: string } }) {
  // Initial SSR data fetch (optional - could also use client-side only)
  // Most data is fetched client-side via polling for consistency

  return <ClientRaceView raceId={params.id} />;
}
```

**Client-Side Polling Updates:**
```typescript
// Coordinated polling with RaceContext
function ClientRaceView({ raceId }: { raceId: string }) {
  // Main race polling hook with dynamic cadence
  const {
    race,
    entrants,
    isPolling,
    error,
    lastUpdate,
    nextPollIn
  } = useRacePolling(raceId);

  // Pool data fetching (triggered by race polling)
  const { pools, isLoading: poolsLoading } = useRacePools(raceId);

  // Money flow timeline (incremental loading)
  const { timeline, isLoading: timelineLoading } = useMoneyFlowTimeline(raceId);

  // Polling metrics for observability (dev only)
  const metrics = usePollingMetrics();

  return (
    <RaceContext.Provider value={{ race, entrants, pools, timeline }}>
      {showPollingMonitor && <PollingMonitor metrics={metrics} />}
      <EnhancedEntrantsGrid entrants={entrants} timeline={timeline} />
      <RaceFooter pools={pools} lastUpdate={lastUpdate} />
    </RaceContext.Provider>
  );
}

// useRacePolling implementation pattern
function useRacePolling(raceId: string) {
  const [data, setData] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const connectionState = useConnectionState();

  useEffect(() => {
    // Guard: don't poll if disconnected
    if (connectionState !== 'connected') {
      return;
    }

    // Determine polling interval based on race timing
    const interval = calculatePollingInterval(data?.race);

    const pollData = async () => {
      setIsPolling(true);
      try {
        const response = await fetch(`/api/race/${raceId}`, {
          signal: AbortSignal.timeout(5000)
        });
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        // Handle error, update connection state if needed
        setConnectionState('disconnected');
      } finally {
        setIsPolling(false);
      }
    };

    // Initial poll
    void pollData();

    // Set up interval for subsequent polls
    const timerId = setInterval(pollData, interval);

    return () => clearInterval(timerId);
  }, [raceId, connectionState, data?.race]);

  return { race: data?.race, entrants: data?.entrants, isPolling, ... };
}
```

### Enhanced Grid Component Architecture

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
