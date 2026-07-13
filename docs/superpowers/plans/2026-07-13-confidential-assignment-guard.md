# 保密项目分配权限守卫 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [x]`）语法来跟踪进度。

**目标：** 阻止保密需求被分配给无保密权限的人员，覆盖手动拖拽、排班转移、分配确认、发布等全部路径。

**架构：** 前端在 3 个操作入口（handleDrop、handleScheduleTransfer、handleAssignConfirm）增加保密权限校验，弹框提醒并阻止操作；后端在 ScheduleService.create/publish 增加服务端校验，防止 API 绕过前端限制。

**技术栈：** React 18 + Ant Design 5（Modal.warning）、Spring Boot 3 + JPA

---

## 文件结构

| 文件 | 变更类型 | 职责 |
|------|---------|------|
| `src/pages/ScheduleWorkbench.tsx` | 修改 | 3 个操作入口增加保密权限校验 |
| `backend/src/main/java/com/testscheduling/service/ScheduleService.java` | 修改 | create/publish 增加保密权限服务端校验 |
| `backend/src/main/java/com/testscheduling/entity/Demand.java` | 只读 | confidential 字段（已存在） |
| `backend/src/main/java/com/testscheduling/entity/TestStaff.java` | 只读 | 需要确认是否有 confidentialClearance 字段 |
| `backend/src/main/java/com/testscheduling/entity/User.java` | 只读 | confidentialClearance 字段（已存在） |

---

