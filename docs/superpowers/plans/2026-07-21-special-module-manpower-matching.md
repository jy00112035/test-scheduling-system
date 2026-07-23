# Special Module Manpower Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立特殊模块字典、需求人力拆分和人员熟悉模块关系，并让自动排班、手动排班与发布统一执行特殊模块硬匹配。

**Architecture:** Spring Boot 后端作为规则权威，使用 Flyway 管理 H2/MySQL 兼容结构，以独立资格校验服务复用所有排班入口；推荐接口直接持久化草稿并返回模块级缺口。React 前端只负责录入、展示和调用接口，删除现有完整贪心分配逻辑，并用结构化归属字段判断需求是否全部满足。

**Tech Stack:** Java 21, Spring Boot 3.2, Spring Data JPA, Flyway, H2, MySQL 8, JUnit 5, Mockito, React 18, TypeScript 5, Ant Design 5, Vite 5, Vitest, Testing Library

---

## 实施原则

1. 按任务顺序实施。任务 1 至 8 建立后端权威规则，任务 9 至 13 接入前端，任务 14 完成双数据库和端到端验收。
2. 每个任务先写失败测试，确认失败原因正确，再写最小实现。
3. 不在过渡期同时启用前端旧推荐算法和后端新推荐算法；任务 13 切换成功后立即删除旧算法。
4. 不重构本功能以外的权限、审批和页面布局。
5. 所有新排班必须带 `demandManpowerDetailId`；特殊模块排班还必须带 `demandSpecialModuleId`。

## 文件结构

### 后端新增文件

| 文件 | 单一职责 |
|------|----------|
| `backend/src/main/resources/db/migration/V1__baseline_schema.sql` | 新数据库的现有系统基线结构 |
| `backend/src/main/resources/db/migration/V2__special_module_schema.sql` | 特殊模块关系和排班归属字段 |
| `backend/src/main/java/com/testscheduling/exception/BusinessException.java` | 稳定业务错误码异常 |
| `backend/src/main/java/com/testscheduling/dto/ErrorData.java` | 错误响应数据 |
| `backend/src/main/java/com/testscheduling/security/RequestRoleGuard.java` | 按 JWT 请求属性校验新接口角色 |
| `backend/src/main/java/com/testscheduling/entity/AuditLog.java` | 关键配置与排班变更审计记录 |
| `backend/src/main/java/com/testscheduling/service/AuditLogService.java` | 写入操作者和变更前后值 |
| `backend/src/main/java/com/testscheduling/entity/TestModuleConfig.java` | 特殊模块字典实体 |
| `backend/src/main/java/com/testscheduling/entity/DemandSpecialModule.java` | 需求特殊模块人力实体 |
| `backend/src/main/java/com/testscheduling/entity/TestStaffModule.java` | 人员熟悉模块关系实体 |
| `backend/src/main/java/com/testscheduling/entity/TestStaffModuleId.java` | 人员模块复合主键 |
| `backend/src/main/java/com/testscheduling/repository/TestModuleConfigRepository.java` | 模块字典查询 |
| `backend/src/main/java/com/testscheduling/repository/DemandSpecialModuleRepository.java` | 需求模块人力查询 |
| `backend/src/main/java/com/testscheduling/repository/TestStaffModuleRepository.java` | 人员模块关系查询 |
| `backend/src/main/java/com/testscheduling/service/TestModuleService.java` | 模块维护、唯一性和引用保护 |
| `backend/src/main/java/com/testscheduling/service/DemandSpecialModuleService.java` | 特殊模块聚合校验和保存 |
| `backend/src/main/java/com/testscheduling/service/StaffModuleService.java` | 人员能力全量替换和旧文本迁移 |
| `backend/src/main/java/com/testscheduling/service/ScheduleEligibilityService.java` | 所有排班入口共用的硬校验 |
| `backend/src/main/java/com/testscheduling/service/DemandFulfillmentService.java` | 模块、通用和需求满足度计算 |
| `backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java` | 两种模式的后端推荐草稿算法 |
| `backend/src/main/java/com/testscheduling/service/SchedulePublishService.java` | 发布前复核和批量发布汇总 |
| `backend/src/main/java/com/testscheduling/controller/TestModuleController.java` | 模块配置接口 |
| `backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationRequest.java` | 推荐请求契约 |
| `backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationResponse.java` | 推荐结果与缺口契约 |
| `backend/src/main/java/com/testscheduling/dto/DemandFulfillmentResponse.java` | 需求明细满足状态 |
| `backend/src/main/java/com/testscheduling/dto/BatchPublishRequest.java` | 批量发布请求 |
| `backend/src/main/java/com/testscheduling/dto/BatchPublishResponse.java` | 逐需求发布结果 |

### 前端新增文件

| 文件 | 单一职责 |
|------|----------|
| `src/components/TestModuleConfigPanel.tsx` | 字段配置中的特殊模块页签 |
| `src/components/SpecialModuleDemandEditor.tsx` | 小组、模块、人力动态行编辑器 |
| `src/utils/specialModuleCalculations.ts` | 人力拆分和提交校验纯函数 |
| `src/test/setup.ts` | Vitest DOM 测试初始化 |
| `src/components/SpecialModuleDemandEditor.test.tsx` | 表单联动组件测试 |
| `src/utils/specialModuleCalculations.test.ts` | 人力拆分纯函数测试 |
| `src/pages/workbench/DemandQueue.test.tsx` | 明细满足状态和拖拽目标测试 |

### 重点修改文件

| 文件 | 修改内容 |
|------|----------|
| `backend/pom.xml` | 加入 Flyway 和测试依赖配置 |
| `backend/src/main/resources/application.yml` | 启用迁移并将 JPA 改为 `validate` |
| `backend/src/main/java/com/testscheduling/entity/TestDemand.java` | 暴露特殊模块明细和满足状态 |
| `backend/src/main/java/com/testscheduling/entity/TestStaff.java` | 返回结构化熟悉模块 |
| `backend/src/main/java/com/testscheduling/entity/Schedule.java` | 增加两类归属字段和乐观锁版本 |
| `backend/src/main/java/com/testscheduling/dto/StaffRequest.java` | 接收 `familiarModuleIds` |
| `backend/src/main/java/com/testscheduling/service/TestDemandService.java` | 事务保存父子人力和回填汇总 |
| `backend/src/main/java/com/testscheduling/service/TestStaffService.java` | 事务保存人员能力 |
| `backend/src/main/java/com/testscheduling/service/ScheduleService.java` | 所有写入口调用资格校验 |
| `backend/src/main/java/com/testscheduling/controller/ScheduleController.java` | 推荐、校验、移动和批量发布接口 |
| `src/types/index.ts` | 全局模块、需求、人员和排班类型 |
| `src/services/api.ts` | 新接口及结构化错误 |
| `src/pages/BaseConfig.tsx` | 增加特殊模块配置页签 |
| `src/pages/TestDemandSubmit.tsx` | 接入特殊模块动态行和草稿 |
| `src/pages/DemandApproval.tsx` | 审批展示和修改特殊模块人力 |
| `src/pages/StaffManagement.tsx` | 熟悉模块多选和导入映射 |
| `src/pages/ScheduleWorkbench.tsx` | 调用后端推荐、校验、移动和发布 |
| `src/pages/workbench/workbenchTypes.ts` | 工作台结构化类型 |
| `src/pages/workbench/DemandQueue.tsx` | 模块/通用分配项和正确标签分类 |
| `src/pages/workbench/ScheduleTimeline.tsx` | 模块能力标签与不可落位状态 |
| `src/pages/workbench/IssuePublishPanel.tsx` | 模块和通用缺口展示 |
| `src/pages/workbench/workbenchCalculations.ts` | 移除总量分类，保留展示计算 |

---

### Task 1: 建立数据库迁移和双数据库基线

**Files:**
- Modify: `backend/pom.xml`
- Modify: `backend/src/main/resources/application.yml`
- Create: `backend/src/main/resources/application-mysql.yml`
- Create: `backend/src/main/resources/db/migration/V1__baseline_schema.sql`
- Create: `backend/src/main/resources/db/migration/V2__special_module_schema.sql`
- Create: `backend/src/test/resources/application.yml`
- Create: `backend/src/test/java/com/testscheduling/migration/MigrationSmokeTest.java`

- [ ] **Step 1: 写迁移失败测试**

```java
package com.testscheduling.migration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;

@SpringBootTest
class MigrationSmokeTest {
    @Autowired JdbcTemplate jdbc;

    @Test
    void createsSpecialModuleTablesAndScheduleColumns() {
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name = 'TEST_MODULE_CONFIG'",
            Integer.class));
        assertEquals(1, jdbc.queryForObject(
            "select count(*) from information_schema.columns where table_name = 'SCHEDULE' and column_name = 'DEMAND_SPECIAL_MODULE_ID'",
            Integer.class));
    }
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=MigrationSmokeTest test`

Expected: FAIL，`TEST_MODULE_CONFIG` 表不存在。

- [ ] **Step 3: 加入 Flyway 并配置开发、测试、MySQL profile**

在 `backend/pom.xml` 加入：

```xml
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-mysql</artifactId>
</dependency>
```

在默认配置中加入 `spring.flyway.enabled=true`、`baseline-on-migrate=true`、`baseline-version=1`，并把 `spring.jpa.hibernate.ddl-auto` 改为 `validate`。测试配置使用内存 H2：

```yaml
spring:
  datasource:
    url: jdbc:h2:mem:testdb;MODE=MySQL;DB_CLOSE_DELAY=-1
    driver-class-name: org.h2.Driver
    username: sa
    password:
  flyway:
    enabled: true
    baseline-on-migrate: true
    baseline-version: 1
  jpa:
    hibernate:
      ddl-auto: validate
```

