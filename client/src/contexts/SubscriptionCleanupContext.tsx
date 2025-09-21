'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'

const DEFAULT_DRAIN_DELAY = 1000

export type CleanupReason =
  | 'navigation'
  | 'route-change'
  | 'fast-refresh'
  | 'before-unload'
  | 'visibility-hidden'
  | string

export interface CleanupOptions {
  reason?: CleanupReason
  drainDelay?: number
  skipIfInProgress?: boolean
}

interface SubscriptionCleanupContextValue {
  signal: number
  isCleanupInProgress: boolean
  lastReason: string | null
  connectionCount: number
  requestCleanup: (options?: CleanupOptions) => Promise<void>
  incrementConnectionCount: () => void
  decrementConnectionCount: () => void
}

const SubscriptionCleanupContext = createContext<
  SubscriptionCleanupContextValue | undefined
>(undefined)

interface ProviderProps {
  children: ReactNode
  defaultDrainDelay?: number
}

export function SubscriptionCleanupProvider({
  children,
  defaultDrainDelay = DEFAULT_DRAIN_DELAY,
}: ProviderProps) {
  const [signal, setSignal] = useState(0)
  const [isCleanupInProgress, setIsCleanupInProgress] = useState(false)
  const [lastReason, setLastReason] = useState<string | null>(null)
  const [connectionCount, setConnectionCount] = useState(0)
  const cleanupPromiseRef = useRef<Promise<void> | null>(null)
  const activeRef = useRef(false)
  const drainTimeoutRef = useRef<number | null>(null)
  const prevPathnameRef = useRef<string | null>(null)
  const pathname = usePathname()
  const routeEventsCleanupRef = useRef<(() => void) | null>(null)

  const incrementConnectionCount = useCallback(() => {
    setConnectionCount(prev => prev + 1)
  }, [])

  const decrementConnectionCount = useCallback(() => {
    setConnectionCount(prev => Math.max(0, prev - 1))
  }, [])

  const finalizeCleanup = useCallback(() => {
    activeRef.current = false
    setIsCleanupInProgress(false)
    setLastReason(null)
  }, [])

  const runCleanup = useCallback(
    (options?: CleanupOptions) => {
      if (options?.skipIfInProgress && activeRef.current) {
        return cleanupPromiseRef.current || Promise.resolve()
      }

      if (drainTimeoutRef.current) {
        window.clearTimeout(drainTimeoutRef.current)
        drainTimeoutRef.current = null
      }

      activeRef.current = true
      const reason = options?.reason ?? null
      const drainDelay = options?.drainDelay ?? defaultDrainDelay

      setIsCleanupInProgress(true)
      setLastReason(reason)
      setSignal((prev) => prev + 1)

      const promise = new Promise<void>((resolve) => {
        drainTimeoutRef.current = window.setTimeout(() => {
          drainTimeoutRef.current = null
          resolve()
        }, drainDelay)
      }).finally(() => {
        finalizeCleanup()
      })

      cleanupPromiseRef.current = promise
      return promise
    },
    [defaultDrainDelay, finalizeCleanup]
  )

  const requestCleanup = useCallback(
    (options?: CleanupOptions) => {
      const promise = runCleanup(options)
      cleanupPromiseRef.current = promise
      return promise
    },
    [runCleanup]
  )

  // React to pathname changes (e.g., back/forward navigation)
  useEffect(() => {
    if (!pathname) return
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname
      return
    }

    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname
      // Trigger immediate cleanup for route changes to prevent connection leaks
      void requestCleanup({ reason: 'route-change', skipIfInProgress: true, drainDelay: 0 })
    }
  }, [pathname, requestCleanup])

  // Integrate with Next.js router events (dynamic import to avoid SSR issues)
  useEffect(() => {
    let isMounted = true

    async function setupRouteEvents() {
      try {
        const routerModule = await import('next/router')
        if (!isMounted) return
        const router = routerModule.default
        if (!router?.events) return

        const handleRouteStart = () => {
          // Trigger immediate cleanup with minimal delay for navigation
          void requestCleanup({ reason: 'navigation', skipIfInProgress: true, drainDelay: 0 })
        }

        router.events.on('routeChangeStart', handleRouteStart)
        router.events.on('beforeHistoryChange', handleRouteStart)

        routeEventsCleanupRef.current = () => {
          router.events.off('routeChangeStart', handleRouteStart)
          router.events.off('beforeHistoryChange', handleRouteStart)
        }
      } catch (error) {
        console.warn('SubscriptionCleanupProvider: Failed to attach router events', error)
      }
    }

    setupRouteEvents()

    return () => {
      isMounted = false
      if (routeEventsCleanupRef.current) {
        routeEventsCleanupRef.current()
        routeEventsCleanupRef.current = null
      }
    }
  }, [requestCleanup])

  // Trigger cleanup when tab is hidden to avoid stale sockets during fast nav
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void requestCleanup({ reason: 'visibility-hidden', skipIfInProgress: true })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [requestCleanup])

  // Ensure cleanup on beforeunload/navigation away
  useEffect(() => {
    const handleBeforeUnload = () => {
      void requestCleanup({ reason: 'before-unload', skipIfInProgress: true })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [requestCleanup])

  // Integrate with Fast Refresh to tear down subscriptions cleanly
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    // @ts-expect-error - module is available in Vite/webpack environments
    if (typeof module !== 'undefined' && module?.hot) {
      // @ts-expect-error - HMR dispose typing not available
      module.hot.dispose(() => {
        void requestCleanup({ reason: 'fast-refresh', skipIfInProgress: true })
      })
    }
  }, [requestCleanup])

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (drainTimeoutRef.current) {
        window.clearTimeout(drainTimeoutRef.current)
        drainTimeoutRef.current = null
      }
      if (routeEventsCleanupRef.current) {
        routeEventsCleanupRef.current()
        routeEventsCleanupRef.current = null
      }
    }
  }, [])

  const value = useMemo<SubscriptionCleanupContextValue>(
    () => ({
      signal,
      isCleanupInProgress,
      lastReason,
      connectionCount,
      requestCleanup,
      incrementConnectionCount,
      decrementConnectionCount,
    }),
    [signal, isCleanupInProgress, lastReason, connectionCount, requestCleanup, incrementConnectionCount, decrementConnectionCount]
  )

  return (
    <SubscriptionCleanupContext.Provider value={value}>
      {children}
    </SubscriptionCleanupContext.Provider>
  )
}

export function useSubscriptionCleanup() {
  const context = useContext(SubscriptionCleanupContext)
  if (!context) {
    throw new Error(
      'useSubscriptionCleanup must be used within a SubscriptionCleanupProvider'
    )
  }
  return context
}

export const NAVIGATION_DRAIN_DELAY = DEFAULT_DRAIN_DELAY
