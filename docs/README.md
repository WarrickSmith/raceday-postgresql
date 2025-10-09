# Raceday PostgreSQL Migration - Documentation Index

**Project:** Appwrite to Node.js/PostgreSQL Backend Migration
**Goal:** Achieve 2x performance improvement for time-critical race data processing
**Status:** Architecture Complete, Ready for Implementation
**Last Updated:** 2025-10-05

---

## 📚 Documentation Overview

This directory contains comprehensive documentation for the Raceday PostgreSQL migration project. Start here to understand the architecture, decisions, and implementation plan.

### API Documentation
- **[NZ TAB API Documentation](./api/README.md)** - OpenAPI specification and usage guide
- **[NZ TAB OpenAPI Spec](./api/nztab-openapi.json)** - Complete API schema definition (124 KB)
- **[API Research Findings](./research-findings-nztab-api.md)** - Validated API behavior, rate limits, and best practices

### PRD Artifacts
- **[Project PRD – 2025-10-05](./PRD-raceday-postgresql-2025-10-05.md)** - Canonical requirements covering all epics
- **[Epic 002 PRD Pointer](./PRD-epic-002.md)** - Placeholder routing to the upcoming dedicated Epic 002 PRD

---

## 🚀 Quick Start

**New to the project?** Read these in order:

1. **[Brainstorming Session Results](./brainstorming-session-results-2025-10-05.md)**
   *Start here* - Understand the business context, performance requirements, and strategic insights from the planning session.

2. **[Architectural Decisions (ADR)](./architectural-decisions.md)**
   Key architectural choices explained: Why monolith? Why hybrid transforms? Why 4 CPUs?

3. **[Architecture Specification](./architecture-specification.md)**
   Complete technical specification including system design, database schema, and implementation details.

4. **[Developer Quick Start](./developer-quick-start.md)**
   Hands-on guide to get your development environment running in 5 minutes.

---

## 📋 Document Summaries

### 1. Brainstorming Session Results
**File:** [brainstorming-session-results-2025-10-05.md](./brainstorming-session-results-2025-10-05.md)
**Purpose:** Strategic planning and requirement discovery
**Key Insights:**
- **Core Problem:** 30-second delays prevent users from capitalizing on insider betting patterns
- **Root Cause:** Critical patterns emerge in final 30-60 seconds; current system too slow to detect
- **Business Impact:** Competitive survival depends on faster pattern detection
- **Performance Target:** 2x improvement (30s → 15s processing window)

**Techniques Used:**
- First Principles Thinking
- SCAMPER Method
- Five Whys Analysis
- Assumption Reversal

**Read this to understand:** WHY we're migrating and WHAT business value it delivers.

---

### 2. Architectural Decisions (ADR)
**File:** [architectural-decisions.md](./architectural-decisions.md)
**Purpose:** Document key architectural choices with rationale
**Decisions Covered:**

| ADR | Decision | Impact |
|-----|----------|--------|
| 001 | Hybrid transforms (Node.js + PostgreSQL) | Maintainable + performant |
| 002 | Monolith architecture | Minimal latency |
| 003 | Worker threads + Promise.all() | Efficient parallelization |
| 004 | Multi-row UPSERT | 10-25x faster writes |
| 005 | 4 CPU cores allocation | Optimal resources |
| 006 | Daily table partitioning | Fast queries |
| 007 | Near drop-in API | Minimal client changes |
| 008 | Circuit breakers | Resilient system |
| 009 | Shadow mode migration | Zero downtime |
| 010 | Structured logging | Observability |

**Read this to understand:** HOW we're solving the problem and WHY these specific choices.

---

### 3. Architecture Specification
**File:** [architecture-specification.md](./architecture-specification.md)
**Purpose:** Complete technical blueprint for implementation
**Contents:**

- **System Architecture:** Component diagrams, data flow, responsibilities
- **Technology Stack:** Node.js 20, PostgreSQL 18, TypeScript, Docker
- **Database Design:** Schema, indexes, partitioning strategy, migrations
- **Performance Optimization:** Bulk UPSERT, connection pooling, worker threads
- **API Design:** REST endpoints, client compatibility
- **Deployment Architecture:** Docker configuration, resource allocation
- **Migration Strategy:** 5-phase rollout plan with rollback procedures
- **Monitoring:** Metrics, logging, alerting, health checks

