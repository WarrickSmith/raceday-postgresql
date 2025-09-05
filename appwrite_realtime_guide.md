# Appwrite Real-time Updates Architecture for Next.js

## Overview

This guide provides the best practice architecture for receiving real-time updates from the Appwrite Database in Next.js Client Components using a combination of Appwrite's Realtime API, React Context for client management, and custom React Hooks for reusable subscription logic.

## Core Principles

### 1. Centralized Appwrite Client
Initialize your Appwrite Client instance once and make it accessible throughout your application, typically via React Context. This avoids re-initializing the client and ensures a single point of configuration.

### 2. Custom Realtime Hook
Encapsulate the Appwrite Realtime subscription logic within a custom React Hook (`useAppwriteRealtime`). This promotes reusability, simplifies component logic, and handles the subscription/unsubscription lifecycle.

### 3. Client Components
Ensure your components that consume the real-time data are Client Components (either explicitly marked with 'use client' or rendered within other Client Components). React Hooks like `useState` and `useEffect` are essential here.

### 4. Channel Specificity
Use Appwrite's powerful channel system to subscribe only to the events you need (e.g., specific database, collection, or even a single document).

### 5. State Management
Use `useState` within your custom hook to manage the real-time data and update it as events arrive.

## Implementation

### 1. Appwrite Client Initialization (with React Context)

#### lib/appwrite.js
```javascript
import { Client, Databases, Account } from 'appwrite';

const client = new Client();
client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);

export const databases = new Databases(client);
export const account = new Account(client); // Optional, if you need
export const appwriteClient = client; // Export the client instance itself
```

#### context/AppwriteContext.js
```javascript
'use client'; // This is a Client Component

import React, { createContext, useContext, useEffect, useState } from 'react';
import { appwriteClient, databases } from '../lib/appwrite'; // Import the client

const AppwriteContext = createContext(null);

export const AppwriteProvider = ({ children }) => {
  const [clientReady, setClientReady] = useState(false);

  // You might want to do some initial authentication check here
  // For now, we just assume the client is ready
  useEffect(() => {
    setClientReady(true);
  }, []);

  return (
    <AppwriteContext.Provider value={{ client: appwriteClient, databases }}>
      {clientReady ? children : <div>Loading Appwrite...</div>}
    </AppwriteContext.Provider>
  );
};

export const useAppwrite = () => {
  return useContext(AppwriteContext);
};
```

#### app/layout.js (or _app.js for Pages Router)
```javascript
// app/layout.js (for App Router)
import { AppwriteProvider } from '../context/AppwriteContext';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppwriteProvider>
          {children}
        </AppwriteProvider>
      </body>
    </html>
  );
}
```

### 2. Custom Realtime Hook (useAppwriteRealtime)

#### hooks/useAppwriteRealtime.js
```javascript
'use client'; // This is a Client Component

import { useEffect, useState, useRef } from 'react';
import { useAppwrite } from '../context/AppwriteContext';
import { ID } from 'appwrite'; // For potential future use, e.g., if creating

/**
 * Custom hook to subscribe to Appwrite Realtime events for a list of documents.
 * It fetches initial data, then updates the list in real-time.
 *
 * @param {string[]} channels - An array of Appwrite Realtime channels to subscribe to.
 * Example: [`databases.${DATABASE_ID}.collections.${COLLECTION_ID}`]
 * @param {function} fetchInitialData - An async function to fetch the initial data.
 * Example: `() => databases.listDocuments(DATABASE_ID, COLLECTION_ID)`
 * @returns {{data: Array, loading: boolean, error: Error | null}}
 */
export const useAppwriteRealtime = (channels, fetchInitialData) => {
  const { client } = useAppwrite();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!client || !channels || channels.length === 0 || !fetchInitialData) {
      setLoading(false);
      return;
    }

    const setupSubscription = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch initial data
        const initialResponse = await fetchInitialData();
        setData(initialResponse.documents || []);

        // 2. Subscribe to real-time updates
        unsubscribeRef.current = client.subscribe(channels, (response) => {
          const eventType = response.events[0]; // e.g., "databases.*.collections.*.documents.*.create"
          const payloadDocument = response.payload;

          setData(prevData => {
            if (!Array.isArray(prevData)) {
              // If somehow prevData isn't an array, start fresh
              return [payloadDocument];
            }

            if (eventType.endsWith('.create')) {
              // Add new document
              return [...prevData, payloadDocument];
            } else if (eventType.endsWith('.update')) {
              // Update existing document
              return prevData.map(doc =>
                doc.$id === payloadDocument.$id ? payloadDocument : doc
              );
            } else if (eventType.endsWith('.delete')) {
              // Remove deleted document
              return prevData.filter(doc => doc.$id !== payloadDocument.$id);
            }

            return prevData; // No relevant event, return current state
          });
        });
      } catch (err) {
        console.error("Appwrite Realtime setup error:", err);
        setError(err);
      } finally {
        setLoading(false);
      }
    };

    setupSubscription();

    // Cleanup: Unsubscribe when the component unmounts or dependencies change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [client, JSON.stringify(channels), fetchInitialData]); // Re-run if dependencies change

  return { data, loading, error };
};
```

