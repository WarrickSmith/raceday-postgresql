/**
 * Memory Management and Performance Monitoring Utility
 * 
 * Provides client-side memory monitoring, cleanup utilities, and performance tracking
 * for optimal race interface performance as specified in Story 4.8.
 */

interface MemoryStats {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  memoryUsagePercentage: number;
  isHighMemoryUsage: boolean;
}

interface PerformanceSnapshot {
  timestamp: number;
  memoryStats: MemoryStats;
  componentCount: number;
  cacheSize: number;
  activeSubscriptions: number;
}

interface MemoryThresholds {
  warning: number; // 70% of heap limit
  critical: number; // 85% of heap limit
  cleanup: number; // 90% of heap limit
}

interface PerformanceMemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemoryInfo;
}

type WindowWithGC = Window & { gc?: () => void };

interface NavigatorMemory {
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

type NavigatorWithMemory = Navigator & { memory?: NavigatorMemory };

class MemoryManager {
  private performanceSnapshots: PerformanceSnapshot[] = [];
  private cleanupCallbacks: Array<() => void> = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private thresholds: MemoryThresholds = {
    warning: 0.7,
    critical: 0.85,
    cleanup: 0.9
  };

  constructor() {
    // Only run in browser
    if (typeof window !== 'undefined') {
      this.startMonitoring();
      this.setupCleanupTriggers();
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const performanceWithMemory = performance as PerformanceWithMemory;
    const memory = performanceWithMemory.memory;
    if (!memory) {
      return null;
    }
    const memoryUsagePercentage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      memoryUsagePercentage,
      isHighMemoryUsage: memoryUsagePercentage > this.thresholds.warning
    };
  }

  /**
   * Start periodic memory monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      const memoryStats = this.getMemoryStats();
      if (!memoryStats) return;

      // Record snapshot
      this.recordSnapshot(memoryStats);

      // Check thresholds and trigger cleanup if needed
      this.checkThresholds(memoryStats);

      // Limit snapshot history to last 100 entries
      if (this.performanceSnapshots.length > 100) {
        this.performanceSnapshots = this.performanceSnapshots.slice(-100);
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Record a performance snapshot
   */
  private recordSnapshot(memoryStats: MemoryStats): void {
    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      memoryStats,
      componentCount: this.getEstimatedComponentCount(),
      cacheSize: this.getEstimatedCacheSize(),
      activeSubscriptions: this.getActiveSubscriptionsCount()
    };

    this.performanceSnapshots.push(snapshot);
  }

  /**
   * Check memory thresholds and trigger appropriate actions
   */
  private checkThresholds(memoryStats: MemoryStats): void {
    const usage = memoryStats.memoryUsagePercentage;

    if (usage > this.thresholds.cleanup) {
      console.warn('🔴 Critical memory usage detected - triggering aggressive cleanup');
      this.triggerAggressiveCleanup();
    } else if (usage > this.thresholds.critical) {
      console.warn('🟠 High memory usage detected - triggering cleanup');
      this.triggerCleanup();
    } else if (usage > this.thresholds.warning) {
      console.warn('🟡 Memory usage approaching threshold');
    }
  }

  /**
   * Register a cleanup callback
   */
  registerCleanupCallback(callback: () => void): () => void {
    this.cleanupCallbacks.push(callback);
    
    // Return unregister function
    return () => {
      const index = this.cleanupCallbacks.indexOf(callback);
      if (index > -1) {
        this.cleanupCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Trigger cleanup callbacks
   */
  triggerCleanup(): void {
    console.log('🧹 Triggering memory cleanup callbacks');
    this.cleanupCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in cleanup callback:', error);
      }
    });
  }

