# Manual Testing Strategy

## Overview

This document outlines the manual testing procedures for the Race Day application, focusing on user acceptance testing, cross-browser compatibility, performance validation, and scenarios that cannot be effectively covered by automated tests.

## Testing Principles

- **User-Centric**: Test from the end user's perspective
- **Real-World Scenarios**: Use actual data and realistic usage patterns  
- **Performance Focused**: Validate performance targets and user experience
- **Accessibility First**: Ensure application works for all users
- **Cross-Platform**: Test across devices, browsers, and network conditions

---

## Story 3.1: Display Race Meetings Chronologically

### **Acceptance Criteria Validation**

#### AC1: Meetings are displayed in chronological order
**Test Procedure:**
1. Navigate to dashboard (`/`)
2. Verify meetings are ordered by first race time (earliest first)
3. Check timestamps displayed are correct for timezone
4. Validate no meetings are missing or duplicated

**Expected Results:**
- Meetings appear in ascending chronological order
- Times display in local timezone (AU/NZ format)
- All expected meetings for current day are present

**Pass/Fail Criteria:**
- ✅ PASS: All meetings sorted correctly by first race time
- ❌ FAIL: Any meeting out of chronological order

---

#### AC2: Real-time updates (list updates as new meetings added/removed)
**Test Procedure:**
1. Open dashboard in browser
2. Open Appwrite console in another tab
3. Add a new meeting to the database with today's date
4. Verify meeting appears on dashboard within 2 seconds
5. Update an existing meeting's time
6. Verify meeting re-orders correctly
7. Delete a meeting
8. Verify meeting disappears from dashboard

**Expected Results:**
- New meetings appear automatically
- Updates reflected within 2 seconds
- Chronological order maintained after updates
- Connection status indicator shows "Live"

**Pass/Fail Criteria:**
- ✅ PASS: All updates appear within 2 seconds, proper ordering maintained
- ❌ FAIL: Updates take >2 seconds or ordering breaks

---

#### AC3: No duplicate meetings are shown
**Test Procedure:**
1. Create test scenario with potential duplicates in database
2. Simulate rapid updates to same meeting
3. Verify only one instance of each meeting displays
4. Test with identical meeting names but different IDs

**Expected Results:**
- Each meeting appears exactly once
- Rapid updates don't create duplicates
- Deduplication works by meeting ID, not name

**Pass/Fail Criteria:**
- ✅ PASS: Zero duplicate meetings displayed
- ❌ FAIL: Any duplicate meetings visible

---

## Story 5.4: Implement Global Audible Alert Toggle

### **AC1: Audible alert triggers one minute before filtered race start**
**Test Procedure:**
1. Ensure audible alerts toggle is enabled from the Race view header.
2. Using Appwrite console or seed data, set a race to start two minutes from current time that matches active filters.
3. Navigate between dashboard and race detail views while waiting.
4. Observe whether the alert fires exactly one minute before the scheduled start.

**Expected Results:**
- Audio cue plays once exactly at T-60 seconds.
- Alert does not repeat after initial playback.
- No alert fires if the race is marked Final/Abandoned before T-60.

**Pass/Fail Criteria:**
- ✅ PASS: Single audible cue at T-60 for applicable races.
- ❌ FAIL: Missing cue, delayed cue, or repeated/late playback.

### **AC2: Toggle state persists across session and views**
**Test Procedure:**
1. Toggle audible alerts off in the race header.
2. Refresh the page and navigate to dashboard, then back to any race.
3. Toggle alerts on, sign out/in (if available) or open a new tab to verify persistence within session scope.

**Expected Results:**
- Toggle state matches last user choice after navigation/refresh within session.
- No unexpected reversion to default state.
- Toggle updates disable audio immediately when set to Off.

**Pass/Fail Criteria:**
- ✅ PASS: Preference respected across race/dashboard routes and reloads.
- ❌ FAIL: Preference resets unexpectedly or toggle state desynchronised from stored value.

### **AC3: Alerts honour active filters and avoid overlaps**
**Test Procedure:**
1. Apply race filters (e.g., country/type) and confirm only filtered races remain visible.
2. Schedule two races—one matching filters, one excluded—within two minutes of each other.
3. Observe audible alerts as both approach start times.
4. If two filtered races share the same trigger minute, verify playback occurs once without stacking.

