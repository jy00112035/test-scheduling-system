# 测试组字段重构：testGroup → testType 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 移除 `testGroup` 字段，复用现有 `testType` 字段存储测试组信息，并通过 FieldConfig 系统动态配置选项。

**架构：** 前端注册页面从 FieldConfig API 获取 `testType` 选项（动态可配置），后端审批逻辑改用 `testType` 字段进行路由匹配。移除所有 `testGroup` 相关代码。

**技术栈：** Spring Boot 3.2.10 + JPA/Hibernate + React 18 + TypeScript + Ant Design 5

---

## 文件结构

### 后端修改
| 文件 | 变更 |
|---|---|
| `backend/.../entity/User.java` | 删除 `testGroup` 字段 |
| `backend/.../dto/RegisterRequest.java` | 删除 `testGroup`，添加 `testType` |
| `backend/.../service/AuthService.java` | 注册逻辑改用 `testType`，审批逻辑改用 `testType` |
| `backend/.../repository/UserRepository.java` | 查询改用 `testType`，删除旧方法 |
| `backend/.../config/DataInitializer.java` | 删除 testLead 的 `setTestGroup`，确认 `testType` 已正确设置 |

### 前端修改
| 文件 | 变更 |
|---|---|
| `src/pages/RegisterPage.tsx` | 从 FieldConfig 获取 `testType` 选项，替换硬编码的 `testGroup` |
| `src/pages/RegistrationApproval.tsx` | 确认无 `testGroup` 引用（已通过 grep 验证） |

---

### 任务 1：后端 RegisterRequest — 替换 testGroup 为 testType

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/dto/RegisterRequest.java:30-35`

- [ ] **步骤 1：修改 RegisterRequest DTO**

将 `testGroup` 字段替换为 `testType`：

```java
// 删除：
/**
 * 所属测试组（测试执行人员必填）
 * 可选值：功能测试组、自动化测试组、性能测试组
 */
private String testGroup;

// 替换为：
/**
 * 测试类型（测试执行人员必填）
 * 选项由 FieldConfig 中 fieldName='testType' 的配置动态决定
 */
private String testType;
```

- [ ] **步骤 2：Commit**

```bash
git add backend/src/main/java/com/testscheduling/dto/RegisterRequest.java
git commit -m "refactor: replace testGroup with testType in RegisterRequest DTO"
```

---

### 任务 2：后端 User 实体 — 删除 testGroup 字段

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/entity/User.java:40-41`

- [ ] **步骤 1：删除 testGroup 字段**

从 User 实体中删除以下两行：

```java
// 删除这两行：
@Column(length = 50)
private String testGroup;
```

保留已有的 `testType` 字段（第 38 行），它将承担原 `testGroup` 的职责。

- [ ] **步骤 2：Commit**

```bash
git add backend/src/main/java/com/testscheduling/entity/User.java
git commit -m "refactor: remove testGroup field from User entity, use testType"
```

---

### 任务 3：后端 AuthService — 注册逻辑改用 testType

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/service/AuthService.java:78-83`

- [ ] **步骤 1：修改 register() 方法**

将 `testGroup` 设置逻辑替换为 `testType`：

```java
// 删除：
// 设置所属测试组
if (request.getTestGroup() != null && !request.getTestGroup().isEmpty()) {
    user.setTestGroup(request.getTestGroup());
}

