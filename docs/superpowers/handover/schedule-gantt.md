# 排期看板（ScheduleGantt）交接文档

> **写给未来的 AI 智能体或开发者**：这份文档帮助你快速理解排期看板的完整架构，避免踩已知的坑。

---

## 一、功能概览

排期看板是一个甘特图视图，展示每个测试需求的时间范围、排班填充状态和风险信息。

**核心概念：**
- **条框 = 测试需求周期**（`startDate` → `endDate`），严格按需求中的测试时间显示
- **颜色 = 排班状态**（排班截止日期与测试截止日期的关系 + 人力满足度）
- **每日色块 = 当天排班详情**（按天汇总的排班百分比和人数）

---

## 二、文件清单

| 层级 | 文件 | 职责 |
|------|------|------|
| 前端页面 | `src/pages/ScheduleGantt.tsx` | 甘特图 UI（~600行），包含筛选、甘特图渲染、风险弹窗 |
| 前端 API | `src/services/api.ts:245` | `getGanttView()` 调用 `/schedules/gantt-view` |
| 后端 DTO | `backend/.../dto/GanttViewItem.java` | API 返回数据结构，含内部类 `DailySchedule` |
| 后端 Service | `backend/.../service/ScheduleService.java:150` | `getGanttView()` 计算排班数据、进度、风险 |
| 后端 Controller | `backend/.../controller/ScheduleController.java:117` | `GET /schedules/gantt-view` |

---

## 三、数据流

```
后端 ScheduleService.getGanttView()
  ├── 查询所有 Schedule → 按 demandId 去重 → 获取对应的 TestDemand
  ├── 对每个需求:
  │   ├── 从 Schedule 计算 allocatedDays, remainingDays, daysToEnd
  │   ├── calculateProgressPercentageByAllocation() → progressPercentage
  │   ├── 计算 scheduleStartDate / scheduleEndDate（排班 min/max date）
  │   ├── 计算 scheduleExceedsDemand（排班结束 > 测试结束?）
  │   ├── 按日期汇总 dailySchedules（Map<LocalDate, List<Schedule>>）
  │   └── assessRisk() → riskScore + riskFactors
  └── 返回 List<GanttViewItem>
        │
        ▼
前段 api.getGanttView() → setGanttData → 筛选 → setFilteredData
  │
  ├── getTimelineRange() → timelineRange（min-3 ~ max+3 天）
  ├── renderTimeline() → 时间轴（网格线 + 周标签 + "今天"红线）
  └── renderGanttBar() → 每个需求的彩色条
```

### GanttViewItem 数据结构

| 字段 | 类型 | 来源 | 说明 |
|------|------|------|------|
| `startDate` / `endDate` | `LocalDateTime` | TestDemand | **测试需求周期**（条框范围） |
| `scheduleStartDate` / `scheduleEndDate` | `LocalDate` | 从 Schedule 计算 | **排班实际起止日期**（min/max date） |
| `manpowerDemand` | `BigDecimal` | TestDemand | 需求人力 |
| `allocatedDays` | `Double` | sum(s.percentage/100) | 已分配人力 |
| `remainingDays` | `Double` | manpower - allocated | 剩余缺口 |
| `progressPercentage` | `Double` | allocated / manpower × 100 | 基于人力分配的进度 |
| `dailySchedules` | `List<DailySchedule>` | 按日期聚合 | 每天的总排班%和人数 |
| `scheduleExceedsDemand` | `Boolean` | scheduleEnd > demandEndDate | 排班是否超出 |
| `riskScore` | `int` | assessRisk() | 风险分（超期+缺口） |
| `riskFactors` | `List<String>` | assessRisk() | 风险因素描述 |

---

## 四、关键设计决策

### 4.1 日期解析：`parseLocalDate()` —— ⚠️ 核心，不要改成 `dayjs()` 直接解析！

```typescript
const parseLocalDate = (dateStr: string): Dayjs => {
  const datePart = dateStr.substring(0, 10); // 提取 YYYY-MM-DD
  return dayjs(datePart);
};
```

