# RaceDay Development Task List

**Generated:** 2025-08-30  
**Based on:** User feedback for meetings and races page enhancements  
**Project Standards:** `/docs/architecture/8-coding-standards.md`, `/docs/UI-UX-Spec.md`

## Task Overview

This document organizes user feedback into actionable development tasks, referencing established coding standards, UI/UX specifications, and architectural patterns. Each task includes relevant project resources for investigation and implementation.

### Status Summary
- ✅ **COMPLETED**: 5 tasks
- ⏳ **PENDING**: 5 tasks
- **Total**: 10 tasks

---

## 📋 Meetings Page Enhancement Tasks

### Task 1: Implement Side-by-Side Layout Architecture
**Status:** ✅ **COMPLETED**  
**Priority:** High  
**Complexity:** Medium-High

**Problem Description:**  
Current meetings page displays meetings in a simple list format. Users need a dual-component layout with meetings on the left and races on the right, displaying simultaneously for better navigation and overview.

**Requirements:**
- Structure page with two key components side-by-side
- Default to first meeting and first race of the day
- Components should be: Meetings (left, chronological) and Races (right, for selected meeting)
- Maximize viewport space with scrollable components

**Project Resources to Investigate:**
- **Current Implementation:** `/client/src/app/page.tsx` - current dashboard structure
- **Components:** `/client/src/components/dashboard/MeetingsListClient.tsx`, `/client/src/components/dashboard/MeetingCard.tsx`
- **Data Fetching:** `/client/src/server/meetings-data.ts`, `/client/src/hooks/useRealtimeMeetings.tsx`
- **Types:** `/client/src/types/meetings.ts`

**Standards & Guidelines:**
- **Component Architecture:** Follow Server/Client component patterns from `/docs/architecture/8-coding-standards.md#L42-L77`
- **Performance:** Implement React.memo, useMemo per `/docs/architecture/8-coding-standards.md#L79-L101`
- **Layout Standards:** Reference responsive breakpoints from `/docs/UI-UX-Spec.md#L143-L148`
- **Accessibility:** Implement keyboard navigation per `/docs/UI-UX-Spec.md#L166-L173`

**Implementation Approach:**
1. Refactor `/client/src/app/page.tsx` to use CSS Grid or Flexbox layout
2. Create new `RacesForMeetingClient.tsx` component for right panel
3. Add meeting selection state management
4. Implement responsive design with mobile breakpoints
5. Add keyboard navigation support (Tab, Arrow keys)

---

### Task 2: Enhance Meeting and Race Card Information Display
**Status:** ✅ **COMPLETED**  
**Priority:** Medium-High  
**Complexity:** Medium

**Problem Description:**  
Current cards lack comprehensive information display. Users need detailed summary cards showing key information, start times, status, weather, track conditions, and race-specific details.

**Requirements:**
- Meeting cards: start time, status, weather, track condition
- Race cards: status, scheduled start time, race distance, number of runners
- Maintain scannable design with clear visual hierarchy

**Project Resources to Investigate:**
- **Components:** `/client/src/components/dashboard/MeetingCard.tsx`, `/client/src/components/dashboard/RaceCard.tsx`
- **Data Types:** `/client/src/types/meetings.ts`, `/client/src/types/races.ts`
- **Formatting Utils:** `/client/src/utils/raceFormatters.ts`
- **Status Configuration:** `/client/src/utils/raceStatusConfig.ts`

**Standards & Guidelines:**
- **Typography:** Follow hierarchy from `/docs/UI-UX-Spec.md#L126-L134`
- **Color System:** Implement status colors per `/docs/UI-UX-Spec.md#L115-L123`
- **Data Density:** Balance information display per `/docs/UI-UX-Spec.md#L149-L152`
- **Component Testing:** Implement per `/docs/architecture/8-coding-standards.md#L206-L224`

**Implementation Approach:**
1. Audit existing card components for missing data fields
2. Update TypeScript interfaces for additional card data
3. Implement status color coding and visual indicators
4. Add responsive design for various card sizes
5. Create comprehensive test suites for enhanced cards

---

### Task 3: Add Meeting Selection and Race Navigation Functionality
**Status:** ✅ **COMPLETED**  
**Priority:** High  
**Complexity:** Medium