`application-mysql.yml`：

```yaml
spring:
  datasource:
    url: ${MYSQL_URL:jdbc:mysql://localhost:3306/test_scheduling?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai}
    username: ${MYSQL_USERNAME:root}
    password: ${MYSQL_PASSWORD:}
    driver-class-name: com.mysql.cj.jdbc.Driver
  jpa:
    database-platform: org.hibernate.dialect.MySQLDialect
```

- [ ] **Step 4: 编写基线和功能迁移**

`V1__baseline_schema.sql` 使用以下完整基线。已有非空数据库会被 baseline 为版本 1；新空数据库会执行 V1：

```sql
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    test_type VARCHAR(255),
    familiar_modules VARCHAR(500),
    confidential_clearance BOOLEAN DEFAULT FALSE,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP,
    CONSTRAINT uk_users_username UNIQUE (username)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id BIGINT NOT NULL,
    role VARCHAR(255) NOT NULL,
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS test_staff (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    emp_no VARCHAR(255) NOT NULL,
    join_date DATE,
    group_name VARCHAR(255),
    test_type VARCHAR(255),
    initial_coefficient DECIMAL(3,2),
    current_coefficient DECIMAL(3,2),
    status VARCHAR(30),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    CONSTRAINT uk_test_staff_emp_no UNIQUE (emp_no)
);

CREATE TABLE IF NOT EXISTS test_demand (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    product VARCHAR(255) NOT NULL,
    version VARCHAR(255),
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    manpower_demand DECIMAL(10,2),
    version_type VARCHAR(255) NOT NULL,
    version_phase VARCHAR(255),
    description TEXT,
    status VARCHAR(30),
    submitted_by VARCHAR(255),
    confidential BOOLEAN DEFAULT FALSE,
    priority VARCHAR(255),
    test_device_count INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS demand_manpower_detail (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT NOT NULL,
    test_type VARCHAR(255) NOT NULL,
    manpower_demand DECIMAL(10,2),
    remark VARCHAR(200),
    CONSTRAINT fk_manpower_detail_demand FOREIGN KEY (demand_id) REFERENCES test_demand(id)
);

CREATE TABLE IF NOT EXISTS schedule (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT,
    staff_id BIGINT,
    date DATE,
    percentage INT,
    product VARCHAR(255),
    test_manager VARCHAR(255),
    version_type VARCHAR(255),
    version VARCHAR(255),
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS staff_daily_status (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    staff_id BIGINT NOT NULL,
    date DATE NOT NULL,
    status VARCHAR(40) NOT NULL,
    percentage DOUBLE DEFAULT 100.0,
    CONSTRAINT uk_staff_daily_status UNIQUE (staff_id, date)
);

CREATE TABLE IF NOT EXISTS field_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    field_name VARCHAR(255) NOT NULL,
    field_type VARCHAR(255) NOT NULL,
    options TEXT,
    description VARCHAR(255),
    required BOOLEAN DEFAULT FALSE,
    sort_order INT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

`V2__special_module_schema.sql` 必须包含：

```sql
CREATE TABLE test_module_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_name VARCHAR(100) NOT NULL,
    test_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    lock_version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_test_module_name UNIQUE (module_name)
);

CREATE INDEX idx_module_test_type_enabled
    ON test_module_config(test_type, enabled, sort_order);

CREATE TABLE demand_special_module (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    demand_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    manpower_demand DECIMAL(10,1) NOT NULL,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT uk_demand_special_module UNIQUE (demand_id, module_id),
    CONSTRAINT fk_dsm_demand FOREIGN KEY (demand_id) REFERENCES test_demand(id),
    CONSTRAINT fk_dsm_module FOREIGN KEY (module_id) REFERENCES test_module_config(id),
    CONSTRAINT ck_dsm_manpower_positive CHECK (manpower_demand > 0)
);

CREATE TABLE test_staff_module (
    staff_id BIGINT NOT NULL,
    module_id BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (staff_id, module_id),
    CONSTRAINT fk_tsm_staff FOREIGN KEY (staff_id) REFERENCES test_staff(id),
    CONSTRAINT fk_tsm_module FOREIGN KEY (module_id) REFERENCES test_module_config(id)
);

CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    action_type VARCHAR(60) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    operator_name VARCHAR(100) NOT NULL,
    before_value TEXT NULL,
    after_value TEXT NULL,
    created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id, created_at);

ALTER TABLE schedule ADD COLUMN demand_manpower_detail_id BIGINT NULL;
ALTER TABLE schedule ADD COLUMN demand_special_module_id BIGINT NULL;
ALTER TABLE schedule ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE test_demand ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE test_staff ADD COLUMN lock_version BIGINT NOT NULL DEFAULT 0;

ALTER TABLE schedule ADD CONSTRAINT fk_schedule_manpower_detail
    FOREIGN KEY (demand_manpower_detail_id) REFERENCES demand_manpower_detail(id);
ALTER TABLE schedule ADD CONSTRAINT fk_schedule_special_module
    FOREIGN KEY (demand_special_module_id) REFERENCES demand_special_module(id);
```

- [ ] **Step 5: 验证迁移**

Run: `cd backend && mvn -Dtest=MigrationSmokeTest test`

Expected: PASS，测试库由 Flyway 建表且 JPA `validate` 成功。

- [ ] **Step 6: Commit**

```bash
git add backend/pom.xml backend/src/main/resources backend/src/test/resources backend/src/test/java/com/testscheduling/migration
git commit -m "build: add versioned database migrations"
```

---

### Task 2: 增加业务错误码和特殊模块配置 API

**Files:**
- Create: `backend/src/main/java/com/testscheduling/exception/BusinessException.java`
- Create: `backend/src/main/java/com/testscheduling/dto/ErrorData.java`
- Create: `backend/src/main/java/com/testscheduling/security/RequestRoleGuard.java`
- Create: `backend/src/main/java/com/testscheduling/entity/AuditLog.java`
- Create: `backend/src/main/java/com/testscheduling/repository/AuditLogRepository.java`
- Create: `backend/src/main/java/com/testscheduling/service/AuditLogService.java`
- Modify: `backend/src/main/java/com/testscheduling/config/GlobalExceptionHandler.java`
- Create: `backend/src/main/java/com/testscheduling/entity/TestModuleConfig.java`
- Create: `backend/src/main/java/com/testscheduling/repository/TestModuleConfigRepository.java`
- Create: `backend/src/main/java/com/testscheduling/service/TestModuleService.java`
- Create: `backend/src/main/java/com/testscheduling/controller/TestModuleController.java`
- Create: `backend/src/test/java/com/testscheduling/service/TestModuleServiceTest.java`

- [ ] **Step 1: 写模块规则失败测试**

```java
@ExtendWith(MockitoExtension.class)
class TestModuleServiceTest {
    @Mock TestModuleConfigRepository moduleRepository;
    @Mock DemandSpecialModuleRepository demandModuleRepository;
    @Mock TestStaffModuleRepository staffModuleRepository;
    @InjectMocks TestModuleService service;

    @Test
    void rejectsDuplicateTrimmedModuleName() {
        when(moduleRepository.existsByModuleName("支付模块")).thenReturn(true);
        TestModuleConfig duplicate = new TestModuleConfig();
        duplicate.setModuleName(" 支付模块 ");
        duplicate.setTestType("功能测试");
        duplicate.setEnabled(true);
        duplicate.setSortOrder(10);
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.create(duplicate));
        assertEquals("MODULE_NAME_DUPLICATE", error.getErrorCode());
    }

    @Test
    void referencedModuleCanOnlyChangeStatusOrSortOrder() {
        TestModuleConfig existing = new TestModuleConfig();
        existing.setId(11L);
        existing.setModuleName("支付模块");
        existing.setTestType("功能测试");
        existing.setEnabled(true);
        existing.setSortOrder(10);
        when(moduleRepository.findById(11L)).thenReturn(Optional.of(existing));
        when(demandModuleRepository.existsByModuleId(11L)).thenReturn(true);
        TestModuleConfig changed = new TestModuleConfig();
        changed.setModuleName("新名称");
        changed.setTestType("功能测试");
        changed.setEnabled(true);
        changed.setSortOrder(20);
        BusinessException error = assertThrows(BusinessException.class,
            () -> service.update(11L, changed));
        assertEquals("MODULE_REFERENCED_IMMUTABLE", error.getErrorCode());
    }
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=TestModuleServiceTest test`

Expected: FAIL，模块实体和服务尚不存在。

- [ ] **Step 3: 实现稳定错误响应**

```java
@Getter
public class BusinessException extends RuntimeException {
    private final String errorCode;

    public BusinessException(String errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }
}

public record ErrorData(String errorCode) {}

@ExceptionHandler(BusinessException.class)
@ResponseStatus(HttpStatus.BAD_REQUEST)
public ApiResponse<ErrorData> handleBusinessException(BusinessException e) {
    return new ApiResponse<>(400, e.getMessage(), new ErrorData(e.getErrorCode()));
}
```

`RequestRoleGuard.requireAny("fieldAdmin")` 从请求属性 `roles` 读取角色；没有 JWT 或角色不匹配时抛出 `FORBIDDEN`。模块写接口调用该守卫，查询接口保持现有登录后可读口径。

`AuditLogService.record(actionType, entityType, entityId, beforeValue, afterValue)` 从请求属性 `username` 记录操作者，使用 Jackson 序列化变更前后值。模块新增、修改、启停和删除均写审计记录；审计写入与业务变更处于同一事务。`AuditLogRepository` 提供 `findByEntityTypeAndEntityIdOrderByCreatedAtDesc`，供验收和后续审计页复用。

- [ ] **Step 4: 实现模块实体、仓库和服务**

实体映射 `test_module_config`，使用映射到 `lock_version` 的 `@Version Long lockVersion`，并增加响应专用的 `@Transient Boolean referenced`。查询列表时通过需求和人员关系仓库回填 `referenced`。仓库提供：

```java
boolean existsByModuleName(String moduleName);
List<TestModuleConfig> findAllByOrderByTestTypeAscSortOrderAscModuleNameAsc();
List<TestModuleConfig> findByTestTypeAndEnabledOrderBySortOrderAscModuleNameAsc(String testType, boolean enabled);
```

`TestModuleService` 在保存前执行 `moduleName.trim()`；删除时同时检查需求和人员引用；启停接口只改 `enabled`；已引用模块更新时拒绝名称或 `testType` 变化。

- [ ] **Step 5: 实现模块接口**

```java
@RestController
@RequestMapping("/api/test-modules")
public class TestModuleController {
    private final TestModuleService service;
    private final RequestRoleGuard roleGuard;

