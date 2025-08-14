# 3. Frontend Architecture (Next.js 15+)

## 3.1. Data Fetching Strategy

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

## 3.3. Enhanced Race Interface Implementation (v4.7)

### Data Fetching Strategy

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
