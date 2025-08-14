# 10. Client Integration

## 10.1. Real-Time Data Architecture

The RaceDay client application leverages Appwrite's real-time subscriptions to provide live betting market visualization with comprehensive historical trend analysis.

**Key Integration Features:**
- **Real-time subscriptions** to `entrants` collection for live odds updates
- **Historical data queries** to `odds-history` collection for trend charts
- **Sub-second latency** for market movements and status changes
- **Seamless race switching** with preserved historical context

## 10.2. Implementation Guide

For detailed client integration patterns, data access strategies, and React implementation examples, see:

📖 **[Client Real-Time Data Integration Guide](./client-real-time-data-integration.md)**

This guide provides:
- Complete subscription patterns for live data
- Historical data querying strategies
- React hooks and component examples
- Performance optimization techniques
- Trend calculation utilities

---
