# UI/UX Specification: RaceDay v1.5

- **Project:** RaceDay
- **Version:** 1.5
- **Author:** Sally - BMad UX Expert
- **Date:** 2025-07-14 14:26:00
- **Status:** Enhanced

## 1. UX Vision & Principles

The user experience for RaceDay will be guided by five core principles:

- **Clarity at a Glance:** The UI must present complex data in a way that is immediately scannable and understandable. Visual cues like color-coding, sparklines, and progressive disclosure are critical.
- **Real-Time Immersion:** The user should feel connected to the live market. The interface must update dynamically and automatically, eliminating the need for manual refreshes and ensuring the user never feels out of sync.
- **User in Control:** The user can customize their experience through powerful filtering and alerting to focus on the data that is most important to them, reducing noise and cognitive load.
- **Accessibility First:** All interactions must be keyboard navigable, screen reader compatible, and follow WCAG 2.1 AA guidelines to ensure inclusive access.
- **Performance Awareness:** Visual feedback for loading states, error handling, and system status keeps users informed and confident in the application's reliability.

## 2. Core Interaction Patterns

- **Filtering:** Filters applied on the dashboard persist and affect all views and navigation, including the "jump to next race" button. Filter state is visually indicated and easily clearable.
- **Navigation:** The primary navigation between races will use clear "Previous" and "Next" buttons with keyboard shortcuts (←/→). A "Next Scheduled Race" button provides a shortcut to the most imminent event that matches the user's filters.
- **Alerts:** Market-based alerts are configured in a dedicated modal with preview functionality. The global audible alert is a persistent toggle in the main UI with volume control.
- **Data Updates:** Real-time updates use smooth animations and visual indicators to show what changed, preventing jarring content shifts.
- **Error Recovery:** Clear error messages with actionable recovery steps, especially for network connectivity issues during live data streaming.

## 3. Wireframes

### Screen 1: Main Dashboard / Detailed Race View (Unified View) - **ENHANCED**

_Enhanced with accessibility, loading states, and improved visual hierarchy._

```
+--------------------------------------------------------------------------------------------------+
| RaceDay [LOGO] [🔄 Live] [📶 Connected]                       Logged in as: WarrickSmith [Logout] |
+--------------------------------------------------------------------------------------------------+
| Filters: Country [NZ, AU ×] Race Type [Gallops ×] | [🔊 Alerts: ON 🔈] [Clear All Filters] |
| Active: 2 filters applied • Showing 12 of 45 races                                              |
+--------------------------------------------------------------------------------------------------+
| Left Panel: Race List (Dashboard)              | Right Panel: Detailed Race View                 |
|------------------------------------------------|-------------------------------------------------|
| 🔴 LIVE NOW                                    | [ ← PREV ] [ ⏰ NEXT SCHEDULED ] [ NEXT → ]     |
| ▼ Meeting: ROTORUA (R) - NZ - Gallops          | Keyboard: ←/→ arrows                            |
|   R1 - Maiden Plate [🟢 Open] - 10:20 (2m)    |-------------------------------------------------|
|   R2 - Handicap     [🟡 Soon] - 10:50          | 10:20 - MAIDEN PLATE @ ROTORUA (R) - 2200m        |
|                                                | Track: Good | Weather: Fine | 🟢 Open (1m 30s)    |
| ⏰ UPCOMING                                     | Last Update: 2s ago [🔄]                        |
| ▼ Meeting: ASCOT (R) - UK - Gallops            |-------------------------------------------------|
|   R1 - Sprint       [🟢 Open] - 11:05          | # | Runner/Jockey/Trainer    | Win  | Place| Money%| Trend |
|   R2 - Stakes       [🟢 Open] - 11:35          |-------------------------------------------------|
|                                                | 1 | MARVON DOWNS ⭐          | 2.50↓| 1.30 | 33.58↑| 📈    |
| 📋 COMPLETED                                   |   | J. McDonald / A. Trainer  |      |      |       |       |
| ▼ Meeting: ADDINGTON (H) - NZ - Trots          |---+-----------------------+------+------+-------+-------|
|   R1 - Mobile Pace  [🔴 Final] - 09:45         | 2 | AL LURCH'E               | 4.20↑| 1.50 | 19.99↓| 📉    |
|   R2 - Trotters Cup [🔴 Final] - 10:15         |   | M. Coleman / B. Trainer   |      |      |       |       |
|                                                |-------------------------------------------------|
| [📱 Mobile View Toggle]                        | ... (8 more runners) ...                        |
|                                                |-------------------------------------------------|
|                                                | [⚙️ Configure Market Alerts] [📊 Race Analytics] |
+--------------------------------------------------------------------------------------------------+
```

### Screen 2: Market Alerts Configuration (Modal) - **ENHANCED**

_Enhanced with preview functionality, better UX patterns, and accessibility._

```
+--------------------------------------------------------------------+
| ⚙️ Configure Market Alerts                                    [✕] |
+--------------------------------------------------------------------+
| 📋 Alert Templates: [Quick Setup ▼] [Import/Export]               |
|                                                                    |
| [✓] Enable Market Alerts                                           |
|                                                                    |
| 🎯 1. Odds Change Alert                                            |
|    Alert me if Win odds [decrease ▼] by more than [ 20 ] %        |
|    within a [ 5 ] minute window.                                   |
|    📊 Preview: "MARVON DOWNS odds dropped 25% (2.50→1.88)"        |
|                                                                    |
| 💰 2. Money Flow Alert                                             |
|    Alert me if Money Flow % [increases ▼] by more than [ 10 ] %.  |
|    📊 Preview: "AL LURCH'E money flow surged 15% (19.99→34.99%)"  |
|                                                                    |
| 🔊 3. Audio Settings                                               |
|    Volume: [▬▬▬▬▬▬▬░░░] 70%  [🔇 Mute] [🎵 Test Sound]           |
|    Pre-race warning: [✓] 1 minute before start                    |
|                                                                    |
| 📱 4. Notification Style                                           |
|    [✓] Visual flash (5s)  [✓] Toast popup  [✓] Browser notification |
|                                                                    |
+--------------------------------------------------------------------+
| [💾 SAVE CHANGES]  [👁️ PREVIEW ALERTS]  [❌ Cancel]              |
+--------------------------------------------------------------------+
```