**为什么必须这样做：**
- 后端 Jackson 序列化 `LocalDateTime` 为 `"2026-07-12T00:00:00"`，序列化 `LocalDate` 为 `"2026-07-12"`
- `dayjs("2026-07-12T00:00:00")` 在不同浏览器/时区中可能产生偏移
- `dayjs("2026-07-12")` 解析为本地时间，稳定一致
- **所有日期解析必须用 `parseLocalDate()`，不要用原始 `dayjs()`**

### 4.2 Timeline 与甘特图条的对齐 —— ⚠️ 核心

**布局结构：**
```
Timeline 行:  [160px占位] [80px占位] [flex:1 网格线区域]
甘特图行:     [160px产品] [80px天数] [flex:1 甘特图条区域]
```

**为什么需要占位列：**
甘特图条的 `left: X%` 百分比是相对于 `flex:1` 容器计算的。如果 Timeline 的网格线用全宽容器，同百分比会落到不同物理位置，导致日期错位。

**Timeline 行（renderTimeline）的占位列必须与甘特图行（列表行）的固定列宽保持一致！**
- 左列：`width: 160, flexShrink: 0`
- 中列：`width: 80, flexShrink: 0`

### 4.3 条框渲染：框体 + 延伸尾双层结构 —— ⚠️ 核心

条框渲染分为两层：

```
无超出时:  [=========框体(灰/绿/橙)=========]
有超出时:  [=========框体(灰/绿/橙)=========]---延伸尾(红色半透明+虚线)---
                                                    ↑
                                              排班超出日期
```

**外层容器**（透明背景，`overflow: visible`）：
- 跨越从 `min(需求开始, 排班开始)` 到 `max(需求结束, 排班结束)` 的全部日期
- 位置计算：`leftPercent`/`widthPercent` 基于 `barStart`/`barEnd`（扩展后的范围）

**延伸尾层**（仅 `hasExtension` 时渲染）：
- 填满整个外层容器
- 背景：`rgba(255, 77, 79, 0.15)`（淡红色）
- 边框：`1px dashed #ff4d4f`（红色虚线）
- 内含超出需求周期的每日排班色块（`renderDailyExtensionSchedules()`）

**框体层**（需求周期，`zIndex: 1` 浮在延伸尾上方）：
- 宽度 = 需求周期占条框的比例（`demandWidthPercent`）
- 位置 = 需求开始相对条框开始的偏移（`demandLeftPercent`）
- 填充：`scheduleColor`（`getScheduleStatusColor()` 返回值）
- 边框：`2px solid rgba(0,0,0,0.25)`（可见框线，标记需求周期边界）
- 内含需求周期内的每日排班色块（`renderDailyDemandSchedules()`）+ 产品名/进度文字

### 4.4 每日排班拆分为两个渲染函数

- **`renderDailyDemandSchedules()`**：渲染需求周期内的排班日期，位置相对于框体宽度
- **`renderDailyExtensionSchedules()`**：渲染超出需求周期的排班日期，位置相对于条框总宽度，仅 `hasExtension` 时调用

### 4.5 进度计算

**当前方案（v2）：** 基于人力分配
```
progressPercentage = allocatedDays / manpowerDemand × 100
```

**旧方案（v1）：** 基于时间流逝
```
progressPercentage = elapsedDays / totalDays × 100
```
> v1 方案对未来的需求进度为 0%，已被替换。保留在 `calculateProgressPercentage()` 方法中但不再调用。

### 4.6 时间轴每日日期标签

**时间轴刻度从每周改为每天**，每个日期列顶部显示日期数字，方便用户快速定位日期。

```typescript
// tick 生成：add(1, 'day') 而非 add(7, 'day')
const ticks: Dayjs[] = [];
let current = timelineRange.start.startOf('day');
while (current.isBefore(timelineRange.end) || current.isSame(timelineRange.end, 'day')) {
  ticks.push(current);
  current = current.add(1, 'day');
}
```

**渲染格式：**
- 每天显示日期数字（`D` 格式，10px 字号），周一蓝色加粗（`#1890ff`）
- 每月 1 日或第一个可见日额外显示"M月"（9px，灰色）
- `pointerEvents: 'none'` 避免遮挡"今天"红线

### 4.7 表头和图例冻结

图例和时间轴包裹在 `position: sticky; top: 0; zIndex: 100` 容器中，需求多时向下滚动页面，表头固定在视口顶部不消失。