**Problem Description:**  
Missing click interactions for cards. Users need to click race cards to navigate to race pages and click meeting cards to update the races display panel.

**Requirements:**
- Clicking on race card (anywhere) navigates to race page
- Clicking on meeting card displays related races in right component
- Maintain "Next Scheduled Race" button functionality at page top

**Project Resources to Investigate:**
- **Navigation:** `/client/src/components/dashboard/NextScheduledRaceButton.tsx`
- **Hooks:** `/client/src/hooks/useRacesForMeeting.tsx`
- **Race Navigation:** `/client/src/app/race/[id]/page.tsx`
- **Context:** Check if `/client/src/contexts/RaceContext.tsx` needs updates

**Standards & Guidelines:**
- **Interactive Elements:** Follow `/docs/UI-UX-Spec.md#L153-L157` for button hierarchy
- **Touch Targets:** Minimum 44px per `/docs/UI-UX-Spec.md#L207-L210`
- **Accessibility:** ARIA labels per `/docs/UI-UX-Spec.md#L174-L182`
- **Performance:** Route optimization per `/docs/architecture/8-coding-standards.md#L103-L122`

**Implementation Approach:**
1. Add click handlers to MeetingCard and RaceCard components
2. Implement meeting selection state in parent component
3. Update RacesForMeeting hook to respond to meeting selection
4. Add proper ARIA labels for screen readers
5. Test navigation flow with keyboard and mouse interactions

---

### Task 4: Implement Real-time Next Race Button Updates
**Status:** ✅ **COMPLETED**  
**Priority:** Medium  
**Complexity:** Medium

**Problem Description:**  
The "Next Race" button currently only updates when the page is refreshed or reloaded. As time progresses and races start/finish, the button should automatically update to display the next scheduled race without manual intervention.

**Requirements:**
- Subscribe to race schedule updates and status changes
- Automatically update the Next Race button when the current next race starts
- Handle race delays, postponements, and cancellations 
- Maintain real-time accuracy throughout the day
- Update button text, timing, and meeting information automatically

**Project Resources to Investigate:**
- **Next Race Button:** `/client/src/components/dashboard/NextScheduledRaceButton.tsx` - current implementation
- **Real-time Hooks:** `/client/src/hooks/useRealtimeMeetings.tsx`, `/client/src/hooks/useRealtimeRace.ts`
- **API Endpoint:** `/client/src/app/api/next-scheduled-race/route.ts` - backend logic
- **Server Functions:** `/server/master-race-scheduler/` - race timing coordination

**Standards & Guidelines:**
- **Real-time Updates:** <100ms update target per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L255`
- **Performance:** Minimize API calls with intelligent polling per `/docs/architecture/8-coding-standards.md#L103-L122`
- **Error Handling:** Graceful fallbacks per `/docs/architecture/8-coding-standards.md#L244-L251`
- **Component Optimization:** React.memo and useMemo patterns per `/docs/architecture/8-coding-standards.md#L79-L101`

**Implementation Approach:**
1. Add real-time subscription to race status changes in NextScheduledRaceButton
2. Implement intelligent polling that increases frequency near race start times
3. Add race transition detection (race starts → find next race)
4. Handle edge cases: delayed races, cancelled races, no more races for the day
5. Optimize to prevent unnecessary API calls and re-renders
6. Test with various race timing scenarios

---

### Task 5: Ensure Real-time Meeting and Race Status Subscriptions
**Status:** ⏳ **PENDING**  
**Priority:** High  
**Complexity:** High

**Problem Description:**  
Race delays and meeting changes can have cascading effects on subsequent races and other meetings due to TV broadcast scheduling. The meetings page needs robust real-time subscriptions for meeting start times, race start times, meeting status, and race status to ensure users see accurate, live-updated information when events change.

**Requirements:**
- Review and ensure meeting start time (first race) is subscribed for live updates
- Verify race start times for displayed races are real-time subscribed
- Confirm meeting status changes are properly subscribed and displayed
- Ensure race status changes are reflected in real-time on meetings page
- Assess backend polling frequency for meeting and race data changes
- Evaluate if daily-meetings function should be called more frequently (every 15 minutes) from master-scheduler
- Optimize API polling efficiency while maintaining data freshness

