# 测试执行人员注册审批流程优化实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将测试执行人员的注册审批从资源主管改为测试组长，支持按测试组分配审批人

**架构：** 
- 注册时测试执行人员需选择所属测试组（功能测试组、自动化测试组、性能测试组）
- 后端根据测试组找到对应的测试组长进行审批
- 权限矩阵调整：测试组长获得审批权限，资源主管失去审批权限

**技术栈：** Spring Boot 3.2 + JPA/Hibernate + React 18 + TypeScript + Ant Design 5

---

## 文件结构

### 后端文件
| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `backend/.../dto/RegisterRequest.java` | 注册请求DTO | 修改：添加 `testGroup` 字段 |
| `backend/.../entity/User.java` | 用户实体 | 修改：添加 `testGroup` 字段 |
| `backend/.../service/AuthService.java` | 认证服务 | 修改：审批逻辑按测试组匹配组长 |
| `backend/.../config/DataInitializer.java` | 初始化数据 | 修改：测试组长设置 testGroup |
| `backend/.../repository/UserRepository.java` | 用户仓库 | 可能需要添加查询方法 |

### 前端文件
| 文件 | 职责 | 变更类型 |
|------|------|----------|
| `src/pages/RegisterPage.tsx` | 注册页面 | 修改：添加测试组选择、修改审批提示 |
| `src/context/UserRoleContext.tsx` | 权限上下文 | 修改：权限矩阵调整 |
| `src/pages/RegistrationApproval.tsx` | 注册审批页面 | 修改：标题显示逻辑 |

---

## 任务分解

### 任务 1：后端 - RegisterRequest 添加 testGroup 字段

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/dto/RegisterRequest.java`

- [ ] **步骤 1：添加 testGroup 字段**

```java
package com.testscheduling.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.util.List;

@Data
public class RegisterRequest {

    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;

    @NotBlank(message = "确认密码不能为空")
    private String confirmPassword;

    @NotBlank(message = "显示名称不能为空")
    private String displayName;

    private String role;

    private List<String> roles;

    private String familiarModules;

    /**
     * 所属测试组（测试执行人员必填）
     * 可选值：功能测试组、自动化测试组、性能测试组
     */
    private String testGroup;
}
```

- [ ] **步骤 2：验证编译**

运行：`mvn compile -f backend/pom.xml`
预期：BUILD SUCCESS

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/dto/RegisterRequest.java
git commit -m "feat: add testGroup field to RegisterRequest DTO"
```

---

### 任务 2：后端 - User 实体添加 testGroup 字段

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/entity/User.java`

- [ ] **步骤 1：添加 testGroup 字段**

在 User.java 中添加字段（在 `familiarModules` 字段之后）：

```java
@Column(length = 50)
private String testGroup;
```

- [ ] **步骤 2：验证编译**

运行：`mvn compile -f backend/pom.xml`
预期：BUILD SUCCESS

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/entity/User.java
git commit -m "feat: add testGroup field to User entity"
```

---

### 任务 3：后端 - AuthService 注册逻辑更新

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/AuthService.java`

- [ ] **步骤 1：修改 register 方法保存 testGroup**

在 `register` 方法中（约第65-86行），在 `user.setFamiliarModules(request.getFamiliarModules());` 之后添加：

```java
// 设置所属测试组
if (request.getTestGroup() != null && !request.getTestGroup().isEmpty()) {
    user.setTestGroup(request.getTestGroup());
}
```

完整修改后的 register 方法：

```java
public void register(RegisterRequest request) {
    if (!request.getPassword().equals(request.getConfirmPassword())) {
        throw new RuntimeException("两次输入的密码不一致");
    }

    if (userRepository.existsByUsername(request.getUsername())) {
        throw new RuntimeException("该用户名已被注册");
    }

    User user = new User();
    user.setUsername(request.getUsername());
    user.setPassword(passwordEncoder.encode(request.getPassword()));
    user.setDisplayName(request.getDisplayName());
    user.setFamiliarModules(request.getFamiliarModules());
    
    // 设置所属测试组
    if (request.getTestGroup() != null && !request.getTestGroup().isEmpty()) {
        user.setTestGroup(request.getTestGroup());
    }
    
    if (request.getRoles() != null && !request.getRoles().isEmpty()) {
        user.setRoles(request.getRoles());
    } else {
        user.setRole(request.getRole());
    }
    user.setEnabled(false);
    userRepository.save(user);
}
```

- [ ] **步骤 2：验证编译**

运行：`mvn compile -f backend/pom.xml`
预期：BUILD SUCCESS

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/AuthService.java
git commit -m "feat: save testGroup during user registration"
```

