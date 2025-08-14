# 8. Migration to v4.7 Enhanced Race Interface

## 8.1. New Features & Components

**Enhanced Database Schema:**
- New `money-flow-history` collection for timeline visualization data
- New `race-pools` collection for real-time pool totals tracking  
- New `jockey-silks` collection for visual silk data
- Additional indexes for optimized money flow queries

**New Backend Functions:**
- `money-flow-tracker` - Event-triggered money flow history capture
- `race-pools-aggregator` - Real-time pool totals maintenance
- `jockey-silks-enricher` - HTTP-triggered silk data enrichment

**Enhanced Frontend Components:**
- `EnhancedEntrantsGrid` with virtualization and money flow timeline
- `MoneyFlowColumns` with horizontal scrolling time periods
- `RaceHeader` with navigation and contextual status
- `RaceFooter` with pool totals and race results

## 8.2. Data Migration Strategy

**Backward Compatibility:**
- All existing collections and data preserved
- New collections added alongside existing schema
- Existing race pages continue to work during migration
- Progressive enhancement approach for new features

**Historical Data Population:**
- Money flow history will be populated from next polling cycle
- Existing odds-history data can be converted to money flow format
- Jockey silks data populated on-demand via enricher function

## 8.3. Deployment Steps (v4.7)

1. **Database Schema Updates:**
   - Deploy new collections: `money-flow-history`, `race-pools`, `jockey-silks`
   - Add optimized indexes for time-series queries
   - Maintain existing collections unchanged

2. **Backend Function Deployment:**
   - Deploy `money-flow-tracker` event-triggered function  
   - Deploy `race-pools-aggregator` for pool totals
   - Deploy `jockey-silks-enricher` HTTP endpoint
   - Update existing `race-data-poller` to populate new collections

3. **Frontend Component Deployment:**
   - Deploy enhanced components with feature flags
   - Implement progressive enhancement strategy
   - A/B test enhanced grid vs existing grid
   - Monitor performance metrics during rollout

4. **Validation & Monitoring:**
   - Verify money flow data population aligns with polling windows
   - Confirm real-time updates work across all new collections
   - Monitor performance targets: <200ms first paint, <100ms updates
   - Validate horizontal scrolling and sorting performance

---
