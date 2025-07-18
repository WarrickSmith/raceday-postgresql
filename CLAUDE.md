# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ci` - Run tests with coverage for CI

### Database Setup
- `npm run setup:appwrite` - Set up Appwrite database and collections (idempotent)

## Architecture Overview

RaceDay is a real-time horse racing dashboard built with:
- **Frontend**: Next.js 15+ with TypeScript, React 19, Tailwind CSS
- **Backend**: Appwrite Cloud with serverless functions
- **Data Source**: New Zealand TAB API
- **Real-time**: Appwrite Realtime Subscriptions

### Key Architecture Concepts

1. **Serverless Backend**: All backend logic runs as Appwrite Functions:
   - `daily-race-importer` - Fetches daily race meetings (CRON scheduled)
   - `race-data-poller` - Polls active races for real-time updates
   - `alert-evaluator` - Evaluates user alert configurations

2. **Database Collections** (see `scripts/appwrite-setup.ts` for schema):
   - Meetings → Races → Entrants (hierarchical relationship)
   - OddsHistory, MoneyFlowHistory (time-series data)
   - UserAlertConfigs, Notifications (user-specific)

3. **Real-time Data Flow**:
   - Backend functions update Appwrite collections
   - Frontend subscribes to Appwrite Realtime channels
   - UI updates automatically when data changes

## Code Standards

### TypeScript Requirements
- All code must be TypeScript with strict type checking
- Use PascalCase for components and interfaces
- Use camelCase for functions and variables

### Frontend Patterns
- Components should be single-responsibility and focused
- Use Server-Side Rendering (SSR) for initial data loads
- Use SWR for client-side data fetching and re-validation
- Prefer local component state; use React Context for global state
- Use Tailwind CSS utility classes (avoid inline styles)

### Environment Setup
Create `.env.local` with:
```
APPWRITE_ENDPOINT=https://appwrite.warricksmith.com/v1
APPWRITE_PROJECT_ID=your_project_id_here
APPWRITE_API_KEY=your_api_key_here
```

### API Endpoints
- **NZTAB Base URL**: https://api.tab.co.nz
- **Appwrite Endpoint**: https://appwrite.warricksmith.com/v1

### Testing
- Tests use Jest with React Testing Library
- Run `npm run test:ci` before committing changes
- Test files located in `__tests__/` directories

### Database Schema Management
- Use `scripts/appwrite-setup.ts` to manage database schema
- Script is idempotent - safe to run multiple times
- Collections use relationships for data normalization
- Indexes optimized for common query patterns

## Project Structure

```
src/
├── app/              # Next.js App Router
│   ├── api/         # API routes
│   ├── layout.tsx   # Root layout with fonts and metadata
│   └── page.tsx     # Main dashboard
├── components/       # React components (to be created)
├── lib/             # Utilities and Appwrite client config
└── services/        # Backend service interactions

scripts/
└── appwrite-setup.ts # Database setup and user role management
```

## Key Files

- `scripts/appwrite-setup.ts:17-31` - Database configuration and collection IDs
- `src/app/layout.tsx:15-19` - App metadata and title configuration
- `docs/architecture.md` - Detailed system architecture documentation
- `docs/architecture/8-coding-standards.md` - Complete coding standards