# 按全部需求排班超出期限预警 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 当"按全部需求排班"生成的排班日期超出需求完成期限时，向用户显示预警提示，告知哪些需求超期及超期天数。

**架构：** 在 `runAllocationCore` 贪婪分配完成后，检测每个需求的排班最晚日期是否超出其 `endDate`，将超期信息附加到返回结果中；在调用方（`runFullAllocateRecommendation` 和 `runDateRecommendation`）解析超期信息并展示预警弹窗，由用户决定是否继续保存。

**技术栈：** React 18, Ant Design 5 (`Modal.warning`, `message.warning`), dayjs, TypeScript

---

## 问题分析

**根因：** `runAllocationCore`（[ScheduleWorkbench.tsx:305](src/pages/ScheduleWorkbench.tsx#L305)）的日期范围为 `[max(today, earliest startDate), today+90]`，分配算法不以 `endDate` 为硬截止。当人力不足时，排班会静默超出需求期限，用户无感知。

**影响范围：**
- `runFullAllocateRecommendation`（按全部需求排班）— 日期范围固定90天，最容易超期
- `runDateRecommendation`（按缺口需求排班）— 用户自选日期范围，也可能超期

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src/pages/workbench/workbenchTypes.ts` | 类型定义 | **修改** — 扩展 `UnfulfilledDetail` 增加超期字段 |
| `src/pages/ScheduleWorkbench.tsx` | 核心排班逻辑 + UI | **修改** — `runAllocationCore` 增加超期检测；两个 recommend 函数增加预警展示 |

---

## 任务 1：扩展 UnfulfilledDetail 类型

**文件：**
- 修改：`src/pages/workbench/workbenchTypes.ts:68-73`

- [ ] **步骤 1：添加超期字段到 UnfulfilledDetail**

在 `UnfulfilledDetail` 接口中新增 `overdueDays` 和 `overdueDates` 字段：

```typescript
export interface UnfulfilledDetail {
  product: string;
  shortage: number;
  details: Array<{ testType: string; shortage: number }>;
  reasons: string[];
  overdueDays?: number;       // 超出 endDate 的天数
  overdueDates?: string[];    // 超出 endDate 的具体日期列表
}
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：零错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/workbench/workbenchTypes.ts
git commit -m "feat: add overdueDays/overdueDates to UnfulfilledDetail type"
```

---

## 任务 2：runAllocationCore 增加超期检测

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:438-489`（unfulfilled 生成逻辑部分）

- [ ] **步骤 1：在分配完成后统计每个需求的排班最晚日期**

在 `runAllocationCore` 函数中，`for (const demand of sortedDemands)` 循环（生成 unfulfilledDetailsList 的部分），在现有 reasons 逻辑之后、`unfulfilledDetailsList.push()` 之前，添加超期检测逻辑。

具体修改位置：在 `src/pages/ScheduleWorkbench.tsx` 的 `unfulfilledDetailsList.push(...)` 调用处（约第 483 行），在 push 之前插入超期检测：

```typescript
      // 检测排班是否超出需求期限
      const demandSchedules = newSchedules.filter(s => s.demandId === demand.id);
      const endDate = dayjs(demand.endDate);
      const overdueDates = demandSchedules
        .filter(s => dayjs(s.date).isAfter(endDate, 'day'))
        .map(s => s.date);
      const uniqueOverdueDates = [...new Set(overdueDates)].sort();
      const overdueDays = uniqueOverdueDates.length;

      if (overdueDays > 0) {
        reasons.push(`排班超出完成期限 ${overdueDays} 天（最晚至 ${uniqueOverdueDates[uniqueOverdueDates.length - 1]}）`);
      }

      unfulfilledDetailsList.push({
        product: demand.product,
        shortage: Math.round(totalRemaining * 10) / 10,
        details: perTypeDetails,
        reasons,
        overdueDays: overdueDays > 0 ? overdueDays : undefined,
        overdueDates: uniqueOverdueDates.length > 0 ? uniqueOverdueDates : undefined,
      });
```

同时，需要对**已完成的需求**（即 `totalRemaining <= 0.001` 的需求）也进行超期检测。当前代码在第 445 行 `if (totalRemaining <= 0.001) continue;` 直接跳过了已完成需求。需要在这个 continue 之前也检测超期：

```typescript
      if (totalRemaining <= 0.001) {
        // 即使人力已满足，仍检测是否超出期限
        const demandSchedules = newSchedules.filter(s => s.demandId === demand.id);
        const endDate = dayjs(demand.endDate);
        const overdueDates = demandSchedules
          .filter(s => dayjs(s.date).isAfter(endDate, 'day'))
          .map(s => s.date);
        const uniqueOverdueDates = [...new Set(overdueDates)].sort();
        const overdueDays = uniqueOverdueDates.length;

        if (overdueDays > 0) {
          // 将超期需求也加入 unfulfilled 列表（仅展示超期警告，shortage 为 0）
          unfulfilledDetailsList.push({
            product: demand.product,
            shortage: 0,
            details: [],
            reasons: [`排班超出完成期限 ${overdueDays} 天（最晚至 ${uniqueOverdueDates[uniqueOverdueDates.length - 1]}）`],
            overdueDays,
            overdueDates: uniqueOverdueDates,
          });
          unfulfilledSet.add(demand.id);
        }
        continue;
      }
```

- [ ] **步骤 2：验证编译**

运行：`npx tsc --noEmit`
预期：零错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "feat: detect overdue allocations in runAllocationCore"
```

---

## 任务 3：排班完成后展示超期预警弹窗

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx` — `runFullAllocateRecommendation`（约第 620-637 行）和 `runDateRecommendation`（约第 569-579 行）

- [ ] **步骤 1：在 runFullAllocateRecommendation 中添加超期预警**

在 `persistRecommendation` 调用之前（约第 620 行），添加超期确认逻辑。当存在超期需求时，弹出确认弹窗让用户决定是否继续：

```typescript
    // 超期预警
    const overdueList = unfulfilledDetailsList.filter(u => u.overdueDays && u.overdueDays > 0);
    if (overdueList.length > 0) {
      const overdueInfo = overdueList
        .map(u => `• ${u.product}：超出期限 ${u.overdueDays} 天`)
        .join('\n');

      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '排班超出完成期限预警',
          icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
          content: (
            <div>
              <p>以下需求的排班日期已超出完成期限：</p>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#fffbe6', padding: 8, borderRadius: 4, fontSize: 13 }}>
                {overdueInfo}
              </pre>
              <p style={{ marginTop: 8, color: '#666' }}>是否仍要保存排班方案？</p>
            </div>
          ),
          okText: '继续保存',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        loadingMsg();
        message.info('已取消排班');
        return;
      }
    }
```

将此代码插入到 `runFullAllocateRecommendation` 中 `try { await persistRecommendation(...)` 之前。

同样修改 `runDateRecommendation` 函数，在 `try { await persistRecommendation(...)` 之前插入相同的超期预警逻辑。

- [ ] **步骤 2：确认 ExclamationCircleOutlined 已导入**

检查文件顶部的 antd icon 导入，确保 `ExclamationCircleOutlined` 已导入。如果没有，添加：

```typescript
import { ExclamationCircleOutlined } from '@ant-design/icons';
```

- [ ] **步骤 3：验证编译**

运行：`npx tsc --noEmit`
预期：零错误

- [ ] **步骤 4：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "feat: show overdue warning dialog before saving schedules"
```

---

## 任务 4：更新"按全部需求排班"弹窗底部提示

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:1565-1567`（fullAllocModalOpen Modal 底部提示）

- [ ] **步骤 1：更新弹窗底部说明文字**

将现有的底部提示：

```tsx
<div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
  将持续分配（最长90天）直到满足全部需求人力。已发布排班不受影响，新排班为草稿需手动发布。
</div>
```

改为：

```tsx
<div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
  将持续分配（最长90天）直到满足全部需求人力。若排班日期超出需求完成期限，将弹出预警提示。已发布排班不受影响，新排班为草稿需手动发布。
</div>
```

- [ ] **步骤 2：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "docs: update full allocate modal hint about overdue warning"
```

---

## 验证清单

1. **场景 A — 人力充足：** 所有需求在期限内排满 → 无超期预警，正常提示"全部需求已满足"
2. **场景 B — 部分超期：** 某些需求排班超出 endDate → 弹窗显示超期需求列表和天数，用户可选择继续或取消
3. **场景 C — 全部超期：** 所有需求都超出期限 → 弹窗列出所有需求，用户可选择继续或取消
4. **场景 D — 用户取消：** 超期弹窗中点"取消" → 不保存排班，提示"已取消排班"
5. **场景 E — 已完成但超期：** 人力已满足但排班日期超出 endDate → 仍显示超期预警（shortage 为 0）
6. **TypeScript 编译：** `npx tsc --noEmit` 零错误