---

### 任务 4：后端 - AuthService 审批逻辑更新

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/AuthService.java`

- [ ] **步骤 1：修改 getPendingApprovals 方法**

将现有的 `getPendingApprovals` 方法（约第88-104行）替换为：

```java
public List<User> getPendingApprovals(List<String> approverRoles, String approverUsername) {
    // 获取当前审批人信息
    User approver = userRepository.findByUsername(approverUsername)
        .orElseThrow(() -> new RuntimeException("审批人不存在"));
    
    if (approverRoles.contains("testLead") && approverRoles.contains("projectManager")) {
        // 同时是测试组长和项目经理，可以看到所有待审批
        return userRepository.findByEnabledFalse();
    } else if (approverRoles.contains("testLead")) {
        // 测试组长：只能看到自己负责的测试组的测试执行人员
        String approverTestGroup = approver.getTestGroup();
        if (approverTestGroup == null || approverTestGroup.isEmpty()) {
            return new ArrayList<>();
        }
        return userRepository.findPendingTestExecutorsByTestGroup(approverTestGroup);
    } else if (approverRoles.contains("projectManager")) {
        // 项目经理：可以看到除测试执行人员外的所有待审批
        List<User> all = userRepository.findByEnabledFalse();
        List<User> filtered = new ArrayList<>();
        for (User u : all) {
            if (!"testExecutor".equals(u.getRole())) {
                filtered.add(u);
            }
        }
        return filtered;
    }
    return new ArrayList<>();
}
```

- [ ] **步骤 2：修改 Controller 调用**

修改 `AuthController.java` 中的 `getPendingApprovals` 方法，传入当前用户名：

```java
@SuppressWarnings("unchecked")
@GetMapping("/pending-approvals")
public ApiResponse<List<User>> getPendingApprovals(HttpServletRequest httpRequest) {
    try {
        List<String> roles = (List<String>) httpRequest.getAttribute("roles");
        String username = (String) httpRequest.getAttribute("username");
        if (roles == null || roles.isEmpty()) {
            return ApiResponse.error(401, "未登录或登录已过期");
        }
        List<User> pending = authService.getPendingApprovals(roles, username);
        return ApiResponse.success(pending);
    } catch (Exception e) {
        return ApiResponse.error(e.getMessage());
    }
}
```

- [ ] **步骤 3：添加 UserRepository 查询方法**

在 `UserRepository.java` 中添加：

```java
/**
 * 查找指定测试组的待审批测试执行人员
 */
@Query("SELECT u FROM User u WHERE u.enabled = false AND u.testGroup = :testGroup AND :testExecutor MEMBER OF u.roles")
List<User> findPendingTestExecutorsByTestGroup(@Param("testGroup") String testGroup);
```

或者使用更简单的方式（如果 MEMBER OF 语法有问题）：

```java
List<User> findByEnabledFalseAndTestGroup(String testGroup);
```

然后在 service 中过滤 testExecutor 角色。

- [ ] **步骤 4：验证编译**

运行：`mvn compile -f backend/pom.xml`
预期：BUILD SUCCESS

- [ ] **步骤 5：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/AuthService.java
git add backend/src/main/java/com/testscheduling/controller/AuthController.java
git add backend/src/main/java/com/testscheduling/repository/UserRepository.java
git commit -m "feat: update approval logic to support test group based approval"
```

---

### 任务 5：后端 - DataInitializer 更新测试组长数据

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/config/DataInitializer.java`

- [ ] **步骤 1：修改测试组长初始化**

修改 `initUsers()` 方法中 testLead 的初始化（约第78-85行）：

```java
User testLead = new User();
testLead.setUsername("testlead");
testLead.setPassword(passwordEncoder.encode("test123"));
testLead.setRoles(List.of("testLead"));
testLead.setDisplayName("测试组长");
testLead.setTestType("功能测试");
testLead.setTestGroup("功能测试组");  // 新增：设置负责的测试组
testLead.setEnabled(true);
userRepository.save(testLead);
```

- [ ] **步骤 2：验证编译并重启后端**

运行：`mvn spring-boot:run -f backend/pom.xml`
预期：应用启动成功，H2数据库初始化完成

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/config/DataInitializer.java
git commit -m "feat: initialize testLead with testGroup"
```

---

### 任务 6：前端 - RegisterPage 添加测试组选择

**文件：**
- 修改：`src/pages/RegisterPage.tsx`

- [ ] **步骤 1：添加测试组状态和表单字段**

