# 集中优先排班策略 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "concentrate first" allocation strategy to the scheduling workbench that prioritizes filling one test executor's workload to 100% (coefficient-based) before assigning to the next person.

**Architecture:** Add `AllocationStrategy` enum to the request DTO. In `ScheduleRecommendationService`, add a new `allocatePersonFirst()` method that iterates candidates (outer) then dates (inner), with a reversed load comparator. Frontend adds a Radio selector in both scheduling modals.

**Tech Stack:** Java 21, Spring Boot 3.2.10, React 18, TypeScript, Ant Design

## Global Constraints

- `allocationStrategy` defaults to `DISTRIBUTE` for backward compatibility
- Percentage allocations remain multiples of 10 (STEP_PERCENT = 10)
- Two-phase structure (special modules before general) unchanged
- Device limit (`testDeviceCount`) check unchanged
- Preview logic unchanged (only cares about totals, not per-person distribution)

---

### Task 1: Add AllocationStrategy to ScheduleRecommendationRequest

**Files:**
- Modify: `backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationRequest.java`

**Interfaces:**
- Produces: `ScheduleRecommendationRequest.AllocationStrategy` enum with values `CONCENTRATE`, `DISTRIBUTE`
- Produces: `getAllocationStrategy()` / `setAllocationStrategy()` on `ScheduleRecommendationRequest`

- [ ] **Step 1: Add enum and field to ScheduleRecommendationRequest.java**

Add the enum inside the class (after the `Mode` enum at line 8) and the field + getter/setter (after the `demandOrder` field at line 19):

```java
// After the Mode enum (line 8), add:
public enum AllocationStrategy { CONCENTRATE, DISTRIBUTE }

// After the demandOrder field (line 19), add:
private AllocationStrategy allocationStrategy = AllocationStrategy.DISTRIBUTE;

// After the demandOrder getter/setter, add:
public AllocationStrategy getAllocationStrategy() { return allocationStrategy; }
public void setAllocationStrategy(AllocationStrategy allocationStrategy) { this.allocationStrategy = allocationStrategy; }
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationRequest.java
git commit -m "feat(scheduling): add AllocationStrategy enum to recommendation request"
```

---

### Task 2: Implement allocatePersonFirst() in ScheduleRecommendationService

**Files:**
- Modify: `backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java`

**Interfaces:**
- Consumes: `ScheduleRecommendationRequest.getAllocationStrategy()`
- Consumes: Existing `available()`, `deviceFull()`, `confidentiallyEligible()`, `dates()`, `draft()`, `load()` methods
- Produces: `allocatePersonFirst()` — same signature and return type as existing `allocate()`

- [ ] **Step 1: Add the candidateComparatorConcentrate() method**

Add after the existing `candidateComparator()` method (after line 475):

```java
/** Concentrate strategy: prefer staff with highest existing load to fill them first. */
private Comparator<TestStaff> candidateComparatorConcentrate(Set<Long> fixed,
        List<LocalDate> dates, Map<Long, List<Schedule>> schedules,
        Map<String, StaffDailyStatus> statuses, String preferredLocation) {
    return Comparator.comparing((TestStaff staff) -> !fixed.contains(staff.getId()))
            .thenComparing((TestStaff staff) -> preferredLocation != null
                    && !Objects.equals(staff.getOfficeLocation(), preferredLocation))
            .thenComparing((left, right) -> Integer.compare(
                    load(right, dates, schedules), load(left, dates, schedules)))
            .thenComparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder()));
}
```

- [ ] **Step 2: Add the allocatePersonFirst() method**

Add after the existing `allocate()` method (after line 458). This method has the same signature as `allocate()` but iterates candidates (outer) then dates (inner):

