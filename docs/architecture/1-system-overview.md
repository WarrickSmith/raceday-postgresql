# 1. System Overview

The RaceDay application uses a **microservices backend architecture** (Appwrite Cloud), a decoupled Next.js frontend, and coordinated client-side polling for live data updates. This version introduces comprehensive money flow visualization, enhanced race monitoring capabilities, and a robust polling architecture optimized for professional betting terminal layouts.

**Key Architectural Features:**
- **Client-Side Polling**: Coordinated polling infrastructure with dynamic cadence based on race timing
- **Health Monitoring**: Periodic backend health checks with connection state guards and automatic recovery
- **Response Compression**: Brotli/Gzip compression for 60-70% payload reduction
- **Polling Observability**: Development monitoring UI for metrics tracking and cadence compliance
- **Enhanced Race Display**: Money flow timeline visualization with horizontal scrolling grid
- **Money Flow History**: Time-series data tracking aligned to polling windows
- **Race Navigation**: Contextual status and pool information with performance-optimized rendering
- **Jockey Silks Integration**: Enhanced visual indicators for professional betting terminals

---
