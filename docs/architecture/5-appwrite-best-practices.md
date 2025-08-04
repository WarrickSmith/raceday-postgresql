# 5. Appwrite Best Practices

## 5.1. SDK Architecture & Usage

### 5.1.1. Dual SDK Strategy

**Purpose:**  
Optimize performance and security by using the appropriate Appwrite SDK for each environment.

**Server-Side SDK (node-appwrite):**
```typescript
// lib/appwrite-server.ts
import { Client, Databases, Account } from 'node-appwrite';
import { cookies } from 'next/headers';

export async function createServerClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!); // Server-only API key

  return {
    get databases() {
      return new Databases(client);
    },
    get account() {
      return new Account(client);
    }
  };
}

export async function createSessionClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

  const session = cookies().get('session');
  if (session?.value) {
    client.setSession(session.value);
  }

  return {
    get databases() {
      return new Databases(client);
    },
    get account() {
      return new Account(client);
    }
  };
}
```

**Client-Side SDK (appwrite):**
```typescript
// lib/appwrite-client.ts
'use client';
import { Client, Databases, Account } from 'appwrite';

const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);
  // No API key - uses session-based authentication

export const databases = new Databases(client);
export const account = new Account(client);
export { client };
```

**Usage Guidelines:**
- [ ] Use `node-appwrite` only in Server Components and server-side functions
- [ ] Use `appwrite` web SDK only in Client Components
- [ ] Never expose API keys to client-side code
- [ ] Implement proper session management for client authentication

### 5.1.2. Performance Optimization

**Tree Shaking and Selective Imports:**
```typescript
// ✅ Good: Import only what you need
import { Client, Databases, Query } from 'appwrite';

// ❌ Bad: Import entire SDK
import * as Appwrite from 'appwrite';

// ✅ Good: Selective service initialization
export function createOptimizedClient() {
  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId);
  
  // Only initialize services you actually use
  return {
    databases: new Databases(client),
    // Don't initialize unused services like Storage, Functions, etc.
  };
}
```

**Connection Pooling:**
```typescript
// lib/appwrite-pool.ts
class AppwriteConnectionPool {
  private static instance: AppwriteConnectionPool;
  private clients: Map<string, Client> = new Map();
  
  static getInstance() {
    if (!AppwriteConnectionPool.instance) {
      AppwriteConnectionPool.instance = new AppwriteConnectionPool();
    }
    return AppwriteConnectionPool.instance;
  }
  
  getClient(endpoint: string, projectId: string): Client {
    const key = `${endpoint}:${projectId}`;
    if (!this.clients.has(key)) {
      const client = new Client().setEndpoint(endpoint).setProject(projectId);
      this.clients.set(key, client);
    }
    return this.clients.get(key)!;
  }
}

export const appwritePool = AppwriteConnectionPool.getInstance();
```

**Requirements:**
- [ ] Implement tree shaking for all Appwrite imports
- [ ] Use connection pooling for high-frequency operations
- [ ] Initialize only required services
- [ ] Monitor bundle size impact of Appwrite SDK

## 5.2. Database Operations

### 5.2.1. Query Optimization

**Efficient Query Patterns:**
```typescript
// ✅ Good: Optimized query with proper indexes
export async function getTodaysMeetings() {
  const { databases } = await createServerClient();
  
  const today = new Date().toISOString().split('T')[0];
  
  return await databases.listDocuments('raceday-db', 'meetings', [
    Query.equal('date', today),           // Indexed field
    Query.equal('country', ['AU', 'NZ']), // Indexed field
    Query.limit(50),                      // Always limit results
    Query.orderAsc('startTime')           // Indexed field for sorting
  ]);
}

// ❌ Bad: Inefficient query without optimization
export async function getAllMeetings() {
  const { databases } = await createServerClient();
  
  // No date filtering, no limits, no indexing consideration
  const allMeetings = await databases.listDocuments('raceday-db', 'meetings');
  
  // Client-side filtering is inefficient
  return allMeetings.documents.filter(meeting => 
    meeting.date === today && ['AU', 'NZ'].includes(meeting.country)
  );
}
```

