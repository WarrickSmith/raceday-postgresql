# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaceDay is a real-time horse racing dashboard built with Next.js 15+ and Appwrite Cloud. The application provides live race data through automated polling of the New Zealand TAB API and real-time updates via Appwrite subscriptions.

## Key Commands

### Client Development (run from `client/` directory)
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run Jest in watch mode
- `npm run test:ci` - Run tests with coverage for CI

### Server Functions (run from `server/` directory)
- `npm run deploy` - Deploy all Appwrite functions
- `npm run deploy:meetings` - Deploy daily-meetings function
- `npm run deploy:races` - Deploy daily-races function
- `npm run deploy:poller` - Deploy race-data-poller function
- `npm run deploy:single-race` - Deploy single-race-poller function
- `npm run deploy:batch-race-poller` - Deploy batch-race-poller function
- `npm run deploy:master-scheduler` - Deploy master-race-scheduler function
- `npm run vars:all` - Update environment variables for all functions

**Note**: Deployment scripts utilize Appwrite CLI and are detailed in `server/package.json`. Each function contains its own dependencies and libraries for self-contained deployment to Appwrite.

### Manual Function Execution
- `npm run meetings` - Execute daily-meetings function
- `npm run races` - Execute daily-races function
- `npm run poller` - Execute race-data-poller function
- `npm run batch-race-poller` - Execute batch-race-poller function

## Architecture Overview

### Frontend (Next.js App Router)
- **Location**: `client/src/`
- **Framework**: Next.js 15+ with React 19, TypeScript, Tailwind CSS
- **Key Directories**:
  - `app/` - Next.js App Router pages and layouts
  - `components/` - Reusable React components
  - `hooks/` - Custom React hooks for real-time data and race management
  - `services/` - Backend service integrations and API calls
  - `types/` - TypeScript type definitions
  - `lib/` - Utility libraries and Appwrite client configuration

### Backend (Appwrite Functions)
- **Location**: `server/`
- **Runtime**: Node.js 22
- **Architecture**: Microservices with individual functions for specific tasks
- **Deployment**: Functions are fully self-contained with duplicated libraries for Appwrite deployment
- **Key Functions**:
  - `daily-meetings` - Import daily meeting data from NZ TAB API
  - `daily-races` - Import race data and entrants
  - `race-data-poller` - Poll for live race updates
  - `batch-race-poller` - Batch processing of multiple race updates
  - `master-race-scheduler` - Coordinate race polling schedules
  - `single-race-poller` - Individual race data updates

### Real-Time Data Flow
1. **Data Import**: Scheduled functions import race data from NZ TAB API
2. **Live Updates**: Polling functions update race data in real-time
3. **Client Subscriptions**: React hooks subscribe to Appwrite real-time events
4. **UI Updates**: Components automatically re-render with live data

## Critical Real-Time Integration

### Appwrite Client Configuration
- Client configuration in `lib/appwrite-client.ts` and `lib/appwrite-server.ts`
- Real-time subscriptions handled through custom hooks in `hooks/`
- Environment variables required: `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- **Documentation Research**: Use MCP Context7 server for up-to-date Appwrite integration documentation and examples

### Key Hooks for Real-Time Data
- `useAppwriteRealtime.ts` - Core real-time subscription management
- `useMoneyFlowTimeline.ts` - Money flow and betting pool data
- `useRealtimeRace.ts` - Individual race data updates
- `useRealtimeMeetings.tsx` - Meeting-level data
- `useRealtimeEntrants.ts` - Entrant-specific updates

### Data Synchronization Patterns
- Real-time hooks must maintain connection to Appwrite database
- Pool calculations require live API data, not fallback dummy values
- Timeline data needs proper interval matching for historical vs live races
- Update timestamps should reflect actual data refresh times

## Development Workflow

### MCP Server Integration
- **Web Search & Documentation**: Use MCP WebSearch and Context7 servers for researching Appwrite integration patterns and troubleshooting
- **Browser Testing**: Use MCP Playwright or Puppeteer servers for comprehensive client-side testing and validation
- **Real-time Debugging**: Leverage browser automation tools to test live data connections and UI responsiveness

### Environment Setup
1. Set up Appwrite Cloud project with required environment variables
2. Run `npm install` in both `client/` and `server/` directories
3. Use `npm run setup:appwrite` from client directory to initialize database schema
4. Ensure real-time subscriptions are properly configured for live data flow

### Testing Strategy
- Unit tests configured with Jest and React Testing Library
- Test real-time data connections with live race data
- Validate pool calculations match race totals (mathematical verification)
- Monitor "No updates yet" vs actual timestamp displays for real-time status
- **Browser Testing**: Use MCP Playwright or Puppeteer servers to validate client application issues and fixes in real browser environments

### Code Patterns
- React components use custom hooks for data fetching and real-time updates
- Appwrite functions follow microservice architecture with individual responsibilities
- TypeScript types are shared between client and server through `types/` directory
- Error handling includes fallback states but should not mask real-time connection issues

## Known Issues & Current Work

### Story 4.9 Implementation (Money Flow Timeline)
- **Status**: Partial implementation with critical real-time data connection issues
- **Problem**: API returns real data but UI shows dummy fallback values
- **Priority**: Fix real-time subscription broken connection preventing live data from reaching UI
- **Files**: `EnhancedEntrantsGrid.tsx`, real-time hooks, pool calculation logic

### Testing with Live Data
- Use race ID `279dc587-bb6e-4a56-b7e5-70d78b942ddd` for "CHRISTCHURCH CASINO 30TH SI AWARDS"
- Verify real percentages (e.g., 28%) instead of dummy values (14.29%)
- Ensure pool amounts sum correctly to footer totals
- Check that timeline columns show real incremental data (e.g., "+$344")

## Database Architecture

### Appwrite Collections
- **Meetings** - Race meeting information
- **Races** - Individual race details  
- **Entrants** - Horse/jockey entries per race
- **Race Pools** - Betting pool data and money flow
- Real-time subscriptions automatically sync data changes to connected clients

### Data Flow Validation
- Server functions populate collections via NZ TAB API
- Client components subscribe to collection changes via Appwrite real-time
- Money flow calculations use live pool data, not estimated fallback values
- Pool percentages and amounts must be mathematically consistent