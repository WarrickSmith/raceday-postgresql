# Story Creation Guide - Next.js 15 & Appwrite Optimized

## Overview

This guide ensures all stories created for the RaceDay project include comprehensive Next.js 15 performance optimizations and Appwrite best practices. **Every story must follow these requirements.**

## Mandatory Architecture Considerations

### 1. Next.js 15 Performance Requirements

**For ALL Frontend Stories - Include in Dev Notes:**

#### Server Component Strategy
- **Data Fetching**: Use Server Components for initial data loading
- **SDK Usage**: Use `node-appwrite` SDK only in Server Components
- **Caching**: Implement 5-minute revalidation for stable data
- **Streaming**: Use React Suspense for progressive loading

```typescript
// REQUIRED Pattern: Server Component data fetching
export default async function Page() {
  const initialData = await getServerData(); // Server-side fetch
  return <ClientComponent initialData={initialData} />;
}
```

#### Client Component Strategy
- **Real-time Only**: Use Client Components only for interactivity and real-time updates
- **SDK Usage**: Use `appwrite` web SDK only in Client Components
- **Hydration**: Accept initial server data as props
- **Optimization**: Use React.memo() for all Client Components

```typescript
// REQUIRED Pattern: Client Component with hydration
'use client';
interface Props {
  initialData: DataType[];
}

export const Component = memo(function Component({ initialData }: Props) {
  const liveData = useRealtimeData(initialData);
  return <div>{/* render */}</div>;
});
```

#### Performance Targets (ALL Stories Must Meet)
- **Bundle Size**: <500KB for main pages
- **Initial Load**: <3 seconds
- **Real-time Latency**: <2 seconds
- **Lighthouse Score**: 90+
- **Core Web Vitals**: LCP <2.5s, FID <100ms, CLS <0.1

### 2. Appwrite Best Practices

**For ALL Stories Using Appwrite - Include in Dev Notes:**

#### Dual SDK Configuration
```typescript
// REQUIRED: Server-side configuration
// lib/appwrite-server.ts
import { Client, Databases } from 'node-appwrite';

export async function createServerClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!); // Server-only API key

  return { databases: new Databases(client) };
}

// REQUIRED: Client-side configuration
// lib/appwrite-client.ts
'use client';
import { Client, Databases } from 'appwrite';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);
  // No API key - uses session authentication

export const databases = new Databases(client);
```

#### Query Optimization Requirements
- **Always use Query.limit()** to prevent large result sets
- **Design queries around indexed fields**
- **Use server-side filtering** instead of client-side
- **Implement cursor-based pagination** for large datasets

#### Real-time Subscription Optimization
- **Update Batching**: Batch rapid updates to prevent UI thrashing
- **Connection Management**: Implement exponential backoff for retries
- **Selective Subscriptions**: Subscribe only to relevant collections
- **Proper Cleanup**: Unsubscribe on component unmount

### 3. File Structure Requirements

**For ALL Frontend Stories - Include in Dev Notes:**

```
client/src/
├── lib/
│   ├── appwrite-server.ts    # Server SDK configuration
│   ├── appwrite-client.ts    # Client SDK configuration
│   └── utils.ts
├── server/
│   └── [feature]-data.ts     # Server Component data fetching
├── components/
│   ├── [feature]/
│   │   ├── [Component].tsx         # Client Component
│   │   └── [Component].test.tsx    # Component tests
│   └── skeletons/
│       └── [Component]Skeleton.tsx # Loading skeletons
├── hooks/
│   └── useRealtime[Feature].tsx    # Real-time hooks
└── types/
    └── [feature].ts               # TypeScript interfaces
```

### 4. Testing Requirements

**For ALL Stories - Include in Dev Notes:**

