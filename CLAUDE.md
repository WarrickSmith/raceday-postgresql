# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaceDay is a live horse racing dashboard built with Next.js 15+ and Appwrite Cloud. The application provides live race data through automated server-side polling of the New Zealand TAB API and coordinated client-side polling for real-time updates.

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
- `npm run deploy:meeting-status` - Deploy meeting-status-poller function
- `npm run deploy:initial-data` - Deploy daily-initial-data function
- `npm run vars:all` - Update environment variables for all functions

**Note**: Deployment scripts utilize Appwrite CLI and are detailed in `server/package.json`. Each function contains its own dependencies and libraries for self-contained deployment to Appwrite.

### Manual Function Execution
- `npm run meetings` - Execute daily-meetings function
- `npm run races` - Execute daily-races function
- `npm run initial-data` - Execute daily-initial-data function
- `npm run poller` - Execute race-data-poller function
- `npm run single-race` - Execute single-race-poller function
- `npm run meeting-status` - Execute meeting-status-poller function
- `npm run batch-race-poller` - Execute batch-race-poller function
- `npm run master-scheduler` - Execute master-race-scheduler function

## Architecture Overview

### Frontend (Next.js App Router)
- **Location**: `client/src/`
- **Framework**: Next.js 15+ with React 19, TypeScript, Tailwind CSS
- **Key Directories**:
  - `app/` - Next.js App Router pages and layouts
  - `components/` - Reusable React components
  - `hooks/` - Custom React hooks for polling, data management, and race coordination
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
  - `daily-initial-data` - Initial data setup and import
  - `race-data-poller` - Poll for live race updates
  - `single-race-poller` - Individual race data updates
  - `batch-race-poller` - Batch processing of multiple race updates
  - `meeting-status-poller` - Monitor meeting status changes
  - `master-race-scheduler` - Coordinate race polling schedules

### Polling Architecture Data Flow
1. **Data Import**: Scheduled functions import race data from NZ TAB API (daily-meetings, daily-races)
2. **Live Updates**: Server polling functions (master-race-scheduler, enhanced-race-poller) update race data at coordinated intervals
3. **Client Polling**: React hooks fetch data from Next.js API routes at dynamic intervals based on race timing
4. **UI Updates**: Components re-render based on polling updates with staleness indicators and loading states

## Critical Polling Integration

### Appwrite Client Configuration
- Client configuration in `lib/appwrite-client.ts` and `lib/appwrite-server.ts`
- Environment variables required: `NEXT_PUBLIC_APPWRITE_ENDPOINT`, `NEXT_PUBLIC_APPWRITE_PROJECT_ID`
- **Documentation Research**: Use MCP Context7 server for up-to-date Appwrite integration documentation and examples

### Key Hooks for Polling Data
- `useRacePolling.ts` - Coordinated race data polling with dynamic cadence and health checks
- `useMeetingsPolling.tsx` - Meeting list polling with connection state management
- `useRacePools.ts` - Pool data fetching synchronized with race polling
- `useMoneyFlowTimeline.ts` - Money flow history with incremental loading
- `usePollingMetrics.ts` - Polling observability and metrics tracking
- `useEndpointMetrics.ts` - Request-level metrics for monitoring

### Polling Synchronization Patterns
- Polling hooks coordinate request timing to prevent overlapping fetches
- Health checks guard polling to prevent requests when backend unavailable
- Pool calculations use live polled data with staleness indicators
- Polling cadence dynamically adjusts based on race timing (T-65m+: 30min, T-60m to T-5m: 2.5min, T-5m to T-3m: 30s, T-3m to Start: 30s, Post-start: 30s)
- Request deduplication prevents stacked API calls
- Update timestamps reflect actual polling data refresh times

## Development Workflow

### MCP Server Integration
- **Web Search & Documentation**: Use MCP WebSearch and Context7 servers for researching Appwrite integration patterns and troubleshooting
- **Browser Testing**: Use MCP Playwright or Puppeteer servers for comprehensive client-side testing and validation
- **Polling Debugging**: Leverage browser automation tools to test polling coordination, health checks, and UI responsiveness

