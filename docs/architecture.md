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

#### enhanced-race-poller (HTTP-triggered, Master Coordination)
- **Specification:** s-2vcpu-2gb
- **Trigger:** HTTP requests with advanced polling logic
- **Purpose:** Consolidated race polling with mathematical validation and data quality scoring
- **Features:** 
  - Enhanced data quality scoring and consistency checks
  - Mathematical validation of pool sums and percentages
  - Dual-phase polling: early morning baseline capture + high-frequency critical periods
  - Server-heavy processing with pre-calculated incremental amounts
- **Dynamic Intervals (v4.8 aligned):**
  - T-65m+: 30-minute baseline cadence (15 minutes with double-frequency override)
  - T-60m to T-5m: 2.5-minute active cadence (75 seconds with double-frequency override)
  - T-5m to Final: 30-second critical cadence (15 seconds with double-frequency override)
  - Post-final statuses: Polling halts entirely to conserve capacity
- **Cadence Controls:**
  - Client/UI mirrors these windows via `calculatePollingIntervalMs`
  - Environment toggles: `NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY`, `DOUBLE_POLLING_FREQUENCY`, `NEXT_PUBLIC_POLLING_ENABLED`, `NEXT_PUBLIC_POLLING_DEBUG_MODE`, `NEXT_PUBLIC_POLLING_TIMEOUT`

#### master-race-scheduler (Scheduled, Autonomous Coordination)
- **Specification:** s-1vcpu-512mb
- **Schedule:** Every 1 minute (CRON minimum interval)
- **Purpose:** Autonomous coordination of all race polling activities
- **Processing:** Delegates high-frequency polling to enhanced-race-poller internal loops
- **Coordination:** Manages polling schedules across multiple races simultaneously

#### race-data-poller (Dynamic Schedule, Legacy)
- **Specification:** s-2vcpu-2gb
- **Schedule:** Every minute during race hours
- **Purpose:** Real-time updates for active races (legacy function)
- **Status:** Maintained for backward compatibility, enhanced-race-poller recommended
- **Dynamic Intervals:**
  - T-60m to T-20m: 5-minute intervals
  - T-20m to T-10m: 2-minute intervals  
  - T-10m to T-5m: 1-minute intervals
  - T-5m to Start: 15-second intervals
  - Post-start: 5-minute intervals until Final

#### single-race-poller (HTTP-triggered, Legacy)
- **Specification:** s-1vcpu-1gb
- **Trigger:** HTTP requests with raceId parameter
- **Purpose:** Individual race monitoring with detailed logging (legacy function)
- **Status:** Maintained for specific use cases, enhanced-race-poller recommended

#### batch-race-poller (Scheduled, Legacy)
- **Specification:** s-1vcpu-2gb
- **Trigger:** Scheduled batch operations
- **Purpose:** Multiple race processing for efficiency (legacy function)
- **Status:** Maintained for batch scenarios, master-race-scheduler recommended

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
entrant (relationship → entrants), raceId (string, indexed), holdPercentage (float),
betPercentage (float), type (string, indexed), timeToStart (integer), timeInterval (integer),
intervalType (string), eventTimestamp (datetime, indexed), pollingTimestamp (datetime, indexed),
winPoolAmount (integer), placePoolAmount (integer), winPoolPercentage (float),
placePoolPercentage (float), incrementalAmount (integer), incrementalWinAmount (integer),
incrementalPlaceAmount (integer), poolType (string), isConsolidated (boolean)

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
- **money-flow-history:** idx_entrant, idx_race_id, idx_time_interval, idx_type, idx_entrant_race_type (compound), idx_race_time_interval (compound)
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

## 6. Tech Stack

### 6.1. Frontend

#### 6.1.1. Core Framework
- **Framework:** Next.js 15+ with App Router
- **Language:** TypeScript 5.0+
- **Runtime:** Node.js 22.17.0+

#### 6.1.2. Architecture Pattern
- **Server Components:** Primary rendering strategy for data fetching and static content
- **Client Components:** Used only for interactivity and real-time features
- **Streaming:** React Suspense for progressive loading
- **Caching:** Next.js 15 native caching with revalidation strategies