```tsx
<div style={{ overflowX: 'auto' }}>
  <div style={{ minWidth: 1200 }}>
    {/* 图例 + 时间轴冻结容器 */}
    <div style={{ position: 'sticky', top: 0, zIndex: 100, background: '#fff', paddingBottom: 4 }}>
      {/* 颜色图例 */}
      {/* 时间轴 renderTimeline() */}
    </div>
    {/* 甘特图行 — 自然跟随页面滚动 */}
  </div>
</div>
```

> **注意：** `background: '#fff'` 必须设置，否则下方滚动内容穿透可见。水平滚动（`overflowX: 'auto'`）不受影响。不需要设置 `overflow-y` 或 `max-height` — 页面自然滚动，表头自动冻结。

---

## 五、颜色状态逻辑

### 框体颜色（需求周期内）

仅判断人力状态，红色不用于整个条：

```typescript
getScheduleStatusColor(item):
  if 无排班（scheduleStartDate 为空 或 dailySchedules 为空） → '#d9d9d9' // ⬜ 灰色：未排班
  if allocatedDays >= manpowerDemand && !scheduleExceedsDemand → '#52c41a' // 🟢 绿色：人力满足（未超期）
  else                                                        → '#faad14' // 🟠 橙色：人力不足/延期
```

**关键设计：绿色 = 人力满足 + 不超期（两者必须同时满足）。延期满足（虽人力够但超期）= 橙色。**

### 延伸尾颜色（超出需求周期部分）

排班日期超出需求结束日期时，框体外延伸红色半透明尾部：

```typescript
延伸背景: rgba(255, 77, 79, 0.15)  // 淡红色
延伸边框: 1px dashed #ff4d4f       // 红色虚线
延伸排班色块: rgba(255, 77, 79, opacity*0.5)  // 红色调半透明
```

**红色仅标注超期部分，不会出现在框体上。**

### 每日排班色块

- **需求周期内**：白色半透明方块（`rgba(255,255,255, opacity*0.7)`），叠加在框体底色上
- **超出部分**：红色半透明方块（`rgba(255,77,79, opacity*0.5)`），仅在延伸尾中显示

### 图例

页面顶部时间轴上方显示颜色图例，包含 4 项：未排班(灰)、人力满足-未超期(绿)、人力不足/延期(橙)、超期部分(红)。

### 第二列状态显示（四象限逻辑）

甘特图行第二列结合**超期状态 + 人力满足状态**做四象限判断，替代旧的纯时间判断：

| 超期? | 人力满足? | 显示 |
|-------|-----------|------|
| `daysToEnd < 0` | `allocatedDays >= manpowerDemand` | 红色 "超期 N 天" |
| `daysToEnd < 0` | `allocatedDays < manpowerDemand` | 红色 "超期 N 天" + 换行 + 橙色 "需求未满足" |
| `daysToEnd >= 0` | `allocatedDays >= manpowerDemand` | 绿色 `CheckCircleOutlined` 图标 ✓ |
| `daysToEnd >= 0` | `allocatedDays < manpowerDemand` | 橙色 "需求未满足" |

```typescript
{item.daysToEnd < 0 ? (
  // 已超期
  item.allocatedDays >= item.manpowerDemand ? (
    <span style={{ color: '#ff4d4f' }}>超期 {Math.abs(item.daysToEnd)} 天</span>
  ) : (
    <span>
      超期 {Math.abs(item.daysToEnd)} 天<br />
      <span style={{ color: '#faad14' }}>需求未满足</span>
    </span>
  )
) : (
  // 未超期
  item.allocatedDays >= item.manpowerDemand ? (
    <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 20 }} />
  ) : (
    <span style={{ color: '#faad14' }}>需求未满足</span>
  )
)}
```

> **注意：** 移除了旧的"今天到期"、"剩余 N 天"状态，改为图标+状态文字。

---

## 六、筛选器

| 筛选器 | 数据源 | 逻辑 |
|--------|--------|------|
| 产品（多选） | `ganttData.product` 去重 | `productFilter.includes(item.product)` |
| 状态（多选） | 固定选项 pending/scheduled/completed | `statusFilter.includes(item.status)` |
| 时间范围 | Ant Design RangePicker | `itemEnd > start AND itemStart < end` |

