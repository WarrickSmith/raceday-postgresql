# Product Brief: raceday-postgresql

**Date:** 2025-10-05
**Author:** warrick (Business Analyst Mary)
**Status:** Complete - Ready for PRD Development

---

## Executive Summary

**Migration from Appwrite to Node.js/PostgreSQL for 2x Performance Improvement**

The Raceday application currently uses Appwrite (serverless functions + MariaDB) to process race betting data. This architecture is too slow to detect time-critical insider betting patterns that emerge in the final 30-60 seconds before race close. Current processing takes >30 seconds for 5 concurrent races, causing users to miss betting opportunities entirely or see patterns too late to capitalize.

This product brief outlines the migration to a custom Node.js 22/PostgreSQL 18 stack targeting <15 seconds processing time (2x improvement). The migration is essential for business survival in a time-sensitive competitive market where faster pattern detection directly impacts user success and competitive advantage.

---

## Problem Statement

### Current State

The Raceday application currently processes race betting data using Appwrite serverless functions and MariaDB. During the critical 5-minute window before race start, the system polls the NZ TAB API every 30 seconds for up to 5 concurrent races, transforms the data (calculating money flow patterns), and writes to the database.

**Performance Issues:**
- Processing 5 races takes >30 seconds (exceeds polling window)
- Users miss entire polling cycles during critical final moments
- Transform + Write operations are the primary bottlenecks
- Cold starts and resource limits impact consistency

### The Core Problem

Critical insider betting patterns emerge in the final 30-60 seconds before race close. With 30-second update cycles, users either:
1. **Miss patterns completely** - Pattern emerges and closes within one polling cycle
2. **See patterns too late** - Competing bettors acting on the same signal have already moved

### Business Impact

This isn't a technical preference—it's about competitive survival. Every second of delay in detecting insider betting patterns directly impacts:
- User ability to capitalize on insider knowledge before betting window closes
- Competitive advantage vs faster systems
- Business viability in time-sensitive market

The application's value proposition is detecting patterns faster than competitors. At 30-second latency, we lose to 15-second systems every time.

---

## Proposed Solution

### Technical Approach

Migrate from Appwrite serverless architecture to a custom **Node.js 22 LTS + PostgreSQL 18** monolith with internal parallelization.

**Core Architecture:**
- **Node.js 22 Worker Threads** for CPU-intensive money flow calculations
- **PostgreSQL 18** with partitioned time-series tables and bulk UPSERT optimization
- **Hybrid Transform Strategy** - Node.js for business logic + PostgreSQL for bulk operations
- **Parallel Processing** - Promise.all() for I/O-bound operations, workers for CPU-bound
- **Docker Deployment** - 4 CPU cores, 4GB RAM optimized for 5 concurrent races

**Performance Strategy:**
- Multi-row UPSERT with conditional WHERE clauses (single transaction per race)
- Connection pooling (10 max connections)
- Race-isolated calculations enable massive parallelization
- Dynamic polling: 15s intervals during critical 5-minute window

### Expected Outcomes

| Metric | Current (Appwrite) | Target (Node/PG) | Improvement |
|--------|-------------------|------------------|-------------|
| 5 races processing | >30s | <15s | **2x faster** |
| Single race | ~6-10s | ~1.2s | **5-8x faster** |
| Polling frequency | 30s | 15s | **2x faster** |
| Data freshness | 30-60s old | 15-30s old | **2x fresher** |

### Safe Experimentation Path

- Forked codebase (raceday-postgresql branch) eliminates production risk
- Shadow mode deployment validates performance before cutover
- Feature flags enable instant rollback if needed
- Keep Appwrite running during validation period

---

## Target Users

### Primary User Segment

**Informed Race Bettors (Power Users)**

**Profile:**
- Active race betting participants in New Zealand
- Sophisticated users who understand money flow analysis
- Time-sensitive decision makers (place bets in final minutes)
- Value real-time pattern detection over post-race analysis
- Willing to act quickly on insider betting signals

