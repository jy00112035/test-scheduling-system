// ============================================================
// DemandQueue — 左侧需求队列
// Phase 1: 风险排序 + 测试类型筛选 + 待排期/已分配 Tab
// ============================================================

import React, { useMemo } from 'react';
import { Card, Select, Tabs, Tag, Button } from 'antd';
import type { DemandItem, ScheduleItem, StaffItem } from './workbenchTypes';
import {
  filterPendingDemands,
  filterAssignedDemands,
  sortDemandsByRisk,
  getPriorityColor,
} from './workbenchCalculations';
import dayjs from 'dayjs';

interface DemandQueueProps {
  demands: DemandItem[];
  schedules: ScheduleItem[];
  staffs: StaffItem[];
  selectedDemandId: number | null;
  selectedDemandIds: Set<number>;
  pendingChangeDemandIds: Set<number>;
  unfulfilledDemands: Set<number>;
  filterDemandTestTypes: string[];
  priorityOptions: string[];
  editingPriorityId: number | null;
  canManagePriority: boolean;
  onFilterChange: (types: string[]) => void;
  onSelectDemand: (demandId: number) => void;
  onViewDetail: (demand: DemandItem) => void;
  onClearDemand: (demandId: number) => void;
  onPublishDemand: (demandId: number) => void;
  onPriorityEdit: (demandId: number | null) => void;
  onPriorityChange: (demandId: number, priority: string) => void;
  onDemandDragStart: (e: React.DragEvent, demand: DemandItem) => void;
  onDemandDragEnd: () => void;
}

