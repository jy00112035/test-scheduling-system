# 修复"发布全部待发布排班"功能 Bug 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复"发布全部待发布排班"按钮的需求计数不正确和部分发布的问题

**架构：** 问题完全在前端 `ScheduleWorkbench.tsx` 的 `handlePublishAll` 方法中。后端 `publishByDemandId` 逻辑正确，会发布指定需求下的所有排班。前端过滤条件过于严格，将"人力未完全满足"的需求排除在发布范围之外。

**技术栈：** React TypeScript, Ant Design

---

## 根因分析

### Bug 1：需求计数不正确（显示 2 个，实际 5 个）

**位置**: `ScheduleWorkbench.tsx` 第 823-831 行

```typescript
const publishableDemands = demands.filter(d => {
    const hasDraft = schedules.some(s => s.demandId === d.id && !s.published);
    if (!hasDraft) return false;
    if (unfulfilledDemands.has(d.id)) return false;          // ← 过滤条件过于严格
    const hasConflict = conflictDetails.some(c =>
        schedules.some(s => s.demandId === d.id && s.staffId === c.staffId && s.date === c.date)
    );
    return !hasConflict;                                      // ← 过滤条件过于严格
});
```

`handlePublishAll` 有三个前置条件：
1. 有草稿排班（`hasDraft`）✅ 正确
2. 不在 `unfulfilledDemands` 中（人力已满足）❌ 过于严格
3. 无冲突 ❌ 过于严格

5 个需求中有 3 个因人力未完全满足被加入 `unfulfilledDemands`，最终只有 2 个需求可以发布。

### Bug 2：114 个草稿只发布 14 个（剩 100 个）

这是 Bug 1 的直接后果。只有 2 个需求通过过滤，共发布约 14 条排班，其余 3 个需求的约 100 条草稿排班未被发布。

### Bug 3：再次点击显示"没有可发布的排班"

**位置**: `ScheduleWorkbench.tsx` 第 872-876 行

发布成功后清除了 `pendingChangeDemandIds`、`selectedDemandIds`、`conflictDetails`，但**没有清除 `unfulfilledDemands`**。剩余 3 个需求仍在 `unfulfilledDemands` 中，导致再次点击时被过滤掉。

---

## 文件结构

- **修改**: `src/pages/ScheduleWorkbench.tsx:821-907` — `handlePublishAll` 方法

---

## 任务 1：修复 handlePublishAll 过滤逻辑

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:821-836`

- [ ] **步骤 1：简化 publishableDemands 过滤条件**

移除 `unfulfilledDemands` 和 `conflictDetails` 过滤，只保留 `hasDraft` 检查。"发布全部"应该发布所有有草稿排班的需求，人力满足度由推荐算法保证，不应作为发布前提。

```typescript
// ---- 发布全部 ----
const handlePublishAll = () => {
    // 筛选可发布需求：有草稿排班即可
    const publishableDemands = demands.filter(d => {
      const hasDraft = schedules.some(s => s.demandId === d.id && !s.published);
      return hasDraft;
    });

    if (publishableDemands.length === 0) {
      message.info('没有可发布的排班（需有草稿排班）');
      return;
    }
```

将 `src/pages/ScheduleWorkbench.tsx` 第 821-836 行替换为上述代码。

- [ ] **步骤 2：验证修改**

运行：`cd /Users/mac/Desktop/code/ceshi-v1.1 && npx tsc --noEmit`
预期：无类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: handlePublishAll 移除过度严格的过滤条件，发布所有有草稿的需求"
```

---

## 任务 2：发布后清除 unfulfilledDemands 状态

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:872-876`

- [ ] **步骤 1：在 onOk 回调中清除 unfulfilledDemands**

在发布成功后的状态清理代码中增加 `setUnfulfilledDemands(new Set())`。

将第 872-876 行：
```typescript
          // 清除所有状态
          setPendingChangeDemandIds(new Set());
          setSelectedDemandIds(new Set());
          setConflictDetails([]);
          clearDraftFromLocalStorage();
```

替换为：
```typescript
          // 清除所有状态
          setPendingChangeDemandIds(new Set());
          setSelectedDemandIds(new Set());
          setConflictDetails([]);
          setUnfulfilledDemands(new Set());
          clearDraftFromLocalStorage();
```

- [ ] **步骤 2：验证修改**

运行：`cd /Users/mac/Desktop/code/ceshi-v1.1 && npx tsc --noEmit`
预期：无类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: handlePublishAll 发布后清除 unfulfilledDemands 状态"
```

---

## 任务 3：手动验证

- [ ] **步骤 1：启动前后端并验证**

1. 启动后端：`cd /Users/mac/Desktop/code/ceshi-v1.1/backend && /opt/homebrew/bin/mvn spring-boot:run`
2. 启动前端：`cd /Users/mac/Desktop/code/ceshi-v1.1 && npm start`
3. 进入排班工作台，点击"按全部需求排班"
4. 点击"发布全部待发布排班"
5. 验证：提示的需求数量与实际草稿需求数量一致
6. 点击确定后，所有草稿排班变为已发布
7. 再次点击"发布全部待发布排班"，提示"没有可发布的排班"