### Environment Setup
1. Set up Appwrite Cloud project with required environment variables
2. Run `npm install` in both `client/` and `server/` directories
3. Use `npm run setup:appwrite` from client directory to initialize database schema
4. Create required user role labels in Appwrite console: "user" and "admin"
5. Configure polling behavior via environment variables (see `.env.example`)
6. **Health Monitoring**: Enabled by default via `NEXT_PUBLIC_ENABLE_HEALTH_MONITORING=true` (periodic backend health checks every 3 minutes)
7. **Polling Monitor**: Set `NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true` in `.env.local` to enable development polling metrics panel

### Health Monitoring & Connection Management
- **Health Monitoring**: Periodic backend health checks enabled by default (every 3 minutes, configurable via `NEXT_PUBLIC_HEALTH_CHECK_INTERVAL_MS`)
- **Connection State Management**: Global connection state guards polling requests when backend unavailable
- **Automatic Recovery**: When backend returns to health, polling automatically resumes
- **Reference Counting**: Health monitoring uses reference counting for multi-page scenarios (continues while at least one page is active)
- **Manual Retry**: Users can manually trigger connection retry via UI when disconnected
- **Connection Guards**: Polling hooks check connection state before making requests to prevent failed fetches

### Polling Monitor (Development Feature)
- **Enable**: Set `NEXT_PUBLIC_ENABLE_POLLING_MONITOR=true` in `.env.local`
- **Disable**: Set `NEXT_PUBLIC_ENABLE_POLLING_MONITOR=false` or omit the variable entirely (default: disabled)
- **Access**: Collapsible panel above Enhanced Entrants Grid on race pages (when enabled)
- **Features**: Request counts, error rates, latency metrics, cadence compliance tracking, endpoint performance table, recent activity log
- **Warning System**: Visual alerts when cadence drift detected or error rates exceed thresholds
- **Performance Impact**: Zero overhead when disabled

### Prerequisites
- Node.js v22.17.0+ (server functions require Node.js 22)
- Appwrite CLI installed globally (`npm install -g appwrite-cli`)
- Appwrite Cloud account with project created

### Testing Strategy
- Unit tests configured with Jest and React Testing Library
- Test polling coordination and request deduplication with multiple simultaneous polls
- Validate health check guards prevent requests when backend disconnected
- Validate pool calculations match race totals (mathematical verification)
- Monitor polling cadence compliance with backend scheduling windows
- Verify staleness indicators and update timestamps reflect actual polling data
- **Browser Testing**: Use MCP Playwright or Puppeteer servers to validate client application issues and fixes in real browser environments

### Code Patterns
- React components use custom hooks for data fetching and polling coordination
- Polling hooks check connection state before making requests
- Appwrite functions follow microservice architecture with individual responsibilities
- TypeScript types are shared between client and server through `types/` directory
- Error handling includes fallback states with retry mechanisms and user-friendly messaging
- Response compression (Brotli/Gzip) enabled for all API routes and Appwrite functions

## Current Architecture Status

### Polling Implementation (Completed)
- **Client Polling**: Coordinated polling hooks with dynamic cadence based on race timing
- **Health Monitoring**: Periodic backend health checks with connection state management
- **Response Compression**: Brotli/Gzip compression for 60-70% payload reduction
- **Polling Observability**: Development monitoring UI for metrics tracking
- **Status**: Polling architecture fully implemented and tested (290/290 tests passing)

### Testing with Live Data
- Use active race IDs from meetings page for current day testing
- Verify polling updates occur at expected intervals based on race timing
- Check connection status indicator shows "Connected" when backend healthy
- Monitor polling metrics (if enabled) for cadence compliance and error rates
- Validate pool amounts and percentages update based on polling data

## Database Architecture

### Appwrite Collections
- **Meetings** - Race meeting information
- **Races** - Individual race details
- **Entrants** - Horse/jockey entries per race
- **Race Pools** - Betting pool data and money flow
- **Money Flow History** - Time-series data for money flow timeline visualization

### Data Flow Validation
- Server functions populate collections via NZ TAB API polling
- Client components fetch data via Next.js API routes using coordinated polling
- Money flow calculations use live polled data with staleness indicators
- Pool percentages and amounts must be mathematically consistent
- Polling cadence adjusts dynamically based on race timing (T-65m through post-start)

## Important Instructions and Reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.