## 任务 1：前端 — handleDrop 保密权限校验

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:1070-1093`

- [x] **步骤 1：在 handleDrop 中添加保密权限校验**

在 `handleDrop` 函数中，`isAvailableForAssignment` 检查之后、业务逻辑之前，增加保密权限校验：

```typescript
// ---- 拖拽：需求放到单元格 ----
const handleDrop = useCallback((staff: StaffItem, date: string) => {
    if (!selectedDemand) return;
    if (!isAvailableForAssignment(dailyStatuses, staff.id, date)) {
      const statusLabel = DailyStatusLabels[getDailyStatus(dailyStatuses, staff.id, date) as DailyAvailabilityStatus];
      message.warning(`${staff.name}今日「${statusLabel}」，不参与测试`);
      return;
    }

    // 保密权限校验
    if (selectedDemand.confidential && !staff.confidentialClearance) {
      Modal.warning({
        title: '无法分配保密需求',
        content: `${staff.name} 不具备保密权限，无法参与保密项目「${selectedDemand.product}」的测试。`,
      });
      return;
    }

    // ... 后续原有逻辑不变
```

- [x] **步骤 2：TypeScript 编译验证**

运行：`npx tsc --noEmit`
预期：0 errors

- [x] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: handleDrop 增加保密项目分配权限校验"
```

---

## 任务 2：前端 — handleScheduleTransfer 保密权限校验

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:998-1009`

- [x] **步骤 1：在 handleScheduleTransfer 中添加保密权限校验**

在 `isAvailableForAssignment` 检查之后、样机数量校验之前，增加保密权限校验：

```typescript
const handleScheduleTransfer = async (schedule: ScheduleItem, targetStaff: StaffItem, targetDate: string) => {
    if (schedule.staffId === targetStaff.id && schedule.date === targetDate) {
      setDraggedSchedule(null);
      return;
    }

    if (!isAvailableForAssignment(dailyStatuses, targetStaff.id, targetDate)) {
      const statusLabel = DailyStatusLabels[getDailyStatus(dailyStatuses, targetStaff.id, targetDate) as DailyAvailabilityStatus];
      message.warning(`${targetStaff.name}今日「${statusLabel}」，不参与测试`);
      setDraggedSchedule(null);
      return;
    }

    // 保密权限校验
    const demand = demands.find(d => d.id === schedule.demandId);
    if (demand?.confidential && !targetStaff.confidentialClearance) {
      Modal.warning({
        title: '无法转移保密需求',
        content: `${targetStaff.name} 不具备保密权限，无法参与保密项目「${demand.product}」的测试。`,
      });
      setDraggedSchedule(null);
      return;
    }

    // ... 后续原有逻辑（样机校验 → published 分支 → API 调用）
```

- [x] **步骤 2：TypeScript 编译验证**

运行：`npx tsc --noEmit`
预期：0 errors

- [x] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: handleScheduleTransfer 增加保密项目转移权限校验"
```

---

## 任务 3：前端 — handleAssignConfirm 保密权限校验

**文件：**
- 修改：`src/pages/ScheduleWorkbench.tsx:1096-1147`

- [x] **步骤 1：在 handleAssignConfirm 中添加保密权限校验**

在函数开头，`assignTarget` 和 `selectedDemand` 检查之后，增加保密权限校验：

```typescript
const handleAssignConfirm = async () => {
    if (!assignTarget || !selectedDemand) return;

    // 保密权限校验
    if (selectedDemand.confidential && !assignTarget.staff.confidentialClearance) {
      Modal.warning({
        title: '无法分配保密需求',
        content: `${assignTarget.staff.name} 不具备保密权限，无法参与保密项目「${selectedDemand.product}」的测试。`,
      });
      return;
    }

    // ... 后续原有逻辑不变
```

- [x] **步骤 2：TypeScript 编译验证**

运行：`npx tsc --noEmit`
预期：0 errors

- [x] **步骤 3：Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx
git commit -m "fix: handleAssignConfirm 增加保密项目分配权限校验"
```

---

## 任务 4：后端 — ScheduleService 服务端保密权限校验

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/ScheduleService.java:43-46,77-83`
- 只读：`backend/src/main/java/com/testscheduling/entity/Demand.java`
- 只读：`backend/src/main/java/com/testscheduling/entity/User.java`

- [x] **步骤 1：确认实体字段**

检查 Demand 实体是否有 `confidential` 字段，User 实体是否有 `confidentialClearance` 字段，以及 Schedule 实体是否关联了 demand 和 staff。

- [x] **步骤 2：修改 ScheduleService.create 增加保密校验**

```java
@Autowired
private DemandRepository demandRepository;

@Autowired
private TestStaffRepository testStaffRepository;

@Transactional
public Schedule create(Schedule schedule) {
    // 保密权限校验
    Demand demand = demandRepository.findById(schedule.getDemand().getId()).orElse(null);
    if (demand != null && demand.getConfidential() != null && demand.getConfidential()) {
        TestStaff staff = testStaffRepository.findById(schedule.getStaff().getId()).orElse(null);
        if (staff == null || staff.getUser() == null || 
            staff.getUser().getConfidentialClearance() == null || 
            !staff.getUser().getConfidentialClearance()) {
            throw new RuntimeException(staff != null ? 
                staff.getName() + " 不具备保密权限，无法参与保密项目测试" : 
                "人员不存在");
        }
    }
    return scheduleRepository.save(schedule);
}
```

- [x] **步骤 3：修改 ScheduleService.publishByDemandId 增加保密校验**

```java
@Transactional
public void publishByDemandId(Long demandId) {
    // 保密权限校验
    Demand demand = demandRepository.findById(demandId).orElse(null);
    if (demand != null && demand.getConfidential() != null && demand.getConfidential()) {
        List<Schedule> schedules = scheduleRepository.findByDemandId(demandId);
        for (Schedule s : schedules) {
            TestStaff staff = testStaffRepository.findById(s.getStaff().getId()).orElse(null);
            if (staff == null || staff.getUser() == null || 
                staff.getUser().getConfidentialClearance() == null || 
                !staff.getUser().getConfidentialClearance()) {
                throw new RuntimeException(staff != null ? 
                    staff.getName() + " 不具备保密权限，无法发布保密项目排班" : 
                    "人员不存在");
            }
        }
    }
    scheduleRepository.findByDemandId(demandId)
        .forEach(s -> {
            s.setPublished(true);
            scheduleRepository.save(s);
        });
}
```

- [x] **步骤 4：后端编译验证**

运行：`cd /Users/mac/Desktop/code/ceshi-v1.1/backend && mvn compile -q`
预期：BUILD SUCCESS

- [x] **步骤 5：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/ScheduleService.java
git commit -m "fix: ScheduleService 增加保密项目分配/发布服务端权限校验"
```

---

## 任务 5：TypeScript 全量编译 + 端到端验证

- [x] **步骤 1：TypeScript 编译**

运行：`npx tsc --noEmit`
预期：0 errors

- [x] **步骤 2：后端编译**

运行：`cd /Users/mac/Desktop/code/ceshi-v1.1/backend && mvn compile -q`
预期：BUILD SUCCESS

- [x] **步骤 3：手动测试场景**

1. 创建一个保密需求（confidential=true）
2. 创建一个无保密权限的测试员（confidentialClearance=false）
3. 尝试将保密需求拖拽到该测试员的单元格 → 应弹出"无法分配保密需求"警告
4. 尝试将已排班的保密需求转移到该测试员 → 应弹出"无法转移保密需求"警告
5. 尝试通过分配确认对话框分配 → 应弹出警告
6. 有保密权限的测试员应能正常分配

- [x] **步骤 4：Final Commit**

```bash
git add -A
git commit -m "fix: 完成保密项目分配权限守卫（前端+后端）"
```