在 `RegisterPage.tsx` 中：

1. 添加状态来跟踪选择的角色：

```typescript
const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
```

2. 修改角色选择的 onChange：

```typescript
<Form.Item
  name="roles"
  label="角色"
  rules={[{ required: true, message: '请选择至少一个角色' }]}
>
  <Select 
    mode="multiple" 
    placeholder="请选择角色（可多选）"
    onChange={(values) => setSelectedRoles(values)}
  >
    <Option value="testExecutor">测试执行人员（测试组长审批）</Option>
    <Option value="testManager">测试经理（项目经理审批）</Option>
    <Option value="resourceManager">资源主管（项目经理审批）</Option>
    <Option value="projectManager">项目经理（项目经理审批）</Option>
    <Option value="fieldAdmin">字段管理员（项目经理审批）</Option>
    <Option value="testLead">测试组长（项目经理审批）</Option>
  </Select>
</Form.Item>
```

3. 在角色选择后面添加测试组选择（仅当选择了 testExecutor 时显示）：

```typescript
{selectedRoles.includes('testExecutor') && (
  <Form.Item
    name="testGroup"
    label="所属测试组"
    rules={[{ required: true, message: '测试执行人员必须选择所属测试组' }]}
  >
    <Select placeholder="请选择所属测试组">
      <Option value="功能测试组">功能测试组</Option>
      <Option value="自动化测试组">自动化测试组</Option>
      <Option value="性能测试组">性能测试组</Option>
    </Select>
  </Form.Item>
)}
```

4. 修改提交处理，包含 testGroup：

```typescript
const handleSubmit = async (values: {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  roles: string[];
  testGroup?: string;
}) => {
  setLoading(true);
  try {
    await api.register({
      ...values,
      role: values.roles[0],
      roles: values.roles,
      testGroup: values.testGroup,
    } as any);
    message.success('注册成功！请等待管理员审批后登录。');
    window.dispatchEvent(new CustomEvent('refresh-pending-counts'));
    form.resetFields();
    setSelectedRoles([]);
  } catch (error: any) {
    message.error(error.message || '注册失败');
  } finally {
    setLoading(false);
  }
};
```

- [ ] **步骤 2：验证前端编译**

