# 9. Performance Characteristics

## 9.1. Function Performance Targets

| Function | Max Duration | Max Memory | Success Rate |
|----------|-------------|------------|--------------|
| daily-meetings | 60s | 200MB | >99.5% |
| daily-races | 90s | 300MB | >99.5% |
| daily-entrants | 300s | 800MB | >99% |
| enhanced-race-poller | 120s | 1.5GB | >99.5% |
| master-race-scheduler | 60s | 200MB | >99.9% |
| race-data-poller (legacy) | 120s | 1.5GB | >99.5% |
| single-race-poller (legacy) | 90s | 800MB | >99.5% |
| batch-race-poller (legacy) | 180s | 1.5GB | >99% |
| alert-evaluator | 30s | 100MB | >99.9% |

## 9.2. Enhanced Frontend Performance Targets (v4.7)

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

## 9.3. Response Compression Strategy (v4.8)

- **Next.js API Routes** now negotiate `br` or `gzip` encoding based on the caller's `Accept-Encoding` header, defaulting to identity responses when headers are absent or payloads are below 1 KB.
- **Appwrite HTTP Functions** share the same compression utility to ensure batch/single race polling responses are compressed when triggered manually without impacting scheduled executions.
- **Client Compatibility** is preserved by appending the `Vary: Accept-Encoding` header and setting explicit `Content-Length` values for both compressed and uncompressed payloads.
- **Validation** is covered by Jest tests that decompress both Brotli and gzip responses to guarantee fidelity before rollout.