#### Component Testing
```typescript
// REQUIRED: Component testing pattern
import { render, screen } from '@testing-library/react';
import { Component } from './Component';

// Mock Appwrite SDK
jest.mock('@/lib/appwrite-client', () => ({
  databases: {
    listDocuments: jest.fn(),
    subscribe: jest.fn()
  }
}));

describe('Component', () => {
  it('renders with initial data', () => {
    render(<Component initialData={mockData} />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

#### Performance Testing
```typescript
// REQUIRED: Bundle size testing
describe('Bundle Analysis', () => {
  it('should meet bundle size requirements', async () => {
    const analysis = await analyzeBundle('[page-name]');
    expect(analysis.size).toBeLessThan(500 * 1024); // 500KB
  });
});
```

#### Real-time Testing
```typescript
// REQUIRED: Real-time subscription testing
describe('Real-time subscriptions', () => {
  it('should handle subscription updates', async () => {
    const mockSubscribe = jest.fn();
    (client.subscribe as jest.Mock).mockReturnValue(mockSubscribe);
    
    render(<Component initialData={[]} />);
    
    // Test subscription behavior
    expect(client.subscribe).toHaveBeenCalledWith(
      expect.arrayContaining(['databases.raceday-db.collections.meetings.documents']),
      expect.any(Function)
    );
  });
});
```

## Story Template Checklist

**Before creating any story, ensure:**

### Dev Notes Section Must Include:
- [ ] **Previous Story Insights** - Relevant context from completed stories
- [ ] **Data Models** - Collection schemas and field requirements
- [ ] **API Specifications** - Appwrite query patterns and endpoints
- [ ] **Component Specifications** - Server/Client component breakdown
- [ ] **File Locations** - Complete file structure with new files to create
- [ ] **Next.js 15 Performance Requirements** - Server Components, optimization patterns
- [ ] **Appwrite Best Practices** - SDK usage, query optimization, real-time patterns
- [ ] **Testing Requirements** - Component, performance, and real-time testing

### Tasks Must Include:
- [ ] **Task 1**: Appwrite SDK configuration (server + client)
- [ ] **Task 2**: Server Component data fetching with caching
- [ ] **Task 3**: Client Component with real-time subscriptions
- [ ] **Task 4**: Component optimization (memo, lazy loading)
- [ ] **Task 5**: Performance testing and validation
- [ ] **Final Task**: Performance targets validation

### Performance Validation Task (MANDATORY):
```markdown
### Task X: Performance Targets Validation
- [ ] Validate bundle size <500KB for main page
- [ ] Validate initial load time <3 seconds
- [ ] Validate Lighthouse score 90+
- [ ] Validate Core Web Vitals compliance
- [ ] Validate real-time latency <2 seconds
```

## Common Anti-Patterns to Avoid

### ❌ Client Component for Initial Data Fetching
```typescript
// DON'T DO THIS
'use client';
export default function Page() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetchData().then(setData); // Client-side initial load
  }, []);
}
```

### ❌ Wrong SDK Usage
```typescript
// DON'T DO THIS
// Using node-appwrite in Client Component
'use client';
import { Client } from 'node-appwrite'; // WRONG SDK

// Using appwrite web SDK in Server Component
import { Client } from 'appwrite'; // WRONG SDK
export default async function Page() {
  // Server Component code
}
```

### ❌ No Performance Optimization
```typescript
// DON'T DO THIS
export function Component({ data }) {
  return (
    <div>
      {data.map(item => (
        <ExpensiveComponent key={item.id} item={item} /> // No memo, no optimization
      ))}
    </div>
  );
}
```

### ❌ Inefficient Appwrite Queries
```typescript
// DON'T DO THIS
const allData = await databases.listDocuments('db', 'collection'); // No limits, no filtering
const filtered = allData.documents.filter(item => item.date === today); // Client-side filtering
```

## Story Review Checklist

**Before approving any story, verify:**

### Architecture Compliance
- [ ] Next.js 15 Server Component patterns included
- [ ] Appwrite dual SDK strategy documented
- [ ] Performance optimization requirements specified
- [ ] Real-time subscription patterns included

### Technical Completeness
- [ ] File structure clearly defined
- [ ] Component breakdown (Server vs Client) specified
- [ ] Database query patterns documented
- [ ] Error handling requirements included

### Performance Requirements
- [ ] Bundle size targets specified
- [ ] Performance testing requirements included
- [ ] Core Web Vitals targets defined
- [ ] Lighthouse score requirements specified

### Testing Coverage
- [ ] Component testing patterns specified
- [ ] Real-time subscription testing included
- [ ] Performance testing requirements defined
- [ ] Appwrite SDK mocking strategies included

## Resources

- **Architecture Documentation**: `docs/architecture/`
- **Tech Stack**: `docs/architecture/6-tech-stack.md`
- **Frontend Architecture**: `docs/architecture/4-frontend-real-time-communication.md`
- **Appwrite Best Practices**: `docs/architecture/5-appwrite-best-practices.md`
- **Coding Standards**: `docs/architecture/8-coding-standards.md`
- **Story Template**: `.bmad-core/templates/story-tmpl.yaml`

---

**Remember: Every story must be production-ready and performance-optimized from day one.**