**Performance Targets:**
- Single race: <2s (currently ~6-10s)
- 5 concurrent races: <15s (currently >30s)
- Database write: <300ms per race

**Read this to understand:** WHAT we're building and HOW to implement it.

---

### 4. Developer Quick Start
**File:** [developer-quick-start.md](./developer-quick-start.md)
**Purpose:** Get developers productive immediately
**Includes:**

- 5-minute setup guide
- Architecture at-a-glance
- Key code files explained
- Common development tasks
- Database quick reference
- API endpoints
- Troubleshooting guide
- Testing strategy

**Read this to:** Start coding immediately.

---

## 🎯 Project Context

### Business Requirement
Detect insider betting patterns in real-time by analyzing money flow changes. Users need to see pattern changes within 15-30 seconds to place bets before the window closes.

### Current Problem (Appwrite)
- **Too Slow:** >30s to process 5 concurrent races
- **Missed Opportunities:** Users see patterns too late to act
- **Bottlenecks:**
  - Appwrite Function resource limits
  - Cold starts
  - MariaDB performance under load
  - Transform + write operations

### Solution (Node.js/PostgreSQL)
- **Performance:** <15s for 5 concurrent races (2x improvement)
- **Architecture:** Monolith with worker threads for parallelization
- **Database:** PostgreSQL with bulk UPSERT and partitioning
- **Deployment:** Docker container (4 CPU, 4GB RAM)

### Expected Outcomes
- ✅ 2x faster data processing
- ✅ 2x polling frequency (30s → 15s)
- ✅ 2x fresher data for users
- ✅ Competitive advantage in pattern detection

---

## 🏗️ Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      NZ TAB API                              │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  RACEDAY NODE.JS SERVER                      │
│                      (Monolith - 4 CPU)                      │
│                                                               │
│  Scheduler → Fetcher → Worker Pool → Race Processor → DB    │
│              (I/O)     (CPU-bound)    (Orchestrator)  (I/O)  │
│                                                      ↓        │
│                                              PostgreSQL       │
│                                           (Bulk UPSERT)      │
└───────────────────────────────────────────────┬─────────────┘
                                                │
                                      ┌─────────▼─────────┐
                                      │   Client App      │
                                      │ (Adaptive Poll)   │
                                      └───────────────────┘
