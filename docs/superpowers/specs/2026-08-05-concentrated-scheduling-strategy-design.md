# 集中优先排班策略设计

## 背景

当前排班工作台的自动排班算法（`ScheduleRecommendationService.allocate()`）采用「按日期遍历」策略：外层循环日期，内层为每个日期找最优候选人。候选人排序优先选择空闲容量更多的人员，导致工作量被均匀分散到多个人身上。

实际业务中，用户希望优先保证某个测试执行人员的任务达到 100%（基于系数的满载），可以用多个测试需求拼凑，而不是占用多个测试执行人员、大家的工作量都不饱满。

## 需求

- 在排班工作台的「按全部需求排班」和「按指定日期排班」弹窗中，新增「分配策略」选项
- 两种策略：集中优先（新行为）和 均匀分配（现有行为，默认）
- 集中优先策略：外层遍历人员、内层遍历日期，优先填满一人再分配下一人
- 仅在当前选中的需求范围内拼凑
- 「100%」指基于系数的满载（coefficient=0.8 → 填到 80%）

## 方案

### 方案选择

| 方案 | 描述 | 优点 | 缺点 |
|---|---|---|---|
| A. 反转候选人排序 | 保持日期优先遍历，反转排序为负载高优先 | 改动最小 | 效果不完美，日期维度上无法保证同一人连续分配 |
| B. 人员优先遍历（选定） | 外层循环人员、内层循环日期 | 完美实现集中分配 | 需重构 allocate() |
| C. 两阶段分配 | 先指定主力再填缺口 | 需求有明确主力 | 过度设计，与现有约束耦合复杂 |

选定方案 B。

---

## 设计

### 1. 数据模型变更

**文件**: `ScheduleRecommendationRequest.java`

新增枚举和字段：

```java
public enum AllocationStrategy { CONCENTRATE, DISTRIBUTE }
private AllocationStrategy allocationStrategy = AllocationStrategy.DISTRIBUTE;
```

- `CONCENTRATE` — 人员优先集中分配（新行为）
- `DISTRIBUTE` — 按日期均匀分配（现有行为，作为默认值保持兼容）

默认值为 `DISTRIBUTE`，确保未传此字段的请求行为不变。

### 2. 核心算法变更

**文件**: `ScheduleRecommendationService.java`

#### 2.1 `recommendInTransaction()` 分支

在 Phase 1（特殊模块）和 Phase 2（通用分配）的循环中，根据 `allocationStrategy` 选择调用 `allocate()` 或 `allocatePersonFirst()`：

```java
// Phase 1 & Phase 2 中：
GapDraft gap = request.getAllocationStrategy() == ScheduleRecommendationRequest.AllocationStrategy.CONCENTRATE
    ? allocatePersonFirst(demand, detail, special, remaining, fixed, staff, familiar, users,
          allByStaff, statusByDate, generated, request)
    : allocate(demand, detail, special, remaining, fixed, staff, familiar, users,
          allByStaff, statusByDate, generated, request);
```

两阶段结构（特殊模块优先于通用分配）在两种策略下保持不变。

#### 2.2 新增 `allocatePersonFirst()` 方法

算法流程：

```
输入: demand, detail/special bucket, remaining manpower, staff list, ...
输出: GapDraft (如果有缺口) 或 null (分配完成)

1. 计算该需求的可用日期列表（复用现有 dates() 逻辑）
2. 过滤出有资格的候选人：
   - 通用分配：testType 匹配 + 保密资质
   - 特殊模块：模块熟悉度 + 保密资质
3. 候选人排序（CONCENTRATE 专用 comparator）：
   a. 固定人员优先
   b. 办公地点匹配优先
   c. 已有负载从高到低（反转现有逻辑）
   d. 员工 ID 确定性排序
4. FOR EACH 候选人（从负载最高开始）:
     FOR EACH 日期（按时间顺序）:
       a. 检查该人在该日的可用容量 >= 10%（STEP_PERCENT）
       b. 检查设备限制未满（deviceFull()）
       c. 分配 min(100, 可用容量, 剩余需求×100)，取整到 10 的倍数
       d. remaining -= 分配量
       e. 如果 remaining < STEP → 完成，返回 null
     END FOR
   END FOR
5. 如果 remaining > 0 → 返回 GapDraft（含缺口原因）
```

