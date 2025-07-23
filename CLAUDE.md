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
- **Backend**: Appwrite Cloud with serverless functions for data polling (`daily-meetings`, `daily-races`, `daily-entrants`, `race-data-poller`, `alert-evaluator`)
- **Database**: Appwrite database with collections for Meetings, Races, Entrants, OddsHistory, MoneyFlowHistory, UserAlertConfigs, and Notifications
- **Data Source**: New Zealand TAB API integration
- **Real-time**: Appwrite Realtime channels for live dashboard updates

## Development Commands

### Essential Commands (run from /client directory)
- `cd client` - **Always navigate to client directory first**
- `npm install` - Install dependencies after pulling changes
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run lint` - Run ESLint linting
- `npm run test` - Run Jest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ci` - Run tests with coverage for CI

### Database Setup
- `npm run setup:appwrite` - Initialize Appwrite database and collections (idempotent)
- `npx tsx scripts/appwrite-setup.ts` - Alternative way to run setup script

### Single Test Execution
- `npm test -- --testNamePattern="test name"` - Run specific test by name
- `npm test -- src/path/to/test.test.ts` - Run specific test file

### Server Functions Deployment

#### Daily Data Pipeline Functions (v2.0 Microservices)
- `cd server/daily-meetings && npm run deploy` - Deploy daily meetings function (17:00 UTC)
- `cd server/daily-races && npm run deploy` - Deploy daily races function (17:10 UTC)  
- `cd server/daily-entrants && npm run deploy` - Deploy daily entrants function (17:20 UTC)

#### Real-time Functions
- `cd server/race-data-poller && npm run deploy` - Deploy race data poller function
- `cd server/alert-evaluator && npm run deploy` - Deploy alert evaluator function

#### Development & Testing
- `cd server/[function-name] && npm run dev` - Local testing of specific function
- `cd server/[function-name] && npm test` - Run function tests

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

## Project Structure & Key Files

### Configuration Files
- `next.config.ts` - Next.js configuration with security headers and Docker optimization
- `jest.config.js` - Test configuration with Appwrite SDK mocking
- `eslint.config.mjs` - ESLint configuration using Next.js recommended rules

### Critical Directories
- `client/src/app/` - Next.js App Router pages and API routes
- `client/scripts/` - Database setup and utility scripts  
- `docs/` - Comprehensive project documentation including architecture specs
- `docs/architecture/` - Detailed system architecture documentation

### Authentication & User Management
The application uses Appwrite user labels for role-based access:
- "user" label (default user role)  
- "admin" label (admin role)
User roles must be manually configured in Appwrite console after running setup script.

## Key Integration Points

- **NZ TAB API**: Primary data source for race information
- **Appwrite Functions**: Microservices architecture with specialized functions:
  - **Daily Pipeline**: `daily-meetings` (17:00) → `daily-races` (17:10) → `daily-entrants` (17:20)
  - **Real-time**: `race-data-poller` (every minute), `alert-evaluator` (event-triggered)
- **Real-time Updates**: Appwrite Realtime channels for live dashboard updates
- **Authentication**: Appwrite Account API with user role labels

## Prerequisites

- Node.js v22.17.0+
- Appwrite Cloud account with configured project
- Appwrite CLI installed globally (`npm install -g appwrite-cli`)
- NZ TAB API access for data polling

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.