#### 6.1.3. Performance Optimizations
- **Bundle Splitting:** Automatic route-based + manual component splitting with `next/dynamic`
- **Lazy Loading:** Progressive component loading with intersection observer
- **Code Splitting:** Tree shaking and selective SDK imports
- **Image Optimization:** Next.js Image component with priority loading
- **Bundle Analysis:** `@next/bundle-analyzer` for size monitoring

#### 6.1.4. UI and Styling
- **CSS Framework:** Tailwind CSS 4.0+ (utility-first)
- **Performance CSS:** Optimized class purging and critical CSS
- **Responsive Design:** Mobile-first approach with container queries
- **Accessibility:** WCAG 2.1 compliance with semantic HTML

#### 6.1.5. State Management
- **Server State:** Server Components with native fetch caching
- **Client State:** React hooks with optimized re-rendering
- **Real-time State:** Appwrite subscriptions with update batching
- **Performance:** React.memo(), useMemo(), useCallback() optimizations

#### 6.1.6. Data Fetching Strategy
- **Initial Load:** Server Components with cached data fetching
- **Real-time Updates:** Client Components with Appwrite subscriptions
- **Caching:** 5-minute revalidation for stable data, instant for critical updates
- **Error Handling:** Error boundaries with graceful degradation

### 6.2. Backend Services

#### 6.2.1. Primary Platform
- **Platform:** Appwrite Cloud (latest version)
- **Architecture:** Microservices with serverless functions
- **Runtime:** Node.js 22.17.0+

#### 6.2.2. Appwrite SDK Strategy
- **Server SDK:** `node-appwrite` v17.0.0+ for Server Components and functions
- **Client SDK:** `appwrite` web SDK v17.0.0+ for Client Components only
- **Security:** API keys server-side only, session-based client authentication
- **Performance:** Tree-shaken imports, selective service initialization

#### 6.2.3. Functions Architecture
- **Language:** JavaScript (ES2022+) for consistency
- **Pattern:** Microservices with shared utilities
- **Deployment:** Individual function deployment with CI/CD
- **Monitoring:** Structured logging and error tracking

### 6.3. Data Sources

#### 6.3.1. External APIs
- **Primary API:** New Zealand TAB API
- **Rate Limiting:** Compliance with API quotas
- **Caching:** Strategic caching to reduce API calls
- **Error Handling:** Retry logic with exponential backoff

#### 6.3.2. Database
- **Primary:** Appwrite Database with collections
- **Real-time:** Appwrite subscriptions for live updates
- **Caching:** Query result caching with intelligent invalidation
- **Performance:** Optimized indexing and relationship queries

### 6.4. Performance Targets

#### 6.4.1. Core Web Vitals
- **Largest Contentful Paint (LCP):** <2.5 seconds
- **First Input Delay (FID):** <100 milliseconds
- **Cumulative Layout Shift (CLS):** <0.1
- **First Contentful Paint (FCP):** <1.8 seconds

#### 6.4.2. Application Metrics
- **Initial Load Time:** <3 seconds for dashboard
- **Real-time Latency:** <2 seconds for subscription updates
- **Bundle Size:** <500KB for main dashboard page
- **Lighthouse Score:** 90+ for performance

#### 6.4.3. Monitoring and Analysis
- **Web Vitals:** Real User Monitoring (RUM)
- **Bundle Analysis:** Automated size tracking in CI/CD
- **Performance CI:** Lighthouse CI in deployment pipeline
- **Error Tracking:** Comprehensive error monitoring and alerting

---

## 7. Source Tree

The project follows a standard Next.js `src` directory structure.