**Note:** `JSON.stringify(channels)` is used in dependencies to correctly detect changes in the channels array. For simple arrays of primitives, this is generally safe. For more complex objects, a deep comparison or `useMemo` for the channels array might be needed.

### 3. Using the Hook in a Client Component

#### app/dashboard/page.js (Example Client Component for App Router)
```javascript
'use client'; // This is a Client Component

import { useAppwriteRealtime } from '../../hooks/useAppwriteRealtime';
import { useAppwrite } from '../../context/AppwriteContext';

// Replace with your actual Appwrite IDs
const DATABASE_ID = 'YOUR_DATABASE_ID';
const COLLECTION_ID = 'YOUR_COLLECTION_ID';

export default function DashboardPage() {
  const { databases } = useAppwrite();

  // Define the function to fetch initial data
  const fetchInitialTodos = () => databases.listDocuments(DATABASE_ID, COLLECTION_ID);

  // Define the channels to subscribe to
  const todoChannels = [`databases.${DATABASE_ID}.collections.${COLLECTION_ID}`];

  // Use the custom hook
  const { data: todos, loading, error } = useAppwriteRealtime(todoChannels, fetchInitialTodos);

  if (loading) {
    return <p>Loading todos...</p>;
  }

  if (error) {
    return <p>Error loading todos: {error.message}</p>;
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>My Real-time Todos</h1>
      {todos.length === 0 ? (
        <p>No todos yet. Add some!</p>
      ) : (
        <ul>
          {todos.map(todo => (
            <li key={todo.$id}>
              <strong>{todo.title}</strong> - {todo.completed ? 'Completed' : 'Pending'}
            </li>
          ))}
        </ul>
      )}
      {/* You could add a form here to create new todos, which would update in real-time */}
    </div>
  );
}
```

## Key Considerations and Best Practices

### 1. Server-Side Rendering (SSR) / Static Site Generation (SSG)

- Real-time subscriptions are inherently client-side. The `useAppwriteRealtime` hook (and any component using `useState`/`useEffect`) must be in a Client Component.
- For initial data display on SSR/SSG pages, you can fetch the data on the server first (e.g., using `getServerSideProps` in Pages Router or directly in a Server Component for App Router) and then pass it as `initialData` to your Client Component.
- Your `useAppwriteRealtime` hook could then potentially use this `initialData` as its starting point before fetching its own or applying updates.
- The provided hook already fetches initial data on the client side, which is simpler for purely client-driven views.

### 2. Error Handling

- Always include robust error handling in your `useEffect` and subscription callbacks.
- Inform the user if real-time updates fail.

### 3. Loading States

- Provide clear loading indicators while initial data is being fetched and the subscription is being set up.

### 4. Channel Granularity

- Be as specific as possible with your channels.
- Subscribing to `collections.*` when you only need `collections.myCollection` is less efficient.
- You can subscribe to individual documents too: `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents.${DOCUMENT_ID}` if you only need updates for a single item.
- In this case, your `setData` logic would be simpler, just replacing the single document.

### 5. Performance & Re-renders

- The `setData` function in the custom hook will trigger re-renders of components using `useAppwriteRealtime`.
- For very frequent updates or large lists, consider `React.memo` for child components or optimizing how `setData` updates the state to prevent unnecessary re-renders.
- Appwrite's WebSockets are generally efficient, but be mindful of the client-side processing of events.

### 6. Authentication and Permissions

- Appwrite's Realtime API respects permissions. Ensure the logged-in user (if any) has the necessary read permissions on the database/collection/documents they are trying to subscribe to.
- If not, the subscription might fail or not receive events.

### 7. Initial Data Fetch vs. Realtime Only

- The provided `useAppwriteRealtime` fetches initial data and subscribes. This is usually the desired behavior.
- If you only ever wanted updates after load without an initial fetch, you could simplify the hook.

## Channel Examples

### Collection-level subscription:
```javascript
const channels = [`databases.${DATABASE_ID}.collections.${COLLECTION_ID}`];
```

### Document-level subscription:
```javascript
const channels = [`databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents.${DOCUMENT_ID}`];
```

### Multiple channels:
```javascript
const channels = [
  `databases.${DATABASE_ID}.collections.${COLLECTION_ID_1}`,
  `databases.${DATABASE_ID}.collections.${COLLECTION_ID_2}`
];
```

## Conclusion

This architecture provides a clean, reusable, and maintainable way to integrate Appwrite's powerful real-time capabilities into your Next.js applications using Client Components. The combination of React Context, custom hooks, and proper channel management ensures efficient and scalable real-time functionality.