**Needs:**
- Fastest possible access to money flow changes during critical final minutes
- Reliable pattern detection before betting window closes
- Fresh data (15-30 seconds old vs 30-60 seconds old)
- Ability to capitalize on fleeting opportunities

**Pain Points with Current System:**
- Missing betting opportunities due to 30-second delays
- Seeing patterns too late after competitors have already acted
- Inconsistent data freshness during critical moments
- Lost competitive advantage vs faster systems

### Secondary User Segment

**Casual Race Bettors**

**Profile:**
- Occasional race betting participants
- Less time-sensitive decision making
- Use app for general race information and trends
- May not act on real-time patterns

**Needs:**
- Accurate race data and odds
- Historical pattern analysis
- General betting insights
- Reliable system performance

**Benefit from Migration:**
- More accurate real-time data
- Better overall system performance
- Improved reliability and consistency

---

## Goals and Success Metrics

### Business Objectives

1. **Restore Competitive Advantage**
   - Achieve 2x faster pattern detection vs current system
   - Match or exceed competitor systems in time-critical scenarios
   - Position as fastest insider pattern detection in market

2. **Eliminate Missed Opportunities**
   - Reduce data latency from 30-60s to 15-30s
   - Ensure users see all critical pattern changes before race close
   - Enable action on patterns that emerge in final 30-60 seconds

3. **Validate Technical Migration Path**
   - Prove Node.js/PostgreSQL achieves <15s processing target
   - Demonstrate zero-downtime migration capability
   - Establish foundation for future performance improvements

### User Success Metrics

**Primary Metrics:**
- **Time to Pattern Detection:** 15-30s from pattern emergence (vs 30-60s currently)
- **Opportunity Capture Rate:** % of final-minute patterns detected before race close
- **Data Freshness:** <15s average age during critical 5-minute window
- **Missed Update Cycles:** 0 missed cycles during critical period

**User Satisfaction:**
- User-reported "missed opportunities due to delay" incidents
- User retention during critical betting hours
- Competitive win rate vs other pattern-detection systems

### Key Performance Indicators (KPIs)

**Technical Performance:**
- ✅ **Processing Time:** <15s for 5 concurrent races (2x target)
- ✅ **Single Race:** <2s fetch + transform + write
- ✅ **Database Write:** <300ms per race
- ✅ **API Response:** <100ms
- ✅ **System Uptime:** 99.9% during race hours

**Business Impact:**
- **User Engagement:** Active users during critical 5-min windows
- **Pattern Detection Rate:** Patterns detected vs patterns emerged
- **Competitive Positioning:** Time-to-detection vs known competitors
- **Migration Success:** Zero data loss, zero downtime deployment

**Operational Metrics:**
- **Deployment Success:** Shadow mode validation passed
- **Rollback Rate:** <1% (feature flag instant rollback if needed)
- **Cost Efficiency:** Infrastructure costs vs Appwrite baseline

---

## Strategic Alignment and Financial Impact

### Financial Impact

**Cost Comparison:**
- **Current (Appwrite):** Serverless function execution + MariaDB hosting + cold start overhead
- **Target (Self-hosted):** Docker container (4 CPU, 4GB RAM) + PostgreSQL 18
- **Expected Change:** Comparable or lower costs with significantly better performance

**Revenue Impact:**
- **User Retention:** Reduce churn from power users frustrated by delays
- **Competitive Positioning:** Enable premium pricing for fastest pattern detection
- **Market Expansion:** Attract competitive bettors seeking time-critical insights

**Risk Mitigation Costs:**
- Safe experimentation via forked codebase (minimal cost)
- Shadow mode deployment (temporary double infrastructure ~2 weeks)
- Feature flags and rollback capability (development time investment)

### Company Objectives Alignment

**Objective: Deliver Superior User Experience**
- 2x faster pattern detection directly improves time-critical user workflows
- Eliminates frustration from missed opportunities
- Positions product as premium solution in competitive market

**Objective: Technical Excellence**
- Modern stack (Node.js 22, PostgreSQL 18, TypeScript 5.7 strict mode)
- Zero `any` types, zero lint errors quality standards
- Establishes foundation for future performance improvements