**Pagination Best Practices:**
```typescript
// Cursor-based pagination for performance
export async function getMeetingsPaginated(cursor?: string, limit = 25) {
  const { databases } = await createServerClient();
  
  const queries = [
    Query.limit(limit),
    Query.orderAsc('$createdAt')
  ];
  
  if (cursor) {
    queries.push(Query.cursorAfter(cursor));
  }
  
  return await databases.listDocuments('raceday-db', 'meetings', queries);
}
```

**Requirements:**
- [ ] Always use Query.limit() to prevent large result sets
- [ ] Design queries around indexed fields
- [ ] Use server-side filtering instead of client-side
- [ ] Implement cursor-based pagination for large datasets

### 5.2.2. Relationship Management

**Efficient Relationship Queries:**
```typescript
// ✅ Good: Efficient relationship querying
export async function getMeetingWithRaces(meetingId: string) {
  const { databases } = await createServerClient();
  
  // Fetch meeting and races in parallel
  const [meeting, races] = await Promise.all([
    databases.getDocument('raceday-db', 'meetings', meetingId),
    databases.listDocuments('raceday-db', 'races', [
      Query.equal('meeting', meetingId),
      Query.orderAsc('raceNumber'),
      Query.limit(20) // Reasonable limit for races per meeting
    ])
  ]);
  
  return { meeting, races: races.documents };
}

// ❌ Bad: N+1 query problem
export async function getMeetingsWithRaces() {
  const { databases } = await createServerClient();
  
  const meetings = await databases.listDocuments('raceday-db', 'meetings');
  
  // This creates N+1 queries (one for each meeting)
  const meetingsWithRaces = await Promise.all(
    meetings.documents.map(async meeting => {
      const races = await databases.listDocuments('raceday-db', 'races', [
        Query.equal('meeting', meeting.$id)
      ]);
      return { ...meeting, races: races.documents };
    })
  );
  
  return meetingsWithRaces;
}
```

**Batch Operations:**
```typescript
// Efficient batch updates
export async function updateMultipleEntrants(updates: EntrantUpdate[]) {
  const { databases } = await createServerClient();
  
  // Process in batches to avoid overwhelming the API
  const batchSize = 10;
  const results = [];
  
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(update => 
        databases.updateDocument('raceday-db', 'entrants', update.id, update.data)
      )
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

**Requirements:**
- [ ] Avoid N+1 query problems with parallel fetching
- [ ] Use batch operations for multiple updates
- [ ] Implement proper error handling for relationship queries
- [ ] Design schema to minimize deep relationship traversals

## 5.3. Real-time Subscriptions

### 5.3.1. Subscription Optimization

**Efficient Subscription Management:**
```typescript
// hooks/useOptimizedSubscriptions.ts
'use client';
import { useEffect, useRef, useState } from 'react';
import { client } from '@/lib/appwrite-client';

export function useOptimizedSubscriptions<T>(
  channels: string[],
  initialData: T[],
  updateHandler: (prev: T[], event: any) => T[]
) {
  const [data, setData] = useState(initialData);
  const subscriptionRef = useRef<(() => void) | null>(null);
  const updateQueueRef = useRef<any[]>([]);
  const processingRef = useRef(false);
  
  // Batch updates to prevent excessive re-renders
  const processUpdates = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    
    const updates = updateQueueRef.current.splice(0);
    if (updates.length > 0) {
      setData(prev => {
        let result = prev;
        for (const update of updates) {
          result = updateHandler(result, update);
        }
        return result;
      });
    }
    
    processingRef.current = false;
  }, [updateHandler]);
  
  useEffect(() => {
    // Clean up existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current();
    }
    
    // Create new subscription
    const unsubscribe = client.subscribe(channels, (response) => {
      updateQueueRef.current.push(response);
      
      // Debounce updates
      setTimeout(processUpdates, 100);
    });
    
    subscriptionRef.current = unsubscribe;
    
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
      }
    };
  }, [channels, processUpdates]);
  
  return data;
}
```

**Connection Management:**
```typescript
// utils/connection-manager.ts
export class AppwriteConnectionManager {
  private static instance: AppwriteConnectionManager;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  static getInstance() {
    if (!AppwriteConnectionManager.instance) {
      AppwriteConnectionManager.instance = new AppwriteConnectionManager();
    }
    return AppwriteConnectionManager.instance;
  }
  