**Expected Results:**
- Only races passing filters trigger audio cues.
- No alerts for filtered-out races.
- Concurrent qualifying races produce a single, non-overlapping cue.

**Pass/Fail Criteria:**
- ✅ PASS: Filter alignment confirmed and no overlapping audio playback.
- ❌ FAIL: Any excluded race triggers audio or overlapping cues occur.

---

## Cross-Browser Compatibility Testing

### **Desktop Browsers**

| Browser | Version | OS | Status | Notes |
|---------|---------|----|---------|-----------| 
| Chrome | Latest | Windows/Mac/Linux | [ ] | Primary target |
| Firefox | Latest | Windows/Mac/Linux | [ ] | |
| Safari | Latest | macOS | [ ] | WebKit engine |
| Edge | Latest | Windows | [ ] | Chromium-based |

**Test Checklist per Browser:**
- [ ] Dashboard loads without errors
- [ ] Real-time updates function correctly
- [ ] UI displays properly (no layout issues)
- [ ] Performance meets targets (<3s load)
- [ ] Console shows no critical errors

### **Mobile Browsers**

| Device | Browser | Status | Notes |
|--------|---------|--------|-------|
| iPhone | Safari | [ ] | iOS primary |
| Android | Chrome | [ ] | Android primary |
| iPhone | Chrome | [ ] | Alternative iOS |
| Android | Firefox | [ ] | Alternative Android |

**Mobile-Specific Tests:**
- [ ] Touch interactions work properly  
- [ ] Responsive design displays correctly
- [ ] Performance acceptable on slower connections
- [ ] Real-time updates work on mobile networks

---

## Performance Testing

### **Load Time Validation**

**Target: Initial dashboard load <3 seconds**

**Test Procedure:**
1. Clear browser cache
2. Open developer tools → Network tab
3. Navigate to dashboard
4. Record "DOMContentLoaded" and "Load" times
5. Test on different connection speeds:
   - Fast 3G (750kb/s)
   - Slow 3G (400kb/s)  
   - Offline → Online recovery

**Expected Results:**
- Fast connection: <2 seconds
- 3G connection: <3 seconds
- Offline recovery: <5 seconds

### **Real-time Performance**

**Target: Updates appear within 2 seconds**

**Test Procedure:**
1. Open dashboard with timer/stopwatch
2. Trigger update in Appwrite console
3. Measure time until change appears
4. Test with multiple rapid updates
5. Monitor memory usage over 10+ minutes

**Expected Results:**
- Single updates: <2 seconds
- Multiple updates: <2 seconds each
- No memory leaks over time
- CPU usage remains reasonable

### **Bundle Size Validation**

**Target: Dashboard bundle <500KB**

**Test Procedure:**
1. Open developer tools → Network tab
2. Reload dashboard page
3. Sum JavaScript bundle sizes
4. Check for unnecessary large dependencies

**Expected Results:**
- Total JS bundle <500KB compressed
- No duplicate dependencies loaded
- Efficient code splitting evident

---

## Accessibility Testing

### **Screen Reader Compatibility**

**Test with NVDA/JAWS/VoiceOver:**
- [ ] Page structure is properly announced
- [ ] Meeting cards have descriptive labels
- [ ] Status indicators are verbalized correctly
- [ ] Navigation is logical and intuitive

### **Keyboard Navigation**

**Test Procedure:**
1. Navigate entire dashboard using only keyboard
2. Tab through all interactive elements
3. Verify focus indicators are visible
4. Test escape key functionality

**Expected Results:**
- All elements accessible via keyboard
- Clear focus indicators
- Logical tab order
- No keyboard traps

### **Color Contrast & Visual**

**Test Checklist:**
- [ ] All text meets WCAG AA contrast requirements (4.5:1)
- [ ] Status indicators work without color alone
- [ ] UI remains usable at 200% zoom
- [ ] High contrast mode displays correctly

---

## Error Handling & Edge Cases

### **Network Connectivity**

**Test Scenarios:**
1. **Offline → Online Recovery**
   - Disconnect internet
   - Verify error banner appears
   - Reconnect internet  
   - Verify automatic recovery

2. **Slow/Intermittent Connection**
   - Throttle to slow 3G
   - Verify graceful loading
   - Test with packet loss simulation

