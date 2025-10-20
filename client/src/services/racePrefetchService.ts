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
    meeting_id: string;
    meeting_name: string;
    country: string;
    race_type: string;
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
  async prefetchBasicRaceData(race_id: string, options: PrefetchOptions = {}): Promise<BasicRaceData | null> {
    const { priority = 'low', timeout = 5000 } = options;
    
    // Check if already in cache
    const cacheKey = `race:${race_id}:basic`;
    try {
      const cached = await raceCache.get(
        cacheKey, 
        async () => {
          throw new Error('Cache check only');
        }, 
        0
      );
      if (cached) {
        console.log('✅ Race data already cached for:', race_id);
        return cached;
      }
    } catch {
      // Cache miss, continue with prefetch
    }

    // Check if prefetch is already in progress
    if (this.prefetchInProgress.has(race_id)) {
      console.log('⏳ Prefetch already in progress for:', race_id);
      return this.prefetchInProgress.get(race_id)!;
    }

    // Add to queue
    this.prefetchQueue.add(race_id);
    
    const prefetchPromise = this.executePrefetch(race_id, timeout);
    this.prefetchInProgress.set(race_id, prefetchPromise);

    try {
      const result = await prefetchPromise;
      console.log(priority === 'high' ? '🚀' : '📋', 'Pre-fetched basic race data for:', race_id);
      return result;
    } catch (error) {
      console.warn('⚠️ Failed to pre-fetch race data for:', race_id, error);
      return null;
    } finally {
      this.prefetchQueue.delete(race_id);
      this.prefetchInProgress.delete(race_id);
    }
  }

  /**
   * Pre-fetch basic race data for multiple races (background)
   */
  async prefetchMultipleRaces(race_ids: string[], options: PrefetchOptions = {}): Promise<void> {
    const { priority = 'low' } = options;
    
    console.log(`📋 Pre-fetching ${race_ids.length} races in background...`);
    
    // Process in batches to avoid overwhelming the server
    const batchSize = priority === 'high' ? 3 : 2;
    for (let i = 0; i < race_ids.length; i += batchSize) {
      const batch = race_ids.slice(i, i + batchSize);
      
      // Execute batch in parallel
      const batchPromises = batch.map(race_id => 
        this.prefetchBasicRaceData(race_id, { ...options, priority: 'low' })
          .catch(error => {
            console.warn('Failed to pre-fetch race in batch:', race_id, error);
            return null;
          })
      );
      
      await Promise.all(batchPromises);
      
      // Small delay between batches for low priority
      if (priority === 'low' && i + batchSize < race_ids.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('✅ Completed background pre-fetching for', race_ids.length, 'races');
  }

  /**
   * Execute the actual prefetch with cache integration
   */
  private async executePrefetch(race_id: string, timeout: number): Promise<BasicRaceData | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Use the progressive loading API endpoint for basic race data
      const response = await fetch(`/api/race/${race_id}/basic`, {
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
      const cacheKey = `race:${race_id}:basic`;
      raceCache.set(cacheKey, data, 15000);
      
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Enhanced pre-fetch for race click - fetch basic data with high priority
   */
  async prefetchForNavigation(race_id: string): Promise<BasicRaceData | null> {
    console.log('🚀 High-priority prefetch for navigation to:', race_id);
    
    return this.prefetchBasicRaceData(race_id, {
      priority: 'high',
      timeout: 2000 // Faster timeout for navigation
    });
  }

  /**
   * Check if race data is available in cache (asynchronous check)
   */
  async isRaceDataCached(race_id: string): Promise<boolean> {
    try {
      const cacheKey = `race:${race_id}:basic`;
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
  async getCachedRaceData(race_id: string): Promise<BasicRaceData | null> {
    try {
      const cacheKey = `race:${race_id}:basic`;
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
  clearRaceCache(race_id: string): void {
    this.prefetchQueue.delete(race_id);
    this.prefetchInProgress.delete(race_id);
    
    const cacheKey = `race:${race_id}:basic`;
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