/**
 * Enhanced caching system for server-side data fetching
 * Implements multi-level caching with TTL and invalidation strategies
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
  averageResponseTime: number;
}

export class EnhancedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
    hitRate: 0,
    averageResponseTime: 0
  };
  private responseTimeBuffer: number[] = [];

  constructor(
    private maxSize: number = 1000,
    private defaultTTL: number = 300000 // 5 minutes
  ) {
    // Periodic cleanup of expired entries
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  async get<K extends T>(
    key: string, 
    fetcher: () => Promise<K>, 
    ttl: number = this.defaultTTL
  ): Promise<K> {
    const start_time = performance.now();
    this.metrics.totalRequests++;

    const cached = this.cache.get(key);
    const now = Date.now();

    // Check if cached entry is valid
    if (cached && (now - cached.timestamp) < cached.ttl) {
      cached.accessCount++;
      cached.lastAccessed = now;
      this.metrics.hits++;
      
      const responseTime = performance.now() - start_time;
      this.updateMetrics(responseTime);
      
      return cached.data as K;
    }

    // Cache miss - fetch new data
    this.metrics.misses++;
    
    try {
      const data = await fetcher();
      this.set(key, data, ttl);
      
      const responseTime = performance.now() - start_time;
      this.updateMetrics(responseTime);
      
      return data;
    } catch (error) {
      // If fetch fails and we have stale data, return it
      if (cached) {
        console.warn(`Cache fetch failed for ${key}, returning stale data:`, error);
        return cached.data as K;
      }
      throw error;
    }
  }

  set(key: string, data: T, ttl: number = this.defaultTTL): void {
    // Ensure cache size limit
    if (this.cache.size >= this.maxSize) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 1,
      lastAccessed: Date.now()
    });
  }

  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.resetMetrics();
  }

  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  getSize(): number {
    return this.cache.size;
  }

  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let leastUsedEntry: CacheEntry<T> | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!leastUsedEntry || entry.accessCount < leastUsedEntry.accessCount) {
        leastUsedKey = key;
        leastUsedEntry = entry;
      }
    }

    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
      this.metrics.evictions++;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if ((now - entry.timestamp) > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }

  private updateMetrics(responseTime: number): void {
    this.responseTimeBuffer.push(responseTime);
    if (this.responseTimeBuffer.length > 100) {
      this.responseTimeBuffer.shift();
    }

    this.metrics.hitRate = this.metrics.hits / this.metrics.totalRequests;
    this.metrics.averageResponseTime = 
      this.responseTimeBuffer.reduce((a, b) => a + b, 0) / this.responseTimeBuffer.length;
  }

  private resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0,
      hitRate: 0,
      averageResponseTime: 0
    };
    this.responseTimeBuffer = [];
  }
}

// Cache configuration for different data types
export const cacheConfig = {
  race: { ttl: 30000, size: 100 }, // 30 seconds, up to 100 races
  entrants: { ttl: 60000, size: 500 }, // 1 minute, up to 500 entrant lists
  navigation: { ttl: 300000, size: 50 }, // 5 minutes, up to 50 navigation sets
  pools: { ttl: 15000, size: 200 }, // 15 seconds, up to 200 pool datasets
  results: { ttl: 3600000, size: 1000 } // 1 hour, up to 1000 result sets
};

// Global cache instances
export const raceCache = new EnhancedCache(cacheConfig.race.size, cacheConfig.race.ttl);
export const entrantsCache = new EnhancedCache(cacheConfig.entrants.size, cacheConfig.entrants.ttl);
export const navigationCache = new EnhancedCache(cacheConfig.navigation.size, cacheConfig.navigation.ttl);
export const poolsCache = new EnhancedCache(cacheConfig.pools.size, cacheConfig.pools.ttl);
export const resultsCache = new EnhancedCache(cacheConfig.results.size, cacheConfig.results.ttl);

// Cache invalidation strategies
export const cacheInvalidation = {
  onRaceUpdate: (race_id: string) => {
    raceCache.invalidate(`race:${race_id}`);
    entrantsCache.invalidate(`entrants:${race_id}`);
    poolsCache.invalidatePattern(new RegExp(`pools:${race_id}`));
  },

  onEntrantUpdate: (race_id: string, entrant_id: string) => {
    void entrant_id;
    entrantsCache.invalidate(`entrants:${race_id}`);
    poolsCache.invalidatePattern(new RegExp(`pools:${race_id}`));
  },

  onRaceStatusChange: (race_id: string) => {
    raceCache.invalidate(`race:${race_id}`);
    navigationCache.invalidatePattern(new RegExp(`navigation:.*${race_id}`));
    poolsCache.invalidatePattern(new RegExp(`pools:${race_id}`));
  },

  onMeetingUpdate: (meeting_id: string) => {
    navigationCache.invalidatePattern(new RegExp(`navigation:${meeting_id}`));
    raceCache.invalidatePattern(new RegExp(`race:.*${meeting_id}`));
  }
};

// Performance monitoring
export function getCacheHealth() {
  return {
    race: {
      ...raceCache.getMetrics(),
      size: raceCache.getSize(),
      maxSize: cacheConfig.race.size
    },
    entrants: {
      ...entrantsCache.getMetrics(),
      size: entrantsCache.getSize(),
      maxSize: cacheConfig.entrants.size
    },
    navigation: {
      ...navigationCache.getMetrics(),
      size: navigationCache.getSize(),
      maxSize: cacheConfig.navigation.size
    },
    pools: {
      ...poolsCache.getMetrics(),
      size: poolsCache.getSize(),
      maxSize: cacheConfig.pools.size
    },
    results: {
      ...resultsCache.getMetrics(),
      size: resultsCache.getSize(),
      maxSize: cacheConfig.results.size
    }
  };
}
