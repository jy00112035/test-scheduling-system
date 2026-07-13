# 修复"发布本批"与"清除未发布排班"按钮不可用

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复人力排布工作台中"发布本批"和"清除未发布排班"按钮在有可操作数据时仍然禁用的问题。

**架构：** 两个按钮的禁用逻辑分别由 `publishableDemandCount > 0` 和 `hasDraftSchedules` 控制。根因是：(1) 推荐排班完成后 `selectedDemandIds` 仍包含无法发布的需求（在 `unfulfilledDemands` 中），导致 `publishableCount` 为 0；(2) `fetchData` 未显式映射 `published` 字段，依赖展开运算符可能丢失该值。

**技术栈：** React + TypeScript + Ant Design（前端），Spring Boot + JPA/H2（后端）

---

## 文件结构

| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `src/pages/ScheduleWorkbench.tsx` | 工作台主组件，包含推荐流程和按钮状态计算 | 修改 |
| `src/pages/workbench/workbenchCalculations.ts` | 批次指标计算函数 `calculateBatchMetrics` | 修改 |
| `src/pages/workbench/WorkbenchSummaryBar.tsx` | 顶部操作栏，包含两个按钮 | 不变（禁用条件由 props 决定，问题在上游） |
| `src/pages/workbench/workbenchTypes.ts` | `ScheduleItem` 类型定义 | 不变（`published?: boolean` 已存在） |

---

## 任务 1：修复推荐排班完成后 `selectedDemandIds` 未剔除不可发布需求

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:607`（`runDateRecommendation` 函数）
- 修改：`src/pages/ScheduleWorkbench.tsx:699`（`runFullAllocateRecommendation` 函数）

**背景：** 推荐排班流程中，`handleDateRecommend`（line 1327）和 `handleFullAllocateRecommend`（line 1341）会将所有符合条件的需求 ID 加入 `selectedDemandIds`。推荐算法执行后，部分需求因人力缺口被加入 `unfulfilledDemands`。但 `selectedDemandIds` 未同步更新，导致 `calculateBatchMetrics` 中的 `publishableCount` 计算（line 306-311）将这些不可发布的需求过滤掉后，结果为 0。

- [ ] **步骤 1：在 `runDateRecommendation` 中，推荐完成后剔除不可发布需求**

在 `src/pages/ScheduleWorkbench.tsx` 中，找到 `runDateRecommendation` 函数里 `setUnfulfilledDemands(unfulfilledSet)` 之后（约 line 607），添加：

```typescript
    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

    // 剔除不可发布的需求，使"发布本批"按钮准确反映可发布数量
    setSelectedDemandIds(prev => {
      const next = new Set(prev);
      unfulfilledSet.forEach(id => next.delete(id));
      return next;
    });
```

- [ ] **步骤 2：在 `runFullAllocateRecommendation` 中，同样剔除不可发布需求**

在 `src/pages/ScheduleWorkbench.tsx` 中，找到 `runFullAllocateRecommendation` 函数里 `setUnfulfilledDemands(unfulfilledSet)` 之后（约 line 699），添加同样的逻辑：

```typescript
    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

    // 剔除不可发布的需求，使"发布本批"按钮准确反映可发布数量
    setSelectedDemandIds(prev => {
      const next = new Set(prev);
      unfulfilledSet.forEach(id => next.delete(id));
      return next;
    });
```

- [ ] **步骤 3：验证修改**

运行：`npm run build`（或项目使用的构建命令）
预期：编译通过，无 TypeScript 类型错误

- [ ] **步骤 4：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: 推荐排班完成后从 selectedDemandIds 中剔除不可发布需求

推荐排班后，部分需求因人力缺口被标记为 unfulfilled，但 selectedDemandIds
未同步更新，导致 publishableCount 为 0，'发布本批'按钮始终禁用。

现在在 runDateRecommendation 和 runFullAllocateRecommendation 完成后，
自动从 selectedDemandIds 中移除 unfulfilledDemands 中的需求。"
```

---