    public TestModuleController(TestModuleService service, RequestRoleGuard roleGuard) {
        this.service = service;
        this.roleGuard = roleGuard;
    }

    @GetMapping
    public ApiResponse<List<TestModuleConfig>> list(
            @RequestParam(required = false) String testType,
            @RequestParam(required = false) Boolean enabled) {
        return ApiResponse.success(service.list(testType, enabled));
    }

    @PostMapping
    public ApiResponse<TestModuleConfig> create(@RequestBody TestModuleConfig module) {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("创建成功", service.create(module));
    }

    @PutMapping("/{id}")
    public ApiResponse<TestModuleConfig> update(@PathVariable Long id, @RequestBody TestModuleConfig module) {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("更新成功", service.update(id, module));
    }

    @PutMapping("/{id}/status")
    public ApiResponse<TestModuleConfig> status(@PathVariable Long id, @RequestBody Map<String, Boolean> body) {
        roleGuard.requireAny("fieldAdmin");
        return ApiResponse.success("状态更新成功", service.setEnabled(id, Boolean.TRUE.equals(body.get("enabled"))));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        roleGuard.requireAny("fieldAdmin");
        service.delete(id);
        return ApiResponse.success("删除成功", null);
    }
}
```

- [ ] **Step 6: 验证模块服务**

Run: `cd backend && mvn -Dtest=TestModuleServiceTest test`

Expected: PASS，重复名称、引用保护、启停和排序测试全部通过。

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service/TestModuleServiceTest.java
git commit -m "feat: add special module configuration API"
```

---

### Task 3: 保存需求特殊模块人力并计算父子配额

**Files:**
- Create: `backend/src/main/java/com/testscheduling/entity/DemandSpecialModule.java`
- Create: `backend/src/main/java/com/testscheduling/repository/DemandSpecialModuleRepository.java`
- Create: `backend/src/main/java/com/testscheduling/service/DemandSpecialModuleService.java`
- Create: `backend/src/main/java/com/testscheduling/dto/ManpowerSummary.java`
- Modify: `backend/src/main/java/com/testscheduling/entity/TestDemand.java`
- Modify: `backend/src/main/java/com/testscheduling/service/TestDemandService.java`
- Modify: `backend/src/main/java/com/testscheduling/service/TestModuleService.java`
- Test: `backend/src/test/java/com/testscheduling/service/DemandSpecialModuleServiceTest.java`
- Test: `backend/src/test/java/com/testscheduling/service/TestDemandServiceTest.java`

- [ ] **Step 1: 写聚合校验失败测试**

```java
@Test
void rejectsSpecialModuleTotalAboveItsGroupTotal() {
    DemandManpowerDetail group = new DemandManpowerDetail();
    group.setId(301L);
    group.setTestType("功能测试");
    group.setManpowerDemand(new BigDecimal("3.0"));
    DemandSpecialModule payment = new DemandSpecialModule();
    payment.setModuleId(11L);
    payment.setManpowerDemand(new BigDecimal("2.0"));
    DemandSpecialModule message = new DemandSpecialModule();
    message.setModuleId(12L);
    message.setManpowerDemand(new BigDecimal("1.5"));
    TestModuleConfig paymentConfig = new TestModuleConfig();
    paymentConfig.setId(11L);
    paymentConfig.setModuleName("支付模块");
    paymentConfig.setTestType("功能测试");
    paymentConfig.setEnabled(true);
    TestModuleConfig messageConfig = new TestModuleConfig();
    messageConfig.setId(12L);
    messageConfig.setModuleName("消息模块");
    messageConfig.setTestType("功能测试");
    messageConfig.setEnabled(true);
    when(moduleRepository.findAllById(List.of(11L, 12L)))
        .thenReturn(List.of(paymentConfig, messageConfig));

    BusinessException error = assertThrows(BusinessException.class,
        () -> service.validate(List.of(group), List.of(payment, message), false));
    assertEquals("SPECIAL_MODULE_EXCEEDS_GROUP", error.getErrorCode());
}

@Test
void allowsDifferentModulesAndReturnsGeneralManpower() {
    DemandManpowerDetail group = new DemandManpowerDetail();
    group.setId(301L);
    group.setTestType("功能测试");
    group.setManpowerDemand(new BigDecimal("8.0"));
    DemandSpecialModule payment = new DemandSpecialModule();
    payment.setId(501L);
    payment.setModuleId(11L);
    payment.setTestType("功能测试");
    payment.setManpowerDemand(new BigDecimal("2.0"));
    DemandSpecialModule message = new DemandSpecialModule();
    message.setId(502L);
    message.setModuleId(12L);
    message.setTestType("功能测试");
    message.setManpowerDemand(new BigDecimal("1.5"));
    List<ManpowerSummary> result = service.summarize(List.of(group), List.of(payment, message));
    assertEquals(new BigDecimal("4.5"), result.get(0).generalManpower());
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=DemandSpecialModuleServiceTest test`

Expected: FAIL，需求特殊模块类型和服务尚不存在。

- [ ] **Step 3: 实现实体和事务服务**

`DemandSpecialModule` 持久字段为 `id`、`demandId`、`moduleId`、`manpowerDemand`、时间字段；增加仅用于响应的 `@Transient moduleName`、`testType`、`enabled`、`allocatedManpower`、`remainingManpower`。

`TestDemand` 增加：

```java
@Transient
private List<DemandSpecialModule> specialModuleDemands;

@Transient
private List<ManpowerSummary> manpowerSummary;

@Transient
private Boolean manpowerFullySatisfied;

@Version
@Column(name = "lock_version")
private Long lockVersion;
```

`DemandSpecialModuleService.validate` 必须：拒绝重复 `moduleId`；新需求拒绝停用模块；确认模块 `testType` 存在于 `manpowerDetails`；按 `testType` 聚合后不超过父级总量。`replaceForDemand` 先校验、再删除旧行、最后写入新行，调用者事务失败时整体回滚。

- [ ] **Step 4: 接入需求创建、更新和审批修改**

在 `TestDemandService.create`、`update`、`approveWithChanges` 中使用同一顺序：保存需求 -> 保存 `manpowerDetails` -> 校验并保存 `specialModuleDemands` -> 重新回填。更新已批准且已有排班的需求时，如果要改变父子配额，抛出 `DEMAND_WITH_SCHEDULE_IMMUTABLE`，避免排班归属悬空。

以上三个入口均通过 `AuditLogService` 记录 `DEMAND_SPECIAL_MODULE_CHANGED`，包含变更前后模块 ID 和人力数值。

- [ ] **Step 5: 验证事务与汇总**

Run: `cd backend && mvn -Dtest=DemandSpecialModuleServiceTest,TestDemandServiceTest test`

Expected: PASS，包括重复模块、停用模块、新建成功、超额整体回滚和 `4.5` 通用人力。

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service
git commit -m "feat: persist special module manpower demand"
```

---

### Task 4: 结构化保存人员熟悉模块并提供迁移报告

**Files:**
- Create: `backend/src/main/java/com/testscheduling/entity/TestStaffModuleId.java`
- Create: `backend/src/main/java/com/testscheduling/entity/TestStaffModule.java`
- Create: `backend/src/main/java/com/testscheduling/repository/TestStaffModuleRepository.java`
- Create: `backend/src/main/java/com/testscheduling/service/StaffModuleService.java`
- Create: `backend/src/main/java/com/testscheduling/dto/LegacyModuleMigrationReport.java`
- Modify: `backend/src/main/java/com/testscheduling/entity/TestStaff.java`
- Modify: `backend/src/main/java/com/testscheduling/dto/StaffRequest.java`
- Modify: `backend/src/main/java/com/testscheduling/service/TestStaffService.java`
- Modify: `backend/src/main/java/com/testscheduling/controller/TestStaffController.java`
- Test: `backend/src/test/java/com/testscheduling/service/StaffModuleServiceTest.java`

- [ ] **Step 1: 写跨组能力和旧文本解析失败测试**

```java
@Test
void replacesModulesWithoutCheckingStaffGroup() {
    TestStaff staff = new TestStaff();
    staff.setId(101L);
    staff.setGroupName("自动化测试组");
    TestModuleConfig external = new TestModuleConfig();
    external.setId(11L);
    external.setModuleName("支付模块");
    external.setTestType("功能测试");
    external.setEnabled(true);
    when(moduleRepository.findAllById(List.of(11L))).thenReturn(List.of(external));

    service.replaceModules(staff, List.of(11L));

    ArgumentCaptor<Iterable<TestStaffModule>> captor = ArgumentCaptor.forClass(Iterable.class);
    verify(staffModuleRepository).saveAll(captor.capture());
    TestStaffModule saved = captor.getValue().iterator().next();
    assertEquals(new TestStaffModuleId(101L, 11L), saved.getId());
}

