/**
 * Performance optimization utilities for the RaceDay application
 * Includes virtualization, memoization, and monitoring utilities
 * Enhanced for Story 4.8 with memory management integration
 * Integrated with conditional logging system
 */

import React, { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { Entrant } from '@/types/meetings';
import { memoryManager } from './memoryManager';
import { logPerformance, logDebug, logWarn, LoggingUtils } from './logging';

type MemoryPerformanceReport = ReturnType<typeof memoryManager.getPerformanceReport>;

// Performance monitoring
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  private enabled = process.env.NODE_ENV === 'development';

  private constructor() {}

  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  public startMeasure(name: string): void {
    if (!this.enabled) return;
    performance.mark(`${name}-start`);
  }

  public endMeasure(name: string): number {
    if (!this.enabled) return 0;

    try {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);

      const measure = performance.getEntriesByName(name, 'measure')[0];
      const duration = measure?.duration || 0;

      // Store metrics for analysis
      if (!this.metrics.has(name)) {
        this.metrics.set(name, []);
      }
      this.metrics.get(name)!.push(duration);

      // Log performance measurement using conditional logging
      if (LoggingUtils.isDebugEnabled()) {
        logPerformance(name, Date.now() - duration, { duration });
      }

      // Clean up marks
      performance.clearMarks(`${name}-start`);
      performance.clearMarks(`${name}-end`);
      performance.clearMeasures(name);

      return duration;
    } catch (error) {
      logWarn('Performance measurement failed', error, 'PerformanceMonitor');
      return 0;
    }
  }

  public getMetrics(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const result: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    this.metrics.forEach((values, name) => {
      if (values.length > 0) {
        result[name] = {
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          count: values.length
        };
      }
    });
    
    return result;
  }

  public clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Enhanced performance report with memory integration
   */
  public getPerformanceReport(): {
    timing: Record<string, { avg: number; min: number; max: number; count: number }>;
    memory: MemoryPerformanceReport;
    recommendations: string[];
  } {
    const timing = this.getMetrics();
    const memoryReport = memoryManager.getPerformanceReport();
    
    const recommendations: string[] = [...memoryReport.recommendations];
    
    // Add timing-based recommendations
    Object.entries(timing).forEach(([name, stats]) => {
      if (stats.avg > 100) {
        recommendations.push(`Consider optimizing ${name} - average time ${stats.avg.toFixed(2)}ms`);
        logWarn(`Performance bottleneck detected: ${name}`, { averageTime: stats.avg }, 'PerformanceMonitor');
      }
    });

    return {
      timing,
      memory: memoryReport,
      recommendations
    };
  }

  /**
   * Register cleanup for performance data
   */
  public registerMemoryCleanup(): () => void {
    return memoryManager.registerCleanupCallback(() => {
      // Keep only recent metrics during cleanup
      this.metrics.forEach((values, name) => {
        if (values.length > 10) {
          this.metrics.set(name, values.slice(-10));
        }
      });
      logDebug('Cleaned performance metrics', {}, 'PerformanceMonitor');
    });
  }
}

// Debounce hook with trailing and leading options
export const useDebouncedCallback = <T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
  options: {
    leading?: boolean;
    trailing?: boolean;
  } = {}
): ((...args: Parameters<T>) => void) => {
  const { leading = false, trailing = true } = options;
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallTimeRef = useRef<number | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  const memoizedCallback = useCallback((...args: Parameters<T>) => {
    pendingArgsRef.current = args;
    const now = Date.now();
    const isLeadingCall = leading && lastCallTimeRef.current === null;

    if (isLeadingCall) {
      callback(...args);
      lastCallTimeRef.current = now;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (trailing && pendingArgsRef.current) {
        callback(...pendingArgsRef.current);
        pendingArgsRef.current = null;
      }
      timeoutRef.current = null;
      lastCallTimeRef.current = trailing ? Date.now() : null;
    }, Math.max(0, delay - (leading && lastCallTimeRef.current ? now - lastCallTimeRef.current : 0)));
  }, [callback, delay, leading, trailing]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  return memoizedCallback;
};