**Objective: Business Sustainability**
- Competitive survival requires matching/exceeding competitor speed
- Migration proves technical capability for future optimizations
- Safe migration path demonstrates operational maturity

### Strategic Initiatives

**Initiative: Performance-First Architecture**
- Migration validates performance-critical path for future features
- Establishes patterns for real-time data processing
- Foundation for potential sub-15s updates if NZ TAB API improves

**Initiative: Modern Technology Stack**
- Node.js 22 LTS provides long-term support and latest features
- PostgreSQL 18 performance improvements (SIMD, improved UPSERT)
- TypeScript strict mode ensures code quality and maintainability

**Initiative: Risk-Managed Innovation**
- Forked codebase allows safe experimentation
- Shadow mode deployment validates before commitment
- Feature flags enable instant rollback if needed

---

## MVP Scope

### Core Features (Must Have)

**1. High-Performance Data Pipeline**
- NZ TAB API polling with dynamic intervals (15s during critical window)
- Worker thread-based money flow calculations
- Bulk UPSERT database operations (<300ms per race)
- Parallel processing for 5 concurrent races (<15s total)

**2. Near Drop-In API Replacement**
- REST endpoints matching Appwrite API contract
- GET /api/meetings - Filter by date, race type
- GET /api/races - Filter by meeting
- GET /api/entrants - Include odds history, money flow history
- Client compatibility maintained (zero client code changes)

**3. PostgreSQL Database**
- Core tables: meetings, races, entrants, race_pools
- Partitioned time-series: money_flow_history, odds_history
- Automated partition management (daily partitions, 30-day retention)
- Connection pooling (10 max connections)
- Indexes optimized for client query patterns

**4. Operational Excellence**
- Docker deployment (4 CPU, 4GB RAM)
- Health check endpoints
- Structured JSON logging (Pino)
- Performance metrics tracking
- Environment variable validation (Zod)

**5. Migration Infrastructure**
- Shadow mode deployment capability
- Feature flag for instant rollback
- Performance benchmarking tools
- Data validation between old/new systems

### Out of Scope for MVP

**Deferred to Future Phases:**
- Real-time subscriptions (WebSockets/SSE)
- Advanced anomaly detection algorithms
- Machine learning predictive models
- Sub-15-second updates (dependent on NZ TAB API)
- Per-client custom polling frequencies
- Advanced monitoring dashboards (Prometheus/Grafana)
- Automated scaling/load balancing
- Multi-region deployment
- Historical data migration beyond 30 days

**Explicitly Not Included:**
- Changes to client application
- New features beyond performance improvement
- UI/UX changes
- Additional data sources beyond NZ TAB
- User authentication/authorization changes

### MVP Success Criteria

**Technical Criteria (Must Pass):**
- ✅ <15s processing for 5 concurrent races (measured)
- ✅ <2s single race fetch + transform + write
- ✅ <300ms database write per race
- ✅ <100ms API response time
- ✅ Zero `any` types in codebase
- ✅ Zero TypeScript errors, zero lint errors
- ✅ All automated tests passing
- ✅ Client app works without code changes

**Operational Criteria (Must Pass):**
- ✅ Shadow mode validation shows data consistency
- ✅ Performance benchmarks confirm 2x improvement
- ✅ Zero data loss during migration
- ✅ Feature flag rollback tested and working
- ✅ Health checks operational
- ✅ Logging and metrics captured

**Business Criteria (Must Achieve):**
- ✅ Users detect patterns in final 30-60 seconds (previously missed)
- ✅ Zero missed polling cycles during critical 5-min window
- ✅ Data freshness <30s during critical period
- ✅ No user-reported missed opportunities due to system delay
- ✅ Successful production deployment with <1% rollback rate

---

## Post-MVP Vision

### Phase 2 Features

**Real-Time Subscriptions (Q2 2026)**
- WebSocket/Server-Sent Events for push notifications
- Eliminate client polling entirely
- Sub-second pattern alerts to connected clients
- Reduced server load from polling elimination

