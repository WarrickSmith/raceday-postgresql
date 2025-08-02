# 4. Frontend Architecture & Real-Time Communication

## 4.1. Next.js 15 App Router Architecture

### 4.1.1. Server Components Strategy

**Purpose:**  
Optimize initial page loads and reduce client bundle size using Server Components for data fetching.

**Implementation Pattern:**
```typescript
// app/(dashboard)/page.tsx - Server Component
import { getMeetingsData } from '@/server/meetings-data';
import { MeetingsListClient } from '@/components/dashboard/MeetingsListClient';

export default async function DashboardPage() {
  const initialMeetings = await getMeetingsData();
  
  return (
    <main>
      <h1>Race Meetings</h1>
      <MeetingsListClient initialData={initialMeetings} />
    </main>
  );
}
```

**Benefits:**
- Faster initial page loads (data fetched on server)
- Reduced client JavaScript bundle size
- Better SEO and Core Web Vitals scores
- Automatic caching and revalidation

**Requirements:**
- [ ] All initial data fetching uses Server Components
- [ ] Server Components use `node-appwrite` SDK
- [ ] Data passes to Client Components via props
- [ ] Implement proper error boundaries

### 4.1.2. Client Components Strategy

**Purpose:**  
Handle interactivity and real-time updates while maintaining performance.

**Implementation Pattern:**
```typescript
// components/dashboard/MeetingsListClient.tsx - Client Component
'use client';
import { useRealtimeMeetings } from '@/hooks/useRealtimeMeetings';

interface Props {
  initialData: Meeting[];
}

export function MeetingsListClient({ initialData }: Props) {
  const meetings = useRealtimeMeetings(initialData);
  
  return (
    <div>
      {meetings.map(meeting => (
        <MeetingCard key={meeting.$id} meeting={meeting} />
      ))}
    </div>
  );
}
```

**Benefits:**
- Smooth hydration from server data
- Real-time updates without full page refresh
- Optimized re-rendering with React.memo()
- Progressive enhancement approach

**Requirements:**
- [ ] Client Components use `appwrite` web SDK only
- [ ] Accept initial server data for hydration
- [ ] Implement update batching for performance
- [ ] Use React.memo() for optimization

### 4.1.3. Streaming and Progressive Loading

**Purpose:**  
Improve perceived performance with progressive content loading.

**Implementation Pattern:**
```typescript
// app/(dashboard)/page.tsx with Streaming
import { Suspense } from 'react';
import { MeetingsListSkeleton } from '@/components/skeletons';

export default function DashboardPage() {
  return (
    <main>
      <h1>Race Meetings</h1>
      <Suspense fallback={<MeetingsListSkeleton />}>
        <MeetingsServerComponent />
      </Suspense>
    </main>
  );
}
```

**Benefits:**
- Instant visual feedback with skeletons
- Non-blocking progressive rendering
- Better perceived performance
- Graceful loading states

**Requirements:**
- [ ] Implement Suspense boundaries for data loading
- [ ] Create skeleton components for all major sections
- [ ] Progressive enhancement for non-critical features
- [ ] Lazy load heavy components with `next/dynamic`

## 4.2. Real-Time Data Synchronization

### 4.2.1. Appwrite Real-time Architecture

**Purpose:**  
Synchronize frontend with backend data changes via optimized Appwrite Realtime subscriptions.

**Implementation Pattern:**
```typescript
// hooks/useRealtimeMeetings.ts
'use client';
import { client } from '@/lib/appwrite-client';

export function useRealtimeMeetings(initialData: Meeting[]) {
  const [meetings, setMeetings] = useState(initialData);
  
  useEffect(() => {
    const unsubscribe = client.subscribe([
      'databases.raceday-db.collections.meetings.documents',
      'databases.raceday-db.collections.races.documents'
    ], (response) => {
      // Batch updates to prevent excessive re-renders
      setMeetings(prev => updateMeetingsOptimized(prev, response));
    });
    
    return () => unsubscribe();
  }, []);
  
  return meetings;
}
```