**Project Resources to Investigate:**
- **Meetings Page Components:** `/client/src/app/page.tsx`, `/client/src/components/dashboard/MeetingCard.tsx`
- **Real-time Hooks:** `/client/src/hooks/useRealtimeMeetings.tsx`, `/client/src/hooks/useRealtimeRace.ts`
- **Appwrite Subscriptions:** `/client/src/hooks/useAppwriteRealtime.ts` - check subscription patterns
- **Meeting Data Fetching:** `/client/src/server/meetings-data.ts` - current data source
- **Backend Functions:** `/server/daily-meetings/`, `/server/master-race-scheduler/` - data polling and scheduling
- **Database Collections:** Appwrite Collections for Meetings and Races - subscription targets

**Standards & Guidelines:**
- **Real-time Performance:** <100ms update target per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L255`
- **Appwrite Integration:** Follow patterns documented in `/CLAUDE.md#L44-L52` for real-time subscriptions
- **Backend Architecture:** Function coordination per `/CLAUDE.md#L30-L35`
- **Data Flow:** Reference `/CLAUDE.md#L54-L60` for real-time data flow patterns

**Implementation Approach:**
1. Audit current real-time subscriptions in meetings page components
2. Review which meeting and race data fields are subscribed vs static
3. Analyze Appwrite database collections for meeting/race status fields
4. Assess current polling frequency in daily-meetings and master-scheduler functions
5. Evaluate trade-offs of increased polling frequency vs API rate limits
6. Test real-time updates during simulated race delays and meeting changes
7. Implement enhanced subscription patterns if gaps are identified
8. Update master-scheduler to call daily-meetings every 15 minutes if beneficial

---

## 🏇 Race Page Visual & Display Issues

### Task 6: Fix Jockey Silk Colors Display
**Status:** ✅ **COMPLETED**  
**Priority:** Medium  
**Complexity:** Low-Medium

**Problem Description:**  
Jockey silk colors are not displayed despite race and entrant data including URLs to silk icons. This reduces visual identification of runners.

**Requirements:**
- Display jockey silk colors/icons for all runners
- Handle missing or broken silk data gracefully
- Maintain visual consistency and accessibility

**Project Resources to Investigate:**
- **Enhanced Grid:** `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` - check JockeySilks import
- **Silk Component:** `/client/src/components/race-view/JockeySilks.tsx` - may need creation
- **Types:** `/client/src/types/meetings.ts` - check Entrant interface for silk data
- **Data Fetching:** Verify silk URL data in race API responses

**Standards & Guidelines:**
- **Color Accessibility:** Ensure WCAG 2.1 AA compliance per `/docs/UI-UX-Spec.md#L183-L189`
- **Image Loading:** Implement loading states per `/docs/UI-UX-Spec.md#L158-L165`
- **Component Standards:** Follow memo patterns per `/docs/architecture/8-coding-standards.md#L79-L101`
- **Error Handling:** Implement graceful fallbacks per `/docs/architecture/8-coding-standards.md#L244-L251`

**Implementation Approach:**
1. Create or verify JockeySilks component exists
2. Add silk URL rendering with proper fallback handling
3. Implement caching strategy for silk images
4. Add accessibility features (alt text, high contrast support)
5. Test with missing/broken silk data scenarios

---

### Task 7: Fix Timeline Column Visibility and Highlighting Issues
**Status:** ⏳ **PENDING**  
**Priority:** High  
**Complexity:** Medium-High

**Problem Description:**  
Multiple timeline column issues: columns show simultaneously when reaching 0s, delayed columns appear too early, active column highlighting is slow (~15s delay), incorrect green highlighting on multiple columns.

**Requirements:**
- Columns should only display when they become active (not all at once at 0s)
- Active highlighted column (green background) should update immediately
- Only current active column should be highlighted, not multiple columns
- For delayed races, only column header should turn green, not whole column

**Project Resources to Investigate:**
- **Enhanced Grid:** `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` - timeline column logic
- **Money Flow Columns:** `/client/src/components/race-view/MoneyFlowColumns.tsx` - if exists
- **Real-time Hooks:** `/client/src/hooks/useRealtimeRace.ts`, `/client/src/hooks/useMoneyFlowTimeline.ts`
- **Race Status:** `/client/src/utils/raceStatusConfig.ts` - timing logic

