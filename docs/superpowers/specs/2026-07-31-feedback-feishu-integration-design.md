# 反馈系统 + 飞书推送 设计文档

## 概述

在测试排班系统中新增用户反馈功能，允许所有登录用户通过全局悬浮按钮提交 Bug 报告或功能需求。反馈内容存入数据库并通过飞书 Webhook 推送到指定群组，管理员可在系统内管理反馈列表。

## 需求摘要

- **入口**：页面右下角全局悬浮按钮，所有已登录页面可见
- **表单**：类型（Bug/功能需求）、标题、详细描述
- **存储**：数据库持久化 + 飞书 Webhook 推送
- **权限**：所有登录用户可提交，管理员可管理
- **管理页**：反馈列表、筛选、状态管理、处理备注、导出 Excel

---

## 数据模型

### feedback 表

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | BIGINT | PK AUTO_INCREMENT | 主键 |
| `type` | VARCHAR(20) | NOT NULL | 类型：`BUG` / `FEATURE` |
| `title` | VARCHAR(200) | NOT NULL | 标题 |
| `description` | TEXT | NOT NULL | 详细描述 |
| `submitter_id` | BIGINT | NOT NULL | 提交人 ID |
| `submitter_name` | VARCHAR(50) | NOT NULL | 提交人姓名（冗余） |
| `status` | VARCHAR(20) | NOT NULL DEFAULT 'PENDING' | 状态：`PENDING` / `IN_PROGRESS` / `RESOLVED` / `CLOSED` |
| `admin_note` | TEXT | NULL | 管理员处理备注 |
| `created_at` | DATETIME | NOT NULL | 创建时间 |
| `updated_at` | DATETIME | NOT NULL | 更新时间 |

通过 Flyway 增量迁移脚本（V8）建表。

### 枚举值

**FeedbackType**: `BUG`（Bug 报告）、`FEATURE`（功能需求）

**FeedbackStatus**:
- `PENDING` - 待处理
- `IN_PROGRESS` - 处理中
- `RESOLVED` - 已解决
- `CLOSED` - 已关闭

---

## 后端设计

### 新增文件

| 层 | 文件 | 说明 |
|---|---|---|
| Entity | `Feedback.java` | JPA 实体 |
| Enum | `FeedbackType.java` | 反馈类型枚举 |
| Enum | `FeedbackStatus.java` | 反馈状态枚举 |
| Repository | `FeedbackRepository.java` | Spring Data JPA Repository |
| DTO | `FeedbackCreateRequest.java` | 提交反馈请求体 |
| DTO | `FeedbackUpdateRequest.java` | 更新状态/备注请求体 |
| DTO | `FeedbackResponse.java` | 反馈响应体 |
| Service | `FeedbackService.java` | 业务逻辑 |
| Service | `FeishuWebhookService.java` | 飞书 Webhook 推送 |
| Controller | `FeedbackController.java` | REST API |
| Migration | `V8__create_feedback_table.sql` | Flyway 迁移脚本 |

### API 接口

#### POST /api/feedback — 提交反馈

- **权限**：所有登录用户
- **请求体**：
  ```json
  {
    "type": "BUG",
    "title": "登录页面显示异常",
    "description": "在 Chrome 浏览器下，登录按钮被遮挡..."
  }
  ```
- **响应**：返回创建的 Feedback 对象
- **副作用**：异步发送飞书 Webhook 消息

#### GET /api/feedback — 查询反馈列表（管理员）

- **权限**：管理员
- **查询参数**：`type`（可选）、`status`（可选）、`submitterId`（可选）、`page`、`size`
- **响应**：分页的反馈列表

#### GET /api/feedback/mine — 查询我的反馈

- **权限**：所有登录用户
- **查询参数**：`page`、`size`
- **响应**：当前用户提交的反馈列表

#### PUT /api/feedback/{id}/status — 更新反馈状态

- **权限**：管理员
- **请求体**：
  ```json
  {
    "status": "RESOLVED",
    "adminNote": "已在 v2.1 修复"
  }
  ```
- **响应**：更新后的 Feedback 对象