// 替换为：
// 设置测试类型（测试执行人员必填，用于审批路由）
if (request.getTestType() != null && !request.getTestType().isEmpty()) {
    user.setTestType(request.getTestType());
}
```

- [ ] **步骤 2：修改 getPendingApprovals() 方法**

将审批路由逻辑从 `testGroup` 改为 `testType`：

```java
// 删除：
} else if (approverRoles.contains("testLead")) {
    // 测试组长：只能看到自己负责的测试组的测试执行人员
    String approverTestGroup = approver.getTestGroup();
    if (approverTestGroup == null || approverTestGroup.isEmpty()) {
        return new ArrayList<>();
    }
    return userRepository.findPendingTestExecutorsByTestGroup(approverTestGroup);

// 替换为：
} else if (approverRoles.contains("testLead")) {
    // 测试组长：只能看到与自己相同测试类型的测试执行人员
    String approverTestType = approver.getTestType();
    if (approverTestType == null || approverTestType.isEmpty()) {
        return new ArrayList<>();
    }
    return userRepository.findPendingTestExecutorsByTestType(approverTestType);
```

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/service/AuthService.java
git commit -m "refactor: use testType for registration and approval routing"
```

---

### 任务 4：后端 UserRepository — 替换查询方法

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/repository/UserRepository.java:29-31`

- [ ] **步骤 1：替换查询方法**

删除旧的 `findPendingTestExecutorsByTestGroup` 方法，替换为 `findPendingTestExecutorsByTestType`：

```java
// 删除：
@Query("SELECT u FROM User u WHERE u.enabled = false AND u.testGroup = :testGroup AND 'testExecutor' MEMBER OF u.roles")
List<User> findPendingTestExecutorsByTestGroup(@Param("testGroup") String testGroup);

// 替换为：
@Query("SELECT u FROM User u WHERE u.enabled = false AND u.testType = :testType AND 'testExecutor' MEMBER OF u.roles")
List<User> findPendingTestExecutorsByTestType(@Param("testType") String testType);
```

- [ ] **步骤 2：Commit**

```bash
git add backend/src/main/java/com/testscheduling/repository/UserRepository.java
git commit -m "refactor: replace findPendingTestExecutorsByTestGroup with ByTestType"
```

---

### 任务 5：后端 DataInitializer — 清理 testLead 种子数据

**文件：**
- 修改：`backend/src/main/java/com/testscheduling/config/DataInitializer.java`

- [ ] **步骤 1：检查并清理 testLead 初始化**

在 DataInitializer 中找到 testLead 用户初始化部分。如果存在 `testLead.setTestGroup(...)` 调用，删除它。确认 `testType` 已正确设置为 `"功能测试"`（与 FieldConfig 中 `testType` 的第一个选项一致）。

示例（假设当前代码）：

```java
// 删除：
testLead.setTestGroup("功能测试组");

// 确认已有（保留）：
testLead.setTestType("功能测试");
```

- [ ] **步骤 2：删除旧数据库文件并重启后端验证**

```bash
rm -f backend/data/testdb.*
# 重启后端服务
```

- [ ] **步骤 3：Commit**

```bash
git add backend/src/main/java/com/testscheduling/config/DataInitializer.java
git commit -m "refactor: remove testGroup from DataInitializer, use testType"
```

---

### 任务 6：前端 RegisterPage — 从 FieldConfig 获取 testType 选项

**文件：**
- 修改：`src/pages/RegisterPage.tsx`

- [ ] **步骤 1：添加 FieldConfig API 调用**

在组件中添加 `useEffect` 获取 FieldConfig 的 `testType` 选项：

```tsx
// 在 import 中添加 useEffect
import React, { useState, useEffect } from 'react';

// 在组件内添加状态和 effect
const [testTypeOptions, setTestTypeOptions] = useState<string[]>([]);

useEffect(() => {
  const fetchTestTypeConfig = async () => {
    try {
      const configs = await api.getFieldConfigs();
      const testTypeConfig = configs.find((c: any) => c.fieldName === 'testType');
      if (testTypeConfig && testTypeConfig.options) {
        setTestTypeOptions(testTypeConfig.options.split(',').map((s: string) => s.trim()));
      }
    } catch (error) {
      console.error('获取测试类型配置失败:', error);
    }
  };
  fetchTestTypeConfig();
}, []);
```

- [ ] **步骤 2：替换表单字段**

将 `testGroup` 字段替换为 `testType`，选项从 `testTypeOptions` 动态获取：

```tsx
// 删除：
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

// 替换为：
{selectedRoles.includes('testExecutor') && (
  <Form.Item
    name="testType"
    label="测试类型"
    rules={[{ required: true, message: '测试执行人员必须选择测试类型' }]}
  >
    <Select placeholder="请选择测试类型">
      {testTypeOptions.map(option => (
        <Option key={option} value={option}>{option}</Option>
      ))}
    </Select>
  </Form.Item>
)}
```

- [ ] **步骤 3：更新 handleSubmit 类型和字段映射**

```tsx
// 修改 handleSubmit 参数类型：
const handleSubmit = async (values: {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  roles: string[];
  testType?: string;
}) => {
  // 修改 api.register 调用：
  await api.register({
    ...values,
    role: values.roles[0],
    roles: values.roles,
    testType: values.testType,
  } as any);
```

- [ ] **步骤 4：Commit**

```bash
git add src/pages/RegisterPage.tsx
git commit -m "refactor: use testType from FieldConfig instead of hardcoded testGroup"
```

---

### 任务 7：编译验证与集成测试

- [ ] **步骤 1：后端编译验证**

```bash
mvn compile -f backend/pom.xml
```
预期：BUILD SUCCESS

- [ ] **步骤 2：删除旧数据库并重启后端**

```bash
rm -f backend/data/testdb.*
cd backend && mvn spring-boot:run &
```

- [ ] **步骤 3：验证 FieldConfig API 返回 testType**

```bash
curl -s http://localhost:8080/api/field-configs | python3 -m json.tool | grep -A5 '"testType"'
```
预期：返回包含 `options: "功能测试,自动化测试,性能测试,安全测试,兼容性测试"` 的配置

- [ ] **步骤 4：验证 testLead 登录和审批**

```bash
# 登录 testlead
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"testlead","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 查看待审批列表
curl -s http://localhost:8080/api/auth/pending-approvals \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

- [ ] **步骤 5：注册新测试执行人员验证 testType 字段**

```bash
curl -s -X POST http://localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"executor_test","password":"test123","confirmPassword":"test123","displayName":"测试执行员","roles":["testExecutor"],"testType":"功能测试"}'
```
预期：注册成功，testType 被正确保存

- [ ] **步骤 6：Commit**

```bash
git add -A
git commit -m "test: verify testType-based approval routing works correctly"
```

---

## 自检清单

1. **规格覆盖度：**
   - ✅ 移除 testGroup 字段 → 任务 2
   - ✅ 复用 testType 字段 → 任务 1, 3
   - ✅ FieldConfig 动态配置选项 → 任务 6
   - ✅ 审批逻辑更新 → 任务 3, 4
   - ✅ 注册页面更新 → 任务 6

2. **占位符扫描：** 无占位符，所有步骤包含完整代码。

3. **类型一致性：** 全链路统一使用 `testType`（DTO → Entity → Repository → Service → Frontend）。
