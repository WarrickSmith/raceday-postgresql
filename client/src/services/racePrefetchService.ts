/**
 * Race Pre-fetch Service for Optimized Meeting-to-Race Transitions
 * 
 * This service pre-fetches basic race data when races are displayed in meeting cards
 * to enable immediate race interface rendering when users click on races.
 * 
 * Performance targets:
 * - Pre-cache basic race data when races are displayed
 * - Enable <100ms meeting-to-race transition time
 * - Integrate with existing cache system for optimal performance
 */

import { raceCache } from '@/lib/cache';
import { Race } from '@/types/meetings';

interface BasicRaceData {
  race: Race;
  meeting: {
    $id: string;
    meetingId: string;
    meetingName: string;
    country: string;
    raceType: string;
    category: string;
    date: string;
  };
}

interface PrefetchOptions {
  priority?: 'low' | 'high';
  timeout?: number;
}

class RacePrefetchService {
  private prefetchQueue = new Set<string>();
  private prefetchInProgress = new Map<string, Promise<BasicRaceData | null>>();

  /**
   * Pre-fetch basic race data for a single race
   */
  async prefetchBasicRaceData(raceId: string, options: PrefetchOptions = {}): Promise<BasicRaceData | null> {
    const { priority = 'low', timeout = 5000 } = options;
    
    // Check if already in cache
    const cacheKey = `race:${raceId}:basic`;
    try {
      const cached = await raceCache.get(
        cacheKey, 
        async () => {
          throw new Error('Cache check only');
        }, 
        0
      );
      if (cached) {
        console.log('✅ Race data already cached for:', raceId);
        return cached;
      }
    } catch {
      // Cache miss, continue with prefetch
    }

    // Check if prefetch is already in progress
    if (this.prefetchInProgress.has(raceId)) {
      console.log('⏳ Prefetch already in progress for:', raceId);
      return this.prefetchInProgress.get(raceId)!;
    }

    // Add to queue
    this.prefetchQueue.add(raceId);
    
    const prefetchPromise = this.executePrefetch(raceId, timeout);
    this.prefetchInProgress.set(raceId, prefetchPromise);

    try {
      const result = await prefetchPromise;
      console.log(priority === 'high' ? '🚀' : '📋', 'Pre-fetched basic race data for:', raceId);
      return result;
    } catch (error) {
      console.warn('⚠️ Failed to pre-fetch race data for:', raceId, error);
      return null;
    } finally {
      this.prefetchQueue.delete(raceId);
      this.prefetchInProgress.delete(raceId);
    }
  }

  /**
   * Pre-fetch basic race data for multiple races (background)
   */
  async prefetchMultipleRaces(raceIds: string[], options: PrefetchOptions = {}): Promise<void> {
    const { priority = 'low' } = options;
    
    console.log(`📋 Pre-fetching ${raceIds.length} races in background...`);
    
    // Process in batches to avoid overwhelming the server
    const batchSize = priority === 'high' ? 3 : 2;
    for (let i = 0; i < raceIds.length; i += batchSize) {
      const batch = raceIds.slice(i, i + batchSize);
      
      // Execute batch in parallel
      const batchPromises = batch.map(raceId => 
        this.prefetchBasicRaceData(raceId, { ...options, priority: 'low' })
          .catch(error => {
            console.warn('Failed to pre-fetch race in batch:', raceId, error);
            return null;
          })
      );
      
      await Promise.all(batchPromises);
      
      // Small delay between batches for low priority
      if (priority === 'low' && i + batchSize < raceIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('✅ Completed background pre-fetching for', raceIds.length, 'races');
  }

  /**
   * Execute the actual prefetch with cache integration
   */
  private async executePrefetch(raceId: string, timeout: number): Promise<BasicRaceData | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use the progressive loading API endpoint for basic race data
      const response = await fetch(`/api/race/${raceId}/basic`, {
        signal: controller.signal,
        headers: {
          'X-Prefetch': 'true', // Indicate this is a prefetch request
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Store in cache with appropriate TTL (15 seconds for live data)
      const cacheKey = `race:${raceId}:basic`;
      raceCache.set(cacheKey, data, 15000);
      
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Enhanced pre-fetch for race click - fetch basic data with high priority
   */
  async prefetchForNavigation(raceId: string): Promise<BasicRaceData | null> {
    console.log('🚀 High-priority prefetch for navigation to:', raceId);
    
    return this.prefetchBasicRaceData(raceId, {
      priority: 'high',
      timeout: 2000 // Faster timeout for navigation
    });
  }

  /**
   * Check if race data is available in cache (asynchronous check)
   */
  async isRaceDataCached(raceId: string): Promise<boolean> {
    try {
      const cacheKey = `race:${raceId}:basic`;
      // Try to get from cache without fetching
      await raceCache.get(
        cacheKey, 
        async () => {
          throw new Error('Cache check only');
        }, 
        0
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached race data if available (uses cache.get with error fetcher)
   */
  async getCachedRaceData(raceId: string): Promise<BasicRaceData | null> {
    try {
      const cacheKey = `race:${raceId}:basic`;
      return await raceCache.get(
        cacheKey, 
        async () => {
          throw new Error('Cache check only');
        }, 
        0
      );
    } catch {
      return null;
    }
  }

  /**
   * Clear prefetch queue and cache for a specific race
   */
  clearRaceCache(raceId: string): void {
    this.prefetchQueue.delete(raceId);
    this.prefetchInProgress.delete(raceId);
    
    const cacheKey = `race:${raceId}:basic`;
    raceCache.invalidate(cacheKey);
  }

  /**
   * Get current prefetch status
   */
  getStatus() {
    return {
      queueSize: this.prefetchQueue.size,
      inProgress: this.prefetchInProgress.size,
      activeRaces: Array.from(this.prefetchQueue)
    };
  }
}

// Export singleton instance
export const racePrefetchService = new RacePrefetchService();

// Export types
export type { BasicRaceData, PrefetchOptions };