  async subscribeWithRetry(channels: string[], callback: (response: any) => void) {
    try {
      const unsubscribe = client.subscribe(channels, callback);
      this.reconnectAttempts = 0; // Reset on successful connection
      return unsubscribe;
    } catch (error) {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.subscribeWithRetry(channels, callback);
      } else {
        throw new Error('Max reconnection attempts reached');
      }
    }
  }
}
```

**Requirements:**
- [ ] Implement update batching to prevent UI thrashing
- [ ] Use exponential backoff for connection retries
- [ ] Subscribe only to relevant channels for current view
- [ ] Properly clean up subscriptions on component unmount

### 5.3.2. Channel Strategy

**Feature-Based Channel Subscription:**
```typescript
// types/subscriptions.ts
export interface SubscriptionConfig {
  feature: 'dashboard' | 'race-detail' | 'user-alerts';
  channels: string[];
  priority: 'high' | 'medium' | 'low';
}

export const SUBSCRIPTION_CONFIGS: Record<string, SubscriptionConfig> = {
  dashboard: {
    feature: 'dashboard',
    channels: [
      'databases.raceday-db.collections.meetings.documents',
      'databases.raceday-db.collections.races.documents'
    ],
    priority: 'high'
  },
  raceDetail: {
    feature: 'race-detail',
    channels: [
      'databases.raceday-db.collections.entrants.documents',
      'databases.raceday-db.collections.odds-history.documents',
      'databases.raceday-db.collections.money-flow-history.documents'
    ],
    priority: 'high'
  },
  userAlerts: {
    feature: 'user-alerts',
    channels: [
      'databases.raceday-db.collections.user-alert-configs.documents',
      'databases.raceday-db.collections.notifications.documents'
    ],
    priority: 'medium'
  }
};

// Usage
export function useFeatureSubscription(feature: keyof typeof SUBSCRIPTION_CONFIGS, initialData: any[]) {
  const config = SUBSCRIPTION_CONFIGS[feature];
  return useOptimizedSubscriptions(config.channels, initialData, updateHandler);
}
```

**Requirements:**
- [ ] Group subscriptions by feature/page
- [ ] Implement subscription priority levels
- [ ] Use specific document subscriptions when possible
- [ ] Avoid overlapping channel subscriptions

## 5.4. Authentication & Security

### 5.4.1. Session Management

**Secure Session Handling:**
```typescript
// lib/auth-server.ts
import { cookies } from 'next/headers';
import { createSessionClient } from './appwrite-server';

export async function getServerSession() {
  try {
    const { account } = await createSessionClient();
    return await account.get();
  } catch (error) {
    return null;
  }
}

export async function createSecureSession(userId: string, secret: string) {
  const { account } = await createAdminClient();
  const session = await account.createSession(userId, secret);
  
  // Set HTTP-only cookie for security
  cookies().set('session', session.secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/'
  });
  
  return session;
}

export async function deleteSession() {
  try {
    const { account } = await createSessionClient();
    await account.deleteSession('current');
  } catch (error) {
    // Session might already be invalid
  } finally {
    cookies().delete('session');
  }
}
```

**Client-Side Auth State:**
```typescript
// hooks/useAuth.ts
'use client';
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    checkAuthStatus()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  
  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const user = await response.json();
      setUser(user);
      return user;
    } else {
      throw new Error('Login failed');
    }
  }, []);
  
  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);
  
  return { user, loading, login, logout };
}
```

**Requirements:**
- [ ] Use HTTP-only cookies for session storage
- [ ] Implement proper session validation on server
- [ ] Handle session expiration gracefully
- [ ] Provide seamless client-server auth state sync

### 5.4.2. Permission Management

**Role-Based Access Control:**
```typescript
// utils/permissions.ts
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest'
}

export function hasPermission(user: User, requiredRole: UserRole): boolean {
  const roleHierarchy = {
    [UserRole.GUEST]: 0,
    [UserRole.USER]: 1,
    [UserRole.ADMIN]: 2
  };
  
  const userRoleLevel = roleHierarchy[user.labels?.role as UserRole] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole];
  
  return userRoleLevel >= requiredRoleLevel;
}

