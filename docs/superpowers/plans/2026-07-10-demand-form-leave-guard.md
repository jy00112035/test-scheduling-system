# 需求表单离开保护与草稿保存 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为测试需求表单添加离开确认弹窗和草稿自动保存功能，防止用户误操作丢失已填写内容

**架构：** 在 TestDemandSubmit 组件中使用 Ant Design Form 的 `onValuesChange` 追踪表单脏状态，Modal 关闭前检查并弹出确认对话框；同时使用 localStorage 自动保存草稿，下次打开时可恢复

**技术栈：** React 18, TypeScript, Ant Design 5 (Modal.confirm, Form), localStorage

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `src/pages/TestDemandSubmit.tsx` | 表单组件：添加脏状态追踪、离开确认、草稿保存/恢复逻辑 |
| `src/pages/TestDemandList.tsx` | 列表页：修改 Modal onCancel 为受控关闭，传递脏状态回调 |
| `src/utils/draftStorage.ts` | 新建：草稿 localStorage 工具函数（保存、读取、清除） |

---

### 任务 1：创建草稿存储工具函数

**文件：**
- 创建：`src/utils/draftStorage.ts`

- [ ] **步骤 1：编写草稿存储工具**

```typescript
// src/utils/draftStorage.ts

const DRAFT_KEY_PREFIX = 'demand_draft_';
const DRAFT_TIMESTAMP_KEY = 'demand_draft_timestamp_';

export interface DraftData {
  formData: Record<string, any>;
  manpowerInputs: Record<string, number>;
  manpowerRemarks: Record<string, string>;
  timestamp: number;
}

/**
 * 保存草稿到 localStorage
 */
export function saveDraft(draftId: string, data: Omit<DraftData, 'timestamp'>): void {
  try {
    const draft: DraftData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(DRAFT_KEY_PREFIX + draftId, JSON.stringify(draft));
    localStorage.setItem(DRAFT_TIMESTAMP_KEY + draftId, String(draft.timestamp));
  } catch (error) {
    console.warn('保存草稿失败:', error);
  }
}

/**
 * 读取草稿
 */
export function getDraft(draftId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + draftId);
    if (!raw) return null;
    return JSON.parse(raw) as DraftData;
  } catch (error) {
    console.warn('读取草稿失败:', error);
    return null;
  }
}

/**
 * 清除指定草稿
 */
export function clearDraft(draftId: string): void {
  localStorage.removeItem(DRAFT_KEY_PREFIX + draftId);
  localStorage.removeItem(DRAFT_TIMESTAMP_KEY + draftId);
}

/**
 * 获取草稿时间戳（用于显示"草稿来自 X 分钟前"）
 */
export function getDraftTimestamp(draftId: string): number | null {
  const ts = localStorage.getItem(DRAFT_TIMESTAMP_KEY + draftId);
  return ts ? Number(ts) : null;
}

/**
 * 格式化草稿时间
 */
export function formatDraftTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
```

- [ ] **步骤 2：验证文件创建成功**

运行：`cat src/utils/draftStorage.ts | head -5`
预期：看到文件头部注释

- [ ] **步骤 3：Commit**

```bash
git add src/utils/draftStorage.ts
git commit -m "feat: add draft storage utility for demand form"
```

---

### 任务 2：修改 TestDemandList Modal 为受控关闭

**文件：**
- 修改：`src/pages/TestDemandList.tsx`

- [ ] **步骤 1：添加脏状态管理和关闭确认逻辑**

在 `TestDemandList.tsx` 中添加状态和处理函数：

```typescript
// 在现有 state 声明附近添加
const [formDirty, setFormDirty] = useState(false);

// 添加关闭确认处理
const handleModalClose = useCallback(() => {
  if (formDirty) {
    Modal.confirm({
      title: '确认离开',
      icon: <ExclamationCircleOutlined />,
      content: '您有未保存的更改，确定要离开吗？',
      okText: '保存草稿并离开',
      cancelText: '直接离开',
      closable: true,
      maskClosable: true,
      onOk() {
        // 保存草稿的逻辑会在 TestDemandSubmit 中处理
        // 这里通过事件通知表单组件保存草稿
        window.dispatchEvent(new CustomEvent('save-demand-draft'));
        setShowSubmitModal(false);
        setFormDirty(false);
        message.success('草稿已保存');
      },
      onCancel() {
        // 清除草稿
        window.dispatchEvent(new CustomEvent('clear-demand-draft'));
        setShowSubmitModal(false);
        setFormDirty(false);
      },
    });
  } else {
    setShowSubmitModal(false);
  }
}, [formDirty]);
```

- [ ] **步骤 2：修改 Modal 的 onCancel**

找到 Modal 组件（约 443-456 行），将 `onCancel={() => setShowSubmitModal(false)}` 改为 `onCancel={handleModalClose}`：

```tsx
<Modal
  title={editingDemand ? '编辑测试需求' : '提交测试需求'}
  open={showSubmitModal}
  onCancel={handleModalClose}  // 修改这里
  footer={null}
  width={800}
  destroyOnClose
>
```

- [ ] **步骤 3：传递 onDirtyChange 给表单组件**

修改 TestDemandSubmit 组件的使用，添加 `onDirtyChange` prop：

```tsx
<TestDemandSubmit
  onBack={handleSubmitSuccess}
  initialValues={editingDemand || undefined}
  isEdit={!!editingDemand}
  onDirtyChange={setFormDirty}  // 新增
/>
```

- [ ] **步骤 4：添加必要的 import**