@Test
void migrationReportsUnknownNamesAndKeepsLegacyText() {
    User user = new User();
    user.setUsername("T1001");
    user.setFamiliarModules("支付模块，未知模块;支付模块");
    TestStaff staff = new TestStaff();
    staff.setId(101L);
    staff.setEmpNo("T1001");
    TestModuleConfig payment = new TestModuleConfig();
    payment.setId(11L);
    payment.setModuleName("支付模块");
    payment.setEnabled(true);
    when(staffRepository.findByEmpNo("T1001")).thenReturn(Optional.of(staff));
    when(moduleRepository.findAll()).thenReturn(List.of(payment));
    LegacyModuleMigrationReport report = service.migrateLegacy(List.of(user));
    assertEquals(List.of("未知模块"), report.unmatched().get("T1001"));
    assertEquals(1, report.createdRelations());
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=StaffModuleServiceTest test`

Expected: FAIL，人员模块关系服务尚不存在。

- [ ] **Step 3: 实现复合主键关系和人员 API**

`StaffRequest` 增加 `List<Long> familiarModuleIds`。`TestStaff` 增加 `@Transient List<TestModuleConfig> familiarModules` 和映射到 `lock_version` 的 `@Version Long lockVersion`。创建与更新人员时，在保存 `TestStaff` 和 `User` 后调用：

```java
if (request.getFamiliarModuleIds() != null) {
    staffModuleService.replaceModules(saved, request.getFamiliarModuleIds());
}
```

空数组清空，`null` 保持不变。`replaceModules` 只要求模块存在且启用，不比较 `staff.groupName` 或 `staff.testType`。

人员能力全量替换通过 `AuditLogService` 记录 `STAFF_MODULES_REPLACED`，包含变更前后模块 ID。

- [ ] **Step 4: 实现幂等迁移接口**

在 `TestStaffController` 增加：

```java
@PostMapping("/modules/migrate-legacy")
public ApiResponse<LegacyModuleMigrationReport> migrateLegacyModules() {
    roleGuard.requireAny("fieldAdmin");
    return ApiResponse.success("迁移完成", testStaffService.migrateLegacyModules());
}
```

解析分隔符使用 `[，,；;]`，名称精确匹配，重复项去重。报告包含 `createdRelations`、`duplicateNames`、`unmatched`、`missingStaffAccounts`。不清空 `users.familiar_modules`。

- [ ] **Step 5: 验证人员能力**

Run: `cd backend && mvn -Dtest=StaffModuleServiceTest,TestStaffServiceTest test`

Expected: PASS，跨组模块允许、停用模块拒绝新增、空数组清空、迁移幂等。

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service
git commit -m "feat: normalize staff familiar modules"
```

---

### Task 5: 增加排班归属和统一资格校验

**Files:**
- Modify: `backend/src/main/java/com/testscheduling/entity/Schedule.java`
- Modify: `backend/src/main/java/com/testscheduling/repository/ScheduleRepository.java`
- Create: `backend/src/main/java/com/testscheduling/service/ScheduleEligibilityService.java`
- Modify: `backend/src/main/java/com/testscheduling/service/ScheduleService.java`
- Modify: `backend/src/main/java/com/testscheduling/controller/ScheduleController.java`
- Test: `backend/src/test/java/com/testscheduling/service/ScheduleEligibilityServiceTest.java`
- Modify: `backend/src/test/java/com/testscheduling/service/ScheduleServiceTest.java`

- [ ] **Step 1: 写特殊模块硬匹配失败测试**

```java
@Test
void rejectsStaffWhoDoesNotKnowSpecialModule() {
    Schedule schedule = specialSchedule();
    stubBaseEligibility("自动化测试");
    when(staffModuleRepository.existsById(new TestStaffModuleId(108L, 11L))).thenReturn(false);

    BusinessException error = assertThrows(BusinessException.class,
        () -> service.validate(schedule, null));
    assertEquals("STAFF_MODULE_NOT_FAMILIAR", error.getErrorCode());
}

@Test
void allowsCrossGroupStaffWhoKnowsModule() {
    Schedule schedule = specialSchedule();
    stubBaseEligibility("自动化测试");
    when(staffModuleRepository.existsById(new TestStaffModuleId(108L, 11L))).thenReturn(true);
    assertDoesNotThrow(() -> service.validate(schedule, null));
}

private Schedule specialSchedule() {
    Schedule schedule = new Schedule();
    schedule.setDemandId(1001L);
    schedule.setStaffId(108L);
    schedule.setDemandManpowerDetailId(301L);
    schedule.setDemandSpecialModuleId(501L);
    schedule.setDate(LocalDate.of(2026, 7, 22));
    schedule.setPercentage(50);
    return schedule;
}

private void stubBaseEligibility(String staffTestType) {
    TestDemand demand = new TestDemand();
    demand.setId(1001L);
    demand.setStartDate(LocalDateTime.of(2026, 7, 20, 0, 0));
    demand.setEndDate(LocalDateTime.of(2026, 7, 31, 0, 0));
    demand.setConfidential(false);
    DemandManpowerDetail detail = new DemandManpowerDetail();
    detail.setId(301L);
    detail.setDemandId(1001L);
    detail.setTestType("功能测试");
    detail.setManpowerDemand(new BigDecimal("2.0"));
    DemandSpecialModule special = new DemandSpecialModule();
    special.setId(501L);
    special.setDemandId(1001L);
    special.setModuleId(11L);
    special.setManpowerDemand(new BigDecimal("1.0"));
    TestModuleConfig module = new TestModuleConfig();
    module.setId(11L);
    module.setModuleName("支付模块");
    module.setTestType("功能测试");
    TestStaff staff = new TestStaff();
    staff.setId(108L);
    staff.setName("张三");
    staff.setEmpNo("T0108");
    staff.setTestType(staffTestType);
    staff.setStatus(TestStaff.StaffStatus.active);
    staff.setCurrentCoefficient(new BigDecimal("1.0"));
    when(demandRepository.findById(1001L)).thenReturn(Optional.of(demand));
    when(detailRepository.findById(301L)).thenReturn(Optional.of(detail));
    when(specialRepository.findById(501L)).thenReturn(Optional.of(special));
    when(moduleRepository.findById(11L)).thenReturn(Optional.of(module));
    when(staffRepository.findById(108L)).thenReturn(Optional.of(staff));
    when(scheduleRepository.findByStaffIdAndDate(108L, LocalDate.of(2026, 7, 22))).thenReturn(List.of());
    when(dailyStatusRepository.findByStaffIdAndDate(108L, LocalDate.of(2026, 7, 22))).thenReturn(Optional.empty());
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=ScheduleEligibilityServiceTest test`

Expected: FAIL，归属字段和资格服务尚不存在。

- [ ] **Step 3: 扩展排班实体和查询**

```java
private Long demandManpowerDetailId;
private Long demandSpecialModuleId;

@Version
@Column(name = "lock_version")
private Long lockVersion;
```

仓库增加 `findByDemandIdAndPublishedFalse`、`findByStaffIdAndDate`、`deleteByDemandIdAndPublishedFalse` 和按多个需求查询。

- [ ] **Step 4: 实现 `ScheduleEligibilityService.validate`**

严格按以下顺序返回第一个错误：引用存在 -> 人员在职 -> 日期在需求周期 -> 人力明细属于需求 -> 特殊模块属于需求且小组一致 -> 特殊模块能力 -> 通用人力的人员 `testType` 匹配 -> 保密权限 -> 百分比为 10 的倍数 -> 单日容量 -> 明细不超配。

核心模块判断：

```java
if (schedule.getDemandSpecialModuleId() != null) {
    DemandSpecialModule special = specialRepository.findById(schedule.getDemandSpecialModuleId())
        .orElseThrow(() -> error("SCHEDULE_DETAIL_NOT_FOUND", "特殊模块人力明细不存在"));
    TestModuleConfig module = moduleRepository.findById(special.getModuleId())
        .orElseThrow(() -> error("MODULE_NOT_FOUND", "特殊模块不存在"));
    if (!module.getTestType().equals(detail.getTestType())) {
        throw error("MODULE_GROUP_MISMATCH", "模块所属小组与人力明细不一致");
    }
    if (!staffModuleRepository.existsById(new TestStaffModuleId(staff.getId(), module.getId()))) {
        throw error("STAFF_MODULE_NOT_FAMILIAR", staff.getName() + "不熟悉" + module.getModuleName() + "，无法分配");
    }
} else if (!detail.getTestType().equals(staff.getTestType())) {
    throw error("STAFF_TEST_TYPE_MISMATCH", "通用人力必须分配给相同测试类型人员");
}
```

- [ ] **Step 5: 接入所有现有写入口**

`ScheduleService.create`、`createBatch`、`update` 均调用资格服务；`update` 必须复制并校验 `staffId`、`date`、`percentage`、两个归属字段。增加 `move(id, staffId, date, percentage)`、`validateOnly(schedule)` 和 `classifyHistorical(id, demandManpowerDetailId, demandSpecialModuleId)`。历史双空排班可读取；普通新建和修改时返回 `SCHEDULE_DETAIL_REQUIRED`，只有 `classifyHistorical` 能为双空历史记录补齐归属并执行完整资格校验。

将 `DELETE /api/schedules/demand/{demandId}` 改为默认只删除 `published=false` 的草稿；只有显式 `scope=all` 且调用者具备资源主管或字段管理员权限时才允许清理全部。增加 `POST /api/schedules/{id}/classify`，请求体只包含两个归属 ID。

`validate`、`move`、`classify` 和清理接口调用 `RequestRoleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin")`，防止普通测试人员绕过工作台直接写排班。

- [ ] **Step 6: 运行资格和回归测试**

Run: `cd backend && mvn -Dtest=ScheduleEligibilityServiceTest,ScheduleServiceTest test`

Expected: PASS，特殊模块跨组允许、通用人力跨类型拒绝、保密与容量旧测试继续通过。

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service
git commit -m "feat: enforce schedule eligibility rules"
```

---

### Task 6: 计算明细满足状态并修正“已分配”口径

**Files:**
- Create: `backend/src/main/java/com/testscheduling/dto/DemandFulfillmentResponse.java`
- Create: `backend/src/main/java/com/testscheduling/service/DemandFulfillmentService.java`
- Modify: `backend/src/main/java/com/testscheduling/service/TestDemandService.java`
- Test: `backend/src/test/java/com/testscheduling/service/DemandFulfillmentServiceTest.java`

- [ ] **Step 1: 写父子明细满足测试**

```java
@Test
void demandIsNotSatisfiedWhenSpecialModuleStillHasGap() {
    DemandManpowerDetail group = new DemandManpowerDetail();
    group.setId(301L);
    group.setDemandId(1001L);
    group.setTestType("功能测试");
    group.setManpowerDemand(new BigDecimal("8.0"));
    DemandSpecialModule special = new DemandSpecialModule();
    special.setId(501L);
    special.setDemandId(1001L);
    special.setModuleId(11L);
    special.setTestType("功能测试");
    special.setManpowerDemand(new BigDecimal("2.0"));
    Schedule specialSchedule = new Schedule();
    specialSchedule.setDemandId(1001L);
    specialSchedule.setDemandManpowerDetailId(301L);
    specialSchedule.setDemandSpecialModuleId(501L);
    specialSchedule.setPercentage(100);
    List<Schedule> generalSchedules = IntStream.range(0, 6).mapToObj(index -> {
        Schedule schedule = new Schedule();
        schedule.setDemandId(1001L);
        schedule.setDemandManpowerDetailId(301L);
        schedule.setPercentage(100);
        return schedule;
    }).toList();
    TestModuleConfig module = new TestModuleConfig();
    module.setId(11L);
    module.setModuleName("支付模块");
    module.setTestType("功能测试");
    when(detailRepository.findByDemandId(1001L)).thenReturn(List.of(group));
    when(specialRepository.findByDemandId(1001L)).thenReturn(List.of(special));
    List<Schedule> schedules = new ArrayList<>(generalSchedules);
    schedules.add(specialSchedule);
    when(scheduleRepository.findByDemandId(1001L)).thenReturn(schedules);
    when(moduleRepository.findById(11L)).thenReturn(Optional.of(module));

    DemandFulfillmentResponse result = service.calculate(1001L);

    assertFalse(result.fullySatisfied());
    assertEquals(new BigDecimal("1.0"), result.specialModuleGaps().get(0).shortage());
    assertTrue(result.generalGaps().isEmpty());
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=DemandFulfillmentServiceTest test`

Expected: FAIL，满足度服务尚不存在。

- [ ] **Step 3: 实现满足度计算**

特殊模块只统计 `demandSpecialModuleId` 相同的排班；通用人力只统计同一 `demandManpowerDetailId` 且模块字段为空的排班。每组：

```java
BigDecimal specialRequired = specialsForGroup.stream()
    .map(DemandSpecialModule::getManpowerDemand)
    .reduce(BigDecimal.ZERO, BigDecimal::add);
BigDecimal generalRequired = group.getManpowerDemand().subtract(specialRequired);
BigDecimal generalAllocated = percentToDays(schedules.stream()
    .filter(s -> group.getId().equals(s.getDemandManpowerDetailId()))
    .filter(s -> s.getDemandSpecialModuleId() == null)
    .mapToInt(Schedule::getPercentage).sum());
```

全部模块和通用缺口均为零时 `fullySatisfied=true`。历史需求没有结构化模块时，双空排班继续按需求总量判断；补录结构化模块后存在双空排班时返回 `requiresHistoricalClassification=true` 且不可满足。

- [ ] **Step 4: 回填需求列表和详情**

`TestDemandService.enrichWithDetails` 同时回填特殊模块结构、`manpowerSummary` 和 `manpowerFullySatisfied`，保证工作台获取需求列表时无需在前端重算规则。

- [ ] **Step 5: 验证满足度**

Run: `cd backend && mvn -Dtest=DemandFulfillmentServiceTest,TestDemandServiceTest test`

Expected: PASS，包括“总量够但模块缺口仍未满足”和“所有父子明细满足”两个场景。

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service
git commit -m "feat: calculate detailed demand fulfillment"
```

---

### Task 7: 实现后端推荐草稿算法

**Files:**
- Create: `backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationRequest.java`
- Create: `backend/src/main/java/com/testscheduling/dto/ScheduleRecommendationResponse.java`
- Create: `backend/src/main/java/com/testscheduling/service/ScheduleRecommendationService.java`
- Modify: `backend/src/main/java/com/testscheduling/controller/ScheduleController.java`
- Test: `backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java`

- [ ] **Step 1: 写算法顺序和硬匹配失败测试**

```java
@SpringBootTest
@Transactional
class ScheduleRecommendationServiceTest {
@Autowired ScheduleRecommendationService service;
@Autowired TestDemandRepository demandRepository;
@Autowired DemandManpowerDetailRepository detailRepository;
@Autowired TestModuleConfigRepository moduleRepository;
@Autowired DemandSpecialModuleRepository specialRepository;
@Autowired TestStaffRepository staffRepository;
@Autowired TestStaffModuleRepository staffModuleRepository;

private Long demandId;
private Long qualifiedStaffId;
private Long generalStaffId;
private TestStaffModuleId qualifiedRelationId;

@BeforeEach
void seedOneDayDemand() {
    TestModuleConfig module = new TestModuleConfig();
    module.setModuleName("支付模块");
    module.setTestType("功能测试");
    module.setEnabled(true);
    module.setSortOrder(10);
    module = moduleRepository.save(module);
    TestDemand demand = new TestDemand();
    demand.setProduct("示例产品");
    demand.setVersionType("维护");
    demand.setStartDate(LocalDateTime.of(2026, 7, 22, 0, 0));
    demand.setEndDate(LocalDateTime.of(2026, 7, 22, 23, 59));
    demand.setStatus(TestDemand.DemandStatus.pending);
    demand = demandRepository.save(demand);
    demandId = demand.getId();
    DemandManpowerDetail detail = new DemandManpowerDetail();
    detail.setDemandId(demandId);
    detail.setTestType("功能测试");
    detail.setManpowerDemand(new BigDecimal("2.0"));
    detail = detailRepository.save(detail);
    DemandSpecialModule special = new DemandSpecialModule();
    special.setDemandId(demandId);
    special.setModuleId(module.getId());
    special.setManpowerDemand(new BigDecimal("1.0"));
    specialRepository.save(special);
    TestStaff qualified = new TestStaff();
    qualified.setName("跨组人员");
    qualified.setEmpNo("T0101");
    qualified.setTestType("自动化测试");
    qualified.setStatus(TestStaff.StaffStatus.active);
    qualified.setCurrentCoefficient(new BigDecimal("1.0"));
    qualified = staffRepository.save(qualified);
    qualifiedStaffId = qualified.getId();
    TestStaff general = new TestStaff();
    general.setName("功能人员");
    general.setEmpNo("T0102");
    general.setTestType("功能测试");
    general.setStatus(TestStaff.StaffStatus.active);
    general.setCurrentCoefficient(new BigDecimal("1.0"));
    general = staffRepository.save(general);
    generalStaffId = general.getId();
    qualifiedRelationId = new TestStaffModuleId(qualifiedStaffId, module.getId());
    TestStaffModule relation = new TestStaffModule();
    relation.setId(qualifiedRelationId);
    relation.setCreatedAt(LocalDateTime.now());
    staffModuleRepository.save(relation);
}

@Test
void allocatesSpecialBeforeGeneralAndNeverUsesUnqualifiedStaff() {
    ScheduleRecommendationResponse result = service.recommend(fullDemandRequest());

    assertEquals(2, result.generatedSchedules().size());
    assertEquals(qualifiedStaffId, result.generatedSchedules().get(0).getStaffId());
    assertNotNull(result.generatedSchedules().get(0).getDemandSpecialModuleId());
    assertEquals(generalStaffId, result.generatedSchedules().get(1).getStaffId());
    assertNull(result.generatedSchedules().get(1).getDemandSpecialModuleId());
}

@Test
void reportsOnlyMissingModuleAndContinuesGeneralAllocation() {
    staffModuleRepository.deleteById(qualifiedRelationId);
    ScheduleRecommendationResponse result = service.recommend(fullDemandRequest());

    assertEquals("NO_QUALIFIED_STAFF", result.fulfillment().get(0).specialModuleGaps().get(0).reasonCode());
    assertTrue(result.fulfillment().get(0).generalGaps().isEmpty());
}

private ScheduleRecommendationRequest fullDemandRequest() {
    ScheduleRecommendationRequest request = new ScheduleRecommendationRequest();
    request.setMode(ScheduleRecommendationRequest.Mode.FULL_DEMAND);
    request.setDemandIds(List.of(demandId));
    request.setFixedStaffIds(List.of());
    request.setExcludedStaffIds(List.of());
    request.setIncludeSaturdays(true);
    request.setIncludeSundays(true);
    request.setReplaceExistingDrafts(false);
    return request;
}
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=ScheduleRecommendationServiceTest test`

Expected: FAIL，推荐请求、响应和服务尚不存在。

- [ ] **Step 3: 定义请求响应契约**

`ScheduleRecommendationRequest` 包含 `mode`、`demandIds`、可空 `dateRange`、`fixedStaffIds`、`excludedStaffIds`、周末开关和 `replaceExistingDrafts`。`FIXED_RANGE` 缺少日期范围返回 `INVALID_DATE_RANGE`；`FULL_DEMAND` 忽略前端日期范围。

- [ ] **Step 4: 实现特殊模块阶段**

按需求风险、优先级、截止日、创建时间排序；每个需求按模块剩余量降序。候选人员过滤条件为：在职、未排除、熟悉模块、保密合格、日期有容量。固定人员只提高排序，不绕过过滤。

每次分配生成：

```java
Schedule draft = new Schedule();
draft.setDemandId(demand.getId());
draft.setStaffId(candidate.staffId());
draft.setDate(date);
draft.setPercentage(allocationPercent);
draft.setDemandManpowerDetailId(groupDetail.getId());
draft.setDemandSpecialModuleId(special.getId());
draft.setProduct(demand.getProduct());
draft.setVersionType(demand.getVersionType());
draft.setVersion(demand.getVersion());
draft.setTestManager(demand.getSubmittedBy());
draft.setPublished(false);
eligibilityService.validate(draft, null);
generated.add(scheduleRepository.save(draft));
```

- [ ] **Step 5: 实现通用人力阶段和缺口原因**

特殊模块全部尝试后，再按小组处理通用人力。通用候选必须 `staff.testType == detail.testType`，模块归属为空。没有候选人员返回 `NO_QUALIFIED_STAFF`，有候选但无容量返回 `INSUFFICIENT_CAPACITY`，设备限制返回 `DEVICE_LIMIT_REACHED`。

`replaceExistingDrafts=true` 只删除请求需求的未发布草稿；`false` 保留现有草稿并从剩余量中扣除。

- [ ] **Step 6: 接口接入和事务并发保护**

在 `ScheduleController` 增加：

```java
@PostMapping("/recommend/draft")
public ApiResponse<ScheduleRecommendationResponse> recommend(
        @RequestBody ScheduleRecommendationRequest request) {
    roleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin");
    return ApiResponse.success("推荐草稿已生成", recommendationService.recommend(request));
}
```

推荐事务开始时按主键顺序锁定请求需求；写入时通过 `@Version` 检测相关实体变化。任一并发冲突转换为 `DATA_CHANGED_RETRY`，不写入部分草稿。

- [ ] **Step 7: 验证两种模式和算法场景**

Run: `cd backend && mvn -Dtest=ScheduleRecommendationServiceTest test`

Expected: PASS，覆盖特殊优先、跨组合格人员、模块无人员、通用继续、固定/排除、指定日期、全部周期、设备和容量。

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service/ScheduleRecommendationServiceTest.java
git commit -m "feat: generate module-aware schedule drafts"
```

---

### Task 8: 发布前重校验和批量发布明细

**Files:**
- Create: `backend/src/main/java/com/testscheduling/dto/BatchPublishRequest.java`
- Create: `backend/src/main/java/com/testscheduling/dto/BatchPublishResponse.java`
- Create: `backend/src/main/java/com/testscheduling/service/SchedulePublishService.java`
- Create: `backend/src/main/java/com/testscheduling/service/SchedulePublishTransactionService.java`
- Modify: `backend/src/main/java/com/testscheduling/controller/ScheduleController.java`
- Modify: `backend/src/main/java/com/testscheduling/service/ScheduleService.java`
- Test: `backend/src/test/java/com/testscheduling/service/SchedulePublishServiceTest.java`

- [ ] **Step 1: 写发布复核和部分成功测试**

```java
@Test
void rejectsPublishAfterStaffModuleWasRemoved() {
    DemandFulfillmentResponse fulfillment = mock(DemandFulfillmentResponse.class);
    when(fulfillment.fullySatisfied()).thenReturn(true);
    when(fulfillment.requiresHistoricalClassification()).thenReturn(false);
    Schedule schedule = new Schedule();
    schedule.setId(9001L);
    schedule.setDemandId(1001L);
    schedule.setPublished(false);
    when(fulfillmentService.calculate(1001L)).thenReturn(fulfillment);
    when(scheduleRepository.findByDemandId(1001L)).thenReturn(List.of(schedule));
    when(eligibilityService.validateForPublish(any())).thenThrow(
        new BusinessException("STAFF_MODULE_NOT_FAMILIAR", "张三不熟悉支付模块"));
    BusinessException error = assertThrows(BusinessException.class,
        () -> service.publishOne(1001L));
    assertEquals("STAFF_MODULE_NOT_FAMILIAR", error.getErrorCode());
}

@Test
void batchPublishKeepsSuccessWhenAnotherDemandFails() {
    doNothing().when(transactionService).publishInNewTransaction(1001L);
    doThrow(new BusinessException("SPECIAL_MODULE_UNFULFILLED", "支付模块仍缺少0.5人天"))
        .when(transactionService).publishInNewTransaction(1002L);
    BatchPublishResponse result = service.publishBatch(List.of(1001L, 1002L));
    assertEquals(List.of(1001L), result.success().stream().map(BatchPublishResponse.Success::demandId).toList());
    assertEquals("SPECIAL_MODULE_UNFULFILLED", result.failed().get(0).reasonCode());
}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd backend && mvn -Dtest=SchedulePublishServiceTest test`

Expected: FAIL，发布服务和批量契约尚不存在。

- [ ] **Step 3: 实现发布服务**

`publishOne` 必须先计算满足度，`requiresHistoricalClassification=true`、特殊模块缺口、通用缺口或冲突任一存在都拒绝；随后逐条调用 `validateForPublish`，最后统一设 `published=true`。

批量发布通过单独 Spring bean `SchedulePublishTransactionService` 的 `@Transactional(propagation = REQUIRES_NEW)` 方法逐需求执行，`SchedulePublishService` 捕获 `BusinessException` 后继续下一个需求，返回成功数量与失败错误码。成功发布通过 `AuditLogService` 记录 `SCHEDULE_PUBLISHED`，失败记录包含需求 ID、错误码和原因。

- [ ] **Step 4: 接入接口并删除控制器局部吞错**

```java
@PostMapping("/batch-publish")
public ApiResponse<BatchPublishResponse> batchPublish(@RequestBody BatchPublishRequest request) {
    roleGuard.requireAny("resourceManager", "projectManager", "fieldAdmin");
    return ApiResponse.success("发布处理完成", publishService.publishBatch(request.demandIds()));
}
```

单需求 `PUT /publish/{demandId}` 改用 `publishService.publishOne`。受影响接口不再把 `BusinessException` 捕获并转换为无错误码的 `ApiResponse.error(String)`。

- [ ] **Step 5: 验证发布**

Run: `cd backend && mvn -Dtest=SchedulePublishServiceTest,ScheduleServiceTest test`

Expected: PASS，能力变化被拦截，批量发布按需求部分成功。

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/testscheduling backend/src/test/java/com/testscheduling/service
git commit -m "feat: revalidate and batch publish schedules"
```

---

### Task 9: 建立前端测试基础和结构化类型/API

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`
- Modify: `src/types/index.ts`
- Modify: `src/pages/workbench/workbenchTypes.ts`
- Modify: `src/services/api.ts`
- Create: `src/services/api.test.ts`

- [ ] **Step 1: 安装并配置 Vitest**

Run: `npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`

在 `package.json` 增加：

```json
"test": "vitest run",
"test:watch": "vitest"
```

在 `vite.config.ts` 配置 `test.environment='jsdom'` 和 `setupFiles=['./src/test/setup.ts']`；setup 导入 `@testing-library/jest-dom/vitest`。

- [ ] **Step 2: 写 API 错误码失败测试**

```typescript
it('preserves backend business error code', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    code: 400,
    message: '人员不熟悉支付模块',
    data: { errorCode: 'STAFF_MODULE_NOT_FAMILIAR' },
  })));
  await expect(api.validateSchedule({} as ScheduleWriteRequest)).rejects.toMatchObject({
    message: '人员不熟悉支付模块',
    errorCode: 'STAFF_MODULE_NOT_FAMILIAR',
  });
});
```

- [ ] **Step 3: 定义结构化类型**

增加 `TestModule`、`DemandSpecialModule`、`ManpowerSummary`、`FamiliarModule`、`ScheduleWriteRequest`、`ScheduleRecommendationRequest/Response`、`DemandFulfillment`、`BatchPublishResponse`。`ScheduleItem` 增加两个归属 ID；过渡期将 `StaffItem.familiarModules` 定义为 `FamiliarModule[] | string`，保证任务 9 单独可构建，任务 12 和 13 完成页面切换后再收窄为数组；`DemandItem` 增加 `specialModuleDemands`、`manpowerSummary`、`manpowerFullySatisfied`。

- [ ] **Step 4: 实现 API 方法**

增加模块 CRUD、`migrateLegacyStaffModules`、`recommendScheduleDraft`、`validateSchedule`、`moveSchedule`、`batchPublishSchedules`。`request` 抛出：

```typescript
export class ApiError extends Error {
  constructor(message: string, public readonly errorCode?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

if (result.code !== 200) {
  const errorData = result.data as { errorCode?: string } | null;
  throw new ApiError(result.message || '请求失败', errorData?.errorCode);
}
```

- [ ] **Step 5: 运行前端测试和类型检查**

Run: `npm test -- src/services/api.test.ts`

Expected: PASS。

Run: `npm run build`

Expected: PASS，无旧字符串类型残留造成的编译错误；暂未切换的页面可在本任务中使用兼容格式化函数。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/test src/types src/pages/workbench/workbenchTypes.ts src/services
git commit -m "test: add frontend test foundation and module types"
```

---

### Task 10: 实现特殊模块配置页签

**Files:**
- Create: `src/components/TestModuleConfigPanel.tsx`
- Create: `src/components/TestModuleConfigPanel.test.tsx`
- Modify: `src/pages/BaseConfig.tsx`

- [ ] **Step 1: 写配置交互失败测试**

```typescript
it('locks name and group when a module is referenced', async () => {
  vi.spyOn(api, 'getTestModules').mockResolvedValue([
    { id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, sortOrder: 10, referenced: true },
  ]);
  render(<TestModuleConfigPanel testTypes={['功能测试']} />);
  await userEvent.click(await screen.findByRole('button', { name: '编辑支付模块' }));
  expect(screen.getByLabelText('模块名称')).toBeDisabled();
  expect(screen.getByLabelText('所属小组')).toBeDisabled();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/components/TestModuleConfigPanel.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现配置面板**

使用表格展示名称、小组、状态、排序和引用状态；新增/编辑使用 Modal；启停使用 Switch；删除用 Popconfirm。按钮使用 Ant Design 图标并设置 `aria-label`。已引用记录的名称和小组禁用，只允许排序和状态变化。

- [ ] **Step 4: 接入字段配置 Tabs**

`BaseConfig.tsx` 获取 `testType` 配置选项并渲染：

```tsx
<Tabs items={[
  { key: 'fields', label: '基础字段', children: fieldConfigContent },
  { key: 'modules', label: '特殊模块配置', children: <TestModuleConfigPanel testTypes={testTypes} /> },
]} />
```

- [ ] **Step 5: 验证组件和构建**

Run: `npm test -- src/components/TestModuleConfigPanel.test.tsx && npm run build`

Expected: PASS，模块可新增、编辑、启停；引用保护状态正确。

- [ ] **Step 6: Commit**

```bash
git add src/components/TestModuleConfigPanel.tsx src/components/TestModuleConfigPanel.test.tsx src/pages/BaseConfig.tsx
git commit -m "feat: add special module configuration tab"
```

---

### Task 11: 实现需求特殊模块动态行和审批展示

**Files:**
- Create: `src/utils/specialModuleCalculations.ts`
- Create: `src/utils/specialModuleCalculations.test.ts`
- Create: `src/components/SpecialModuleDemandEditor.tsx`
- Create: `src/components/SpecialModuleDemandEditor.test.tsx`
- Modify: `src/pages/TestDemandSubmit.tsx`
- Modify: `src/pages/DemandApproval.tsx`
- Modify: `src/utils/draftStorage.ts`

- [ ] **Step 1: 写人力拆分纯函数失败测试**

```typescript
it('subtracts special manpower from its group without increasing total', () => {
  const summary = calculateManpowerSummary(
    { 功能测试: 8 },
    [
      { moduleId: 11, testType: '功能测试', manpowerDemand: 2 },
      { moduleId: 12, testType: '功能测试', manpowerDemand: 1.5 },
    ],
  );
  expect(summary).toEqual([
    { testType: '功能测试', totalManpower: 8, specialManpower: 3.5, generalManpower: 4.5 },
  ]);
});

it('returns SPECIAL_MODULE_EXCEEDS_GROUP for overflow', () => {
  expect(validateSpecialModuleRows({ 功能测试: 3 }, [
    { moduleId: 11, testType: '功能测试', manpowerDemand: 3.5 },
  ])).toMatchObject({ valid: false, errorCode: 'SPECIAL_MODULE_EXCEEDS_GROUP' });
});
```

- [ ] **Step 2: 运行纯函数测试并确认失败**

Run: `npm test -- src/utils/specialModuleCalculations.test.ts`

Expected: FAIL，计算函数尚不存在。

- [ ] **Step 3: 实现动态行组件和联动测试**

组件 props 固定为：

```typescript
interface SpecialModuleDemandEditorProps {
  rows: SpecialModuleDemandInput[];
  modules: TestModule[];
  manpowerByTestType: Record<string, number>;
  onChange: (rows: SpecialModuleDemandInput[]) => void;
}
```

每行先选 `testType`，模块选项过滤 `module.testType === row.testType && module.enabled`，已被其他行选择的模块禁用。切换小组时清空 `moduleId` 和 `manpowerDemand`。溢出时给相关行显示错误并由父页面禁用提交。

- [ ] **Step 4: 接入提交、编辑回填和草稿**

`TestDemandSubmit.tsx` 同时请求字段配置和模块列表；删除原“所需模块”自由文本输入，保留 `remark` 数据兼容展示。提交 payload 增加：

```typescript
specialModuleDemands: specialRows.map(row => ({
  moduleId: row.moduleId,
  manpowerDemand: row.manpowerDemand,
}))
```

`DraftData` 增加 `specialModuleDemands`，恢复草稿时一并恢复。提交前 `validateSpecialModuleRows` 失败则定位并提示对应小组。

- [ ] **Step 5: 接入审批详情和审批修改**

`DemandApproval.tsx` 展示每组“总人力 / 特殊模块 / 通用人力”，审批修改时复用 `SpecialModuleDemandEditor`，提交 `specialModuleDemands`。停用模块历史行显示“已停用”，不可在新行选择。

- [ ] **Step 6: 验证表单**

Run: `npm test -- src/utils/specialModuleCalculations.test.ts src/components/SpecialModuleDemandEditor.test.tsx`

Expected: PASS，小组联动、重复禁选、溢出拦截、切组清空和停用回填均通过。

Run: `npm run build`

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/utils src/components/SpecialModuleDemandEditor.tsx src/components/SpecialModuleDemandEditor.test.tsx src/pages/TestDemandSubmit.tsx src/pages/DemandApproval.tsx
git commit -m "feat: capture special module manpower demand"
```

---

### Task 12: 将人员熟悉模块改为跨组多选

**Files:**
- Modify: `src/pages/StaffManagement.tsx`
- Create: `src/utils/staffModuleImport.ts`
- Create: `src/utils/staffModuleImport.test.ts`

- [ ] **Step 1: 写导入解析失败测试**

```typescript
it('maps unique names and reports unknown module names', () => {
  const result = parseFamiliarModuleNames('支付模块；未知模块,支付模块', [
    { id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, sortOrder: 10 },
  ]);
  expect(result.moduleIds).toEqual([11]);
  expect(result.unmatched).toEqual(['未知模块']);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/utils/staffModuleImport.test.ts`

Expected: FAIL，导入解析函数尚不存在。

- [ ] **Step 3: 修改人员表单和列表**

页面初始化加载全部模块。熟悉模块字段使用 `Select mode="multiple"`，按 `testType` 生成分组选项，不根据人员本组过滤。payload 使用 `familiarModuleIds`。列表和详情使用结构化标签；停用模块显示灰色“已停用”。

- [ ] **Step 4: 修改 Excel 导入**

对“熟悉模块”列使用 `parseFamiliarModuleNames`。存在未匹配名称时，该行不静默提交，在导入预览中显示具体名称；用户修正后才可批量保存。导出模板仍保留“熟悉模块”列，说明使用全系统唯一名称和逗号分隔。

- [ ] **Step 5: 验证人员页面**

Run: `npm test -- src/utils/staffModuleImport.test.ts && npm run build`

Expected: PASS，跨组模块可选、重复去除、未知名称可见。

- [ ] **Step 6: Commit**

```bash
git add src/pages/StaffManagement.tsx src/utils/staffModuleImport.ts src/utils/staffModuleImport.test.ts
git commit -m "feat: select structured familiar modules for staff"
```

---

### Task 13: 工作台切换到后端推荐、明细拖拽和正确发布

**Files:**
- Modify: `src/pages/workbench/workbenchTypes.ts`
- Modify: `src/pages/workbench/workbenchCalculations.ts`
- Modify: `src/pages/workbench/DemandQueue.tsx`
- Create: `src/pages/workbench/DemandQueue.test.tsx`
- Modify: `src/pages/workbench/ScheduleTimeline.tsx`
- Modify: `src/pages/workbench/IssuePublishPanel.tsx`
- Modify: `src/pages/ScheduleWorkbench.tsx`

- [ ] **Step 1: 写“总量够但模块未满足”分类失败测试**

```typescript
it('keeps demand pending until every module and general bucket is satisfied', () => {
  const demand: DemandItem = {
    id: 1001,
    product: '示例产品',
    version: 'v2.0.0',
    startDate: '2026-07-22T00:00:00',
    endDate: '2026-07-31T00:00:00',
    manpowerDemand: 8,
    versionType: '维护',
    status: 'pending',
    manpowerFullySatisfied: false,
    specialModuleDemands: [{
      id: 501, moduleId: 11, moduleName: '支付模块', testType: '功能测试',
      enabled: true, manpowerDemand: 2, allocatedManpower: 1, remainingManpower: 1,
    }],
  };
  expect(filterAssignedDemands([demand], [], [], [])).toEqual([]);
  expect(filterPendingDemands([demand], [], [], [])).toEqual([demand]);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/pages/workbench/DemandQueue.test.tsx`

Expected: FAIL，当前分类仍按总人天计算。

- [ ] **Step 3: 引入明确的拖拽分配目标**

```typescript
export type AllocationTarget =
  | {
      kind: 'special';
      demandId: number;
      demandManpowerDetailId: number;
      demandSpecialModuleId: number;
      testType: string;
      moduleId: number;
      moduleName: string;
      remainingManpower: number;
    }
  | {
      kind: 'general';
      demandId: number;
      demandManpowerDetailId: number;
      testType: string;
      remainingManpower: number;
    };
```

`DemandQueue` 在每张需求卡下渲染特殊模块分配项和各组通用分配项，每个分配项单独可拖拽。卡片只在 `manpowerFullySatisfied=true` 时进入“已分配”。

- [ ] **Step 4: 改造手动拖拽和移动**

`ScheduleWorkbench` 保存 `draggedAllocationTarget`。拖到人员日期单元格时，先本地检查特殊模块能力并调用 `/schedules/validate`，成功后创建带归属字段的排班；失败时保持原数据并显示后端原因。移动已有特殊模块排班调用 `/schedules/{id}/move`，不改变归属字段。

`ScheduleTimeline` 对特殊模块目标只高亮具备 `moduleId` 的人员；不合格人员单元格为 `not-allowed`，Tooltip 显示“不熟悉支付模块”。人员熟悉模块按分组标签展示，不再渲染字符串。

当需求返回 `requiresHistoricalClassification=true` 时，需求详情列出双空历史排班，并提供“小组明细”和可选“特殊模块明细”下拉框；确认后调用 `POST /schedules/{id}/classify`。归类成功后刷新需求满足状态，归类前发布按钮禁用。

- [ ] **Step 5: 切换两种后端推荐接口**

将 `runDateRecommendation` 改为：

```typescript
const result = await api.recommendScheduleDraft({
  mode: 'FIXED_RANGE',
  demandIds: Array.from(selectedDemandIds),
  dateRange: {
    startDate: Array.from(selectedDates).sort()[0],
    endDate: Array.from(selectedDates).sort().at(-1)!,
  },
  fixedStaffIds: Array.from(fixedStaffIds),
  excludedStaffIds: Array.from(excludedStaffIds),
  includeSaturdays,
  includeSundays,
  replaceExistingDrafts: true,
});
applyRecommendationResult(result);
await fetchData();
```

“按全部需求排班”只把 `mode` 改为 `FULL_DEMAND` 且不发送 `dateRange`。删除 `runAllocationCore`、`getAvailableStaffForDate`、`persistRecommendation` 及其专用状态，确保前端不保留第二套算法。

- [ ] **Step 6: 展示模块和通用缺口**

`IssuePublishPanel` 接收推荐响应中的 fulfillment，按需求展示 `specialModuleGaps` 和 `generalGaps`，原因使用后端 `reason`。需求详情显示每组总量、特殊模块分配、通用分配和历史待归类提示。

- [ ] **Step 7: 切换批量发布**

`handlePublishAll` 一次调用 `api.batchPublishSchedules({ demandIds })`。成功列表从本地草稿中刷新，失败列表逐项显示 `reasonCode` 和 `reason`；不再循环调用单需求接口。单需求发布仍调用后端，后端决定是否满足。

- [ ] **Step 8: 验证工作台**

Run: `npm test -- src/pages/workbench/DemandQueue.test.tsx`

Expected: PASS，总量满足但模块有缺口的需求仍在待排期。

Run: `npm run build`

Expected: PASS，代码中不再存在 `runAllocationCore`。

Run: `rg -n "runAllocationCore|familiarModules\?: string" src`

Expected: 无输出。

- [ ] **Step 9: Commit**

```bash
git add src/pages/ScheduleWorkbench.tsx src/pages/workbench
git commit -m "feat: enforce module matching in schedule workbench"
```

---

### Task 14: 完成迁移、双数据库和端到端验收

**Files:**
- Modify: `backend/src/test/java/com/testscheduling/migration/MigrationSmokeTest.java`
- Create: `backend/src/test/java/com/testscheduling/integration/SpecialModuleSchedulingIntegrationTest.java`
- Create: `docs/特殊模块人力排班验收清单.md`
- Create: `docs/verification/2026-07-23-task14-h2-runtime-upgrade.md`

- [x] **Step 1: 写完整服务集成测试**

使用 `@SpringBootTest` 和测试数据库覆盖：创建模块 -> 跨组人员配置熟悉模块 -> 创建需求 -> 审批 -> 推荐 -> 发布。核心断言：

```java
assertNotNull(specialDraft.getDemandSpecialModuleId());
assertEquals(101L, specialDraft.getStaffId());
assertTrue(publishResult.failed().isEmpty());
assertTrue(scheduleRepository.findByDemandId(1001L).stream().allMatch(Schedule::getPublished));
assertFalse(auditLogRepository.findByEntityTypeAndEntityIdOrderByCreatedAtDesc("SCHEDULE", "1001").isEmpty());
```

第二场景移除人员模块关系后发布，断言 `STAFF_MODULE_NOT_FAMILIAR`；第三场景一个需求失败、另一个成功，断言批量结果部分成功。

Evidence (2026-07-23, `6823e33`): `SpecialModuleSchedulingIntegrationTest` 使用真实 Spring/Flyway/JPA 和公开服务 API 覆盖上述 3 个场景；定向运行 3/3 通过。

- [x] **Step 2: 运行全部后端测试**

Run: `cd backend && mvn clean test`

Expected: BUILD SUCCESS，零失败、零错误。

Evidence (2026-07-23, `6823e33`): `cd backend && mvn clean test` 完成，278/278 通过，0 failures，0 errors，0 skipped；报告位于 `backend/target/surefire-reports/`。

- [x] **Step 3: 运行前端全量检查**

Run: `npm test`

Expected: 所有 Vitest 测试通过。

Run: `npm run lint`

Expected: 零 warning、零 error。

Run: `npm run build`

Expected: TypeScript 和 Vite 构建成功。

Evidence (2026-07-23, `6823e33`): `npm test` 为 18 个测试文件、147/147 通过；`npm run lint` 退出码 0；`npm run build` 成功，只有非阻断的大包体提示。

- [x] **Step 4: 验证 H2 文件数据库升级**

备份 `backend/data/testdb.mv.db`，使用现有 H2 数据启动后端：

Run: `cd backend && mvn spring-boot:run`

Expected: Flyway 将现有库 baseline 到 V1、执行 V2 和 V3，JPA `validate` 通过；历史需求、人员和排班接口可读取。

Evidence (2026-07-23, `6823e33`): 非空 H2 文件复制到仓库外临时目录后由 V1 升至 V3，JPA 初始化成功；`/api/demands`、`/api/staff`、`/api/schedules` 均返回 HTTP 200 和非空数据；仓库内原文件 SHA-256 未变化。`MigrationSmokeTest` 同时覆盖 legacy V1 升级、当前 V3 重启和 JPA validate。持久化证据见 [Task 14 H2 运行时升级验证记录](../../verification/2026-07-23-task14-h2-runtime-upgrade.md)。

- [ ] **Step 5: 验证 MySQL profile**

准备空 MySQL 8 数据库后运行：

先在当前终端设置 `MYSQL_PASSWORD`，再运行：

Run: `cd backend && SPRING_PROFILES_ACTIVE=mysql MYSQL_URL='jdbc:mysql://localhost:3306/test_scheduling?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai' MYSQL_USERNAME=root mvn spring-boot:run`

Expected: V1、V2、V3 全部执行，应用启动成功。不要把真实密码写入仓库。

Status (2026-07-23): 待验。仅观察到 MySQL 客户端 9.6.0；未验证 MySQL 8 服务端或一次性空 schema；`MYSQL_URL`、`MYSQL_USERNAME`、`MYSQL_PASSWORD`、`JWT_SECRET` 均不可用；未创建或修改任何 MySQL schema。

- [ ] **Step 6: 浏览器端到端验收**

按以下顺序验证并记录结果：

1. 字段管理员新增两个不同小组模块，重复名称被拒绝。
2. 人员管理员给其他小组测试员配置模块，保存和回填正确。
3. 测试经理填写小组总人力和多个特殊模块；溢出时不能提交。
4. 审批页显示总量、特殊模块和通用人力，审批后数据不丢失。
5. 指定日期推荐只把特殊模块分给熟悉人员。
6. 全部需求推荐在某模块无人时仍完成其他模块和通用排班。
7. 手动拖给不熟悉人员时回弹；拖给熟悉人员时成功。
8. 总量达到但模块缺口未补齐时需求仍在“待排期”。
9. 推荐后移除能力，发布被后端拦截。
10. 批量发布显示逐需求成功和失败原因。

Status (2026-07-23): 工作流 1-10 均待验；没有提交可复验的页面截图和相关请求/响应或后端错误码，不以临时浏览器观察或自动化测试替代人工通过结论。

- [x] **Step 7: 提交验收文档**

```bash
git add backend/src/test docs/特殊模块人力排班验收清单.md
git commit -m "test: verify special module scheduling workflow"
```

Evidence (2026-07-23): `docs/特殊模块人力排班验收清单.md` 已创建，并在文档复核后按计划工作流 1-10、自动化门禁和待验证状态完成校正；提交记录可通过 `git log -- docs/特殊模块人力排班验收清单.md` 复验。

- [ ] **Task 14 最终门禁：未完成**

Pending: MySQL 8 空库迁移/启动和浏览器人工工作流 1-10 均未完成，因此不得将 Task 14 或下方最终验收门禁标记为完成。

---

## 最终验收门禁

实施完成后必须同时满足：

1. `cd backend && mvn clean test` 成功。
2. `npm test`、`npm run lint`、`npm run build` 全部成功。
3. `rg -n "runAllocationCore|familiarModules\?: string" src` 无输出。
4. H2 现有数据升级和 MySQL 空库初始化均成功。
5. 工作台特殊模块任务无法通过推荐、拖拽、编辑、转移或发布分配给不熟悉人员。
6. 通用人力仍按测试类型匹配，不受特殊模块缺口阻塞。
7. “已分配”标签只包含所有特殊模块和通用明细均满足的需求。
8. 历史自由文本和双空归属排班没有被静默删除或误归类。

## 回滚边界

1. 阶段一到阶段二可关闭前端入口回滚，新增表和可空排班字段保留，不做破坏性降级。
2. 阶段三启用后若推荐接口异常，关闭自动推荐入口，但保留后端手动排班硬校验，不能恢复允许错误模块分配的行为。
3. 已写入新归属字段的排班不能回滚到不理解这些字段的旧发布逻辑。
4. 数据库回滚只允许从上线前备份恢复，不编写删除模块关系数据的自动 down migration。