// Throttle hook with tail call option
export const useThrottledCallback = <T extends (...args: never[]) => void>(
  callback: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  const lastCallRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  const memoizedCallback = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    if (timeSinceLastCall >= delay) {
      callback(...args);
      lastCallRef.current = now;
    } else {
      pendingArgsRef.current = args;
      if (!timeoutRef.current) {
        timeoutRef.current = setTimeout(() => {
          if (pendingArgsRef.current) {
            callback(...pendingArgsRef.current);
            pendingArgsRef.current = null;
          }
          timeoutRef.current = null;
          lastCallRef.current = Date.now();
        }, delay - timeSinceLastCall);
      }
    }
  }, [callback, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return memoizedCallback;
};

// Memoized list virtualization helper
export const useVirtualizedList = <T,>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan = 5
) => {
  return useMemo(() => {
    const visibleCount = Math.ceil(containerHeight / itemHeight);
    const totalCount = items.length;
    const paddingCount = Math.max(overscan, 10);

    return {
      visibleCount,
      totalCount,
      paddingCount,
      totalHeight: totalCount * itemHeight,
    };
  }, [items.length, itemHeight, containerHeight, overscan]);
};

// React.memo wrapper with performance logging
export const memoWithTracking = <T,>(
  component: React.FC<T>,
  propsAreEqual?: (prevProps: Readonly<T>, nextProps: Readonly<T>) => boolean,
  componentName?: string
) => {
  const MemoizedComponent = React.memo(component, (prevProps, nextProps) => {
    const result = propsAreEqual ? propsAreEqual(prevProps, nextProps) : false;
    if (!result && LoggingUtils.isDebugEnabled()) {
      logDebug(`${componentName ?? component.name} re-rendered`, {
        timestamp: new Date().toISOString(),
      });
    }
    return result;
  });

  MemoizedComponent.displayName = componentName ?? component.displayName ?? component.name;
  return MemoizedComponent;
};

// Intelligent memoization for entrants list
export const useEntrantMemoization = (entrants: Entrant[]): Entrant[] => {
  const cachedEntrantsRef = useRef<Map<string, Entrant>>(new Map());

  return useMemo(() => {
    const cache = cachedEntrantsRef.current;
    const result: Entrant[] = [];

    entrants.forEach((entrant) => {
      const { entrant_id } = entrant;
      const cached = cache.get(entrant_id);

      if (
        cached &&
        cached.win_odds === entrant.win_odds &&
        cached.place_odds === entrant.place_odds &&
        cached.is_scratched === entrant.is_scratched &&
        cached.hold_percentage === entrant.hold_percentage
      ) {
        result.push(cached);
      } else {
        result.push(entrant);
        cache.set(entrant_id, entrant);
      }
    });

    // Cleanup cache entries for removed entrants
    const currentIds = new Set(entrants.map((entrant) => entrant.entrant_id));
    cachedEntrantsRef.current = new Map(
      [...cache.entries()].filter(([entrant_id]) => currentIds.has(entrant_id))
    );

    return result;
  }, [entrants]);
};

// Optimized entrant comparison for memo
export const entrantComparison = (prev: Entrant, next: Entrant): boolean => {
  // Only compare fields that affect rendering
  return (
    prev.entrant_id === next.entrant_id &&
    prev.win_odds === next.win_odds &&
    prev.place_odds === next.place_odds &&
    prev.is_scratched === next.is_scratched &&
    prev.hold_percentage === next.hold_percentage &&
    prev.money_flow_trend === next.money_flow_trend &&
    prev.updated_at === next.updated_at
  );
};

// Optimized entrants list comparison
export const entrantsListComparison = (prev: Entrant[], next: Entrant[]): boolean => {
  if (prev.length !== next.length) return false;
  
  for (let i = 0; i < prev.length; i++) {
    if (!entrantComparison(prev[i], next[i])) {
      return false;
    }
  }
  
  return true;
};