**Performance Optimizations:**
- **Selective Subscriptions:** Only subscribe to relevant collections and documents
- **Update Batching:** Batch rapid updates to prevent UI thrashing
- **Connection Management:** Handle disconnections with exponential backoff
- **Memory Management:** Proper cleanup of subscriptions

**Requirements:**
- [ ] Data updates propagate to UI <2 seconds
- [ ] Implement connection retry logic
- [ ] Batch updates during high-frequency periods
- [ ] Handle offline/online state gracefully

### 4.2.2. Subscription Channel Strategy

**Channel Subscriptions by Feature:**

```typescript
// Dashboard real-time subscriptions
const dashboardChannels = [
  'databases.raceday-db.collections.meetings.documents',
  'databases.raceday-db.collections.races.documents'
];

// Race detail real-time subscriptions
const raceDetailChannels = [
  'databases.raceday-db.collections.entrants.documents',
  'databases.raceday-db.collections.odds-history.documents',
  'databases.raceday-db.collections.money-flow-history.documents'
];

// User-specific subscriptions
const userChannels = [
  'databases.raceday-db.collections.user-alert-configs.documents',
  'databases.raceday-db.collections.notifications.documents'
];
```

**Requirements:**
- [ ] Subscribe only to relevant data for current view
- [ ] Unsubscribe when components unmount
- [ ] Filter updates by user permissions
- [ ] Implement subscription pooling for efficiency

## 4.3. Authentication & Session Management

### 4.3.1. Server-Side Authentication

**Purpose:**  
Secure server-side authentication using Appwrite with Next.js 15 Server Components.

**Implementation Pattern:**
```typescript
// lib/appwrite-server.ts
import { Client, Account } from 'node-appwrite';
import { cookies } from 'next/headers';

export async function createSessionClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

  const session = cookies().get('session');
  if (session?.value) {
    client.setSession(session.value);
  }

  return {
    get account() {
      return new Account(client);
    }
  };
}
```

**Security Features:**
- HTTP-only cookies for session storage
- Server-side session validation
- API keys kept server-side only
- CSRF protection with SameSite cookies

**Requirements:**
- [ ] Implement secure session handling
- [ ] Server-side authentication validation
- [ ] Protected route middleware
- [ ] Automatic session refresh

### 4.3.2. Client-Side Authentication State

**Purpose:**  
Manage authentication state in Client Components for UI updates.

**Implementation Pattern:**
```typescript
// hooks/useAuth.ts
'use client';
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Get initial auth state from server
    checkAuthStatus().then(setUser).finally(() => setLoading(false));
  }, []);
  
  return { user, loading, login, logout };
}
```

**Requirements:**
- [ ] Hydrate client state from server authentication
- [ ] Handle login/logout state changes
- [ ] Persist sessions across browser sessions
- [ ] Implement automatic token refresh

## 4.4. Performance Monitoring & Optimization

### 4.4.1. Real User Monitoring (RUM)

**Purpose:**  
Monitor real-world performance metrics and optimize accordingly.

**Implementation:**
```typescript
// app/layout.tsx - Web Vitals tracking
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
```

**Monitoring Targets:**
- Core Web Vitals (LCP, FID, CLS)
- Real-time subscription latency
- Bundle size and load times
- Error rates and user flows

**Requirements:**
- [ ] Implement Web Vitals tracking
- [ ] Monitor real-time performance
- [ ] Track user interaction metrics
- [ ] Set up performance alerts

### 4.4.2. Bundle Optimization

**Purpose:**  
Minimize JavaScript bundle size for faster loading.

**Optimization Strategies:**
- Tree shaking for Appwrite SDK imports
- Code splitting with `next/dynamic`
- Route-based bundle splitting
- Static asset optimization

**Requirements:**
- [ ] Bundle size <500KB for main dashboard
- [ ] Implement tree shaking for all imports
- [ ] Use dynamic imports for heavy components
- [ ] Monitor bundle size in CI/CD

---