```

**Key Patterns:**
- **Hybrid Transforms:** Node.js logic + PostgreSQL operations
- **Parallelization:** Worker threads (CPU) + Promise.all() (I/O)
- **Bulk Writes:** Multi-row UPSERT with conditional updates
- **Partitioning:** Daily partitions for time-series data

---

## 📊 Performance Comparison

| Metric | Appwrite (Current) | Node.js/PostgreSQL (Target) | Improvement |
|--------|-------------------|----------------------------|-------------|
| Single race processing | 6-10s | 1.2s | **5-8x faster** ✅ |
| 5 concurrent races | >30s | 6-9s | **3-5x faster** ✅ |
| Database write per race | N/A | <300ms | **Optimized** ✅ |
| Backend polling frequency | 30s | 15s | **2x faster** ✅ |
| Client polling frequency | 30s | 15s | **2x faster** ✅ |
| Data freshness | 30-60s old | 15-30s old | **2x fresher** ✅ |

---

## 🛠️ Technology Stack

### Core
- **Runtime:** Node.js 22 LTS (minimum v22.0.0) - **REQUIRED**
- **Language:** TypeScript 5.7+ (Strict mode, zero `any` types, zero lint errors)
- **Database:** PostgreSQL 18
- **Container:** Docker

### Key Libraries (Node.js 22 Compatible)
- **express** ^4.21.2 - HTTP server
- **pg** ^8.13.1 - PostgreSQL client with pooling
- **axios** ^1.7.9 - NZ TAB API client
- **node-cron** ^3.0.3 - Scheduling
- **pino** ^9.5.0 - High-performance logging
- **zod** ^3.23.8 - Runtime type validation (replaces `any` types)
- **worker_threads** - CPU parallelization (Node.js native)

### Code Quality Requirements
- ✅ TypeScript strict mode enabled
- ✅ No `any` types allowed (ESLint enforced)
- ✅ Zero lint errors policy
- ✅ All external data validated with Zod
- ✅ Pre-commit hooks enforce standards

---

## 📅 Implementation Timeline

### Phase 1: Foundation Setup (3-5 days)
- ✅ Architecture documented
- [ ] Fork codebase (raceday-postgresql)
- [ ] Rename server → server-old
- [ ] Extract business logic from server-old
- [ ] Set up development environment
- [ ] Create PostgreSQL schema

### Phase 2: Core Development (1-2 weeks)
- [ ] Database operations layer
- [ ] Worker thread transforms
- [ ] NZ TAB API fetcher
- [ ] Race processor orchestrator
- [ ] Dynamic scheduler
- [ ] REST API endpoints

### Phase 3: Testing & Validation (1 week)
- [ ] Performance benchmarks (<15s for 5 races)
- [ ] Load testing
- [ ] Integration testing
- [ ] Client compatibility testing
- [ ] Security audit

### Phase 4: Migration (3-5 days)
- [ ] Deploy shadow mode (parallel to Appwrite)
- [ ] Validate output accuracy
- [ ] Gradual cutover (10% → 50% → 100%)
- [ ] Monitor performance
- [ ] Decommission Appwrite

**Total Timeline:** 4-6 weeks

---

## ✅ Success Criteria

### Technical
- [x] Architecture designed and documented
- [ ] <15s processing for 5 concurrent races
- [ ] <300ms database write per race
- [ ] Client API compatibility maintained
- [ ] Zero data loss during migration
- [ ] All tests passing

### Business
- [ ] 2x performance improvement validated
- [ ] Users detect patterns faster
- [ ] No missed betting opportunities
- [ ] Successful production deployment
- [ ] Positive user feedback

### Operational
- [ ] Monitoring dashboards active
- [ ] Alerting rules configured
- [ ] Runbooks documented
- [ ] Team trained on new stack
- [ ] Rollback plan tested

---

## 🔗 Related Resources

### Internal
- **Legacy Code:** `../server-old/` (reference only)
- **Stories:** `./stories/` (user stories and requirements)

### External
- **PostgreSQL Docs:** https://www.postgresql.org/docs/16/
- **Node.js Worker Threads:** https://nodejs.org/api/worker_threads.html
- **Express.js:** https://expressjs.com/
- **NZ TAB API:** (internal documentation)

---

## 🚨 Critical Architectural Principles

1. **Performance First:** Every millisecond counts in 15-second processing window
2. **Boring Technology:** Proven stack (Node.js, PostgreSQL) over experimental tools
3. **Safe Experimentation:** Forked codebase allows validation before commitment
4. **Simplicity Over Complexity:** Monolith beats microservices for this use case
5. **Race Isolation:** No cross-race dependencies enables massive parallelization

---

## 📞 Getting Help

**Architecture Questions?** → Review [Architecture Specification](./architecture-specification.md)
**Implementation Questions?** → Check [Developer Quick Start](./developer-quick-start.md)
**Business Context?** → Read [Brainstorming Results](./brainstorming-session-results-2025-10-05.md)
**Why This Decision?** → See [Architectural Decisions](./architectural-decisions.md)

---

## 🎯 Next Steps

1. **Review all documentation** (start with brainstorming results)
2. **Set up development environment** (follow developer quick start)
3. **Extract business logic from server-old** (money flow calculations)
4. **Build MVP:** Single race fetch → transform → write
5. **Validate performance:** <2s per race
6. **Scale to 5 concurrent races:** <15s total
7. **Deploy shadow mode:** Validate before cutover

---

**Remember:** This migration isn't about technology preferences - it's about **competitive survival**. Every second of delay in detecting insider betting patterns directly impacts user success and business viability.

**Target:** <15s processing for 5 races (2x improvement)
**Status:** Architecture Complete ✅
**Next:** Begin Phase 1 Implementation

---

*Last updated: 2025-10-05 by Winston (BMAD System Architect)*