**Standards & Guidelines:**
- **Real-time Performance:** <100ms update target per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L255`
- **Color System:** Green status colors per `/docs/UI-UX-Spec.md#L115-L123`
- **Animation Standards:** 200ms ease-out per `/docs/UI-UX-Spec.md#L157`
- **Component Optimization:** useMemo for column calculations per `/docs/architecture/8-coding-standards.md#L97-L105`

**Implementation Approach:**
1. Review timeline column visibility logic in enhanced grid
2. Fix active column calculation to use precise timing
3. Implement single-column highlighting logic
4. Optimize real-time update performance
5. Add proper status-based column styling (delayed vs normal)
6. Test with delayed and on-time race scenarios

---

### Task 8: Resolve Race Status and Timing Display Issues  
**Status:** ⏳ **PENDING**  
**Priority:** High  
**Complexity:** Medium

**Problem Description:**  
Race status display problems: shows 'Started' for 30s then 'Delayed' with current time, should show 'Delayed' from 0s with -X time format. Status transitions skip 'Closed' stage (Open → Interim instead of Open → Closed → Interim).

**Requirements:**
- Race should show 'Delayed' with time from 0s (-30s, -1m format) unless actually closed/started
- Proper status progression: Open → Closed → Interim → Final
- Race header status should reflect actual race state immediately

**Project Resources to Investigate:**
- **Race Header:** `/client/src/components/race-view/RaceHeader.tsx` - status display logic
- **Race Status Utils:** `/client/src/utils/raceStatusConfig.ts` - status definitions and transitions
- **Real-time Race Hook:** `/client/src/hooks/useRealtimeRace.ts` - status updates
- **Server Functions:** `/server/` functions handling race status polling

**Standards & Guidelines:**
- **Status Colors:** Follow `/docs/UI-UX-Spec.md#L115-L123` for status indicators
- **Real-time Updates:** <100ms latency per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L255`
- **Error Handling:** Proper status validation per `/docs/architecture/8-coding-standards.md#L168-L180`
- **Typography:** Consistent time formatting per `/docs/UI-UX-Spec.md#L126-L134`

**Implementation Approach:**
1. Review race status calculation logic in RaceHeader component
2. Fix status transition logic to include all required stages
3. Implement proper delayed race time formatting (-30s, -1m, etc.)
4. Update server-side polling functions if status detection is incorrect
5. Test with various race timing scenarios (on-time, delayed, closed)
6. Verify status progression matches expected workflow

---

## ⚡ Race Page Real-time & Polling Issues

### Task 9: Fix Money Flow Polling Frequency and Data Updates
**Status:** ⏳ **PENDING**  
**Priority:** High  
**Complexity:** High

**Problem Description:**  
Money flow updates not occurring frequently enough from -5m to -5m and beyond. Delayed races may have insufficient polling frequency. Processing time, backend polling, or API source data may be causing delays.

**Requirements:**  
- Increase money flow update frequency during critical periods (-5m to start)
- Optimize backend function processing times
- Ensure API source provides adequate data refresh rates
- Missing money flow updates in timeline columns

**Project Resources to Investigate:**
- **Client Hooks:** `/client/src/hooks/useMoneyFlowTimeline.ts`, `/client/src/hooks/useRacePoolData.ts`
- **Server Functions:** `/server/race-data-poller/`, `/server/batch-race-poller/`, `/server/master-race-scheduler/`
- **Real-time Subscriptions:** `/client/src/hooks/useAppwriteRealtime.ts`
- **Enhanced Grid:** `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` - money flow display

**Standards & Guidelines:**
- **Performance Targets:** <100ms real-time updates per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L255`
- **Function Standards:** Timeout management per `/docs/architecture/8-coding-standards.md#L187-L199`
- **Batch Processing:** Per `/docs/architecture/8-coding-standards.md#L201-L215`
- **Error Handling:** Function error patterns per `/docs/architecture/8-coding-standards.md#L168-L180`