**Advanced Monitoring & Observability**
- Prometheus metrics collection
- Grafana dashboards for real-time performance
- Alerting rules for performance degradation
- Distributed tracing for bottleneck identification

**Enhanced Performance Optimizations**
- PostgreSQL query optimization based on production patterns
- Caching layer (Redis) for frequently accessed data
- CDN integration for static content
- Database read replicas for scaled read operations

### Long-term Vision

**Sub-15-Second Detection (2026+)**
- If NZ TAB API refresh rate improves, leverage existing architecture
- Current design supports <10s processing with faster upstream data
- Worker pool sizing can scale with increased API frequency

**Machine Learning Integration**
- Pattern prediction algorithms on high-frequency data
- Anomaly detection using historical money flow trends
- Predictive insights before patterns fully emerge
- Automated confidence scoring for betting signals

**Market Expansion**
- Additional race betting markets (AU, UK, US)
- Multi-region deployment for global coverage
- White-label pattern detection service
- B2B API for institutional betting platforms

### Expansion Opportunities

**Horizontal Scaling**
- Auto-scaling based on concurrent race load
- Multi-instance deployment with load balancing
- Geographic distribution for reduced latency
- Serverless compute for burst capacity

**Data Monetization**
- Historical pattern analysis API
- Premium real-time data feeds
- Research access to time-series betting data
- Predictive modeling datasets

**Platform Evolution**
- Support for additional sports/betting markets
- General-purpose real-time financial data processing
- Pattern detection as a service (PDaaS)
- Open-source worker thread framework for high-performance Node.js

---

## Technical Considerations

### Platform Requirements

**Runtime Environment:**
- **Node.js:** 22 LTS minimum (v22.0.0+)
- **TypeScript:** 5.7+ with strict mode enabled
- **PostgreSQL:** 18 (SIMD acceleration, improved UPSERT)
- **Docker:** Latest stable for containerization
- **Operating System:** Linux (production), macOS/Windows (development)

**Code Quality Standards:**
- Zero `any` types (enforced by ESLint)
- Zero lint errors (TypeScript ESLint strict rules)
- Zero type errors (strict null checks, no implicit any)
- Runtime validation with Zod for all external data
- Pre-commit hooks (Husky + lint-staged)

**Infrastructure:**
- **CPU:** 4 cores (optimal for 5 concurrent races + workers)
- **Memory:** 4GB RAM
- **Storage:** 50GB SSD (database + logs)
- **Network:** 1Gbps for NZ TAB API throughput

### Technology Preferences

**Core Stack (Non-Negotiable):**
- Node.js 22 LTS - Performance, Worker Threads, long-term support
- TypeScript 5.7+ - Type safety, maintainability, developer experience
- PostgreSQL 18 - Performance improvements, partitioning, reliability
- Docker - Consistent deployment, resource isolation

**Libraries (Proven & Boring):**
- **Express** - HTTP server (stable, well-documented)
- **pg** - PostgreSQL client (native, performant)
- **Pino** - Logging (high-performance JSON logs)
- **Zod** - Runtime validation (type-safe, composable)
- **Axios** - HTTP client (reliable, well-maintained)

**Development Tools:**
- **Jest** - Testing framework
- **ESLint** - Code linting with TypeScript support
- **Prettier** - Code formatting
- **Husky** - Git hooks for quality gates

**Avoid:**
- Experimental/cutting-edge technologies
- Heavy ORMs (Prisma, TypeORM) - Use raw SQL for performance
- Complex microservices - Monolith is sufficient
- Over-engineered patterns - KISS principle

### Architecture Considerations

**Monolith vs Microservices: MONOLITH CHOSEN**
- Rationale: Minimizes network latency, shared connection pool, simpler operations
- Decision locked per architectural analysis
- Future: Can extract services if needed, but not for MVP

**Transform Location: HYBRID CHOSEN**
- Node.js Worker Threads for CPU-intensive money flow calculations
- PostgreSQL for bulk data operations
- Rationale: Maintainable business logic + performant database operations

