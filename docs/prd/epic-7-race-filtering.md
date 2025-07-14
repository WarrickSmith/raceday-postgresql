# Epic 7: Race Filtering

## Story 7.1: Create filter controls UI

**As a** user  
**I want** to see a set of filter controls on the main dashboard  
**So that** I can focus on relevant races.

#### Tasks

- Design multi-select dropdowns for filters.
- Implement filter logic on frontend.
- Persist filter state in session.

#### Acceptance Criteria

- [ ] Filters are visible and usable.
- [ ] Filter selections update dashboard view.
- [ ] Filters persist during session.

## Story 7.2: Implement filtering by Country

**As a** user  
**I want** to filter displayed meetings and races by one or more Countries  
**So that** I see only preferred locations.

#### Tasks

- Add Country filter control.
- Update dashboard data per filter.
- Test multi-country selection.

#### Acceptance Criteria

- [ ] Only selected countries are shown.
- [ ] Filter updates in real-time.
- [ ] No data bleed from other countries.

## Story 7.3: Implement filtering by Race Type

**As a** user  
**I want** to filter displayed meetings and races by Race Type (e.g., Gallops, Trots)  
**So that** I see only the races I care about.

#### Tasks

- Add Race Type filter control.
- Update dashboard data per filter.
- Support multiple race types.

#### Acceptance Criteria

- [ ] Only selected race types are shown.
- [ ] Filter updates in real-time.
- [ ] No data bleed from other types.

## Story 7.4: Apply filters to navigation

**As a** user  
**I want** my filter selections to apply to all dashboard views and navigational actions (e.g., Next Scheduled Race jumps to next filtered race)  
**So that** navigation respects my preferences.

#### Tasks

- Update navigation logic to respect filters.
- Test navigation with multiple filters.
- Handle edge cases.

#### Acceptance Criteria

- [ ] Navigation only moves to filtered races.
- [ ] No skipped or duplicate races.
- [ ] Filters persist in navigation.

## Story 7.5: Persist filters during session

**As a** user  
**I want** my filter selections to be remembered within my session  
**So that** my view is consistent.

#### Tasks

- Store filter state in session/local storage.
- Restore filters on reload.
- Clear filters on logout.

#### Acceptance Criteria

- [ ] Filters persist during session.
- [ ] Filters reset on logout.
- [ ] No stale filters remain.

---