#### GET /api/feedback/export/excel — 导出 Excel

- **权限**：管理员
- **查询参数**：同列表查询（type、status、submitterId）
- **响应**：Excel 文件流（Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet）
- **限制**：最多导出 1000 条

### 飞书 Webhook 推送

`FeishuWebhookService` 负责发送消息：

- **触发时机**：用户提交反馈时（异步执行）
- **消息格式**：飞书富文本卡片（Interactive Card）
- **卡片内容**：
  - 标题：「新反馈」+ 反馈标题
  - 类型：Bug / 功能需求
  - 描述：反馈详细内容
  - 提交人：姓名
  - 时间：提交时间
- **Webhook URL**：通过 `application.yml` 配置 `feishu.webhook.url`
- **错误处理**：Webhook 发送失败仅记录日志，不影响反馈创建成功

---

## 前端设计

### 新增文件

| 文件 | 说明 |
|---|---|
| `src/components/FeedbackFloatingButton.tsx` | 全局悬浮按钮 + 反馈弹窗 |
| `src/pages/FeedbackManagement.tsx` | 反馈管理页面 |
| `src/services/api.ts`（修改） | 新增反馈相关 API 方法 |

### 组件设计

#### FeedbackFloatingButton

- 使用 Ant Design `FloatButton` 组件
- 位置：右下角固定定位
- 点击后打开 `Modal` 弹窗
- 弹窗内包含表单：类型（Radio.Group）、标题（Input）、描述（TextArea）
- 提交成功后显示成功提示，清空表单并关闭弹窗
- 登录后才显示（通过 `useAuth` 判断）

#### FeedbackManagement

- 侧边栏菜单项："反馈管理"，图标 `MessageOutlined`，仅管理员可见
- **筛选区**：类型下拉 + 状态下拉 + 提交人 Input.Search
- **表格列**：标题、类型（Tag 标签）、状态（Tag 标签）、提交人、创建时间、操作
- **操作列**：修改状态（下拉选择）、添加备注（弹窗）、查看详情（Drawer）
- **导出按钮**：导出当前筛选结果为 Excel
- **分页**：标准分页器

### API 方法扩展

在 `api.ts` 中新增：

```typescript
// 提交反馈
createFeedback(request: FeedbackCreateRequest): Promise<Feedback>

// 查询反馈列表（管理员）
getFeedbackList(params: FeedbackQueryParams): Promise<PageResult<Feedback>>

// 查询我的反馈
getMyFeedback(params: PageParams): Promise<PageResult<Feedback>>

// 更新反馈状态
updateFeedbackStatus(id: number, request: FeedbackUpdateRequest): Promise<Feedback>

// 导出反馈
exportFeedback(params: FeedbackQueryParams): Promise<Blob>
```

### 类型定义

在 `src/types/index.ts` 中新增：

```typescript
type FeedbackType = 'BUG' | 'FEATURE';
type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface Feedback {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  submitterId: number;
  submitterName: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 配置项

### application.yml 新增

```yaml
feishu:
  webhook:
    url: https://open.feishu.cn/open-apis/bot/v2/hook/xxxxxxxx
    enabled: true
```

- `url`：飞书自定义机器人 Webhook 地址
- `enabled`：是否启用推送（开发环境可关闭）

---

## 错误处理

| 场景 | 处理方式 |
|---|---|
| 表单字段校验失败 | 前端 Ant Design Form 校验 + 后端 @Valid 校验，返回统一 ApiResponse |
| 飞书 Webhook 发送失败 | 仅记录 WARN 日志，不影响反馈创建 |
| 非管理员访问管理接口 | 返回 403，前端隐藏入口 |
| 导出数据量过大 | 限制最大 1000 条，超出提示用户缩小筛选范围 |

---

## 测试策略

- **后端单元测试**：FeedbackService 的 CRUD 逻辑、状态流转
- **后端集成测试**：FeedbackController 的 API 接口、权限校验
- **前端组件测试**：FeedbackFloatingButton 的表单交互、FeedbackManagement 的筛选和操作
- **飞书 Webhook**：Mock HTTP 调用，验证消息格式正确