// Middleware for protected routes
export async function requireRole(role: UserRole) {
  const user = await getServerSession();
  
  if (!user) {
    throw new Error('Authentication required');
  }
  
  if (!hasPermission(user, role)) {
    throw new Error('Insufficient permissions');
  }
  
  return user;
}
```

**Document-Level Permissions:**
```typescript
// When creating documents with user-specific permissions
export async function createUserDocument(userId: string, data: any) {
  const { databases } = await createServerClient();
  
  return await databases.createDocument(
    'raceday-db',
    'user-alert-configs',
    ID.unique(),
    data,
    [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId))
    ]
  );
}
```

**Requirements:**
- [ ] Implement role-based access control
- [ ] Use document-level permissions for user data
- [ ] Validate permissions on both client and server
- [ ] Log permission violations for security monitoring

## 5.5. Error Handling & Monitoring

### 5.5.1. Error Classification

**Appwrite Error Handling:**
```typescript
// utils/appwrite-errors.ts
import { AppwriteException } from 'appwrite';

export enum AppwriteErrorType {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  RATE_LIMIT = 'rate_limit',
  SERVER = 'server'
}

export function classifyAppwriteError(error: any): AppwriteErrorType {
  if (error instanceof AppwriteException) {
    switch (error.code) {
      case 401:
        return AppwriteErrorType.AUTHENTICATION;
      case 403:
        return AppwriteErrorType.PERMISSION;
      case 400:
        return AppwriteErrorType.VALIDATION;
      case 429:
        return AppwriteErrorType.RATE_LIMIT;
      case 500:
      case 502:
      case 503:
        return AppwriteErrorType.SERVER;
      default:
        return AppwriteErrorType.SERVER;
    }
  }
  
  return AppwriteErrorType.NETWORK;
}

export function handleAppwriteError(error: any): { message: string; retry: boolean } {
  const errorType = classifyAppwriteError(error);
  
  switch (errorType) {
    case AppwriteErrorType.NETWORK:
      return { message: 'Network error. Please check your connection.', retry: true };
    case AppwriteErrorType.AUTHENTICATION:
      return { message: 'Please log in again.', retry: false };
    case AppwriteErrorType.PERMISSION:
      return { message: 'You do not have permission to perform this action.', retry: false };
    case AppwriteErrorType.VALIDATION:
      return { message: 'Invalid data provided.', retry: false };
    case AppwriteErrorType.RATE_LIMIT:
      return { message: 'Too many requests. Please try again later.', retry: true };
    default:
      return { message: 'An unexpected error occurred.', retry: true };
  }
}
```

**Retry Logic:**
```typescript
// utils/retry.ts
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      const { retry } = handleAppwriteError(error);
      if (!retry || attempt === maxAttempts) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}
```

**Requirements:**
- [ ] Classify errors by type for appropriate handling
- [ ] Implement retry logic with exponential backoff
- [ ] Provide user-friendly error messages
- [ ] Log errors for monitoring and debugging

### 5.5.2. Performance Monitoring

**Operation Timing:**
```typescript
// utils/performance.ts
export function withPerformanceTracking<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  const startTime = performance.now();
  
  return operation()
    .then(result => {
      const duration = performance.now() - startTime;
      console.log(`${operationName} completed in ${duration.toFixed(2)}ms`);
      
      // Send to monitoring service
      if (typeof window !== 'undefined' && window.gtag) {
        window.gtag('event', 'appwrite_operation', {
          event_category: 'performance',
          event_label: operationName,
          value: Math.round(duration)
        });
      }
      
      return result;
    })
    .catch(error => {
      const duration = performance.now() - startTime;
      console.error(`${operationName} failed after ${duration.toFixed(2)}ms:`, error);
      throw error;
    });
}

// Usage
export async function getMeetingsWithTracking() {
  return withPerformanceTracking(
    () => getMeetings(),
    'getMeetings'
  );
}
```

**Requirements:**
- [ ] Track operation performance metrics
- [ ] Monitor real-time subscription latency
- [ ] Set up alerts for performance degradation
- [ ] Log slow operations for optimization

---