// Frame throttling hook for heavy animations
export const useAnimationFrame = (callback: () => void) => {
  const requestRef = useRef<number | undefined>(undefined);
  const previousTimeRef = useRef<number | undefined>(undefined);

  const animate = useCallback(
    (time: number) => {
      if (previousTimeRef.current !== undefined) {
        const deltaTime = time - previousTimeRef.current;

        // Throttle to ~60fps
        if (deltaTime >= 16) {
          callback();
          previousTimeRef.current = time;
        }
      } else {
        previousTimeRef.current = time;
      }

      requestRef.current = requestAnimationFrame(animate);
    },
    [callback],
  );

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [animate]);
};

// Memory usage hooks
export const useMemoryTracking = () => {
  const [memoryUsage, setMemoryUsage] = useState(memoryManager.getPerformanceReport());

  useEffect(() => {
    const interval = setInterval(() => {
      setMemoryUsage(memoryManager.getPerformanceReport());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return memoryUsage;
};

// CPU usage simulation for testing
export const simulateCpuLoad = (durationMs: number): void => {
  const endTime = Date.now() + durationMs;
  while (Date.now() < endTime) {
    Math.sqrt(Math.random());
  }
};

// React hook for connection quality monitoring
export const useConnectionQuality = () => {
  const [quality, setQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('excellent');

  useEffect(() => {
    const updateQuality = () => {
      const nav = navigator as Navigator & { connection?: { downlink?: number; rtt?: number } };
      const connection = nav.connection;
      if (!connection) return;

      const { downlink = 0, rtt = 0 } = connection;

      if (downlink > 10 && rtt < 50) setQuality('excellent');
      else if (downlink > 5 && rtt < 100) setQuality('good');
      else if (downlink > 2 && rtt < 200) setQuality('fair');
      else setQuality('poor');
    };

    updateQuality();
    const nav = navigator as Navigator & { connection?: { addEventListener?: (event: string, handler: () => void) => void; removeEventListener?: (event: string, handler: () => void) => void } };
    nav.connection?.addEventListener?.('change', updateQuality);

    return () => {
      nav.connection?.removeEventListener?.('change', updateQuality);
    };
  }, []);

  return quality;
};

// Visibility-based polling optimization
export const useVisibilityPolling = (pollFn: () => void, intervalMs: number) => {
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!pollInterval) {
        pollFn();
        pollInterval = setInterval(pollFn, intervalMs);
      }
    };

    const stopPolling = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    startPolling();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
    };
  }, [pollFn, intervalMs]);
};

// Hook for element visibility
export const useElementVisibility = (options?: IntersectionObserverInit) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        rootMargin: options?.rootMargin || '0px',
        threshold: options?.threshold || 0.1,
      }
    );

    const element = elementRef.current;
    observer.observe(element);

    return () => {
      observer.unobserve(element);
      observer.disconnect();
    };
  }, [options?.rootMargin, options?.threshold]);

  return [isVisible, elementRef] as const;
};

// Hook for debounced value
export const useDebouncedValue = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Hook for request idle callback
export const useIdleCallback = (callback: () => void, timeout?: number) => {
  useEffect(() => {
    const win = window as Window & { requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number; cancelIdleCallback?: (handle: number) => void };
    if (win.requestIdleCallback) {
      const handle = win.requestIdleCallback(callback, { timeout });
      return () => win.cancelIdleCallback?.(handle);
    }

    const handle = setTimeout(callback, timeout ?? 1);
    return () => clearTimeout(handle);
  }, [callback, timeout]);
};