```java
/**
 * Person-first allocation: iterate candidates (outer) then dates (inner).
 * Prefers staff with highest existing load, filling each to capacity before moving on.
 */
private GapDraft allocatePersonFirst(TestDemand demand, DemandManpowerDetail detail,
        DemandSpecialModule special, BigDecimal remaining, Set<Long> fixed, List<TestStaff> staff,
        Set<TestStaffModuleId> familiar, Map<String, User> users, Map<Long, List<Schedule>> allByStaff,
        Map<String, StaffDailyStatus> statuses, List<Schedule> generated,
        ScheduleRecommendationRequest request) {
    if (remaining.signum() <= 0) return null;
    List<LocalDate> allocationDates = dates(demand, request);
    if (allocationDates.isEmpty()) {
        return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(),
                remaining, "INSUFFICIENT_CAPACITY");
    }
    String preferredLocation = request.getDemandOfficePreferences() != null
            ? request.getDemandOfficePreferences().get(demand.getId()) : null;
    boolean sawQualified = false;
    boolean sawDevice = false;
    List<TestStaff> candidates = staff.stream().filter(candidate ->
                    special == null ? Objects.equals(candidate.getTestType(), detail.getTestType())
                            : familiar.contains(new TestStaffModuleId(candidate.getId(), special.getModuleId())))
            .filter(candidate -> confidentiallyEligible(demand, candidate, users))
            .sorted(candidateComparatorConcentrate(fixed, allocationDates, allByStaff, statuses, preferredLocation))
            .toList();
    sawQualified |= !candidates.isEmpty();
    for (TestStaff candidate : candidates) {
        if (remaining.compareTo(STEP) < 0) break;
        for (LocalDate date : allocationDates) {
            if (remaining.compareTo(STEP) < 0) break;
            if (available(candidate, date, allByStaff, statuses) < STEP_PERCENT) continue;
            if (deviceFull(demand, date, candidate, generated, allByStaff)) { sawDevice = true; continue; }
            int allocation = Math.min(100, Math.min(available(candidate, date, allByStaff, statuses),
                    remaining.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.FLOOR).intValue()));
            allocation = allocation - allocation % STEP_PERCENT;
            if (allocation < STEP_PERCENT) continue;
            Schedule schedule = draft(demand, detail, special, candidate, date, allocation);
            generated.add(schedule);
            allByStaff.computeIfAbsent(candidate.getId(), ignored -> new ArrayList<>()).add(schedule);
            remaining = remaining.subtract(BigDecimal.valueOf(allocation)
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.UNNECESSARY));
        }
    }
    if (remaining.signum() <= 0) return null;
    String code = sawDevice ? "DEVICE_LIMIT_REACHED" : sawQualified ? "INSUFFICIENT_CAPACITY" : "NO_QUALIFIED_STAFF";
    return new GapDraft(detail == null ? null : detail.getId(), special == null ? null : special.getId(), remaining, code);
}
```

- [ ] **Step 3: Modify recommendInTransaction() to branch on strategy**

In the `recommendInTransaction()` method, change the two `allocate()` calls in Phase 1 (line 361) and Phase 2 (line 377) to dispatch based on strategy.

Replace the Phase 1 allocate call (line 361-363):
```java
GapDraft gap = allocate(demand, detail, special,
        remainingSpecial(special, existing, generated), fixed, staff, familiar, users,
        allByStaff, statusByDate, generated, request);
```

With:
```java
GapDraft gap = request.getAllocationStrategy() == ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE
        ? allocatePersonFirst(demand, detail, special,
                remainingSpecial(special, existing, generated), fixed, staff, familiar, users,
                allByStaff, statusByDate, generated, request)
        : allocate(demand, detail, special,
                remainingSpecial(special, existing, generated), fixed, staff, familiar, users,
                allByStaff, statusByDate, generated, request);
```

Replace the Phase 2 allocate call (line 377-378):
```java
GapDraft gap = allocate(demand, detail, null, remaining, fixed, staff, familiar,
        users, allByStaff, statusByDate, generated, request);
```

