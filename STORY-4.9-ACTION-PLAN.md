# Story 4.9 Implementation Gap Analysis & Developer Action Plan

**Date Created:** 2025-08-19  
**Status:** Ready for Implementation  
**Estimated Time:** 8-10 hours

## Critical Gaps Identified

### **1. Pool Toggle Functionality - NOT WORKING**
**Current Issue:** The Pool Toggle (Win/Place buttons) exists but doesn't properly switch data displayed in timeline grid or Pool/Pool% columns.

**Root Cause:** The `getTimelineData` function and pool calculations don't respect the `poolViewState.activePool` selection.

### **2. Timeline Grid Data Logic - FUNDAMENTALLY INCORRECT**
**Current Issue:** Timeline shows mock/placeholder data instead of real incremental money flow from polling history.

**Root Causes:**
- No actual money flow history data being fetched from `money-flow-history` collection
- `getTimelineData` function uses mock calculations instead of real data
- Missing integration with polling timestamp data from backend functions

### **3. Money Flow History Database Schema Gap**
**Current Issue:** Database schema exists but lacks critical fields for timeline display.

**Missing Fields in `money-flow-history`:**
- `pollingTimestamp` - when the polling occurred
- `timeToStart` - minutes to race start at polling time
- `winPoolAmount` / `placePoolAmount` - actual pool amounts
- `incrementalAmount` - calculated incremental change

### **4. Backend Data Collection Issues**
**Current Issue:** Backend polling functions may not be saving the granular data needed.

**Investigation Needed:**
- Verify if backend functions capture NZTAB API `EntrantLiability` data (hold_percentage, bet_percentage)
- Check if polling functions save time-stamped money flow data
- Validate data pipeline from NZTAB API → Appwrite collections

### **5. Real-time Data Integration Incomplete**
**Current Issue:** Component doesn't properly subscribe to money-flow-history changes.

**Problem:** Only subscribes to entrants updates, missing money flow timeline updates.

## Developer Action Plan

### **Phase 1: Data Pipeline Investigation (1-2 hours)**
1. **Audit Backend Functions**
   - Check race polling functions for money flow data collection
   - Verify NZTAB API integration captures `EntrantLiability` data
   - Confirm data is being saved to `money-flow-history` collection

2. **Database Schema Validation**
   - Add missing fields to `money-flow-history` collection
   - Verify indexes for efficient timeline queries
   - Test data retention and historical access

### **Phase 2: Timeline Data Implementation (3-4 hours)**
1. **Create Money Flow Data Service**
   - Build `useMoneyFlowTimeline` hook to fetch historical data
   - Implement incremental calculation logic (current - previous)
   - Add real-time subscription to money-flow-history updates

2. **Fix Timeline Grid Display**
   - Replace mock `getTimelineData` with real data queries
   - Implement proper incremental money display logic
   - Add time-based data filtering for columns

### **Phase 3: Pool Toggle Implementation (2 hours)**
1. **Fix Pool Data Switching**
   - Update timeline grid to respect pool selection (Win/Place)
   - Fix Pool/Pool% columns to show correct pool-specific data
   - Remove Quinella button as specified

2. **State Management**
   - Ensure `poolViewState.activePool` drives all data displays
   - Add proper loading states during pool switches

### **Phase 4: Testing & Validation (2 hours)**
1. **Component Testing**
   - Test pool toggle functionality with real data
   - Verify timeline shows correct incremental amounts
   - Test real-time updates during active polling

2. **Performance Validation**
   - Monitor subscription performance with large datasets
   - Verify memory cleanup and component optimization

## Technical Implementation Details

### **Key Files to Modify:**
- `client/src/components/race-view/EnhancedEntrantsGrid.tsx` - Main component fixes
- `client/src/hooks/useRacePoolData.ts` - Extend for money flow timeline
- `server/daily-meetings/src/database-setup.js` - Add missing money flow fields
- Backend polling functions - Verify data collection

### **Current Todo Status:**
- [ ] Phase 1: Audit backend functions for money flow data collection
- [ ] Phase 1: Verify NZTAB API integration captures EntrantLiability data
- [ ] Phase 1: Update money-flow-history database schema with missing fields
- [ ] Phase 2: Create useMoneyFlowTimeline hook for historical data
- [ ] Phase 2: Fix getTimelineData function to use real data instead of mock
- [ ] Phase 3: Fix pool toggle functionality to switch data properly
- [ ] Phase 3: Remove Quinella button and fix Pool/Pool% columns
- [ ] Phase 4: Test timeline grid with real incremental money flow data
- [ ] Phase 4: Verify real-time updates and component performance

## Expected Outcomes

After implementation:
- Timeline grid shows real incremental money flow data
- Pool toggles correctly switch between Win/Place data
- Real-time updates reflect actual betting activity
- Component displays accurate pool percentages and amounts

## Debug Information

**Problem Screenshot:** Shows live race with 5 minutes before start with no data in timeline grid  
**Original Brief:** `/home/warrick/Dev/raceday/Brief - Story 4.9 Implement Accurate Moneyflow.txt`  
**Story Documentation:** `/home/warrick/Dev/raceday/docs/stories/4.9.implement-accurate-moneyflow.md`

## Notes for Development

1. **Database Schema:** Money flow history collection exists but needs additional fields
2. **API Integration:** NZTAB API has `EntrantLiability` with `hold_percentage` and `bet_percentage`
3. **Component Architecture:** Single table with sticky columns design is correct, data logic needs fixing
4. **Real-time Updates:** Subscription architecture exists but needs money flow timeline integration
5. **Performance:** Component has optimization features - maintain during fixes