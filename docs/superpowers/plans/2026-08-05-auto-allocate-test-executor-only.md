# 排班自动分配仅限测试执行人员 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 排班工作台自动分配时，仅允许角色为"测试执行人员"（唯一角色）的人员参与

**架构：** 在 `ScheduleRecommendationService` 中新增 `filterByTestExecutorRole()` 私有方法，在 `preview()` 和 `recommendInTransaction()` 中加载 User 后调用过滤

**技术栈：** Java 21, Spring Boot 3.2, Jakarta Persistence

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java` | 修改 | 新增过滤方法，在两个分配入口调用 |
| `backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java` | 修改 | 新增角色过滤单元测试 |

---

### 任务 1：在 `recommendInTransaction()` 中添加角色过滤

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java:326-335`

`recommendInTransaction()` 在 line 332-335 已加载 `users` 映射（用于密级检查）。在 line 335 之后插入角色过滤，然后重建 `staffById` 和 `lockedStaffIds`。

- [ ] **步骤 1：读取现有代码确认插入点**

读取 `ScheduleRecommendationService.java` 第 326-340 行，确认 `users` 加载位置和 `staffById` / `lockedStaffIds` 的使用。

- [ ] **步骤 2：在 line 335 后插入角色过滤代码**

在 `Map<String, User> users = ...` 那行之后（line 335 后），插入：

```java
        // 仅保留角色为"测试执行人员"的人员（多角色排除）
        staff = filterByTestExecutorRole(staff, users);
        staffById = staff.stream().collect(Collectors.toMap(TestStaff::getId, Function.identity()));
        lockedStaffIds = new ArrayList<>(staffById.keySet());
```

注意 `lockedStaffIds` 从 `List<Long>` 改为重新赋值。原 line 328 的声明需改为 `List<Long> lockedStaffIds;`，然后在过滤后赋值。

- [ ] **步骤 3：调整 line 328 的声明**

将 line 328 的：
```java
        List<Long> lockedStaffIds = new ArrayList<>(staffById.keySet());
```
改为：
```java
        List<Long> lockedStaffIds;
```

这样后面过滤后可以重新赋值。

- [ ] **步骤 4：验证编译**

```bash
cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw compile -q
```
预期：编译成功

- [ ] **步骤 5：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java
git commit -m "feat: recommendInTransaction 按测试执行人员角色过滤分配人员"
```

---

### 任务 2：在 `preview()` 中添加角色过滤

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java:191-194`

`preview()` 方法在 line 191-194 确定 staff 列表后，未加载 User。需新增 User 加载和角色过滤。

- [ ] **步骤 1：在 line 194 后插入 User 加载和角色过滤**

在 `.toList();` 之后（line 194 后），插入：

```java
        // 加载 User 用于角色过滤
        List<String> usernames = staff.stream().map(TestStaff::getEmpNo)
                .filter(Objects::nonNull).distinct().sorted().toList();
        Map<String, User> users = fetchChunks(usernames, userRepository::findByUsernameIn)
                .stream().collect(Collectors.toMap(User::getUsername, Function.identity()));
        // 仅保留角色为"测试执行人员"的人员
        staff = filterByTestExecutorRole(staff, users);
```

- [ ] **步骤 2：验证编译**

```bash
cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw compile -q
```
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java
git commit -m "feat: preview 按测试执行人员角色过滤分配人员"
```

---

### 任务 3：提取 `filterByTestExecutorRole()` 公共方法

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java`（在类内添加方法）

- [ ] **步骤 1：在类末尾 `}` 之前添加私有方法**

```java
    private List<TestStaff> filterByTestExecutorRole(List<TestStaff> staff, Map<String, User> users) {
        return staff.stream().filter(s -> {
            User user = users.get(s.getEmpNo());
            if (user == null || user.getRoles() == null) return false;
            List<String> roles = user.getRoles();
            return roles.size() == 1 && "测试执行人员".equals(roles.get(0));
        }).toList();
    }
```

- [ ] **步骤 2：验证编译**

```bash
cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw compile -q
```
预期：编译成功

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java
git commit -m "feat: 提取 filterByTestExecutorRole 公共方法"
```

---

### 任务 4：单元测试

**文件：**
- 修改：`backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java`

- [ ] **步骤 1：编写 filterByTestExecutorRole 测试**

通过反射调用私有方法，或通过集成测试验证。由于是私有方法，推荐通过 `preview()` 集成测试验证过滤效果。如果测试文件已存在，追加测试；否则创建。

测试场景：
1. 人员角色仅为 `["测试执行人员"]` → 参与分配
2. 人员角色为 `["测试执行人员", "测试组长"]` → 被排除
3. 人员角色为 `["测试组长"]` → 被排除
4. 人员无 User 关联 → 被排除
5. 人员 User 无 roles → 被排除

- [ ] **步骤 2：运行测试**

```bash
cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw test -Dtest=ScheduleRecommendationServiceTest -q
```
预期：全部通过

- [ ] **步骤 3：Commit**

```bash
git add backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java
git commit -m "test: 新增角色过滤单元测试"
```

---

### 任务 5：全量回归测试

- [ ] **步骤 1：运行全量后端测试**

```bash
cd /Users/mac/Desktop/code/ceshi-v1.1/backend && ./mvnw test -q
```
预期：全部通过，无回归

- [ ] **步骤 2：推送代码**

```bash
git push gitee appmod/java-upgrade-20260521062807
```