  /**
   * Trigger aggressive cleanup for critical memory situations
   */
  private triggerAggressiveCleanup(): void {
    console.log('🧹 Triggering aggressive memory cleanup');
    
    // Clear older performance snapshots
    this.performanceSnapshots = this.performanceSnapshots.slice(-20);
    
    // Trigger all cleanup callbacks
    this.triggerCleanup();
    
    // Force garbage collection if available (Chrome DevTools)
    if (typeof window !== 'undefined') {
      const gc = (window as WindowWithGC).gc;
      if (gc) {
        try {
          gc();
          console.log('♻️ Forced garbage collection');
        } catch (error) {
          console.log('GC not available', error);
        }
      }
    }
  }

  /**
   * Setup cleanup triggers for common events
   */
  private setupCleanupTriggers(): void {
    // Cleanup when page becomes hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.triggerCleanup();
      }
    });

    // Cleanup before page unload
    window.addEventListener('beforeunload', () => {
      this.triggerCleanup();
      this.stopMonitoring();
    });

    // Cleanup on memory pressure (if supported)
    if (typeof navigator !== 'undefined') {
      try {
        const navigatorWithMemory = navigator as NavigatorWithMemory;
        navigatorWithMemory.memory?.addEventListener?.('memorywarning', () => {
          console.warn('🔴 System memory warning - triggering cleanup');
          this.triggerAggressiveCleanup();
        });
      } catch (error) {
        console.debug('Memory pressure API not available', error);
      }
    }
  }

  /**
   * Get estimated component count (approximation)
   */
  private getEstimatedComponentCount(): number {
    try {
      // Count DOM elements as a proxy for React components
      return document.querySelectorAll('*').length;
    } catch {
      return 0;
    }
  }

  /**
   * Get estimated cache size (approximation)
   */
  private getEstimatedCacheSize(): number {
    try {
      // Try to estimate cache size from localStorage and other storage
      let size = 0;
      
      // localStorage size
      if (typeof localStorage !== 'undefined') {
        size += JSON.stringify(localStorage).length;
      }
      
      // sessionStorage size
      if (typeof sessionStorage !== 'undefined') {
        size += JSON.stringify(sessionStorage).length;
      }
      
      return size;
    } catch {
      return 0;
    }
  }

  /**
   * Get active subscriptions count (approximation)
   */
  private getActiveSubscriptionsCount(): number {
    // This would need to be integrated with your actual subscription tracking
    // For now, return a reasonable estimate
    return 0;
  }

  /**
   * Get performance report
   */
  getPerformanceReport(): {
    currentMemory: MemoryStats | null;
    recentSnapshots: PerformanceSnapshot[];
    averageMemoryUsage: number;
    memoryTrend: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
  } {
    const currentMemory = this.getMemoryStats();
    const recentSnapshots = this.performanceSnapshots.slice(-10);
    
    const averageMemoryUsage = recentSnapshots.length > 0
      ? recentSnapshots.reduce((sum, s) => sum + s.memoryStats.memoryUsagePercentage, 0) / recentSnapshots.length
      : 0;

    // Determine memory trend
    let memoryTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentSnapshots.length >= 2) {
      const oldest = recentSnapshots[0].memoryStats.memoryUsagePercentage;
      const newest = recentSnapshots[recentSnapshots.length - 1].memoryStats.memoryUsagePercentage;
      const diff = newest - oldest;
      
      if (diff > 0.05) memoryTrend = 'increasing';
      else if (diff < -0.05) memoryTrend = 'decreasing';
    }

    // Generate recommendations
    const recommendations: string[] = [];
    if (averageMemoryUsage > this.thresholds.warning) {
      recommendations.push('Consider reducing the number of cached race data entries');
      recommendations.push('Check for memory leaks in real-time subscriptions');
    }
    if (memoryTrend === 'increasing') {
      recommendations.push('Memory usage is trending upward - monitor closely');
    }
    if (currentMemory && currentMemory.memoryUsagePercentage > 80) {
      recommendations.push('High memory usage detected - consider component optimization');
    }

    return {
      currentMemory,
      recentSnapshots,
      averageMemoryUsage,
      memoryTrend,
      recommendations
    };
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Format memory size for display
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();

// Export types
export type { MemoryStats, PerformanceSnapshot, MemoryThresholds };