## 任务 2：修复 `fetchData` 未显式映射 `published` 字段

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:206-216`（`fetchData` 函数中的 `setSchedules` 调用）

**背景：** `fetchData` 中 `setSchedules` 使用 `...s` 展开运算符映射后端返回的排班数据，但未显式映射 `published` 字段。虽然后端 `Schedule` 实体默认 `published = false`，但展开运算符依赖后端响应中包含该字段。如果后端序列化异常或字段缺失，`published` 会是 `undefined`，`!undefined === true` 意味着该排班被误判为草稿——这反而会让按钮可用。但更安全的做法是显式映射并提供默认值，确保行为一致。

- [ ] **步骤 1：在 `fetchData` 的 `setSchedules` 调用中添加 `published` 映射**

在 `src/pages/ScheduleWorkbench.tsx` 中，找到 `fetchData` 函数里的 `setSchedules` 调用（约 line 206-216），修改为：

```typescript
      setSchedules(schedulesData.map((s: any) => ({
        ...s,
        id: s.id,
        staffId: s.staffId,
        date: s.date,
        percentage: s.percentage,
        product: s.product,
        versionType: s.versionType,
        demandId: s.demandId,
        testManager: s.testManager,
        published: s.published ?? false,
      })));
```

- [ ] **步骤 2：验证修改**

运行：`npm run build`
预期：编译通过，无 TypeScript 类型错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: fetchData 中显式映射 published 字段并提供默认值

避免依赖展开运算符隐式传递后端字段，确保 published 在任何情况下
都有明确的布尔值，防止'清除未发布排班'按钮状态异常。"
```

---

## 任务 3：在 `persistRecommendation` 中显式设置 `published: false`

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:565-576`（`persistRecommendation` 函数中的 `mappedSchedules`）

**背景：** `persistRecommendation` 将 `createSchedulesBatch` 返回的新排班映射到 `ScheduleItem`。当前映射包含 `published: s.published`，但未提供默认值。如果后端返回的 `published` 为 `null` 或 `undefined`（理论上不应发生，但防御性编程），会导致后续 `hasDraftSchedules` 判断异常。

- [ ] **步骤 1：在 `mappedSchedules` 映射中为 `published` 添加默认值**

在 `src/pages/ScheduleWorkbench.tsx` 中，找到 `persistRecommendation` 函数里的 `mappedSchedules` 映射（约 line 565-576），将 `published: s.published` 改为：

```typescript
    const mappedSchedules: ScheduleItem[] = savedSchedules.map((s: any) => ({
      id: s.id,
      staffId: s.staffId,
      demandId: s.demandId,
      date: s.date,
      percentage: s.percentage,
      product: s.product,
      testManager: s.testManager,
      versionType: s.versionType,
      version: s.version,
      published: s.published ?? false,
    }));
```

- [ ] **步骤 2：验证修改**

运行：`npm run build`
预期：编译通过

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: persistRecommendation 中为 published 字段添加默认值

防御性处理后端返回 published 为 null/undefined 的边界情况，
确保新创建的草稿排班始终有明确的 published=false 值。"
```

---

## 任务 4：端到端验证

- [ ] **步骤 1：启动前后端**

```bash
# 后端
cd backend && mvn spring-boot:run

# 前端
npm run dev
```

- [ ] **步骤 2：验证"发布本批"按钮**

1. 登录系统，进入人力排布工作台
2. 点击"按指定日期排班"或"按全部需求排班"
3. 选择需求和日期，点击"开始排班"
4. 推荐完成后，检查"发布本批"按钮：
   - 如果有需求被完全满足（不在 unfulfilledDemands 中），按钮应可用，显示正确的可发布数量
   - 如果所有需求都有缺口，按钮应禁用，显示"发布本批（0）"

- [ ] **步骤 3：验证"清除未发布排班"按钮**

1. 在推荐排班完成后（有草稿排班），检查"清除未发布排班"按钮应可用
2. 点击按钮，确认弹窗应显示草稿数量
3. 确认清除后，按钮应变为禁用

- [ ] **步骤 4：验证草稿恢复**

1. 推荐排班后刷新页面
2. 如果 localStorage 中有草稿，应弹出恢复提示
3. 恢复后 `selectedDemandIds` 应正确恢复

- [ ] **步骤 5：最终 Commit（如有额外修改）**

```bash
git add -A
git commit -m "fix: 完成发布本批与清除未发布排班按钮修复的端到端验证"
```

---

## 自检清单

1. **规格覆盖度：** ✅ 两个按钮的禁用问题均已覆盖——"发布本批"通过剔除 unfulfilled 需求修复，"清除未发布排班"通过显式 published 映射修复
2. **占位符扫描：** ✅ 无"待定"/"TODO"/"后续实现"等占位符
3. **类型一致性：** ✅ 所有任务中使用的 `selectedDemandIds`、`unfulfilledDemands`、`published` 类型一致
