# 8. Coding Standards

## 8.1. General Standards

### 8.1.1. Language Requirements
- **Frontend:** TypeScript 5.0+ exclusively for all frontend code
- **Backend:** JavaScript (ES2022+) exclusively for all Appwrite functions
- **Configuration:** TypeScript for configuration files (next.config.ts, etc.)

### 8.1.2. Code Quality Tools
- **Formatting:** Prettier with project-specific configuration
- **Linting:** ESLint with Next.js 15 and TypeScript rules
- **Type Checking:** Strict TypeScript configuration
- **Testing:** Jest + React Testing Library for components

### 8.1.3. Naming Conventions
- **Components:** `PascalCase` (e.g., `MeetingCard.tsx`, `RaceDetailsModal.tsx`)
- **Functions/Variables:** `camelCase` (e.g., `fetchMeetingData`, `useRealtimeMeetings`)
- **Types/Interfaces:** `PascalCase` (e.g., `interface MeetingData`, `type RaceStatus`)
- **Files:** `kebab-case` for directories, `PascalCase` for components
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`)

### 8.1.4. Documentation Standards
- **TSDoc:** Use TSDoc comments for public APIs and complex functions
- **README:** Each major feature/module must have usage documentation
- **Architecture Decisions:** Document in ADR format for significant choices
- **Code Comments:** Focus on "why" not "what" - code should be self-documenting

## 8.2. Frontend Standards (Next.js 15)

### 8.2.1. Component Architecture

**Server Component Standards:**
```typescript
// ✅ Good: Server Component for data fetching
export default async function MeetingsPage() {
  const meetings = await getMeetings(); // Server-side data fetching
  return <MeetingsListClient initialData={meetings} />;
}

// ❌ Bad: Client Component for initial data
'use client';
export default function MeetingsPage() {
  const [meetings, setMeetings] = useState([]);
  useEffect(() => {
    fetchMeetings().then(setMeetings); // Client-side initial load
  }, []);
}
```

**Client Component Standards:**
```typescript
// ✅ Good: Client Component with initial data + real-time
'use client';
interface Props {
  initialData: Meeting[];
}

export const MeetingsListClient = memo(function MeetingsListClient({ initialData }: Props) {
  const meetings = useRealtimeMeetings(initialData);
  return <div>{meetings.map(meeting => <MeetingCard key={meeting.$id} meeting={meeting} />)}</div>;
});

// ❌ Bad: No memo, no initial data hydration
export function MeetingsListClient() {
  const [meetings, setMeetings] = useState([]);
  // Missing optimization and server hydration
}
```

**Requirements:**
- [ ] All Server Components use `async` for data fetching
- [ ] Client Components accept `initialData` for hydration
- [ ] Use `React.memo()` for all Client Components
- [ ] Implement proper TypeScript interfaces for props

### 8.2.2. Performance Optimization Standards

**Bundle Optimization:**
```typescript
// ✅ Good: Tree-shaken imports
import { Client, Databases } from 'appwrite';

// ✅ Good: Dynamic imports for heavy components
const HeavyModal = dynamic(() => import('./HeavyModal'), {
  loading: () => <ModalSkeleton />,
  ssr: false
});

// ❌ Bad: Whole library import
import * as Appwrite from 'appwrite';

// ❌ Bad: No lazy loading for heavy components
import HeavyModal from './HeavyModal';
```

**Re-rendering Optimization:**
```typescript
// ✅ Good: Optimized component with memoization
const MeetingCard = memo(function MeetingCard({ meeting }: { meeting: Meeting }) {
  const formattedTime = useMemo(() => formatTime(meeting.startTime), [meeting.startTime]);
  const handleClick = useCallback(() => onSelect(meeting.id), [meeting.id, onSelect]);
  
  return <div onClick={handleClick}>{formattedTime}</div>;
});

// ❌ Bad: No optimization, expensive recalculations
function MeetingCard({ meeting }) {
  return <div onClick={() => onSelect(meeting.id)}>{formatTime(meeting.startTime)}</div>;
}
```

**Requirements:**
- [ ] Use `React.memo()` for all components that receive props
- [ ] Use `useMemo()` for expensive calculations
- [ ] Use `useCallback()` for event handlers passed as props
- [ ] Implement lazy loading with `next/dynamic` for heavy components

### 8.2.3. Data Fetching Standards

**Server Component Data Fetching:**
```typescript
// ✅ Good: Server Component with caching
export async function getMeetings() {
  const { databases } = await createServerClient();
  
  const meetings = await databases.listDocuments('raceday-db', 'meetings', [
    Query.equal('date', new Date().toISOString().split('T')[0]),
    Query.limit(50)
  ]);
  
  return meetings.documents;
}

// Usage with caching
const meetings = await getMeetings();
// Next.js automatically caches this server function
```

**Client Component Real-time:**
```typescript
// ✅ Good: Real-time hook with optimization
export function useRealtimeMeetings(initialData: Meeting[]) {
  const [meetings, setMeetings] = useState(initialData);
  
  useEffect(() => {
    const unsubscribe = client.subscribe(channels, (response) => {
      setMeetings(prev => optimizedUpdate(prev, response));
    });
    
    return unsubscribe;
  }, []);
  
  return meetings;
}
```

**Requirements:**
- [ ] Server Components handle initial data fetching
- [ ] Client Components handle real-time updates only
- [ ] Implement proper error boundaries
- [ ] Use optimistic updates where appropriate

### 8.2.4. Appwrite SDK Standards

**Server-side Configuration:**
```typescript
// lib/appwrite-server.ts
import { Client, Databases } from 'node-appwrite';