const DemandQueue: React.FC<DemandQueueProps> = ({
  demands,
  schedules,
  staffs,
  selectedDemandIds,
  pendingChangeDemandIds,
  unfulfilledDemands,
  filterDemandTestTypes,
  priorityOptions,
  editingPriorityId,
  canManagePriority,
  onFilterChange,
  onViewDetail,
  onClearDemand,
  onPublishDemand,
  onPriorityEdit,
  onPriorityChange,
  onDemandDragStart,
  onDemandDragEnd,
}) => {
  const staffIds = useMemo(() => staffs.map(s => s.id), [staffs]);

  // 筛选 + 风险排序：待排期需求
  const pendingDemands = useMemo(() => {
    const filtered = filterPendingDemands(demands, schedules, staffIds, filterDemandTestTypes);
    return sortDemandsByRisk(filtered, schedules, staffIds, priorityOptions);
  }, [demands, schedules, staffIds, filterDemandTestTypes, priorityOptions]);

  // 筛选：已分配需求
  const assignedDemands = useMemo(() => {
    return filterAssignedDemands(demands, schedules, staffIds, filterDemandTestTypes);
  }, [demands, schedules, staffIds, filterDemandTestTypes]);

  // 收集所有测试类型（用于筛选下拉）
  const allTestTypes = useMemo(() => {
    const types = new Set<string>();
    demands.forEach(d => {
      if (d.manpowerDetails) {
        d.manpowerDetails.forEach((md) => {
          if (md.testType) types.add(md.testType);
        });
      }
    });
    return Array.from(types).map(t => ({ label: t, value: t }));
  }, [demands]);

  // 渲染需求卡片
  const renderDemandCard = (demand: DemandItem) => {
    const demandSchedules = schedules.filter(
      s => s.demandId === demand.id && staffIds.includes(s.staffId)
    );
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const remainingDays = Number(demand.manpowerDemand || 0) - allocatedDays;
    const daysToEnd = dayjs(demand.endDate).diff(dayjs(), 'day');
    const isUrgent = daysToEnd <= 3 && remainingDays > 0;
    const isUnfulfilled = unfulfilledDemands.has(demand.id);
    const hasChanges = pendingChangeDemandIds.has(demand.id) ||
      demandSchedules.some((s: ScheduleItem) => !s.published);

    // 卡片颜色
    let borderColor = '#b7eb8f';
    let bgColor = '#f6ffed';
    if (isUnfulfilled) {
      borderColor = '#ff4d4f';
      bgColor = '#fff1f0';
    } else if (remainingDays > 0) {
      borderColor = isUrgent ? '#ff4d4f' : '#ff9c6e';
      bgColor = isUrgent ? '#fff1f0' : '#fff7e6';
    }

    return (
      <div
        key={demand.id}
        draggable
        onDragStart={(e) => onDemandDragStart(e, demand)}
        onDragEnd={onDemandDragEnd}
        onClick={() => onViewDetail(demand)}
        style={{
          padding: '4px 6px',
          border: `1px solid ${borderColor}`,
          borderRadius: 3,
          marginBottom: 2,
          cursor: 'pointer',
          background: selectedDemandIds.has(demand.id)
            ? (isUnfulfilled ? '#ffd8d8' : '#d6e4ff')
            : bgColor,
          fontSize: 11,
          transition: 'background 0.2s',
        }}
      >
        {/* 第一行：产品名 + 优先级 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 1,
        }}>
          <strong style={{
            fontSize: 11,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 4,
          }}>
            <span style={{ marginRight: 4, color: selectedDemandIds.has(demand.id) ? '#1890ff' : undefined }}>
              {selectedDemandIds.has(demand.id) ? '☑' : '☐'}
            </span>
            {demand.product}
          </strong>
          {demand.priority && (
            editingPriorityId === demand.id && canManagePriority ? (
              <Select
                size="small"
                value={demand.priority}
                onChange={(val) => onPriorityChange(demand.id, val)}
                onBlur={() => onPriorityEdit(null)}
                style={{ width: 56, fontSize: 10 }}
                autoFocus
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                {priorityOptions.map(opt => (
                  <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                ))}
              </Select>
            ) : (
              <Tag
                color={getPriorityColor(demand.priority, priorityOptions)}
                style={{
                  margin: 0,
                  fontSize: 9,
                  lineHeight: '14px',
                  padding: '0 4px',
                  flexShrink: 0,
                  cursor: canManagePriority ? 'pointer' : 'default',
                }}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (canManagePriority) {
                    onPriorityEdit(editingPriorityId === demand.id ? null : demand.id);
                  }
                }}
              >
                {demand.priority}
              </Tag>
            )
          )}
        </div>

        {/* 第二行：日期范围 */}
        <div style={{ fontSize: 10, color: '#888' }}>
          {dayjs(demand.startDate).format('MM/DD')} ~ {dayjs(demand.endDate).format('MM/DD')}
        </div>

        {/* 第三行：人天 + 标识 + 操作按钮 */}
        <div style={{
          fontSize: 10,
          color: '#888',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span>
            {Number(demand.manpowerDemand || 0).toFixed(1)} 人/天
            {allocatedDays > 0 && (
              <span style={{ marginLeft: 4, color: '#1890ff' }}>
                已排 {allocatedDays.toFixed(1)}
              </span>
            )}
            {demand.testDeviceCount != null && (
              <span style={{ marginLeft: 4 }}>{demand.testDeviceCount} 台</span>
            )}
          </span>
          <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {demand.confidential && (
              <Tag color="red" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>保密</Tag>
            )}
            {hasChanges && (
              <Tag color="processing" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>待提交</Tag>
            )}
            <Button
              size="small"
              type="link"
              danger
              style={{ fontSize: 10, padding: 0, height: 16 }}
              onClick={(e) => { e.stopPropagation(); onClearDemand(demand.id); }}
            >
              清除
            </Button>
            {hasChanges && (
              <Button
                size="small"
                type="link"
                style={{ fontSize: 10, padding: 0, height: 16 }}
                onClick={(e) => { e.stopPropagation(); onPublishDemand(demand.id); }}
              >
                发布
              </Button>
            )}
          </span>
        </div>
      </div>
    );
  };

  // 渲染已分配需求卡片（简化版，不可拖拽）
  const renderAssignedCard = (demand: DemandItem) => {
    return (
      <div
        key={demand.id}
        onClick={() => onViewDetail(demand)}
        style={{
          padding: '4px 6px',
          border: '1px solid #b7eb8f',
          borderRadius: 3,
          marginBottom: 2,
          background: '#f6ffed',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 1,
        }}>
          <strong style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>
            {demand.product}
          </strong>
          <span style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
            {demand.priority && (
              <Tag
                color={getPriorityColor(demand.priority, priorityOptions)}
                style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}
              >
                {demand.priority}
              </Tag>
            )}
            {demand.confidential && (
              <Tag color="red" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>保密</Tag>
            )}
          </span>
        </div>
        <div style={{ fontSize: 10, color: '#888' }}>
          {dayjs(demand.startDate).format('MM/DD')} ~ {dayjs(demand.endDate).format('MM/DD')}
        </div>
        <div style={{ fontSize: 10, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{Number(demand.manpowerDemand || 0).toFixed(1)} 人/天</span>
          <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <Tag color="green" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}>
              已分配
            </Tag>
            <Button
              size="small"
              type="link"
              danger
              style={{ fontSize: 10, padding: 0, height: 16 }}
              onClick={(e) => { e.stopPropagation(); onClearDemand(demand.id); }}
            >
              清除
            </Button>
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card
      className="left-demand-card"
      style={{ width: 270, flexShrink: 0, overflow: 'hidden' }}
      bodyStyle={{ padding: 0, overflow: 'hidden', height: '100%' }}
    >
      {/* 测试类型筛选 */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <Select
          mode="multiple"
          placeholder="测试类型筛选"
          style={{ width: '100%' }}
          size="small"
          value={filterDemandTestTypes}
          onChange={onFilterChange}
          allowClear
          maxTagCount={1}
          options={allTestTypes}
        />
      </div>

      {/* 布局样式 */}
      <style>{`
        .left-demand-card.ant-card { display: flex; flex-direction: column; }
        .left-demand-card > .ant-card-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
        .demand-tabs.ant-tabs { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; padding: 0 8px; }
        .demand-tabs > .ant-tabs-nav { flex-shrink: 0; }
        .demand-tabs > .ant-tabs-content-holder { flex: 1; min-height: 0; overflow: hidden; }
        .demand-tabs .ant-tabs-content { height: 100%; }
        .demand-tabs .ant-tabs-tabpane { height: 100%; }
      `}</style>

      <Tabs
        size="small"
        className="demand-tabs"
        defaultActiveKey="pending"
        items={[
          {
            key: 'pending',
            label: `待排期 (${pendingDemands.length})`,
            children: (
              <div style={{ height: '100%', overflowY: 'auto', padding: '0 4px', overscrollBehavior: 'contain' }}>
                {pendingDemands.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                    暂无待排期需求
                  </div>
                ) : (
                  pendingDemands.map(renderDemandCard)
                )}
              </div>
            ),
          },
          {
            key: 'assigned',
            label: `已分配 (${assignedDemands.length})`,
            children: (
              <div style={{ height: '100%', overflowY: 'auto', padding: '0 4px', overscrollBehavior: 'contain' }}>
                {assignedDemands.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                    暂无已分配项目
                  </div>
                ) : (
                  assignedDemands.map(renderAssignedCard)
                )}
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default DemandQueue;
