# RaceDay - Real-time Horse Racing Dashboard

This is a [Next.js](https://nextjs.org) project for real-time horse racing data visualization, built with Appwrite as the backend.

## Prerequisites

- Node.js v22.17.0+
- Appwrite Cloud account
- New Zealand TAB API access (for data polling)

## Setup

### 1. Appwrite Configuration

Before running the application, you need to set up your Appwrite project:

1. Create a new project in [Appwrite Cloud](https://cloud.appwrite.io)
2. Copy your Project ID and API Key
3. Create a `.env.local` file in the `client/` directory:

```bash
APPWRITE_ENDPOINT=https://appwrite.warricksmith.com/v1
APPWRITE_PROJECT_ID=your_project_id_here
APPWRITE_API_KEY=your_api_key_here
```

### 2. Database Setup

Run the Appwrite setup script to create the database and collections:

```bash
# Navigate to client directory
cd client

# Install dependencies first
npm install

# Run the setup script
npm run setup:appwrite
```

This script will:

- Create the `raceday-db` database
- Create all required collections (Meetings, Races, Entrants, etc.)
- Set up relationships between collections
- Create indexes for optimal querying
- Provide instructions for setting up user role labels

**Important**: After running the script, you must manually create user role labels in your Appwrite console:

1. Go to Auth > Labels in your Appwrite console
2. Create label: "user" with color #3B82F6 (default user role)
3. Create label: "admin" with color #EF4444 (admin role)

The script is **idempotent** - safe to run multiple times without duplicating resources.

### 3. User Role Management

The application uses Appwrite user labels for role-based access control. Use the provided helper functions:

```typescript
import { assignUserRole, getUserRole } from './scripts/appwrite-setup'

// Assign role to a user (during registration)
await assignUserRole(userId, 'user') // or 'admin'

// Get user role (for route protection)
const role = await getUserRole(userId)
```

## Getting Started

First, navigate to the client directory and run the development server:

```bash
cd client
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `client/src/app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Project Structure

```
/
├── client/                        # Next.js Frontend
│   ├── scripts/
│   │   └── appwrite-setup.ts     # Database setup script
│   ├── src/
│   │   ├── app/                  # Next.js App Router
│   │   ├── components/           # React components
│   │   ├── lib/
│   │   │   └── appwrite.ts      # Appwrite client configuration
│   │   └── services/             # Backend service interactions
│   ├── public/                   # Static assets
│   ├── package.json             # Frontend dependencies
│   └── .env.local              # Environment variables
├── server/                       # Appwrite Functions
│   └── daily-race-importer/     # Daily race data import function
├── docs/                         # Project documentation
└── README.md                    # This file
```

## Available Scripts

### Frontend (run from `client/` directory)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run test` - Run tests
- `npm run setup:appwrite` - Set up Appwrite database

### Backend (Appwrite Functions)
- Functions are deployed directly to Appwrite Cloud
- Configuration files located in `server/` directory

## Tech Stack

- **Frontend**: Next.js 15.4+, React 19, TypeScript, Tailwind CSS
- **Backend**: Appwrite Cloud
- **Real-time**: Appwrite Realtime Subscriptions
- **Data Source**: New Zealand TAB API

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