// Hook for throttled window resize
export const useResizeObserver = (
  elementRef: React.RefObject<Element>,
  callback: (rect: DOMRectReadOnly) => void,
  throttleMs = 100
) => {
  const throttledCallback = useThrottledCallback(
    (entry: ResizeObserverEntry) => callback(entry.contentRect),
    throttleMs
  );

  useEffect(() => {
    const element = elementRef.current;
    if (!element || typeof ResizeObserver !== 'function') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      throttledCallback(entries[0]);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef, throttledCallback]);
};

// Hook for intersection observer
export const useIntersectionObserver = (
  elementRef: React.RefObject<Element>,
  options?: IntersectionObserverInit
) => {
  const [entry, setEntry] = useState<IntersectionObserverEntry>();
  const thresholds = useMemo(
    () =>
      options?.threshold
        ? Array.isArray(options.threshold)
          ? options.threshold
          : [options.threshold]
        : [0],
    [options?.threshold]
  );
  const root = options?.root ?? null;
  const rootMargin = options?.rootMargin ?? '0%';

  const frozen = entry?.isIntersecting && options?.rootMargin === '0%';

  const updateEntry = ([entry]: IntersectionObserverEntry[]): void => {
    setEntry(entry);
  };

  useEffect(() => {
    const node = elementRef?.current;
    const hasIOSupport = !!window.IntersectionObserver;

    if (!hasIOSupport || frozen || !node) return;

    const observerParams = { threshold: thresholds, root, rootMargin };
    const observer = new IntersectionObserver(updateEntry, observerParams);

    observer.observe(node);

    return () => observer.disconnect();
  }, [elementRef, thresholds, root, rootMargin, frozen]);

  return entry;
};

// Bundle analysis utilities
export const BundleAnalyzer = {
  /**
   * Log component render counts for debugging
   */
  logRender: (componentName: string): void => {
    logDebug(`Component rendered`, { timestamp: new Date().toISOString() }, componentName);
  },

  /**
   * Measure bundle size impact
   */
  measureBundleImpact: (feature: string, callback: () => void): void => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.startMeasure(`bundle-${feature}`);
    
    callback();
    
    const duration = monitor.endMeasure(`bundle-${feature}`);
    
    logPerformance(`bundle-${feature}`, Date.now() - duration, { duration }, 'BundleAnalyzer');
  }
};

// React Suspense utilities
export function withSuspense<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function SuspenseWrapper(props: P) {
    const Suspense = React.Suspense;
    const defaultFallback = React.createElement('div', {}, 'Loading...');
    
    return React.createElement(
      Suspense,
      { fallback: fallback || defaultFallback },
      React.createElement(Component, props)
    );
  };
}

// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Hook for component memory management
 */
export function useMemoryOptimization() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Register cleanup with memory manager
    cleanupRef.current = memoryManager.registerCleanupCallback(() => {
      // Component-specific cleanup logic
      logDebug('Component memory cleanup triggered', {}, 'MemoryOptimization');
    });

    // Register performance cleanup
    const performanceCleanup = performanceMonitor.registerMemoryCleanup();

    return () => {
      cleanupRef.current?.();
      performanceCleanup();
    };
  }, []);

  const triggerCleanup = useCallback(() => {
    memoryManager.triggerCleanup();
  }, []);

  const getMemoryReport = useCallback(() => {
    return performanceMonitor.getPerformanceReport();
  }, []);

  return {
    triggerCleanup,
    getMemoryReport
  };
}

/**
 * Hook for tracking component render performance with memory awareness
 */
export function useRenderTracking(componentName: string) {
  const renderCount = useRef(0);

  useEffect(() => {
    renderCount.current++;
    
    logDebug(`Render #${renderCount.current}`, {}, componentName);

    // Track excessive re-renders
    if (renderCount.current > 10) {
      logWarn(`Component has rendered ${renderCount.current} times - check for optimization opportunities`, { renderCount: renderCount.current }, componentName);
    }
  });

  // Memory cleanup for render tracking
  useEffect(() => {
    return memoryManager.registerCleanupCallback(() => {
      renderCount.current = 0;
    });
  }, []);

  return renderCount.current;
}