## 4. Visual Design Language (Enhanced)

### 4.1 Color System

- **Status Colors:**
  - 🟢 Green: Open races, positive trends, connected status
  - 🟡 Yellow: Warning states, races starting soon, moderate changes
  - 🔴 Red: Closed/Final races, critical alerts, disconnected status
  - 🔵 Blue: Information, neutral states, user actions
- **Market Movement:**
  - Red/Pink (↓): Shortening odds (favorites strengthening)
  - Blue/Purple (↑): Lengthening odds (drifting in market)
  - Gray: No significant change
- **Accessibility:** All colors meet WCAG 2.1 AA contrast ratios with text alternatives

### 4.2 Typography Hierarchy

- **Primary Font:** Inter (web-optimized, excellent readability)
- **Monospace:** JetBrains Mono (for odds, percentages, precise data)
- **Scale:**
  - H1: 24px (Page titles)
  - H2: 20px (Section headers)
  - H3: 16px (Race names, important labels)
  - Body: 14px (Standard text)
  - Small: 12px (Metadata, timestamps)

### 4.3 Layout & Spacing

- **Grid System:** 8px base unit for consistent spacing
- **Responsive Breakpoints:**
  - Desktop: 1200px+ (primary target)
  - Tablet: 768px-1199px
  - Mobile: <768px (simplified view)
- **Data Density:** Optimized for information scanning with adequate whitespace

### 4.4 Interactive Elements

- **Buttons:** Clear hierarchy (Primary, Secondary, Tertiary)
- **Form Controls:** Consistent styling with clear focus states
- **Loading States:** Skeleton screens and progress indicators
- **Hover/Focus:** Subtle animations (200ms ease-out)

## 5. Accessibility Requirements

### 5.1 Keyboard Navigation

- **Tab Order:** Logical flow through all interactive elements
- **Shortcuts:** Arrow keys for race navigation, Space/Enter for actions
- **Focus Indicators:** High-contrast outlines on all focusable elements
- **Skip Links:** "Skip to main content" and "Skip to race data"

### 5.2 Screen Reader Support

- **ARIA Labels:** Comprehensive labeling for complex data tables
- **Live Regions:** Announce real-time updates without interrupting flow
- **Semantic HTML:** Proper heading structure and landmark roles
- **Alt Text:** Meaningful descriptions for sparklines and visual indicators

### 5.3 Visual Accessibility

- **Contrast:** Minimum 4.5:1 for normal text, 3:1 for large text
- **Text Scaling:** Support up to 200% zoom without horizontal scrolling
- **Color Independence:** Information never conveyed by color alone
- **Motion:** Respect prefers-reduced-motion for animations

## 6. Performance & Loading States

### 6.1 Progressive Loading

- **Critical Path:** Race list loads first, detailed view follows
- **Skeleton Screens:** Show layout structure while data loads
- **Lazy Loading:** Non-critical data loads on demand
- **Caching Strategy:** Smart caching for frequently accessed races

### 6.2 Real-Time Updates

- **Smooth Transitions:** Animate data changes to show what updated
- **Batch Updates:** Group rapid changes to prevent UI thrashing
- **Connection Status:** Clear indicators for WebSocket connection state
- **Offline Handling:** Graceful degradation when connection is lost

### 6.3 Error States

- **Network Errors:** Clear messaging with retry options
- **Data Errors:** Fallback to cached data when possible
- **User Errors:** Inline validation with helpful guidance
- **System Errors:** Friendly error pages with support contact

## 7. Mobile Considerations

### 7.1 Responsive Design

- **Touch Targets:** Minimum 44px for all interactive elements
- **Gesture Support:** Swipe navigation between races
- **Viewport Optimization:** Prevent zoom on form inputs
- **Orientation:** Support both portrait and landscape modes

### 7.2 Mobile-Specific Features

- **Pull-to-Refresh:** Manual data refresh capability
- **Bottom Navigation:** Easy thumb access to key functions
- **Simplified Filters:** Streamlined filter interface for small screens
- **Haptic Feedback:** Subtle vibration for important alerts

## 8. Future Enhancement Considerations

### 8.1 Advanced Features (Post-MVP)

- **Customizable Dashboard:** User-defined layouts and widgets
- **Advanced Analytics:** Historical trend analysis and predictions
- **Social Features:** Share interesting market movements
- **API Integration:** Third-party betting platform connections

### 8.2 Desktop-Focused Scalability

- **Component Library:** Desktop-optimized reusable UI components
- **Design Tokens:** Centralized design system prioritizing desktop density
- **Multi-Monitor Optimization:** Enhanced layouts for ultra-wide and multi-display setups
- **Professional Trading Interface:** Evolution toward Bloomberg Terminal-style information density
- **Theme Support:** Light/dark mode optimized for extended desktop usage
- **Keyboard Power User Features:** Advanced shortcuts and navigation for professional users