确保文件顶部导入了需要的组件：

```typescript
import { Modal, message } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useCallback } from 'react';
```

- [ ] **步骤 5：Commit**

```bash
git add src/pages/TestDemandList.tsx
git commit -m "feat: add controlled modal close with dirty state check"
```

---

### 任务 3：为 TestDemandSubmit 添加脏状态追踪和草稿功能

**文件：**
- 修改：`src/pages/TestDemandSubmit.tsx`

- [ ] **步骤 1：添加新的 props 接口**

在组件 props 定义处添加 `onDirtyChange`：

```typescript
interface TestDemandSubmitProps {
  onBack?: () => void;
  initialValues?: TestDemand;
  isEdit?: boolean;
  onDirtyChange?: (dirty: boolean) => void;  // 新增
}
```

- [ ] **步骤 2：添加草稿相关的 state 和 import**

在组件顶部添加导入和状态：

```typescript
import { useEffect, useState, useRef, useCallback } from 'react';
import { Modal, message } from 'antd';
import { saveDraft, getDraft, clearDraft, formatDraftTime, getDraftTimestamp } from '../utils/draftStorage';

// 在组件内部
const draftId = useRef(isEdit ? `edit_${initialValues?.id}` : 'new').current;
const [hasShownDraftPrompt, setHasShownDraftPrompt] = useState(false);
```

- [ ] **步骤 3：添加草稿恢复提示**

在 FieldConfig 加载的 useEffect 之后添加草稿恢复逻辑：

```typescript
// 组件挂载时检查是否有草稿
useEffect(() => {
  if (hasShownDraftPrompt) return;

  const draft = getDraft(draftId);
  if (!draft) {
    setHasShownDraftPrompt(true);
    return;
  }

  const draftTime = getDraftTimestamp(draftId);
  const timeText = draftTime ? formatDraftTime(draftTime) : '';

  Modal.confirm({
    title: '恢复草稿',
    content: `发现${timeText}保存的草稿，是否恢复？`,
    okText: '恢复草稿',
    cancelText: '放弃草稿',
    onOk() {
      // 恢复表单数据
      form.setFieldsValue(draft.formData);
      setManpowerInputs(draft.manpowerInputs);
      setManpowerRemarks(draft.manpowerRemarks);
      message.success('草稿已恢复');
    },
    onCancel() {
      clearDraft(draftId);
    },
  });

  setHasShownDraftPrompt(true);
}, [draftId, form, hasShownDraftPrompt]);
```

- [ ] **步骤 4：添加表单值变化监听**

在 Form 组件上添加 `onValuesChange`：

```typescript
<Form
  form={form}
  layout="horizontal"
  labelCol={{ span: 6 }}
  wrapperCol={{ span: 18 }}
  onFinish={handleSubmit}
  style={{ maxWidth: 800 }}
  initialValues={{ priority: 'medium', confidential: false }}
  onValuesChange={() => {
    // 通知父组件表单已变脏
    onDirtyChange?.(true);
  }}
>
```

- [ ] **步骤 5：添加草稿保存/清除事件监听**

```typescript
// 监听草稿保存事件
useEffect(() => {
  const handleSaveDraft = () => {
    const formData = form.getFieldsValue();
    saveDraft(draftId, {
      formData,
      manpowerInputs,
      manpowerRemarks,
    });
    onDirtyChange?.(false);
  };

  const handleClearDraft = () => {
    clearDraft(draftId);
    onDirtyChange?.(false);
  };

  window.addEventListener('save-demand-draft', handleSaveDraft);
  window.addEventListener('clear-demand-draft', handleClearDraft);

  return () => {
    window.removeEventListener('save-demand-draft', handleSaveDraft);
    window.removeEventListener('clear-demand-draft', handleClearDraft);
  };
}, [draftId, form, manpowerInputs, manpowerRemarks, onDirtyChange]);
```

- [ ] **步骤 6：提交成功后清除草稿**

在 `handleSubmit` 函数的成功回调中，添加草稿清除：

```typescript
// 在 api.createDemand 或 api.updateDemand 成功后
clearDraft(draftId);
onDirtyChange?.(false);
```

- [ ] **步骤 7：Commit**

```bash
git add src/pages/TestDemandSubmit.tsx
git commit -m "feat: add form dirty tracking and draft save/restore"
```

---

### 任务 4：端到端测试验证

- [ ] **步骤 1：启动前端开发服务器**

运行：`npm run dev`
预期：服务器在 http://localhost:3000 启动

- [ ] **步骤 2：测试新需求草稿流程**

1. 打开 http://localhost:3000/demands
2. 点击「提交需求」
3. 填写部分表单内容（如产品名称）
4. 点击 Modal 的 X 关闭按钮
5. 预期：弹出挽留弹窗，提示「保存草稿并离开」或「直接离开」
6. 选择「保存草稿并离开」
7. 再次点击「提交需求」
8. 预期：弹出「恢复草稿」提示

- [ ] **步骤 3：测试直接离开流程**

1. 点击「提交需求」
2. 填写部分内容
3. 点击 X 关闭
4. 选择「直接离开」
5. 再次点击「提交需求」
6. 预期：没有草稿恢复提示（草稿已被清除）

- [ ] **步骤 4：测试未修改直接关闭**

1. 点击「提交需求」
2. 不做任何修改，直接点击 X
3. 预期：直接关闭，无挽留弹窗（因为表单未变脏）

- [ ] **步骤 5：Commit 最终版本**

```bash
git add -A
git commit -m "feat: complete demand form leave guard and draft persistence"
```
