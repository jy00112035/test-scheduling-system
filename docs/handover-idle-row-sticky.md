# 交接文档：排班工作台页面滚动修复 + 空闲行冻结

## 本次修改总结

### 修改1：页面滚动修复（ScheduleWorkbench.tsx 第1422行）

**问题：** 排班工作台页面向下滚动时，整个页面（顶部按钮区 + 左侧卡片 + 右侧时间轴）一起滚动。

**根因：** `flex: 1` 在 ScheduleWorkbench 根 div 上无效。父元素 `<Content>` 不是 flex 容器（antd Layout 内 Content 是 flex 子元素，但它自己不设置 `display: flex`），所以 `flex: 1` 不生效。根 div 无高度约束，内容自由扩展，Content 的 `overflow: auto` 接管所有滚动。

**修复（一行）：**
```jsx
// 旧
<div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', overscrollBehavior: 'none', minHeight: 0 }}>

// 新
<div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
```

`height: '100%'` 将根 div 约束在 Content 的计算高度内。Content 是 Layout 的 flex 子元素（`flex: 1`），拥有浏览器计算后的固定高度，`height: 100%` 正确解析。

**效果：**
- 顶部按钮区固定
- 左侧卡片区固定（卡片多时鼠标悬停独立滚动，DemandQueue 内部已有 `overflowY: auto`）
- 右侧时间轴独立滚动（Card body 的 `overflow: auto` 正确激活）

### 修改2：空闲行移至表头下方（ScheduleTimeline.tsx）

**需求：** 将"空闲可用工作量"行从表格底部移到表头首行下方，冻结表头行和空闲行。

**当前状态：** 待验证。修改1使 Card body 成为真正的滚动容器后，`position: sticky` 应该能正常工作。

**改动明细（ScheduleTimeline.tsx）：**

| 行号 | 变更 |
|------|------|
| 6 | `useRef` 加入 React import |
| 123-125 | 新增 `headerRowRef`、`headerHeight` state（默认 42） |
| 127-132 | 新增 `useEffect`：测量表头行 `offsetHeight`，依赖 `weekDates` |
| 373 | 表头 `<tr>`：`ref={headerRowRef}` + 原始 `position: sticky; top: 0; zIndex: 5` |
| 412-485 | 空闲行：移至 `<tbody>` 首行，`position: sticky; top: headerHeight; zIndex: 4`，`boxShadow: '0 2px 4px ...'`，`borderBottom: '2px solid #1677ff'` |
| 原 667-741 | 已删除 tbody 底部旧的空闲行 |

**最终表格结构：**
```
<thead>
  <tr ref={headerRowRef} style="position: sticky; top: 0; zIndex: 5">
    ...列标题...
  </tr>
</thead>
<tbody>
  <tr style="position: sticky; top: headerHeight; zIndex: 4">
    ...空闲可用工作量...
  </tr>
  {filteredStaffs.map(...)}
</tbody>
```

### 修改3：`bodyStyle` 废弃警告（建议处理，未实施）

Ant Design 5.x 中 Card 的 `bodyStyle` 已废弃，建议后续改用 `styles={{ body: {...} }}`。当前代码仍在使用 `bodyStyle`，功能正常但控制台可能有警告。

---

## 布局链（修改后）

```
App.tsx:
  <Layout style={{ height: '100vh' }}>                     ← 固定视口
    <Layout style={{ overflow: 'hidden', minHeight: 0 }}>  ← flex 容器
      <Header />                                            ← 固定
      <Content style={{ margin: '16px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        ScheduleWorkbench 根 div (height: '100%', overflow: 'hidden', flex column)
          ├── 顶部按钮区 (flexShrink: 0)                    ← 固定
          └── 主体区域 (flex: 1, overflow: 'hidden', flex row)
               ├── DemandQueue (width: 270)                  ← 内部 overflowY: auto
               └── ScheduleTimeline Card (flex: 1)
                    └── Card body (overflow: auto)           ← **时间轴滚动容器**
```

---

## Z-Index 层级

| zIndex | 元素 |
|--------|------|
| 1 | 人员行 sticky left 列 |
| 4 | 空闲行 `<tr>` + 空闲行标签 `<td>` |
| 5 | 表头行 `<tr>` |
| 6 | 表头 sticky left 列 |

---

## 已尝试但失败的方案

| 方案 | 做法 | 失败原因 |
|------|------|---------|
| A | `position: sticky` 在 `<thead>` 上 | 浏览器不支持 `display: table-header-group` 上的 sticky |
| B | 两个 `<tr>` 在 `<thead>` 内分别 sticky | `<td>` 在 `<thead>` 内疑似导致表格布局异常 |
| C | 空闲行在 `<tbody>` 首行 sticky | 修改1之前，Card body 不是真正的滚动容器，sticky 不生效 |

---

## 仪表盘滚动保护

仪表盘依赖 `App.tsx:311` 的 `<Content style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>` 提供页面级滚动。Dashboard 组件无 `height: 100%`，内容自然溢出 Content。ScheduleWorkbench 的 `height: '100%'` 仅在该组件渲染时生效，不影响其他页面。

---

## 待验证项

1. 空闲行 sticky 冻结是否生效（依赖修改1使 Card body 正确激活为滚动容器）
2. 表头 sticky 冻结是否生效
3. 左侧卡片区独立滚动
4. 仪表盘和其他页面滚动正常

## 恢复命令

```bash
# 恢复 ScheduleTimeline.tsx（空闲行改动）
git checkout -- src/pages/workbench/ScheduleTimeline.tsx

# 恢复 ScheduleWorkbench.tsx（滚动修复）
git checkout -- src/pages/ScheduleWorkbench.tsx
```
