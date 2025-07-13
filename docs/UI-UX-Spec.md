# UI/UX Specification: RaceDay v1.1

*   **Project:** RaceDay
*   **Version:** 1.1
*   **Author:** BMad UX Expert
*   **Date:** 2025-07-11 05:39:02
*   **Status:** Draft

## 1. UX Vision & Principles

The user experience for RaceDay will be guided by three core principles:

*   **Clarity at a Glance:** The UI must present complex data in a way that is immediately scannable and understandable. Visual cues like color-coding and sparklines are critical.
*   **Real-Time Immersion:** The user should feel connected to the live market. The interface must update dynamically and automatically, eliminating the need for manual refreshes and ensuring the user never feels out of sync.
*   **User in Control:** The user can customize their experience through powerful filtering and alerting to focus on the data that is most important to them, reducing noise and cognitive load.

## 2. Core Interaction Patterns

*   **Filtering:** Filters applied on the dashboard persist and affect all views and navigation, including the "jump to next race" button.
*   **Navigation:** The primary navigation between races will use clear "Previous" and "Next" buttons. A "Next Scheduled Race" button provides a shortcut to the most imminent event that matches the user's filters.
*   **Alerts:** Market-based alerts are configured in a dedicated modal. The global audible alert is a persistent toggle in the main UI.

## 3. Wireframes

### Screen 1: Main Dashboard / Detailed Race View (Unified View) - **UPDATED**

*The global audible alert toggle is now in the filter bar for constant visibility.*

```
+--------------------------------------------------------------------------------------------------+
| RaceDay [LOGO]                                                 Logged in as: WarrickSmith [Logout] |
+--------------------------------------------------------------------------------------------------+
| Filters: Country [Multi-Select Dropdown v] Race Type [Multi-Select Dropdown v] | [Audible Alert 🔊 ON/OFF] |
+--------------------------------------------------------------------------------------------------+
| Left Panel: Race List (Dashboard)              | Right Panel: Detailed Race View                 |
|------------------------------------------------|-------------------------------------------------|
| ▼ Meeting: ROTORUA (R) - NZ - Gallops          | [ < PREV RACE ] [ NEXT SCHEDULED RACE ] [ NEXT > ] |
|   R1 - Maiden Plate [Open] - 10:20             |                                                 |
|   R2 - Handicap     [Open] - 10:50             | 10:20 - MAIDEN PLATE @ ROTORUA (R) - 2200m        |
|                                                | Track: Good | Weather: Fine | Status: Open (1m 30s) |
| ▼ Meeting: ASCOT (R) - UK - Gallops            |-------------------------------------------------|
|   R1 - Sprint       [Open] - 11:05             | # | Runner/Jockey/Trainer | Win  | Place| Money%| Odds History |
|   R2 - Stakes       [Open] - 11:35             |-------------------------------------------------|
|                                                | 1 | MARVON DOWNS          | 2.50 | 1.30 | 33.58 | __/\_        |
| ▼ Meeting: ADDINGTON (H) - NZ - Trots          |   | J. McDonald           |      |      |       |              |
|   R1 - Mobile Pace  [Closed] - 09:45           |---+-----------------------+------+------+-------+--------------|
|   R2 - Trotters Cup [Final]  - 10:15           | 2 | AL LURCH'E            | 4.20 | 1.50 | 19.99 |   \/_/\_     |
|                                                |   | M. Coleman            |      |      |       |              |
|                                                |-------------------------------------------------|
|                                                | ... (more runners) ...                          |
|                                                |-------------------------------------------------|
|                                                | [ Configure Market Alerts ]                     |
+--------------------------------------------------------------------------------------------------+
```

### Screen 2: Market Alerts Configuration (Modal) - **UPDATED**

*The modal is now focused only on market-based alerts.*

```
+--------------------------------------------------------------------+
| Configure Market Alerts                                        [X] |
+--------------------------------------------------------------------+
|                                                                    |
| [X] Enable Market Alerts                                           |
|                                                                    |
| 1. Odds Change Alert                                               |
|    Alert me if Win odds [change by v] more than [ 20 ] %           |
|    within a [ 5 ] minute window.                                   |
|                                                                    |
| 2. Money Flow Alert                                                |
|    Alert me if Money Flow % [increases by v] more than [ 10 ] %.   |
|                                                                    |
+--------------------------------------------------------------------+
| [_SAVE_CHANGES_]                                [ Cancel ]         |
+--------------------------------------------------------------------+
```

## 4. Visual Design Language (Initial Direction)

*   **Color-Coding:** As seen in the reference image, color will be used to indicate market movement. Red/Pink for shortening odds, Blue/Purple for lengthening odds.
*   **Typography:** A clean, sans-serif font (like Inter or Roboto) for maximum readability.
*   **Layout:** A tight grid system will be used to align all data points.