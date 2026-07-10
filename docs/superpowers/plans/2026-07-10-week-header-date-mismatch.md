# 人力排布视图标题行日期与星期不匹配 修复计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 修复人力排布视图标题行日期与实际星期不一致的问题

**架构：** `getWeekDates` 函数直接从 `weekViewDate` 开始取 7 天，但未将起始日标准化到周一。Ant Design 的 `DatePicker picker="week"` 返回的是周一的日期，但初始化值 `dayjs()` 是当天。导致标题行从当天开始而非从周一开始，日期和星期错位。

**技术栈：** React 18, dayjs, Ant Design 5

---

## 根因分析

`ScheduleWorkbench.tsx:62` 初始化 `weekViewDate` 为 `dayjs()`（今天），`getWeekDates` 从该日期开始取 7 天，没有标准化到周一。

例如今天是周四 7 月 10 日：
- `getWeekDates` 生成 7/10 ~ 7/16
- `DAY_LABELS[date.day()]` 正确显示「周四、周五、周六...」
- 但 DatePicker 显示的是「2026-07-06」（周一），因为 picker="week" 会标准化
- 用户选择某一周时，DatePicker 返回该周的周一，表格正确显示
- **仅初始加载时错位**（从今天而非周一开始）

## 文件结构

| 文件 | 职责 | 变更 |
|------|------|------|
| `src/pages/workbench/workbenchCalculations.ts:23-25` | `getWeekDates` 函数 | 标准化到周一 |

## 修复方案

在 `getWeekDates` 中将 `weekViewDate` 标准化到当周周一，确保无论初始值是哪天，标题行都从周一开始。

---

### 任务 1：修复 getWeekDates 标准化到周一

**文件：**
- 修改：`src/pages/workbench/workbenchCalculations.ts:23-25`

- [ ] **步骤 1：修改 getWeekDates 函数**

将 `getWeekDates` 改为先标准化到周一：

```ts
export function getWeekDates(weekViewDate: dayjs.Dayjs): dayjs.Dayjs[] {
  // 标准化到当周周一（day() 返回 0=周日,1=周一,...6=周六）
  const day = weekViewDate.day();
  const mondayOffset = day === 0 ? -6 : 1 - day; // 周日回退6天，其他天回退到周一
  const startOfWeek = weekViewDate.clone().add(mondayOffset, 'day');
  return Array.from({ length: 7 }, (_, i) => startOfWeek.clone().add(i, 'day'));
}
```

- [ ] **步骤 2：验证修复**

启动开发服务器，打开人力排布工作台，确认：
1. 标题行从周一开始
2. 日期和星期标签一致
3. 切换周后仍然正确

- [ ] **步骤 3：Commit**

```bash
git add src/pages/workbench/workbenchCalculations.ts
git commit -m "fix: normalize weekDates to Monday in getWeekDates

weekViewDate initialized as dayjs() starts from today instead of
Monday, causing date headers to misalign with weekday labels.
Normalize to Monday before generating the 7-day range."
```