**Concurrency Pattern: WORKER THREADS + PROMISE.ALL()**
- Worker threads (3 workers) for CPU-bound transforms
- Promise.all() for I/O-bound operations (fetch, write)
- Race-isolated calculations enable massive parallelization

**Database Strategy: BULK UPSERT**
- Multi-row UPSERT with conditional WHERE clause
- Single transaction per race (atomic)
- Connection pooling (10 max connections)
- Partitioned time-series tables (daily partitions)

**Deployment: DOCKER CONTAINER**
- Single container, 4 CPU cores, 4GB RAM
- PostgreSQL as separate container
- Docker Compose for orchestration
- Health checks and graceful shutdown

**Critical Architectural Decisions:**
All key decisions documented in [architectural-decisions.md](./architectural-decisions.md) with 10 ADRs covering:
1. Transform location
2. Execution model
3. Concurrency pattern
4. Database write strategy
5. Deployment model
6. Technology stack
7. Type safety approach
8. Testing strategy
9. Monitoring approach
10. Migration strategy

---

## Constraints and Assumptions

### Constraints

**External Constraints:**
- **NZ TAB API Refresh Rate:** Ultimate performance ceiling (unknown exact rate)
- **API Rate Limits:** Potential throttling from NZ TAB (coordinate with TAB team)
- **Client Application:** Cannot change client code for MVP (drop-in replacement required)
- **Budget:** Infrastructure costs must be comparable to Appwrite baseline

**Technical Constraints:**
- **Node.js 22 LTS Minimum:** No `any` types, strict TypeScript enforcement
- **Zero Downtime:** Migration must not disrupt active betting periods
- **Data Consistency:** Zero data loss or corruption during migration
- **Backward Compatibility:** API contract must match Appwrite exactly

**Time Constraints:**
- **Migration Timeline:** 5 weeks total (aggressive)
  - Week 1: Preparation
  - Week 2-3: Development
  - Week 4: Testing & validation
  - Week 5: Migration
- **Critical Path:** Architecture → Development → Testing (cannot parallelize)
- **Betting Season:** Must avoid peak racing calendar periods

**Resource Constraints:**
- **Development Team:** Single developer (warrick)
- **Infrastructure:** Single Docker host (4 CPU, 4GB RAM)
- **Testing Environment:** Limited to development/staging (no full production clone)

### Key Assumptions

**Performance Assumptions:**
- ✅ **Node.js/PostgreSQL is faster than Appwrite** - Validated via architecture analysis
- ✅ **2x improvement is achievable** - Target: <15s processing (vs >30s current)
- ✅ **Worker threads effective for CPU-bound transforms** - Node.js pattern proven
- ⚠️ **NZ TAB API refresh rate is ≥15s** - Unvalidated (research needed)

**Technical Assumptions:**
- ✅ **PostgreSQL 18 SIMD/UPSERT improvements deliver 20-30%** - Documented
- ✅ **All dependencies are Node.js 22 compatible** - Verified
- ✅ **Race-isolated calculations enable parallelization** - Validated via brainstorming
- ✅ **Client API contract is stable** - Must validate with client team

**Business Assumptions:**
- ⚠️ **Users will notice 2x improvement** - Assumes current delays are pain point
- ⚠️ **Insider patterns emerge in 30-60s window** - Domain knowledge (validate with users)
- ⚠️ **Faster detection = competitive advantage** - Market research needed
- ✅ **Power users are primary value segment** - Confirmed via brainstorming

**Operational Assumptions:**
- ✅ **Shadow mode validates data consistency** - Standard deployment practice
- ✅ **Feature flags enable instant rollback** - Proven pattern
- ✅ **Appwrite can run alongside new stack for 2 weeks** - Infrastructure capacity
- ⚠️ **Migration during low-traffic period is possible** - Race calendar dependent

**Risk Mitigation Assumptions:**
- ✅ **Forked codebase allows safe experimentation** - Git branch strategy
- ✅ **Gradual rollout reduces risk** - 10% → 50% → 100% traffic
- ✅ **Monitoring catches performance regressions early** - Logging + metrics
- ⚠️ **Rollback is fast enough (<5 min)** - Feature flag assumption

