# 测试排班系统 - 后端 API

## 技术栈

- Java 17
- Spring Boot 3.2.0
- Spring Data JPA
- Spring Security
- H2 Database (开发环境)
- JWT Authentication
- Lombok

## 快速开始

### 环境要求

- JDK 17+
- Maven 3.6+

### 运行

```bash
cd backend
mvn spring-boot:run
```

服务将在 http://localhost:8080 启动

### H2 控制台

访问 http://localhost:8080/h2-console

- JDBC URL: `jdbc:h2:mem:testdb`
- Username: `sa`
- Password: (空)

## 默认用户

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 字段管理员 |
| testmanager | test123 | 测试经理 |
| resourcemanager | resource123 | 资源主管 |
| projectmanager | project123 | 项目经理 |
| testexecutor | test123 | 测试执行人员 |

## API 接口

### 认证

```
POST /api/auth/login - 登录
```

### 测试需求

```
GET    /api/demands        - 获取所有需求
GET    /api/demands/{id}   - 获取单个需求
GET    /api/demands/pending - 获取待排期需求
POST   /api/demands       - 创建需求
PUT    /api/demands/{id}  - 更新需求
DELETE /api/demands/{id}  - 删除需求
POST   /api/demands/{id}/close - 关闭需求
```

### 排班

```
GET    /api/schedules              - 获取所有排班
GET    /api/schedules/{id}         - 获取单个排班
GET    /api/schedules/date/{date}  - 按日期获取
GET    /api/schedules/range        - 按日期范围获取
POST   /api/schedules             - 创建排班
POST   /api/schedules/batch        - 批量创建
PUT    /api/schedules/{id}         - 更新排班
DELETE /api/schedules/{id}         - 删除排班
```

### 人员

```
GET    /api/staff         - 获取所有人员
GET    /api/staff/{id}    - 获取单个人员
GET    /api/staff/active  - 获取在职人员
POST   /api/staff         - 创建人员
PUT    /api/staff/{id}    - 更新人员
DELETE /api/staff/{id}    - 删除人员
```

### 字段配置

```
GET    /api/field-configs          - 获取所有配置
GET    /api/field-configs/{id}     - 获取单个配置
GET    /api/field-configs/name/{name} - 按名称获取
POST   /api/field-configs          - 创建配置
PUT    /api/field-configs/{id}     - 更新配置
DELETE /api/field-configs/{id}     - 删除配置
```

## 响应格式

```json
{
  "code": 200,
  "message": "success",
  "data": { ... }
}
```

## 前端对接

前端开发服务器运行在 3000 端口，后端 API 运行在 8080 端口。

在前端添加代理配置，或在 API 调用时使用完整的 URL。