With:
```java
GapDraft gap = request.getAllocationStrategy() == ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE
        ? allocatePersonFirst(demand, detail, null, remaining, fixed, staff, familiar,
                users, allByStaff, statusByDate, generated, request)
        : allocate(demand, detail, null, remaining, fixed, staff, familiar,
                users, allByStaff, statusByDate, generated, request);
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw compile -q`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java
git commit -m "feat(scheduling): implement allocatePersonFirst for concentrated strategy"
```

---

### Task 3: Add backend tests for concentrated allocation

**Files:**
- Modify: `backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java`

**Interfaces:**
- Consumes: `ScheduleRecommendationRequest.setAllocationStrategy(CONCENTRATE)`
- Consumes: `service.recommend(request)`

- [ ] **Step 1: Add test — concentrate fills one person before moving to next**

Add at the end of the test class (before the helper methods):

```java
@Test
void concentrateStrategyFillsOnePersonBeforeMovingToNext() {
    // Two staff in same testType, demand needs2.0 person-days (2 days ×100%)
    // Concentrate should fill staff A to100% on both days, not split between A and B
    TestDemand demand = demand(LocalDate.of(2026, 7, 22), LocalDate.of(2026, 7, 23));
    DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Concentrate", "2.0");
    TestStaff staffA = staff("人员A Concentrate", "功能测试 Concentrate");
    TestStaff staffB = staff("人员B Concentrate", "功能测试 Concentrate");

    ScheduleRecommendationRequest req = request(demand.getId());
    req.setAllocationStrategy(ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE);
    ScheduleRecommendationResponse result = service.recommend(req);

    assertEquals(2, result.generatedSchedules().size());
    // Both schedules should be for the same staff member (staffA, lower ID = first in sorted order)
    Long firstStaffId = result.generatedSchedules().get(0).getStaffId();
    assertEquals(firstStaffId, result.generatedSchedules().get(1).getStaffId());
    assertEquals(100, result.generatedSchedules().get(0).getPercentage());
    assertEquals(100, result.generatedSchedules().get(1).getPercentage());
    assertTrue(result.fulfillment().get(0).fullySatisfied());
}
```

- [ ] **Step 2: Add test — concentrate uses multiple demands to fill one person**

```java
@Test
void concentrateStrategyCombinesMultipleDemandsToFillOnePerson() {
    // Two demands, each needing 1.0 person-day, same testType
    // One day only, so only 100% capacity per person
    // Concentrate should fill staffA with100% from demandA, then demandB goes to staffB
    TestDemand demandA = demand();
    DemandManpowerDetail detailA = detail(demandA.getId(), "功能测试 MultiDemand", "1.0");
    TestDemand demandB = demand();
    DemandManpowerDetail detailB = detail(demandB.getId(), "功能测试 MultiDemand", "1.0");
    TestStaff staffA = staff("人员A MultiDemand", "功能测试 MultiDemand");
    TestStaff staffB = staff("人员B MultiDemand", "功能测试 MultiDemand");

    ScheduleRecommendationRequest req = request(demandA.getId(), demandB.getId());
    req.setAllocationStrategy(ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE);
    ScheduleRecommendationResponse result = service.recommend(req);

    assertEquals(2, result.generatedSchedules().size());
    // staffA gets first demand (100%), staffB gets second demand
    assertEquals(staffA.getId(), result.generatedSchedules().get(0).getStaffId());
    assertEquals(staffB.getId(), result.generatedSchedules().get(1).getStaffId());
    assertTrue(result.fulfillment().get(0).fullySatisfied());
    assertTrue(result.fulfillment().get(1).fullySatisfied());
}
```

- [ ] **Step 3: Add test — default (DISTRIBUTE) behavior unchanged**

```java
@Test
void distributeStrategySpreadsWorkAcrossStaff() {
    // Same setup as concentrate test, but with DISTRIBUTE (default)
    // Two staff, one day, demand needs2.0 person-days
    // DISTRIBUTE should split: staffA gets100%, staffB gets100%
    TestDemand demand = demand();
    DemandManpowerDetail detail = detail(demand.getId(), "功能测试 Distribute", "2.0");
    TestStaff staffA = staff("人员A Distribute", "功能测试 Distribute");
    TestStaff staffB = staff("人员B Distribute", "功能测试 Distribute");

    ScheduleRecommendationRequest req = request(demand.getId());
    // Default is DISTRIBUTE, no need to set explicitly
    ScheduleRecommendationResponse result = service.recommend(req);

    assertEquals(2, result.generatedSchedules().size());
    // Both staff should be used (one per schedule)
    assertTrue(result.fulfillment().get(0).fullySatisfied());
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw test -pl . -Dtest=ScheduleRecommendationServiceTest -q`
Expected: All tests pass (including existing tests + new tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java
git commit -m "test(scheduling): add tests for concentrated allocation strategy"
```

---

### Task 4: Add allocation strategy selector to frontend

**Files:**
- Modify: `src/pages/ScheduleWorkbench.tsx`

**Interfaces:**
- Produces: `allocationStrategy` state (`'CONCENTRATE' | 'DISTRIBUTE'`)
- Produces: `allocationStrategy` field passed in preview and recommend API calls

- [ ] **Step 1: Add state variable**

Find the state declarations near line 131-133. After the `fullAllocModalOpen` state, add:

```typescript
const [allocationStrategy, setAllocationStrategy] = useState<'CONCENTRATE' | 'DISTRIBUTE'>('DISTRIBUTE');
```

- [ ] **Step 2: Add Radio selector to "按指定日期排班" modal**

In the date recommendation modal (around line 1906, inside the `recommendStep === 1` block), add after the fixed/excluded staff selects (after the closing `</Space>` at line 1936) and before the date range picker section (line 1937):

```tsx
<div style={{ marginBottom: 12 }}>
  <div style={{ fontWeight: 500, marginBottom: 8 }}>分配策略</div>
  <Radio.Group
    value={allocationStrategy}
    onChange={(e) => setAllocationStrategy(e.target.value)}
  >
    <Space direction="vertical">
      <Radio value="CONCENTRATE">集中优先 — 优先保证一人任务 100%</Radio>
      <Radio value="DISTRIBUTE">均匀分配 — 将工作量分散给所有可用人员</Radio>
    </Space>
  </Radio.Group>
</div>
<Divider style={{ margin: '12px 0' }} />
```

- [ ] **Step 3: Add Radio selector to "按全部需求排班" modal**

In the full allocation modal (around line 2021, inside the `recommendStep === 1` block), add after the fixed/excluded staff selects (after the closing `</Space>` at line 2051) and before the weekend settings section (line 2053):

```tsx
<div style={{ marginBottom: 12 }}>
  <div style={{ fontWeight: 500, marginBottom: 8 }}>分配策略</div>
  <Radio.Group
    value={allocationStrategy}
    onChange={(e) => setAllocationStrategy(e.target.value)}
  >
    <Space direction="vertical">
      <Radio value="CONCENTRATE">集中优先 — 优先保证一人任务 100%</Radio>
      <Radio value="DISTRIBUTE">均匀分配 — 将工作量分散给所有可用人员</Radio>
    </Space>
  </Radio.Group>
</div>
<Divider style={{ margin: '12px 0' }} />
```

- [ ] **Step 4: Pass allocationStrategy in preview API call**

In `handleGoToPreview()` (around line 488), add `allocationStrategy` to the request object:

```typescript
const result = await api.previewScheduleDraft({
  mode,
  demandIds,
  allocationStrategy,  // add this line
  ...(mode === 'FIXED_RANGE' ? { ... } : {}),
  // ... rest of the request
});
```

- [ ] **Step 5: Pass allocationStrategy in recommend API call**

In `runRecommendationWithOrder()` (around line 542), add `allocationStrategy` to the request object:

```typescript
const result = await api.recommendScheduleDraft({
  mode,
  demandIds,
  allocationStrategy,  // add this line
  ...(mode === 'FIXED_RANGE' ? { ... } : {}),
  // ... rest of the request
});
```

- [ ] **Step 6: Reset allocationStrategy on modal close**

In the "按指定日期排班" modal's `onCancel` (around line 1875), add:

```typescript
setAllocationStrategy('DISTRIBUTE');
```

In the "按全部需求排班" modal's `onCancel` (around line 1992), add:

```typescript
setAllocationStrategy('DISTRIBUTE');
```

- [ ] **Step 7: Add Radio import**

Add `Radio` to the existing antd import at line 8:

```typescript
import {
  Button, Tag, Space, Modal, message, InputNumber, Descriptions, Divider,
  DatePicker, Checkbox, Card, Select, Alert, Spin, Radio,
} from 'antd';
```

- [ ] **Step 8: Verify TypeScript compilation**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1 && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "feat(scheduling): add allocation strategy selector to scheduling modals"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw test -q`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run: `cd /Users/mac/Desktop/code/ceshi-v1.1 && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual verification**

Start the application and verify:
1. Open 排班工作台 → click "按全部需求排班" → verify "分配策略" Radio appears
2. Select "集中优先" → select demands → click "下一步" → verify preview loads
3. Click "确认排班" → verify schedules are concentrated on fewer staff
4. Repeat with "按指定日期排班" modal
5. Verify default "均匀分配" produces same behavior as before
