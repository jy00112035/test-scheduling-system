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

### 4.3 进度计算

**当前方案（v2）：** 基于人力分配
```
progressPercentage = allocatedDays / manpowerDemand × 100
```

**旧方案（v1）：** 基于时间流逝
```
progressPercentage = elapsedDays / totalDays × 100
```
> v1 方案对未来的需求进度为 0%，已被替换。保留在 `calculateProgressPercentage()` 方法中但不再调用。

---

## 五、颜色状态逻辑

```typescript
getScheduleStatusColor(item):
  if allocatedDays < manpowerDemand → '#faad14' // 🟠 橙色：人力不满足
  if scheduleEnd < demandEnd           → '#52c41a' // 🟢 绿色：提前完成
  if scheduleEnd == demandEnd          → '#faad14' // 🟡 黄色：按时完成
  if scheduleEnd > demandEnd           → '#ff4d4f' // 🔴 红色：超出周期
  fallback                             → '#1890ff' // 🔵 蓝色：默认
```

甘特图条背景直接使用该颜色，超出测试周期时额外加红色虚线边框。

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
2. **修改 Timeline 时不要忘记占位列** → 宽度必须与甘特图行固定列一致（160px + 80px）
3. **修改甘特图行固定列宽时同步改 Timeline 占位列** → 否则对不齐
4. **`totalDays` 不能为 0** → `getTimelineRange()` 在无数据时返回 30 天默认范围
5. **`duration` 不能为 0** → `renderGanttBar` 中 `duration = endDate.diff(startDate) + 1`，同一天为 1
6. **排班可能完全超出测试周期** → test02 场景：需求仅 7/12 当天，排班 7/13-7/17，此时 `exceedsRight=true`，条框仍在 7/12 位置，红色虚线边框标识
7. **`dailySchedules` 中的日期用 `parseLocalDate()`** → 不要用 `dayjs()`
8. **后端 `@JsonFormat(pattern = "yyyy-MM-dd")` 必须加在 `LocalDate` 字段上** → 否则 Jackson 序列化为数组 [2026,7,12]

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
# - 检查 test02 条框是否在 7/12 位置（红色虚线边框）
# - 悬浮查看 tooltip 信息
# - 筛选器功能是否正常
```