```
/
|-- .env.local
|-- .gitignore
|-- next.config.js
|-- package.json
|-- README.md
|-- tsconfig.json
|-- public/
|   |-- favicons/
|-- src/
|   |-- app/
|   |   |-- (api)/               # API routes and server actions
|   |   |-- (auth)/              # Auth pages (login, signup)
|   |   |-- (main)/              # Core application layout and pages
|   |   |   |-- layout.tsx
|   |   |   |-- page.tsx         # Main dashboard
|   |   |   |-- race/[id]/       # Detailed race view
|   |-- components/
|   |   |-- common/              # Reusable UI components (buttons, modals)
|   |   |-- layout/              # Layout components (header, sidebar)
|   |   |-- dashboard/           # Dashboard-specific components
|   |   |-- race-view/           # Race view-specific components
|   |-- lib/
|   |   |-- appwrite.ts          # Appwrite client configuration
|   |   |-- utils.ts             # Utility functions
|   |-- hooks/                   # Custom React hooks
|   |-- services/                # Backend service interactions
|   |-- styles/
|   |   |-- globals.css
|-- scripts/
    |-- appwrite-setup.ts      # Appwrite project setup script
```

---

## 8. Deployment Architecture

### 8.1. Function Specifications

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
      "$id": "enhanced-race-poller",
      "specification": "s-2vcpu-2gb",
      "events": ["http"],
      "timeout": 300
    },
    {
      "$id": "master-race-scheduler",
      "specification": "s-1vcpu-512mb",
      "schedule": "*/1 * * * *",
      "timeout": 180
    },
    {
      "$id": "race-data-poller",
      "specification": "s-2vcpu-2gb",
      "schedule": "*/1 * * * *",
      "timeout": 300
    },
    {
      "$id": "single-race-poller",
      "specification": "s-1vcpu-1gb",
      "events": ["http"],
      "timeout": 300
    },
    {
      "$id": "batch-race-poller",
      "specification": "s-1vcpu-2gb",
      "events": ["schedule"],
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

### 8.2. Deployment Pipeline

- **Frontend:** Vercel deployment with automatic builds on main branch
- **Backend:** Individual function deployment via Appwrite CLI
- **Database:** Idempotent schema setup via client/scripts/appwrite-setup.ts
- **Monitoring:** Built-in Appwrite Console + structured logging

---

## 9. Performance Characteristics

### 9.1. Function Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| enhanced-race-poller | 120s | 1.5GB | >99.5% |
| master-race-scheduler | 60s | 200MB | >99.9% |
| race-data-poller (legacy) | 120s | 1.5GB | >99.5% |
| single-race-poller (legacy) | 90s | 800MB | >99.5% |
| batch-race-poller (legacy) | 180s | 1.5GB | >99% |
| alert-evaluator | 30s | 100MB | >99.9% |

### 9.2. Enhanced Frontend Performance Targets (v4.7)

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

## 10. Migration to v4.7 Enhanced Race Interface

### 10.1. New Features & Components

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

### 10.2. Data Migration Strategy

**Backward Compatibility:**
- All existing collections and data preserved
- New collections added alongside existing schema
- Existing race pages continue to work during migration
- Progressive enhancement approach for new features

**Historical Data Population:**
- Money flow history will be populated from next polling cycle
- Existing odds-history data can be converted to money flow format
- Jockey silks data populated on-demand via enricher function

### 10.3. Deployment Steps (v4.7)

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

## 11. Success Metrics

### 11.1. Technical Metrics

- **Zero hanging functions:** All functions complete within timeout limits
- **Pipeline reliability:** >99% daily pipeline success rate
- **Data completeness:** >95% of races have complete entrant data
- **Real-time latency:** <2s from backend update to frontend display

### 11.2. Enhanced Business Metrics (v4.7)

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

## 12. Client Integration

### 12.1. Enhanced Real-Time Data Architecture

The RaceDay client application leverages Appwrite's real-time subscriptions to provide live betting market visualization with comprehensive historical trend analysis and money flow timeline tracking.

**Key Integration Features:**
- **Unified real-time subscriptions** to `entrants` collection with intelligent filtering
- **Enhanced historical data queries** to `odds-history` and `money-flow-history` collections
- **Race status-based subscription management** with automatic lifecycle control
- **Server-heavy architecture** with pre-calculated incremental amounts
- **Sub-second latency** for market movements and money flow changes
- **Seamless race switching** with preserved historical context and cached data

**Enhanced Subscription Patterns:**
- **Race Status Awareness:** Disable subscriptions for completed races to preserve final state
- **Debounced Updates:** 500ms delays to handle rapid data changes without UI thrashing
- **Unified Channels:** Single subscription with intelligent entrant filtering
- **Error Handling:** Comprehensive try/catch blocks with graceful degradation
- **Performance Optimization:** Client-side caching with race completion awareness

### 12.2. Money Flow Timeline Integration

**Real-Time Money Flow Data:**
- **Live timeline updates** via `money-flow-history` collection subscriptions
- **Pre-calculated incremental amounts** from server-side processing
- **Timeline column generation** with fixed pre-start and dynamic post-start intervals
- **Value flash animations** for changed amounts using `useValueFlash` hook

**Enhanced React Hooks:**
- `useMoneyFlowTimeline` - Unified money flow data with real-time subscriptions
- `useValueFlash` - Value change animation handling
- `useRaceSubscription` - Race status-aware subscription management
- `useUnifiedRaceSubscription` - Single subscription with intelligent filtering

### 12.3. Implementation Guide

For detailed client integration patterns, data access strategies, and React implementation examples, see:

📖 **[Client Real-Time Data Integration Guide](./client-real-time-data-integration.md)**

This guide provides:
- Enhanced subscription patterns with race status awareness
- Historical data querying strategies for odds and money flow
- React hooks and component examples with debounced updates
- Performance optimization techniques and server-heavy architecture
- Trend calculation utilities and mathematical validation
- Error handling patterns with comprehensive fallback mechanisms

---

## 13. Conclusion

The RaceDay v4.7 enhanced race interface architecture builds upon the proven v2.0 microservices foundation to deliver professional-grade betting terminal capabilities with comprehensive money flow visualization. The new architecture introduces sophisticated time-series data tracking, high-performance grid rendering, and desktop-optimized data density while maintaining the system's reliability and real-time responsiveness.

**Key v4.7 Achievements:**
- **Professional Interface:** Desktop-first design supporting 12+ time columns with horizontal scrolling
- **Money Flow Intelligence:** Real-time tracking and visualization of betting patterns aligned with polling windows  
- **Performance Excellence:** <200ms first paint, <100ms real-time updates, <300ms race switching
- **Enhanced Data Model:** New collections for money flow history, pool tracking, and jockey silks
- **Backward Compatibility:** Seamless integration with existing v2.0 architecture without breaking changes

The enhanced architecture delivers Bloomberg Terminal-style information density and real-time capabilities while maintaining the robust microservices foundation. This design is production-ready and optimized for immediate deployment with progressive enhancement strategy to minimize risk.

**Next Phase:** Document sharding recommended for specialized team focus areas - frontend components, backend functions, and database optimization can now be developed independently while maintaining architectural coherence.

---

## 14. Money Flow Timeline System Architecture

### 14.1. System Overview

The Money Flow Timeline system provides comprehensive tracking and visualization of betting pool changes over time for each race entrant. This system follows a **server-heavy, client-light** architecture where server functions perform data acquisition, calculation, and storage, while client components focus on presentation and real-time subscriptions.

**Core Architecture Principles:**
- **NZTAB API Integration:** Direct polling of betting pool data with `with_money_tracker=true` and `with_tote_trends_data=true` parameters
- **Mathematical Validation:** Server-side validation of pool sums and percentage consistency
- **Timeline Calculation:** Pre-calculated incremental amounts stored in database for optimal client performance
- **Real-Time Updates:** Live streaming of money flow changes to connected clients

### 14.2. NZTAB API Data Acquisition

**Primary Endpoint:** `/affiliates/v1/racing/events/{raceId}`
**Required Parameters:**
- `with_money_tracker=true` - Enables entrant liability tracking with `hold_percentage` and `bet_percentage`
- `with_tote_trends_data=true` - Provides pool totals and trend information
- `will_pays=true` - Additional pool information for validation

**Expected Data Structures:**
```javascript
"money_tracker": {
  "entrants": [
    {
      "entrant_id": "uuid-string",
      "hold_percentage": 4.5,    // General percentage across all pool types
      "bet_percentage": 7.2      // General percentage across all pool types
    }
  ]
},
"tote_pools": [
  {
    "product_type": "Win",     // Pool type: Win, Place, Quinella, etc.
    "total": 45320.50,        // Total pool amount in dollars
    "status": "OPEN"          // Pool status
  }
],
"entrants": [
  {
    "entrant_id": "uuid-string",
    "win_pool_amount": 2341.50,    // Dollars bet on this entrant to Win
    "place_pool_amount": 1456.25   // Dollars bet on this entrant to Place
  }
]
```

### 14.3. Enhanced Server Processing

**Self-Contained Function Architecture:**
- `enhanced-race-poller` - Consolidated polling with mathematical validation and data quality scoring
- `master-race-scheduler` - Autonomous coordination with 1-minute CRON intervals
- `race-data-poller` (legacy) - Maintained for backward compatibility
- `single-race-poller` (legacy) - Individual race monitoring
- `batch-race-poller` (legacy) - Multiple race processing

**Dynamic Polling Strategy:**
```javascript
// Enhanced polling intervals based on race timing
if (timeToStart > 65) intervalType = '5m'    // Baseline capture
else if (timeToStart > 30) intervalType = '5m' // Early period  
else if (timeToStart > 5) intervalType = '1m'  // Pre-race buildup
else if (timeToStart > 3) intervalType = '30s' // Critical period
else if (timeToStart > 0) intervalType = '15s' // Final countdown
else intervalType = '15s' // Live updates until Final
```

### 14.4. Timeline Calculation Logic

**Fixed Timeline Intervals:** 60m, 55m, 50m, 45m, 40m, 35m, 30m, 25m, 20m, 15m, 10m, 5m, 4m, 3m, 2m, 1m, 0, -0.5m, -1m, -1.5m, -2m, etc.

**Baseline Calculation (60m Column):**
```javascript
// Establish absolute pool amounts at 60m mark
winPoolAmount = entrantData.win_pool_amount * 100 // Convert to cents
placePoolAmount = entrantData.place_pool_amount * 100 // Convert to cents

// Alternative calculation from total pools if needed
winPoolAmount = totalWinPool * (holdPercentage / 100) * 100
placePoolAmount = totalPlacePool * (holdPercentage / 100) * 100
```

**Incremental Calculation:**
```javascript
// Core formula for money flow changes
incrementalWinAmount = currentWinAmount - (previousDoc.winPoolAmount || 0)
incrementalPlaceAmount = currentPlaceAmount - (previousDoc.placePoolAmount || 0)

// Fallback policy for missing previous buckets
if (isFirstBucket) {
  incrementalWinAmount = winPoolAmount
  incrementalPlaceAmount = placePoolAmount
} else if (!previousBucket) {
  incrementalWinAmount = 0 // Explicit zero for display as '—'
  incrementalPlaceAmount = 0
}
```

### 14.5. Database Storage Strategy

**Document Type: bucketed_aggregation**
```javascript
{
  entrant: "entrant-uuid",           // Relationship to entrants collection
  raceId: "race-uuid",              // Race identifier
  type: "bucketed_aggregation",     // Pre-calculated timeline data
  timeInterval: 45,                 // Timeline bucket (60, 55, 50...)
  intervalType: "1m",               // Polling frequency indicator
  winPoolAmount: 123450,            // Absolute Win amount in cents
  placePoolAmount: 67890,           // Absolute Place amount in cents
  winPoolPercentage: 6.2,           // Win-specific percentage
  placePoolPercentage: 4.8,         // Place-specific percentage
  incrementalWinAmount: 5670,       // Win pool increment in cents
  incrementalPlaceAmount: 2340,     // Place pool increment in cents
  pollingTimestamp: "2025-08-28...", // When data was collected
  eventTimestamp: "2025-08-28...",   // When event occurred
  poolType: "combined",             // Contains both Win and Place data
  isConsolidated: false             // Processing status
}
```

### 14.6. Client-Side Implementation

**React Hook: useMoneyFlowTimeline**
- Dual-path data fetching: bucketed aggregation with legacy fallback
- Race status-based subscription management
- Extended timeline range: -65 to +66 intervals
- Unified real-time subscriptions with intelligent filtering

**Timeline Grid Component Architecture:**
- Fixed left columns: Runner, Win Odds, Place Odds (sticky)
- Scrollable center: Timeline columns with horizontal scrolling
- Fixed right columns: Pool Total, Pool % (sticky)
- Value flash animations for changed amounts

**Display Logic:**
```typescript
interface MoneyFlowDataPoint {
  timeInterval: number // Timeline bucket (60, 55, 50...)
  incrementalWinAmount: number // Server pre-calculated Win increment
  incrementalPlaceAmount: number // Server pre-calculated Place increment
  winPoolAmount?: number // Win pool amount in cents
  placePoolAmount?: number // Place pool amount in cents
  timestamp: string // When data was recorded
}
```

### 14.7. Mathematical Validation & Quality Assurance

**Pool Sum Validation:**
```javascript
// Win pool validation
const totalWinIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalWinAmount, 0
)
const winPoolGrowth = currentWinPoolTotal - previousWinPoolTotal
const isWinConsistent = Math.abs(totalWinIncrement - winPoolGrowth) < 0.01

// Place pool validation
const totalPlaceIncrement = entrantIncrements.reduce(
  (sum, entrant) => sum + entrant.incrementalPlaceAmount, 0
)
const placePoolGrowth = currentPlacePoolTotal - previousPlacePoolTotal
const isPlaceConsistent = Math.abs(totalPlaceIncrement - placePoolGrowth) < 0.01
```

**Data Quality Scoring:**
- Automatic consistency checks for pool percentage sums (~100%)
- Mathematical validation of incremental amounts
- Logging of negative increments for investigation
- Data integrity scoring (0-100) for enhanced functions

### 14.8. Development & Testing Tools

**Enhanced NPM Scripts:**
```bash
# Deployment commands
npm run deploy:enhanced-race-poller  # Deploy enhanced function (recommended)
npm run deploy:master-scheduler      # Deploy master coordination
npm run deploy:poller               # Deploy legacy poller
npm run deploy:single-race          # Deploy single race poller
npm run deploy:batch-race-poller    # Deploy batch poller

# Local testing commands
npm run enhanced-race-poller        # Test enhanced function locally
npm run master-scheduler            # Test coordination locally
npm run poller                     # Test legacy poller locally
```

**Validation Checklist:**
- Verify entrant incremental amounts sum to total pool growth
- Confirm stable pools produce zero incremental amounts
- Check client displays '—' for zero increments and '+$N' for positive
- Log negative increments for investigation
- Validate mathematical consistency across all polling intervals

### 14.9. Race Status Handling

**Status-Based Processing:**
- **Open:** Active polling at determined intervals with full data collection
- **Closed:** Continues polling for delayed starts, maintains timeline integrity
- **Interim:** Captures in-race money movements until Final status
- **Final:** Stops polling, preserves complete historical record
- **Abandoned:** Smart handling based on existing data, preserves partial timeline

**Client Subscription Management:**
- Active races: Live real-time subscriptions enabled
- Completed races: Subscriptions disabled to preserve final state
- Navigation persistence: Full timeline data available when returning to race
- Historical review: Complete money flow history maintained for analysis

### 14.10. Performance Characteristics

**System Performance Targets:**
- **API Response Time:** <500ms for single race data
- **Database Write Time:** <100ms per document  
- **Client Data Loading:** <2 seconds for full timeline
- **Real-time Update Latency:** <1 second from server to client
- **Mathematical Consistency Rate:** >98%
- **Document Creation Success Rate:** >95%

**Key Monitoring Metrics:**
- No documents created for active race in 10+ minutes (alert)
- Hold percentage sum deviates >5% from 100% (alert)
- Client timeline shows >50% empty cells for active race (alert)
- API call success rate >99%
- Client subscription connection rate >95%

This Money Flow Timeline system provides comprehensive real-time betting market intelligence with mathematical validation, ensuring accurate and timely visualization of money flow patterns for professional race analysis and monitoring.