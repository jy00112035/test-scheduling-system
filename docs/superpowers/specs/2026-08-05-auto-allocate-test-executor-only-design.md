# 排班自动分配仅限"测试执行人员"

**日期:** 2026-08-05
**状态:** 已批准

## 背景

排班工作台的"按指定日期排班"和"按全部需求排班"功能目前对所有活跃人员进行分配，未考虑人员角色。需求：只有角色**仅为**"测试执行人员"的人员才参与自动分配，拥有多角色的人员（如同时是"测试组长"）应被排除。

## 范围

- **改动范围：** 仅后端 `ScheduleRecommendationService.java`
- **前端：** 无改动
- **手动排班：** 不受影响（逻辑在 `ScheduleEligibilityService`）

## 设计

### 核心逻辑

在 `ScheduleRecommendationService` 中提取公共过滤方法：

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

### 过滤条件

- 人员的 `empNo` 必须在 `users` 映射中找到对应 User
- User 的 `roles` 列表长度必须为 1
- 唯一的角色必须为 `"测试执行人员"`

### 改动点 1：`recommendInTransaction()` 方法

**现有代码（line 316-327）：**

```java
List<TestStaff> activeSnapshot = staffRepository.findByStatus(TestStaff.StaffStatus.active);
// ... excluded filter ...
List<TestStaff> staff = fetchChunks(staffIds, staffRepository::findAllByIdInForUpdate);
// ... status filter ...
```

**改动：**

在 line 326-327 之后（staff 列表已确定），加载 users 映射并过滤：

```java
// 加载 User 用于角色过滤
List<String> usernames = staff.stream().map(TestStaff::getEmpNo)
        .filter(Objects::nonNull).distinct().sorted().toList();
Map<String, User> usersForRoleFilter = fetchChunks(usernames, userRepository::findByUsernameIn)
        .stream().collect(Collectors.toMap(User::getUsername, Function.identity()));

// 仅保留角色为"测试执行人员"的人员
staff = filterByTestExecutorRole(staff, usersForRoleFilter);
staffById = staff.stream().collect(Collectors.toMap(TestStaff::getId, Function.identity()));
```

注意：原来 line 332-335 的 users 加载（用于 confidential clearance）可以复用此 users 映射，避免重复查询。

### 改动点 2：`preview()` 方法

**现有代码（line 188-194）：**

```java
List<TestStaff> activeStaff = staffRepository.findByStatus(TestStaff.StaffStatus.active);
// ... excluded filter ...
List<TestStaff> staff = activeStaff.stream()
        .filter(s -> !excluded.contains(s.getId()))
        .sorted(...)
        .toList();
```

**改动：**

在 staff 列表确定后，新增 User 加载和角色过滤：

```java
// 加载 User 用于角色过滤
List<String> usernames = staff.stream().map(TestStaff::getEmpNo)
        .filter(Objects::nonNull).distinct().sorted().toList();
Map<String, User> users = fetchChunks(usernames, userRepository::findByUsernameIn)
        .stream().collect(Collectors.toMap(User::getUsername, Function.identity()));

// 仅保留角色为"测试执行人员"的人员
staff = filterByTestExecutorRole(staff, users);
```

## 效果

- preview 和 recommend 结果一致（都经过角色过滤）
- 多角色人员不参与自动分配
- 纯"测试执行人员"正常参与分配
- 手动排班不受影响