---

## Risks and Open Questions

### Key Risks

**Technical Risks (Medium-High Impact):**

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Node.js performance worse than expected | HIGH | LOW | Forked codebase allows testing; rollback to Appwrite if needed |
| PostgreSQL connection pool saturation | MEDIUM | MEDIUM | Monitor pool usage; increase max connections; implement queueing |
| Worker thread memory leaks | MEDIUM | LOW | Worker restart after N tasks; memory profiling |
| NZ TAB API rate limiting | HIGH | MEDIUM | Exponential backoff; cache responses; coordinate with TAB |
| Transform logic bugs vs server-old | HIGH | LOW | Unit tests; shadow mode validation; gradual rollout |

**Operational Risks (Medium Impact):**

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Data migration errors | HIGH | LOW | Dry-run migrations; validation queries; backup Appwrite data |
| Client app incompatibility | HIGH | LOW | API contract testing; integration tests; client coordination |
| Deployment failures | MEDIUM | LOW | Staged rollout; feature flags; automated rollback |
| Performance regression under load | HIGH | MEDIUM | Load testing; gradual traffic increase; monitoring |

**Business Risks (High Impact):**

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Migration delays competitive advantage | HIGH | MEDIUM | Aggressive timeline; daily standups; scope discipline |
| Users miss betting opportunities during migration | CRITICAL | LOW | Zero-downtime deployment; shadow mode; instant rollback |
| 2x improvement insufficient | MEDIUM | LOW | Architecture allows further optimization; iterative approach |
| Cost overruns (infrastructure) | MEDIUM | LOW | Cloud cost monitoring; resource right-sizing; budget alerts |

### Open Questions

**Critical Questions (Block Development):**
1. ❓ **What is NZ TAB API actual refresh rate?** - Defines performance ceiling
2. ❓ **Are there API rate limits we need to know about?** - May require throttling/caching
3. ❓ **Can client app tolerate API contract changes if needed?** - Flexibility assessment

**Important Questions (Inform Design):**
4. ❓ **What is acceptable rollback window?** - SLA for feature flag cutover
5. ❓ **How much historical data needs migration?** - 30 days assumed, validate
6. ❓ **Are there peak racing periods to avoid?** - Migration timing strategy
7. ❓ **What monitoring/alerting already exists?** - Integration vs greenfield

**Nice-to-Know Questions (Future Planning):**
8. ❓ **Will NZ TAB API improve refresh rate in future?** - Sub-15s opportunity
9. ❓ **Are there other betting markets to support?** - AU, UK, US expansion
10. ❓ **What is user tolerance for data latency?** - Define "good enough"

### Areas Needing Further Research

**Priority 1 - Pre-Development Research:**
1. **NZ TAB API Documentation Review**
   - Confirm refresh rate
   - Identify rate limits
   - Understand API stability/changes
   - **Action:** Request API docs from NZ TAB team
   - **Timeline:** Week 0 (before development starts)

2. **Current Appwrite Performance Baseline**
   - Measure actual processing times (not estimates)
   - Identify specific bottlenecks (transform vs write breakdown)
   - Document cold start frequency/impact
   - **Action:** Add instrumentation to current system
   - **Timeline:** Week 0 (parallel with architecture work)

3. **Client Application API Contract Validation**
   - Document exact API endpoints and response formats
   - Identify any undocumented dependencies
   - Confirm client-side error handling
   - **Action:** Review client codebase + integration tests
   - **Timeline:** Week 1 (during preparation phase)

**Priority 2 - During Development Research:**
4. **PostgreSQL 18 UPSERT Performance Testing**
   - Benchmark multi-row UPSERT with realistic data volumes
   - Validate 20-30% improvement claim
   - Test conditional WHERE clause performance
   - **Action:** Create isolated benchmark test
   - **Timeline:** Week 2 (early development)