3. **Appwrite Service Unavailable**
   - Block Appwrite endpoints
   - Verify error boundary displays
   - Check graceful degradation

**Expected Results:**
- Clear error messages displayed
- Automatic retry functionality
- No application crashes
- Graceful degradation of features

### **Data Edge Cases**

**Test Scenarios:**
1. **No Meetings Today**
   - Clear all meetings for current day
   - Verify empty state displays correctly
   - Check messaging is helpful

2. **Large Dataset**
   - Create 50+ meetings for today
   - Verify performance remains acceptable
   - Test scrolling/virtualization if implemented

3. **Invalid Data**
   - Create meetings with missing/invalid fields
   - Verify error handling
   - Ensure application doesn't crash

---

## User Experience Testing

### **First-Time User Experience**

**Test Scenario:**
1. Fresh browser (no cache)
2. Navigate to dashboard as new user
3. Evaluate initial impression and usability

**Evaluation Criteria:**
- [ ] Purpose of page is immediately clear
- [ ] Loading states provide appropriate feedback
- [ ] Information hierarchy is logical
- [ ] Visual design is professional and trustworthy

### **Real-World Usage Patterns**

**Test Scenarios:**
1. **Peak Usage Simulation**
   - Multiple browser tabs open
   - Background data updates
   - Extended session (30+ minutes)

2. **Mobile Usage**
   - Portrait/landscape orientation
   - Touch interaction quality
   - Battery/data usage impact

3. **Power User Workflow**
   - Rapid navigation and scanning
   - Multi-tasking scenarios
   - Information density preferences

---

## Security Testing

### **Client-Side Security**

**Test Checklist:**
- [ ] No sensitive data exposed in client-side code
- [ ] API keys not visible in browser dev tools
- [ ] No XSS vulnerabilities in dynamic content
- [ ] HTTPS enforced for all communications

### **Data Privacy**

**Test Scenarios:**
- [ ] No PII logged to browser console
- [ ] Local storage contains no sensitive data  
- [ ] Session management works correctly
- [ ] Data transmission is encrypted

---

## Test Execution Template

### **Pre-Test Setup**
```
□ Appwrite database populated with test data
□ Environment variables configured
□ Test browsers/devices available
□ Performance monitoring tools ready
□ Stopwatch/timer for performance tests
```

### **Test Data Requirements**

**Minimum Test Dataset:**
- 5-10 meetings for current day
- Mix of AU/NZ meetings
- Both Thoroughbred and Harness races
- Meetings with varying first race times
- At least one meeting with no races (edge case)

### **Test Execution Record**

| Test Case | Expected Result | Actual Result | Pass/Fail | Notes |
|-----------|----------------|---------------|-----------|-------|
| AC1: Chronological Order | Meetings sorted by first race time | | | |
| AC2: Real-time Updates | Updates <2s | | | |
| AC3: No Duplicates | Zero duplicates shown | | | |
| Chrome Desktop | No errors, <3s load | | | |
| Mobile Safari | Responsive, functional | | | |
| Accessibility | Screen reader compatible | | | |
| Performance | <500KB bundle, <3s load | | | |

---

## Post-Testing Actions

### **Pass Criteria**
- All acceptance criteria tests pass
- No critical browser compatibility issues
- Performance targets met
- Accessibility requirements satisfied
- No security vulnerabilities identified

### **Failure Response**
1. Document specific failures with screenshots
2. Create detailed bug reports with reproduction steps
3. Prioritize fixes based on severity/impact
4. Re-test after fixes implemented

### **Sign-off Requirements**
- [ ] Technical QA approval
- [ ] Product Owner acceptance
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Accessibility compliance verified

---

## Tools & Resources

### **Testing Tools**
- **Performance**: Chrome DevTools, WebPageTest, Lighthouse
- **Accessibility**: axe DevTools, WAVE, NVDA screen reader
- **Cross-browser**: BrowserStack, local browser testing
- **Mobile**: Device testing, Chrome mobile emulation

### **Test Data Sources**
- Appwrite console for database manipulation
- Test data scripts (if available)
- Production data samples (anonymized)

### **Documentation References**
- Story 3.1 requirements
- Technical architecture docs
- Coding standards and best practices
- WCAG 2.1 AA guidelines

---

*This manual testing strategy should be executed before each release and updated as new features are added.*