筛选后 `filteredData` 变化 → `timelineRange` 重新计算 → 时间轴和甘特图条重新渲染。

---

## 七、交互

- **悬浮任一甘特图条** → tooltip 显示测试周期、排班周期、人力详情、状态
- **点击 riskScore ≥ 50 的条** → 打开风险详情弹窗（Modal）
- **弹窗内容** → 产品信息、版本、优先级、测试周期、完成期限、进度、人力、风险分数、风险因素

---

## 八、已知坑点（修改前必读）

1. **不要用 `dayjs()` 直接解析日期** → 必须走 `parseLocalDate()`
2. **框体颜色只看人力状态** → 绿色需同时满足 `allocatedDays >= manpowerDemand` AND `!scheduleExceedsDemand`
3. **红色只用于超出部分的延伸尾** → 不用于整个条框，框体颜色只有灰/绿/橙
4. **修改 Timeline 时不要忘记占位列** → 宽度必须与甘特图行固定列一致（160px + 80px）
5. **修改甘特图行固定列宽时同步改 Timeline 占位列** → 否则对不齐
6. **`totalDays` 不能为 0** → `getTimelineRange()` 在无数据时返回 30 天默认范围
7. **`duration` 不能为 0** → `renderGanttBar` 中 `duration = endDate.diff(startDate) + 1`，同一天为 1
8. **框体和延伸尾是双层结构** → 外层容器 `overflow: visible`，框体 `zIndex: 1`，延伸尾在下层。两者各有一套每日排班渲染
9. **`dailySchedules` 中的日期用 `parseLocalDate()`** → 不要用 `dayjs()`
10. **后端 `@JsonFormat(pattern = "yyyy-MM-dd")` 必须加在 `LocalDate` 字段上** → 否则 Jackson 序列化为数组 [2026,7,12]
11. **图例位于 `renderTimeline()` 之前** → 修改图例时注意与 `getScheduleStatusColor()` 颜色保持一致
12. **⚠️ `daysToEnd` 计算必须用 `LocalDate` 而非 `LocalDateTime`** → `ChronoUnit.DAYS.between(LocalDateTime, LocalDateTime)` 统计完整 24 小时间隔，当 `endDate` 的时间分量与 `now` 时间分量不满足 24h 时结果会少 1 天。务必用 `.toLocalDate()` 转换后再计算：`ChronoUnit.DAYS.between(now.toLocalDate(), demand.getEndDate().toLocalDate())`。同样的问题也存在于 `calculateProgressPercentage()` 中的 `totalDays` 和 `elapsedDays` 计算。

---

## 九、API 契约

```
GET /schedules/gantt-view
Authorization: Bearer <token>
Response: { code: 200, data: GanttViewItem[], message: "success" }
```

---

## 十、验证方法

```bash
# 1. TypeScript 编译
npx tsc --noEmit

# 2. Java 编译
mvn compile -f backend/pom.xml

# 3. API 测试
curl -s "http://localhost:8080/api/schedules/gantt-view" -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; [print(f\"{i['product']}: {i['startDate']} ~ {i['endDate']} | schedule: {i.get('scheduleStartDate')} ~ {i.get('scheduleEndDate')}\") for i in json.load(sys.stdin)['data']]"

# 4. 前端验证
# - 刷新排期看板页面
# - 检查时间轴：每个日期列顶部有日期数字（周一蓝色），月初显示"M月"
# - 向下滚动：图例和时间轴表头冻结在视口顶部
# - 检查第二列：超期+满足→"超期N天"、超期+未满足→"超期N天\n需求未满足"、未超期+满足→绿色✓、未超期+未满足→"需求未满足"
# - 检查图例：4 项（灰/绿/橙/红超期部分）
# - 框体颜色：无排班→灰、人力满足+未超期→绿、人力不足/延期→橙
# - 超出部分：红色半透明延伸尾 + 红色虚线边框
# - 框体边框可见（2px solid），能清晰区分需求周期起止日期
# - 悬浮查看 tooltip 信息
# - 筛选器功能是否正常
# - API 返回的 daysToEnd 与日历天数一致（排除时间分量干扰）
```