运行：`npm run build`（在前端目录）
预期：编译成功，无错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/RegisterPage.tsx
git commit -m "feat: add test group selection for testExecutor registration"
```

---

### 任务 7：前端 - UserRoleContext 权限矩阵更新

**文件：**
- 修改：`src/context/UserRoleContext.tsx`

- [ ] **步骤 1：修改权限矩阵**

修改 `permissions` 对象（约第44-129行）：

1. 从 `resourceManager` 中移除 `approveRegistration`
2. 在 `testLead` 中添加 `approveRegistration`

修改后的权限矩阵：

```typescript
const permissions: Record<UserRole, string[]> = {
  testManager: [
    'viewDashboard',
    'viewTaskKanban',
    'submitTestDemand',
    'editTestDemand',
    'deleteTestDemand',
    'closeTestDemand',
    'viewTestDemands',
    'submitSupplementRequest',
    'viewReports',
    'adjustTestCycle',
    'personalCenter',
  ],
  resourceManager: [
    'viewDashboard',
    'viewTaskKanban',
    'submitTestDemand',
    'editTestDemand',
    'deleteTestDemand',
    'closeTestDemand',
    'viewTestDemands',
    'scheduleManpower',
    'aiRecommendSchedule',
    'submitSupplementRequest',
    'viewReports',
    'manageStaff',
    // 'approveRegistration',  // 已移除：测试执行人员改由测试组长审批
    'personalCenter',
  ],
  projectManager: [
    'viewDashboard',
    'viewTaskKanban',
    'submitTestDemand',
    'editTestDemand',
    'deleteTestDemand',
    'closeTestDemand',
    'viewTestDemands',
    'scheduleManpower',
    'aiRecommendSchedule',
    'approveTestDemand',
    'viewReports',
    'manageStaff',
    'approveRegistration',
    'adjustTestCycle',
    'personalCenter',
  ],
  testExecutor: [
    'viewTaskKanban',
    'personalCenter',
  ],
  fieldAdmin: [
    'viewDashboard',
    'viewTaskKanban',
    'submitTestDemand',
    'editTestDemand',
    'deleteTestDemand',
    'closeTestDemand',
    'viewTestDemands',
    'submitSupplementRequest',
    'viewReports',
    'adjustTestCycle',
    'personalCenter',
    'scheduleManpower',
    'aiRecommendSchedule',
    'manageStaff',
    'approveRegistration',
    'approveTestDemand',
    'manageBaseFields',
    'viewBaseConfig',
    'manageDailyAvailability',
  ],
  testLead: [
    'viewDashboard',
    'viewTaskKanban',
    'submitTestDemand',
    'editTestDemand',
    'deleteTestDemand',
    'closeTestDemand',
    'viewTestDemands',
    'viewReports',
    'manageDailyAvailability',
    'manageStaff',
    'approveRegistration',  // 新增：测试组长可以审批测试执行人员
    'personalCenter',
  ],
};
```

- [ ] **步骤 2：验证前端编译**

运行：`npm run build`（在前端目录）
预期：编译成功，无错误

- [ ] **步骤 3：Commit**

```bash
git add src/context/UserRoleContext.tsx
git commit -m "feat: update permission matrix - testLead gets approveRegistration"
```

---

### 任务 8：前端 - RegistrationApproval 标题更新

**文件：**
- 修改：`src/pages/RegistrationApproval.tsx`

- [ ] **步骤 1：修改标题逻辑**

修改标题显示逻辑（约第89-96行）：

```typescript
const isTestLead = roles.includes('testLead' as any);
const isProjectManager = roles.includes('projectManager' as any);
let title = '注册审批';
if (isTestLead && !isProjectManager) {
  title = '注册审批 — 测试执行人员';
} else if (isProjectManager && !isTestLead) {
  title = '注册审批 — 其他角色';
}
```

- [ ] **步骤 2：验证前端编译**

运行：`npm run build`（在前端目录）
预期：编译成功，无错误

- [ ] **步骤 3：Commit**

```bash
git add src/pages/RegistrationApproval.tsx
git commit -m "feat: update registration approval title for testLead"
```

---

### 任务 9：集成测试验证

- [ ] **步骤 1：重启后端服务**

```bash
cd backend && mvn spring-boot:run
```

等待应用启动完成。

- [ ] **步骤 2：重启前端服务**

```bash
npm run dev
```

- [ ] **步骤 3：测试注册流程**

1. 打开浏览器访问 http://localhost:3000
2. 点击"注册新账户"
3. 填写用户名、显示名称、密码
4. 选择角色为"测试执行人员"
5. 验证：应该出现"所属测试组"下拉框
6. 选择一个测试组（如"功能测试组"）
7. 提交注册
8. 验证：显示"注册成功！请等待管理员审批后登录。"

- [ ] **步骤 4：测试 testlead 审批流程**

1. 使用 testlead / test123 登录
2. 验证：左侧菜单应该显示"审批中心"
3. 进入审批中心
4. 验证：应该能看到刚才注册的测试执行人员（仅当选择的测试组是"功能测试组"）
5. 批准该用户

- [ ] **步骤 5：测试 resourcemanager 无审批权限**

1. 使用 resourcemanager / resource123 登录
2. 验证：左侧菜单不应该显示"审批中心"

- [ ] **步骤 6：测试 projectmanager 审批其他角色**

1. 使用 projectmanager / project123 登录
2. 注册一个非 testExecutor 角色的用户
3. 验证：projectmanager 应该能看到该待审批用户

- [ ] **步骤 7：最终 Commit**

```bash
git add -A
git commit -m "test: verify test executor registration approval flow"
```

---

## 自检清单

### 规格覆盖度检查

| 需求 | 对应任务 | 状态 |
|------|----------|------|
| 测试执行人员注册时选择测试组 | 任务 6 | ✅ |
| 注册页面备注改为"测试组长审批" | 任务 6 | ✅ |
| 测试组长有审批中心权限 | 任务 7 | ✅ |
| 资源主管取消审批中心权限 | 任务 7 | ✅ |
| 按测试组匹配审批组长 | 任务 4 | ✅ |
| 后端存储测试组信息 | 任务 1, 2, 3 | ✅ |
| 初始数据设置测试组长的测试组 | 任务 5 | ✅ |

### 占位符扫描

- ❌ 无 "待定"、"TODO"、"后续实现"
- ❌ 无 "添加适当的错误处理" 等模糊描述
- ❌ 无未定义的类型/函数引用

### 类型一致性检查

- `testGroup` 字段名在所有文件中一致
- 权限名称 `approveRegistration` 在所有文件中一致
- 测试组名称（功能测试组、自动化测试组、性能测试组）在前后端一致

---

## 执行方式

**计划已完成并保存到 `docs/superpowers/plans/2026-07-10-test-executor-registration-approval-by-test-lead.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
