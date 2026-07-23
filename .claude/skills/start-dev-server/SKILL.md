---
name: start-dev-server
description: 启动前后端开发服务器并在浏览器中打开（前端 3000 端口、后端 8080 端口）
---

# 启动开发服务器

在浏览器中打开前端和后端开发服务器。

## 前置条件

- 前端：Node.js + npm，项目根目录有 `package.json`
- 后端：Java + Maven，`backend/pom.xml` 存在
- 后端 `application.yml` 中 `jwt.secret` 需要有默认值（如 `${JWT_SECRET:默认值}`），否则需设置环境变量

## 执行步骤

### 1. 检查并停用已有服务

```bash
pkill -f "spring-boot:run" 2>/dev/null; pkill -f "vite" 2>/dev/null; sleep 2; echo "已清理旧进程"
```

### 2. 启动后端（后台运行）

```bash
mvn spring-boot:run -f backend/pom.xml
```

使用 `run_in_background: true` 启动。

如果启动失败，检查错误：
- `Could not resolve placeholder 'JWT_SECRET'` → 需要在 `application.yml` 中给 `jwt.secret` 添加默认值：`${JWT_SECRET:DevSecretKeyForLocalTestingOnlyMustBe32CharsLong}`
- 端口占用 → `lsof -i :8080` 检查并清理

### 3. 启动前端（后台运行）

```bash
npm run dev
```

使用 `run_in_background: true` 启动。

### 4. 等待服务就绪

使用 Monitor 工具等待后端启动（后端启动较慢）：

```bash
until curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null | grep -qE "200|401|302|403"; do sleep 3; done; echo "backend ready"
```

前端通常秒启，可直接检查：`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`

### 5. 在浏览器中打开

```bash
open http://localhost:3000
open http://localhost:8080
```

## 端口说明

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端 (Vite) | 3000 | React 开发服务器，热更新 |
| 后端 (Spring Boot) | 8080 | API 服务器，返回 401 为正常（需 JWT 认证） |
| H2 控制台 | 8080/h2-console | 数据库管理（需先在 application.yml 中启用） |

## 常见问题

### 后端启动报 JWT_SECRET 错误

合并代码后 `JwtUtil` 改为读取环境变量。本地开发可在 `backend/src/main/resources/application.yml` 中设置默认值：

```yaml
jwt:
  secret: ${JWT_SECRET:DevSecretKeyForLocalTestingOnlyMustBe32CharsLong}
  expiration: 86400000
```

### 前端启动报端口占用

```bash
lsof -i :3000 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### 后端启动报端口占用

```bash
lsof -i :8080 | grep LISTEN | awk '{print $2}' | xargs kill -9
```
