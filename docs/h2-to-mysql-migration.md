# H2 → MySQL 切换

## 1. 改 application.yml

替换 `spring.datasource` 和 `spring.jpa`：

```yaml
spring:
  datasource:
    url: jdbc:mysql://${MYSQL_HOST:localhost}:${MYSQL_PORT:3306}/${MYSQL_DB:test_scheduling}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf8mb4
    driver-class-name: com.mysql.cj.jdbc.Driver
    username: ${MYSQL_USER:ts_user}
    password: ${MYSQL_PASSWORD:your_secure_password}
  h2:
    console:
      enabled: false
  jpa:
    properties:
      hibernate:
        dialect: org.hibernate.dialect.MySQL8Dialect
```

> pom.xml 不需要改。`mysql-connector-j:8.4.0` 和 `flyway-mysql` 已存在。

## 2. Flyway 迁移脚本

**不需要修改**。已确认 V1~V8 全部兼容 MySQL 8.0.19+：

- V7 的 `ADD COLUMN IF NOT EXISTS` — MySQL 8.0.19+ 支持
- V8 的 `DATETIME` — MySQL 原生支持
- 其余 SQL 均为标准语法

> 要求 MySQL 版本 ≥ 8.0.19

## 3. 环境变量

```
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DB=test_scheduling
MYSQL_USER=ts_user
MYSQL_PASSWORD=your_secure_password
JWT_SECRET=替换为32字符以上密钥
FEISHU_WEBHOOK_URL=飞书webhook地址
FEISHU_WEBHOOK_ENABLED=true
```

## 4. 验证

启动后检查 Flyway 日志 → 调用 `GET /api/demand/list` → MySQL 执行 `SHOW TABLES;`
