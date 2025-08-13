# 7. Performance Characteristics

## 7.1. Function Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| race-data-poller | 120s | 1.5GB | >99.5% |
| alert-evaluator | 30s | 100MB | >99.9% |

## 7.2. Enhanced Frontend Performance Targets (v4.7)

**Core Performance Requirements:**
- **Initial Load:** < 200ms for cached race data (SSR first paint)
- **Real-time Updates:** < 100ms latency for money flow changes
- **Race Switching:** < 300ms total transition time
- **Grid Rendering:** < 50ms for 20+ runners with full money flow data
- **Horizontal Scroll:** 60fps smooth scrolling for time columns

**Desktop-Optimized Targets:**
- **Data Density:** Support 12+ time columns without performance degradation
- **Sorting Performance:** < 100ms sort time for any column with 20+ rows
- **Memory Usage:** < 100MB for single race view with full history
- **Bundle Size:** < 350KB initial (increased for enhanced grid components)

**Real-Time Performance:**
- **WebSocket Latency:** < 50ms from backend update to grid re-render
- **Update Batching:** Max 10 updates/second to prevent UI thrashing
- **Change Indicators:** < 16ms animation frame updates for ⚡ indicators

---