**Implementation Approach:**
1. Audit current polling frequencies in master-race-scheduler
2. Optimize race-data-poller function execution time
3. Implement more aggressive polling during critical periods (-5m to start)
4. Review NZ TAB API rate limits and response times
5. Add performance monitoring to identify bottlenecks
6. Test money flow update frequency during live races

---

### Task 10: Resolve Race Status Transitions and Delayed Race Handling
**Status:** ⏳ **PENDING**  
**Priority:** High  
**Complexity:** High  

**Problem Description:**  
Races frequently skip 'Closed' status, going directly from 'Open' to 'Interim'. This may cause missed money flow updates and incorrect timeline column behavior. Related to insufficient polling during status transitions.

**Requirements:**
- Ensure proper status progression: Open → Closed → Interim → Final  
- Maintain frequent polling during status transitions
- Capture all money flow data during critical transition periods
- Fix timeline column disappearance when race reaches final status

**Project Resources to Investigate:**
- **Server Functions:** `/server/race-data-poller/src/main.js` - status detection logic
- **Status Configuration:** `/client/src/utils/raceStatusConfig.ts` - status definitions
- **Real-time Updates:** `/client/src/hooks/useRealtimeRace.ts` - status change handling
- **Enhanced Grid:** `/client/src/components/race-view/EnhancedEntrantsGrid.tsx` - column visibility logic

**Standards & Guidelines:**
- **Function Error Handling:** Per `/docs/architecture/8-coding-standards.md#L168-L180`
- **Status Management:** Consistent status patterns
- **Real-time Architecture:** Per `/docs/stories/4.7.enhance-race-interface-ui-architecture.md#L101-L108`
- **Performance Monitoring:** Function execution tracking

**Implementation Approach:**
1. Review NZ TAB API response patterns for race status detection
2. Implement more granular status checking in polling functions  
3. Add intermediate status validation before transitions
4. Fix timeline column persistence through status changes
5. Implement enhanced logging for status transition debugging
6. Test with delayed races that have complex timing scenarios
7. Monitor status transition patterns in production data

---

## 🔧 Implementation Guidelines

### General Development Standards
- **Code Quality:** All code must pass ESLint and TypeScript strict mode per `/docs/architecture/8-coding-standards.md#L15-L20`
- **Testing:** Implement Jest + React Testing Library tests per `/docs/architecture/8-coding-standards.md#L206-L224`
- **Performance:** Use React.memo, useMemo, useCallback per `/docs/architecture/8-coding-standards.md#L79-L101`
- **Accessibility:** WCAG 2.1 AA compliance per `/docs/UI-UX-Spec.md#L166-L189`

### Architecture Patterns
- **Server Components:** Use for initial data fetching per `/docs/architecture/8-coding-standards.md#L42-L60`
- **Client Components:** Use for real-time updates only per `/docs/architecture/8-coding-standards.md#L62-L77`
- **Real-time Subscriptions:** Follow established patterns in existing hooks
- **Error Boundaries:** Implement comprehensive error handling per `/docs/architecture/8-coding-standards.md#L244-L251`

### Testing Requirements  
- **Component Tests:** All enhanced/modified components require test coverage
- **Integration Tests:** Test real-time data flow and navigation interactions
- **Performance Tests:** Validate timing requirements and bundle size targets
- **Accessibility Tests:** Screen reader and keyboard navigation validation

---

## 📚 Quick Reference Links

**Key Documentation:**
- [Coding Standards](/docs/architecture/8-coding-standards.md)
- [UI/UX Specification](/docs/UI-UX-Spec.md)  
- [Story 4.7 Architecture](/docs/stories/4.7.enhance-race-interface-ui-architecture.md)
- [CLAUDE.md Project Instructions](/CLAUDE.md)

**Command Reference:**
- `npm run dev` (client) - Development server
- `npm run lint` (client) - Code linting
- `npm run test` (client) - Run tests
- `npm run deploy` (server) - Deploy functions

**Critical Files:**
- Main Dashboard: `/client/src/app/page.tsx`
- Race Page: `/client/src/app/race/[id]/page.tsx`  
- Enhanced Grid: `/client/src/components/race-view/EnhancedEntrantsGrid.tsx`
- Real-time Hooks: `/client/src/hooks/useRealtimeRace.ts`