5. **Worker Thread Memory Profiling**
   - Identify memory leak patterns
   - Determine optimal worker restart frequency
   - Test worker pool sizing (3 vs 4 vs 5 workers)
   - **Action:** Performance testing with memory snapshots
   - **Timeline:** Week 3 (mid-development)

**Priority 3 - Pre-Migration Research:**
6. **Shadow Mode Data Consistency Validation**
   - Define acceptable drift tolerance
   - Create automated comparison tools
   - Establish data integrity checks
   - **Action:** Build validation harness
   - **Timeline:** Week 4 (testing phase)

7. **Load Testing Under Realistic Conditions**
   - Simulate 5 concurrent races with real NZ TAB data
   - Test during actual race hours (if possible)
   - Measure performance under sustained load
   - **Action:** Load testing framework
   - **Timeline:** Week 4 (testing phase)

---

## Appendices

### A. Research Summary

**Brainstorming Session (2025-10-05)**
- Techniques: First Principles, SCAMPER, Five Whys, Assumption Reversal
- Key Insight: Competitive survival depends on sub-15s pattern detection
- Core Truth: Insider betting patterns emerge in final 30-60 seconds before race close
- Performance Ceiling: NZ TAB API refresh rate is ultimate constraint
- Full Report: [brainstorming-session-results-2025-10-05.md](./brainstorming-session-results-2025-10-05.md)

**Architecture Analysis (2025-10-05)**
- Architect: Winston (BMAD System Architect)
- Decisions: 10 ADRs covering all critical architectural choices
- Performance Target: <15s for 5 races, <2s single race
- Technology Stack: Node.js 22, PostgreSQL 18, TypeScript 5.7+
- Full Spec: [architecture-specification.md](./architecture-specification.md)

**Technical Requirements (2025-10-05)**
- Node.js 22 LTS minimum requirement
- Zero `any` types policy (TypeScript strict mode)
- All dependencies validated for Node.js 22 compatibility
- Code quality: zero lint errors, zero type errors
- Full Details: [REQUIREMENTS.md](./REQUIREMENTS.md)

### B. Stakeholder Input

**Primary Stakeholder: warrick (Product Owner/Developer)**

**Key Inputs:**
- Current system too slow for time-critical pattern detection
- Need 2x performance improvement minimum
- Preserve client compatibility (drop-in API replacement)
- Strict code quality requirements (Node 22, TypeScript strict, no `any`)
- Safe migration path required (forked codebase, shadow mode)

**Priorities:**
1. Performance above all else
2. Type safety and code quality
3. Operational simplicity (monolith over microservices)
4. Risk mitigation (feature flags, gradual rollout)

**Constraints:**
- Single developer resource
- Aggressive 5-week timeline
- Must avoid peak racing periods
- Infrastructure costs comparable to Appwrite

### C. References

**Technical Documentation:**
1. [Architecture Specification](./architecture-specification.md) - Complete system design
2. [Architectural Decisions](./architectural-decisions.md) - 10 ADRs with rationale
3. [Technical Requirements](./REQUIREMENTS.md) - Node.js 22, TypeScript strict mode
4. [TypeScript/ESLint Config](./typescript-eslint-config.md) - Complete tooling setup
5. [PostgreSQL 18 Features](./postgresql-18-features.md) - Performance improvements
6. [Developer Quick Start](./developer-quick-start.md) - Getting started guide

**Research & Analysis:**
7. [Brainstorming Session Results](./brainstorming-session-results-2025-10-05.md) - Business insights
8. [Final Summary](./FINAL-SUMMARY.md) - Executive overview

**External References:**
9. [Node.js 22 Release Notes](https://nodejs.org/en/blog/release/v22.0.0) - LTS features
10. [PostgreSQL 18 Release Notes](https://www.postgresql.org/docs/18/release-18.html) - SIMD, UPSERT
11. [TypeScript 5.7 Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) - Strict mode
12. [Zod Documentation](https://zod.dev/) - Runtime validation patterns

---

_This Product Brief serves as the foundational input for Product Requirements Document (PRD) creation._

_Next Steps: Handoff to Product Manager for PRD development using the `workflow prd` command._
