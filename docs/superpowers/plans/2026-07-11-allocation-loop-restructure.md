# 自动排班分配循环重构 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 重构 `runAllocationCore` 的内层循环，从"需求优先"改为"人员优先"，使单个人员的容量可在同一天分配给多个需求，解决非整数人力无法合理分配的问题。

**架构：** 将三层循环从 `日期→需求→人员` 改为 `日期→人员→需求`。每个人员在一天内按需求优先级依次分配，剩余容量自动流转给下一个需求。需求完成后释放的人员容量可立即被其他需求复用。

**技术栈：** React 18, TypeScript, dayjs

---

## 问题分析

**当前循环结构（需求优先）：**
```
for 每个日期:
  for 每个需求(按风险排序):
    for 每个可用人员:
      分配容量给当前需求
```

**问题：** 每个需求独占其分配到的人员。当一个需求完成后，释放的人员容量无法在同一天被其他需求复用。导致：
- 3.5人/天 + 1.5人/天 的需求需要 4 天完成（本可 3 天）
- 人员在某些天半天空闲

**修复后循环结构（人员优先）：**
```
for 每个日期:
  for 每个可用人员:
    for 每个需求(按风险排序):
      如果人员还有剩余容量，分配给当前需求
```

**优势：**
- 一个人员的容量可在同一天分配给多个需求
- 需求完成后释放的容量立即可被下一个需求使用
- 设备限制、测试类型匹配等约束保持不变

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/pages/ScheduleWorkbench.tsx` | `runAllocationCore` 函数 | **修改** — 重构内层循环结构 |

仅修改一个文件中的一段代码（约 362-436 行）。

---

## 任务 1：重构 runAllocationCore 内层循环

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:362-436`（主分配循环）

- [ ] **步骤 1：替换循环结构**

将现有的三层循环：

```typescript
for (const dateStr of dateStrings) {
  const date = dayjs(dateStr);
  for (const demand of sortedDemands) {
    if (completedDemands.has(demand.id)) continue;
    if (date.isBefore(dayjs(demand.startDate), 'day')) continue;

    const neededTypes = demandNeededTypes.get(demand.id) || [];
    const allAvailable = getAvailableStaffForDate(dateStr, loadMap, activeStaffs, demand.confidential);
    const deviceCount = demand.testDeviceCount;

    for (const staff of allAvailable) {
      // ... allocation logic ...
    }

    const allDone = neededTypes.every((tt: string) =>
      (remainingByType.get(`${demand.id}-${tt}`) || 0) <= 0.001
    );
    if (allDone) completedDemands.add(demand.id);
  }
  if (completedDemands.size === sortedDemands.length) break;
}
```

替换为人员优先的循环：

```typescript
for (const dateStr of dateStrings) {
  const date = dayjs(dateStr);

  // 收集当天所有有保密需求的需求，确定是否需要保密人员
  const hasConfidential = sortedDemands.some(d => !completedDemands.has(d.id) && d.confidential);
  const allAvailable = getAvailableStaffForDate(dateStr, loadMap, activeStaffs, hasConfidential);

  for (const staff of allAvailable) {
    if (staff.capacity < 5) continue;

    for (const demand of sortedDemands) {
      if (completedDemands.has(demand.id)) continue;
      if (date.isBefore(dayjs(demand.startDate), 'day')) continue;

      const neededTypes = demandNeededTypes.get(demand.id) || [];
      const deviceCount = demand.testDeviceCount;

      // 样机限制检查
      if (deviceCount && deviceCount > 0) {
        const dcKey = `${demand.id}-${dateStr}`;
        const assignedSet = deviceStaffMap.get(dcKey);
        const alreadyAssigned = assignedSet ? assignedSet.size : 0;
        if (!assignedSet?.has(staff.id) && alreadyAssigned >= deviceCount) {
          deviceBlockedCount.set(demand.id, (deviceBlockedCount.get(demand.id) || 0) + 1);
          continue;
        }
      }

      // 测试类型匹配
      const staffTestType = staff.testType;
      const matched = neededTypes.find((tt: string) => {
        if (tt === '__ALL__') return true;
        return tt === staffTestType;
      });
      if (!matched) continue;

      const matchSet = hasMatchingStaff.get(demand.id)!;
      matchSet.add(matched);

      const typeKey = `${demand.id}-${matched}`;
      const typeRemaining = remainingByType.get(typeKey) || 0;
      if (typeRemaining <= 0.001) continue;

      const maxAlloc = Math.min(staff.capacity, 100);
      const alloc = Math.min(Math.round(typeRemaining * 100), maxAlloc);
      if (alloc < 5) {
        capacityBlockedCount.set(demand.id, (capacityBlockedCount.get(demand.id) || 0) + 1);
        continue;
      }

      newSchedules.push({
        staffId: staff.id,
        demandId: demand.id,
        date: dateStr,
        percentage: alloc,
        product: demand.product,
        testManager: demand.submittedBy || '推荐排班',
        versionType: demand.versionType,
        version: demand.version,
      });

      const key = `${staff.id}-${dateStr}`;
      loadMap.set(key, (loadMap.get(key) || 0) + alloc);
      remainingByType.set(typeKey, typeRemaining - alloc / 100);
      dateCoverageMap.get(demand.id)!.add(dateStr);

      const dcKey = `${demand.id}-${dateStr}`;
      if (!deviceStaffMap.has(dcKey)) deviceStaffMap.set(dcKey, new Set());
      deviceStaffMap.get(dcKey)!.add(staff.id);

      // 更新人员剩余容量，以便分配给下一个需求
      staff.capacity -= alloc;

      // 检查需求是否完成
      const allDone = neededTypes.every((tt: string) =>
        (remainingByType.get(`${demand.id}-${tt}`) || 0) <= 0.001
      );
      if (allDone) completedDemands.add(demand.id);

      // 人员容量用尽，跳过剩余需求
      if (staff.capacity < 5) break;
    }
  }
  if (completedDemands.size === sortedDemands.length) break;
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：零错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "refactor: restructure allocation loop from demand-first to staff-first

Staff capacity can now be split across multiple demands per day.
When a demand completes, freed capacity is immediately reused by
the next demand. Fixes non-integer manpower (e.g. 0.5) allocation
where staff would sit idle while other demands still need work."
```

---

## 验证清单

1. **场景 A — 非整数人力分配：** Demand A (T1=3.5) + Demand B (T1=1.5)，2 人 T1 → 应 3 天完成（原 4 天）
2. **场景 B — 0.5 系数人员：** Staff 系数 0.5，Demand 需要 0.5 人/天 → 恰好 1 天 50% 满足
3. **场景 C — 多测试类型：** 3 组各 0.5，3 个匹配人员 → 1 天全部满足
4. **场景 D — 设备限制：** testDeviceCount=2，3 人可用 → 第 3 人被正确跳过
5. **场景 E — 保密需求：** confidential 需求优先使用有保密权限的人员
6. **TypeScript 编译：** `npx tsc --noEmit` 零错误