#### 2.3 新增 `candidateComparatorConcentrate()`

与现有 `candidateComparator()` 类似，但反转负载排序：

```java
private Comparator<TestStaff> candidateComparatorConcentrate(Set<Long> fixed,
        List<LocalDate> dates, Map<Long, List<Schedule>> schedules,
        Map<String, StaffDailyStatus> statuses, String preferredLocation) {
    return Comparator.comparing((TestStaff staff) -> !fixed.contains(staff.getId()))
            .thenComparing((TestStaff staff) -> preferredLocation != null
                    && !Objects.equals(staff.getOfficeLocation(), preferredLocation))
            .thenComparing((left, right) -> Integer.compare(
                    load(right, dates, schedules), load(left, dates, schedules)))  // 负载高优先
            .thenComparing(TestStaff::getId, Comparator.nullsLast(Comparator.naturalOrder()));
}
```

注意：移除了 `periodRemaining` 和 `available` 维度（这两个是用于在同负载人员中选更空闲的），CONCENTRATE 模式下不需要 — 我们就是要优先填满负载最高的人。

### 3. 前端 UI 变更

**文件**: `ScheduleWorkbench.tsx`

#### 3.1 新增状态

```typescript
const [allocationStrategy, setAllocationStrategy] = useState<'CONCENTRATE' | 'DISTRIBUTE'>('DISTRIBUTE');
```

两个弹窗共享同一 state（同一时间只有一个弹窗打开）。

#### 3.2 弹窗 UI 新增

在两个排班弹窗的 Step 1 中，固定人员/排除人员选择器下方、日期范围/周末设置上方，新增：

```tsx
<div style={{ marginBottom: 12 }}>
  <div style={{ fontWeight: 500, marginBottom: 8 }}>分配策略</div>
  <Radio.Group
    value={allocationStrategy}
    onChange={(e) => setAllocationStrategy(e.target.value)}
  >
    <Radio value="CONCENTRATE">集中优先 — 优先保证一人任务 100%</Radio>
    <Radio value="DISTRIBUTE">均匀分配 — 将工作量分散给所有可用人员</Radio>
  </Radio.Group>
</div>
```

#### 3.3 API 请求传递

在 `handleGoToPreview()` 和 `runRecommendationWithOrder()` 的请求体中增加：

```typescript
allocationStrategy,
```

#### 3.4 弹窗关闭时重置

在两个弹窗的 `onCancel` 中增加：

```typescript
setAllocationStrategy('DISTRIBUTE');
```

### 4. Preview 适配

Preview 方法 (`preview()`) 的模拟分配逻辑不需要变更。Preview 只关心总量估算（每种测试类型的总需求 vs 总容量），不涉及具体人员分配。两种策略下的总分配量和缺口估算一致。

### 5. 边界情况

| 场景 | 处理方式 |
|---|---|
| 特殊模块优先级 | 不变，Phase 1 仍优先于 Phase 2 |
| 需求间优先级 | 不变，按用户拖拽顺序或默认排序处理 |
| 设备限制 | 不变，`deviceFull()` 同样生效 |
| 已发布排班 | 不变，`replaceExistingDrafts` 逻辑不变 |
| 未传 allocationStrategy | 默认 `DISTRIBUTE`，行为与现有完全一致 |

---

## 涉及文件

| 文件 | 变更类型 |
|---|---|
| `backend/.../dto/ScheduleRecommendationRequest.java` | 新增枚举 + 字段 |
| `backend/.../service/ScheduleRecommendationService.java` | 新增 `allocatePersonFirst()` + `candidateComparatorConcentrate()`，修改 `recommendInTransaction()` 分支 |
| `src/pages/ScheduleWorkbench.tsx` | 新增 Radio 选择器 + state + 传递参数 |

## 验证

- TypeScript 编译通过
- 使用「集中优先」策略排班后，检查排班结果：同一人员在日期范围内的工作量应接近 100%，而非分散到多人
- 使用「均匀分配」策略排班后，行为应与现有完全一致
- 不传 `allocationStrategy` 字段时，行为应与现有完全一致（向后兼容）