export async function createServerClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!); // Server-only API key

  return {
    get databases() {
      return new Databases(client);
    }
  };
}
```

**Client-side Configuration:**
```typescript
// lib/appwrite-client.ts
'use client';
import { Client, Databases } from 'appwrite';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);
  // No API key - client uses session authentication

export const databases = new Databases(client);
export { client };
```

**Requirements:**
- [ ] Use `node-appwrite` only in Server Components
- [ ] Use `appwrite` web SDK only in Client Components
- [ ] Never expose API keys to client-side code
- [ ] Implement proper session management

### 8.2.5. Testing Standards

**Component Testing:**
```typescript
// MeetingCard.test.tsx
import { render, screen } from '@testing-library/react';
import { MeetingCard } from './MeetingCard';

describe('MeetingCard', () => {
  const mockMeeting = {
    $id: '1',
    meetingName: 'Test Meeting',
    startTime: '2025-08-02T10:00:00Z'
  };

  it('renders meeting information correctly', () => {
    render(<MeetingCard meeting={mockMeeting} />);
    expect(screen.getByText('Test Meeting')).toBeInTheDocument();
  });

  it('handles click events', async () => {
    const handleClick = jest.fn();
    render(<MeetingCard meeting={mockMeeting} onClick={handleClick} />);
    // Test interactions...
  });
});
```

**Performance Testing:**
```typescript
// Performance test for bundle size
import { analyzeBundle } from '@next/bundle-analyzer';

describe('Bundle Analysis', () => {
  it('dashboard bundle should be under 500KB', async () => {
    const analysis = await analyzeBundle('dashboard');
    expect(analysis.size).toBeLessThan(500 * 1024); // 500KB
  });
});
```

**Requirements:**
- [ ] Test all components with React Testing Library
- [ ] Mock Appwrite SDK calls in unit tests
- [ ] Include performance tests for bundle size
- [ ] Test real-time subscription behavior

## 8.3. Backend Standards (Appwrite Functions)

### 8.3.1. Function Structure Standards

**Entry Point Pattern:**
```javascript
// src/main.js - Function entry point
export default async function(context) {
  const { req, res, log, error } = context;
  
  try {
    // Validate environment variables
    validateEnvironment();
    
    // Initialize services
    const { databases } = await initializeAppwrite();
    
    // Execute business logic
    const result = await processRequest(req, databases);
    
    return res.json({ success: true, data: result });
  } catch (err) {
    error('Function execution failed:', err);
    return res.json({ success: false, error: err.message }, 500);
  }
}
```

**Error Handling Pattern:**
```javascript
// utils/error-handler.js
export class FunctionError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function handleError(error, res) {
  if (error instanceof FunctionError) {
    return res.json({ error: error.message }, error.statusCode);
  }
  
  return res.json({ error: 'Internal server error' }, 500);
}
```

**Requirements:**
- [ ] All functions must include comprehensive error handling
- [ ] Use structured logging with context information
- [ ] Implement proper input validation
- [ ] Return consistent response formats

### 8.3.2. Environment Variable Standards

```javascript
// utils/config.js
export function validateEnvironment() {
  const required = [
    'APPWRITE_ENDPOINT',
    'APPWRITE_PROJECT_ID',
    'APPWRITE_API_KEY',
    'NZTAB_API_KEY'
  ];
  
  for (const envVar of required) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }
}

export const config = {
  appwrite: {
    endpoint: process.env.APPWRITE_ENDPOINT,
    projectId: process.env.APPWRITE_PROJECT_ID,
    apiKey: process.env.APPWRITE_API_KEY
  },
  nztab: {
    apiKey: process.env.NZTAB_API_KEY,
    baseUrl: process.env.NZTAB_BASE_URL
  }
};
```

**Requirements:**
- [ ] All secrets stored as environment variables
- [ ] Validate required environment variables on startup
- [ ] Never log sensitive configuration values
- [ ] Use secure environment variable naming

### 8.3.3. Performance Standards

**Timeout Management:**
```javascript
// utils/timeout.js
export function withTimeout(promise, timeoutMs = 15000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
    )
  ]);
}

// Usage
const raceData = await withTimeout(
  fetch(apiUrl),
  10000 // 10 second timeout
);
```

**Batch Processing:**
```javascript
// utils/batch.js
export async function processBatch(items, processor, batchSize = 10) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => processor(item).catch(err => ({ error: err.message })))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

**Requirements:**
- [ ] Implement timeout protection for all external calls
- [ ] Use batch processing for large datasets
- [ ] Implement rate limiting compliance
- [ ] Monitor function execution times

## 8.4. Security Standards

### 8.4.1. Authentication & Authorization

```typescript
// middleware/auth.ts
export async function requireAuth(req: Request) {
  const session = req.headers.get('authorization');
  if (!session) {
    throw new Error('Authentication required');
  }
  
  const user = await validateSession(session);
  if (!user) {
    throw new Error('Invalid session');
  }
  
  return user;
}
```

### 8.4.2. Input Validation

```typescript
// utils/validation.ts
import { z } from 'zod';

export const MeetingSchema = z.object({
  meetingName: z.string().min(1).max(100),
  country: z.enum(['AU', 'NZ']),
  raceType: z.enum(['Thoroughbred Horse Racing', 'Harness']),
  date: z.string().datetime()
});

export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error.message}`);
  }
  return result.data;
}
```

**Requirements:**
- [ ] Validate all user inputs with Zod schemas
- [ ] Sanitize data before database operations
- [ ] Implement proper session management
- [ ] Use HTTPS for all communications

---
