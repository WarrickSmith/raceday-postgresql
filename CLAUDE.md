# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RaceDay is a real-time horse racing dashboard built with Next.js 15+ and Appwrite Cloud. The application polls New Zealand TAB API for race data and provides real-time updates through Appwrite's realtime subscriptions.

## Architecture

The project follows a client-server split architecture:

- **client/**: Next.js 15+ frontend with TypeScript, Tailwind CSS, and React 19
- **server/**: Appwrite setup scripts and backend configuration
- **docs/**: Comprehensive project documentation including architecture, PRD, and API specs

Key architectural components:
- **Frontend**: Next.js App Router with real-time Appwrite subscriptions
- **Backend**: Appwrite Cloud with serverless functions for data polling
- **Database**: Appwrite database with collections for Meetings, Races, Entrants, OddsHistory, MoneyFlowHistory, UserAlertConfigs, and Notifications
- **Data Source**: New Zealand TAB API integration

## Development Commands

### Client Development (run from /client directory)
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint linting
- `npm run test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ci` - Run tests with coverage for CI

### Database Setup
- `npm run setup:appwrite` - Initialize Appwrite database and collections (idempotent)
- `npx tsx scripts/appwrite-setup.ts` - Alternative way to run setup script

## Environment Configuration

Required environment variables in `.env.local`:
```
APPWRITE_ENDPOINT=https://appwrite.warricksmith.com/v1
APPWRITE_PROJECT_ID=your_project_id_here
APPWRITE_API_KEY=your_api_key_here
```

## Database Schema

The Appwrite database (`raceday-db`) contains these collections:
- **meetings**: Race meeting information
- **races**: Individual race details linked to meetings
- **entrants**: Horse entrants linked to races
- **odds-history**: Historical odds data for entrants
- **money-flow-history**: Money flow tracking for entrants
- **user-alert-configs**: User notification preferences
- **notifications**: Real-time alert notifications

All collections use relationship attributes for data linking and include proper indexing for optimal querying.

## Testing

- Test files use Jest with jsdom environment
- Tests located in `__tests__/` directories or `.test.ts` files
- Coverage collection configured for `src/` and `scripts/` directories
- Custom module mapping for Appwrite SDK mocking

## Code Conventions

- **Language**: TypeScript exclusively
- **Components**: PascalCase (e.g., `RaceGrid.tsx`)
- **Functions/Variables**: camelCase
- **Types/Interfaces**: PascalCase
- **Styling**: Tailwind CSS utility classes
- **State Management**: Appwrite SDK with SWR for client-side data fetching
- **Real-time**: Appwrite Realtime subscriptions for live data updates

## Key Integration Points

- **NZ TAB API**: Primary data source for race information
- **Appwrite Functions**: Serverless functions for data polling (`daily-race-importer`, `race-data-poller`, `alert-evaluator`)
- **Real-time Updates**: Appwrite Realtime channels for live dashboard updates
- **Authentication**: Appwrite Account API with user role labels

## Prerequisites

- Node.js v22.17.0+
- Appwrite Cloud account with configured project
- NZ TAB API access for data polling