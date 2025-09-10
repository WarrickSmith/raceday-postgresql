# Implementation Plan: Story 4.9 - Place Pool and Odds Flow

## Analysis Summary

The current implementation has:
- Win pool money flow working with bucketed data system
- Fixed Win/Place odds stored in `odds-history` collection 
- Money flow data in `money-flow-history` collection with Place pool fields already available
- Enhanced Entrants Grid with Win/Place/Odds selector UI already present but not functional

## Revised Approach: Consolidate Odds into MoneyFlowHistory Collection

Based on analysis, consolidating Fixed Win and Fixed Place odds into the MoneyFlowHistory collection will:

1. **Eliminate Redundancy**: Remove the separate `odds-history` collection entirely
2. **Improve Performance**: Single collection queries instead of multiple collection joins
3. **Better Synchronization**: Odds and money flow data captured in same polling cycle
4. **Simplified Real-time Updates**: One subscription handles all timeline data (money + odds)

## Key Implementation Tasks

### 1. Enhanced MoneyFlowHistory Collection Schema

**Add these fields to existing structure:**
- `fixedWinOdds` - Fixed Win odds at this time bucket
- `fixedPlaceOdds` - Fixed Place odds at this time bucket  
- `poolWinOdds` - Pool Win odds (tote) at this time bucket
- `poolPlaceOdds` - Pool Place odds (tote) at this time bucket

**Current fields to leverage:**
- `placePoolAmount`, `incrementalPlaceAmount` - Already available for Place pool money flow
- `winPoolAmount`, `incrementalWinAmount` - Working for Win pool money flow
- `timeInterval`, `pollingTimestamp` - Timeline bucketing system

### 2. Server Function Updates

**race-data-poller Enhancement:**
- Store Fixed Win/Place odds alongside money flow data in same document/bucket
- Remove odds-history collection processing entirely
- Single database write operation per time bucket per entrant
- Capture both pool (tote) and fixed odds in unified data structure

**database-setup.js Updates:**
- Add new odds fields to MoneyFlowHistory collection schema
- Create indexes for efficient odds queries
- Remove odds-history collection creation (mark as obsolete)

### 3. Hook Extensions for Multi-Pool Support

**useMoneyFlowTimeline Hook Updates:**
- Extend to support Place pool filtering using existing `poolType` field
- Add odds data access from consolidated MoneyFlowHistory collection
- Update `getEntrantDataForInterval` to handle three data types:
  - **Win money:** incremental amounts from `incrementalWinAmount`
  - **Place money:** incremental amounts from `incrementalPlaceAmount`
  - **Odds values:** point-in-time values from `fixedWinOdds`/`fixedPlaceOdds`

**Remove useOddsHistory Hook:**
- No longer needed - odds data comes from unified timeline hook
- Simplifies component dependencies

### 4. UI Component Updates

**Enhanced Entrants Grid Updates:**
- Implement functional Win/Place/Odds selector (UI exists but not connected)
- Update timeline columns to display appropriate data based on selection:
  - **Win:** Show Win pool incremental money flow (`incrementalWinAmount`)
  - **Place:** Show Place pool incremental money flow (`incrementalPlaceAmount`)  
  - **Odds:** Show Fixed Win odds values (`fixedWinOdds` - latest per time bucket)

**Column Display Logic:**
- **Win Odds Column**: Latest `fixedWinOdds` from MoneyFlowHistory (most recent time bucket)
- **Place Odds Column**: Latest `fixedPlaceOdds` from MoneyFlowHistory (most recent time bucket)
- **Pool/Pool% Columns**: Show correct data based on selection:
  - Win view: Win pool amounts/percentages
  - Place view: Place pool amounts/percentages
  - Odds view: Win pool amounts/percentages (unchanged)

### 5. API Route Updates

**money-flow-timeline API Enhancement:**
- Support filtering by poolType (win/place/odds)
- Return consolidated data including odds values
- Single endpoint serves all three timeline display modes
- Remove dependency on odds-history collection

**Remove odds-specific APIs:**
- Consolidate into unified money-flow-timeline endpoint
- Simplify client-side data fetching

## Technical Approach

**Priority 1 - Consolidate Data Storage:**
- Enhance MoneyFlowHistory collection with odds fields
- Update server polling to capture odds alongside money flow
- Remove odds-history collection processing

**Priority 2 - Leverage Existing Infrastructure:**
- Use existing bucketed data system for odds timeline
- Extend current real-time subscription to include odds updates
- Utilize existing UI components with functional enhancements

**Priority 3 - Maintain Existing Patterns:**
- Follow existing server-side pre-calculation pattern for incremental amounts
- Maintain existing timeline column structure and behaviors
- Preserve existing real-time subscription patterns for money flow

**Priority 4 - Performance Optimizations:**
- Single collection queries instead of cross-collection joins
- Atomic data updates (money + odds together)
- Reduced subscription complexity

## Expected Outcomes

1. **Three-way selector functionality:** Win/Place/Odds buttons will control timeline data display
2. **Place pool timeline:** Shows Place pool money flow using same incremental display pattern as Win
3. **Odds timeline:** Shows Fixed Win odds history as point-in-time values per time bucket
4. **Smart Pool/Pool% columns:** Display appropriate pool data based on current selection mode
5. **Unified data source:** All timeline data (money + odds) from MoneyFlowHistory collection
6. **Improved performance:** Faster queries, simpler real-time updates, atomic data consistency
7. **Simplified architecture:** Remove odds-history collection and related processing overhead

## Migration Considerations

- **Data Migration**: Existing odds-history data could be migrated to MoneyFlowHistory format if needed
- **Backward Compatibility**: Maintain existing Win pool functionality during transition
- **Testing**: Verify odds display accuracy matches previous odds-history collection data
- **Cleanup**: Remove obsolete odds-history collection and related code after verification

This consolidated approach leverages the solid foundation already built while extending it efficiently to meet story requirements with improved performance and simplified architecture.