// ============================================================
// ScheduleTimeline — 人员×日期时间轴矩阵
// Phase 1: 保留现有拖拽分配、编辑、删除、状态管理等全部功能
// ============================================================

import React, { useState, useEffect } from 'react';
import { Card, Space, DatePicker, Select, InputNumber, Tag, Button, Popconfirm, Popover, Divider, Tooltip, Checkbox, Modal, Input } from 'antd';
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ScheduleItem, DemandItem, StaffItem, DailyStatusEntry } from './workbenchTypes';
import {
  getWeekDates,
  DAY_LABELS,
  getSchedulesForStaffAndDate,
  getTotalPercentage,
  calculateDailyFreeWorkload,
  getDailyStatus,
  getDailyStatusPercentage,
  isAvailableForAssignment,
  getMaxCapacity,
  getVersionTypeColor,
} from './workbenchCalculations';
import { DailyAvailabilityStatus, DailyStatusLabels, DailyStatusColors } from '../../types';

interface ScheduleTimelineProps {
  // 数据
  staffs: StaffItem[];
  schedules: ScheduleItem[];
  weekViewDate: dayjs.Dayjs;
  dailyStatuses: Map<string, DailyStatusEntry>;
  selectedDemand: DemandItem | null;
  draggedSchedule: ScheduleItem | null;
  dragOverCell: string | null;
  dragOverTrash: boolean;

  // 筛选
  filterProducts: string[];

  // 用户权限
  canManageDailyAvailability: boolean;
  userTestType?: string;
  userRoles?: string[];

  // 状态 Popover
  statusPopoverOpen: string | null;
  statusDraft: DailyAvailabilityStatus;
  statusPctDraft: number;

  // 事件处理
  onWeekChange: (date: dayjs.Dayjs) => void;
  onFilterProductsChange: (products: string[]) => void;
  onDrop: (staff: StaffItem, date: string) => void;
  onScheduleTransfer: (schedule: ScheduleItem, targetStaff: StaffItem, targetDate: string) => void;
  onScheduleDragStart: (e: React.DragEvent, schedule: ScheduleItem) => void;
  onScheduleDragEnd: () => void;
  onCellDragOver: (cellKey: string | null) => void;
  onTrashDragOver: (over: boolean) => void;
  onTrashDrop: () => void;
  onEditSchedule: (schedule: ScheduleItem) => void;
  onDeleteSchedule: (schedule: ScheduleItem) => void;
  onStatusPopoverOpen: (key: string | null) => void;
  onStatusChange: (staff: StaffItem, date: string, status: string, percentage?: number) => void;
  onStatusDraftChange: (status: DailyAvailabilityStatus) => void;
  onStatusPctDraftChange: (pct: number) => void;
}

const ScheduleTimeline: React.FC<ScheduleTimelineProps> = ({
  staffs,
  schedules,
  weekViewDate,
  dailyStatuses,
  selectedDemand,
  draggedSchedule,
  dragOverCell,
  dragOverTrash,
  filterProducts,
  canManageDailyAvailability,
  userTestType,
  userRoles,
  statusPopoverOpen,
  statusDraft,
  statusPctDraft,
  onWeekChange,
  onFilterProductsChange,
  onDrop,
  onScheduleTransfer,
  onScheduleDragStart,
  onScheduleDragEnd,
  onCellDragOver,
  onTrashDragOver,
  onTrashDrop,
  onEditSchedule,
  onDeleteSchedule,
  onStatusPopoverOpen,
  onStatusChange,
  onStatusDraftChange,
  onStatusPctDraftChange,
}) => {
  const weekDates = getWeekDates(weekViewDate);

  // 空闲工作量筛选：排除的测试类型（持久化到 localStorage）
  const STORAGE_KEY = 'schedule_workbench_excludedTestTypes';
  const [excludedTestTypes, setExcludedTestTypes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  // 表头筛选状态
  const [nameSearch, setNameSearch] = useState('');
  const [coefficientFilter, setCoefficientFilter] = useState<string[]>([]);
  const [clearanceFilter, setClearanceFilter] = useState<string[]>([]); // 'confidential' | 'normal'
  const [headerTestTypeFilter, setHeaderTestTypeFilter] = useState<string[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(excludedTestTypes));
  }, [excludedTestTypes]);

  // 表头筛选选项（基于全量 active 员工）
  const activeStaffs = staffs.filter(s => s.status === 'active');
  const allCoefficients = [...new Set(activeStaffs.map(s => s.currentCoefficient?.toFixed(1) || '1.0'))].sort();
  const allHeaderTestTypes = [...new Set(activeStaffs.map(s => s.testType).filter(Boolean))] as string[];

  // 基础员工列表（仅测试组长权限限制，用于空闲工作量计算）
  const baseStaffs = staffs.filter(s => {
    if (s.status !== 'active') return false;
    if (userRoles?.includes('testLead') && userTestType && s.testType !== userTestType) return false;
    return true;
  });

  // 筛选后的员工（表头筛选 + 产品筛选，用于表格显示）
  const filteredStaffs = baseStaffs.filter(s => {
    // 顶部产品筛选
    if (filterProducts.length > 0) {
      const weekDateStrs = weekDates.map(d => d.format('YYYY-MM-DD'));
      const hasMatchingSchedule = schedules.some(
        sch => sch.staffId === s.id && weekDateStrs.includes(sch.date) && filterProducts.includes(sch.product)
      );
      if (!hasMatchingSchedule) return false;
    }
    // 表头：姓名搜索
    if (nameSearch && !s.name?.toLowerCase().includes(nameSearch.toLowerCase())) return false;
    // 表头：系数筛选
    if (coefficientFilter.length > 0 && !coefficientFilter.includes(s.currentCoefficient?.toFixed(1) || '1.0')) return false;
    // 表头：保密权限筛选
    if (clearanceFilter.length > 0) {
      if (clearanceFilter.includes('confidential') && !clearanceFilter.includes('normal')) {
        if (!s.confidentialClearance) return false;
      }
      if (clearanceFilter.includes('normal') && !clearanceFilter.includes('confidential')) {
        if (s.confidentialClearance) return false;
      }
    }
    // 表头：测试类型筛选
    if (headerTestTypeFilter.length > 0 && s.testType && !headerTestTypeFilter.includes(s.testType)) return false;
    return true;
  });

  // 所有测试类型（去重，基于全量员工用于弹窗选项）
  const allTestTypes = [...new Set(baseStaffs.map(s => s.testType).filter(Boolean))] as string[];

  // 用于空闲工作量计算的员工（仅受空闲工作量弹窗筛选影响，不受表头筛选影响）
  const workloadStaffs = excludedTestTypes.length > 0
    ? baseStaffs.filter(s => !s.testType || !excludedTestTypes.includes(s.testType))
    : baseStaffs;

  return (
    <Card
      title={
        <Space size={8}>
          <span>人力排布视图</span>
          {/* 垃圾桶拖放区域 */}
          {draggedSchedule && (
            <div
              onDrop={(e) => {
                e.preventDefault();
                onTrashDrop();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrashDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTrashDragOver(false);
              }}
              style={{
                width: dragOverTrash ? 40 : 32,
                height: dragOverTrash ? 40 : 32,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: dragOverTrash ? '#ff4d4f' : '#fff1f0',
                border: dragOverTrash ? '2px solid #ff4d4f' : '2px dashed #ff4d4f',
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                transform: dragOverTrash ? 'scale(1.2)' : 'scale(1)',
                boxShadow: dragOverTrash ? '0 0 14px rgba(255, 77, 79, 0.55)' : 'none',
              }}
            >
              <DeleteOutlined style={{
                color: dragOverTrash ? '#fff' : '#ff4d4f',
                fontSize: dragOverTrash ? 20 : 16,
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
            </div>
          )}
        </Space>
      }
      extra={
        <Space size={8} wrap>
          <DatePicker
            picker="week"
            value={weekViewDate}
            onChange={(date) => date && onWeekChange(date)}
            allowClear={false}
            style={{ width: 130 }}
          />
          <Select
            mode="multiple"
            placeholder="全部产品"
            style={{ minWidth: 200 }}
            value={filterProducts}
            onChange={onFilterProductsChange}
            allowClear
            maxTagCount={2}
            options={[...new Set(schedules.map(s => s.product).filter(Boolean))]
              .map(p => ({ label: p, value: p }))}
          />
          <Input
            placeholder="搜索姓名"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value || '')}
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 140 }}
          />
          <Select
            mode="multiple"
            placeholder="系数"
            style={{ width: 100 }}
            value={coefficientFilter}
            onChange={setCoefficientFilter}
            allowClear
            maxTagCount={1}
            options={allCoefficients.map(c => ({ label: c, value: c }))}
          />
          <Select
            mode="multiple"
            placeholder="保密权限"
            style={{ width: 130 }}
            value={clearanceFilter}
            onChange={setClearanceFilter}
            allowClear
            maxTagCount={1}
            options={[
              { label: '保密', value: 'confidential' },
              { label: '普通', value: 'normal' },
            ]}
          />
          <Select
            mode="multiple"
            placeholder="测试类型"
            style={{ width: 130 }}
            value={headerTestTypeFilter}
            onChange={setHeaderTestTypeFilter}
            allowClear
            maxTagCount={1}
            options={allHeaderTestTypes.map(t => ({ label: t, value: t }))}
          />
        </Space>
      }
      style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ padding: 0, overflow: 'auto', flex: 1, minHeight: 0, overscrollBehavior: 'contain' }}
    >
      {/* 表格 */}
      <style>{`
        .drop-active {
          transform: scale(0.88);
          transition: transform 0.2s ease;
          box-shadow: inset 0 0 12px rgba(24, 144, 255, 0.35);
          border: 2px dashed #1890ff !important;
          border-radius: 6px;
          background: rgba(24, 144, 255, 0.06);
        }
        .schedule-item:hover { filter: brightness(0.95); }
        .status-card { padding: 2px 6px; border-radius: 2px; margin-bottom: 1px; font-size: 10px; cursor: pointer; }
      `}</style>

      <div onDragLeave={() => onCellDragOver(null)}>
        <table className="kanban-table" style={{ minWidth: 1200 }}>
          <thead>
            <tr style={{ position: 'sticky', top: 0, zIndex: 5 }}>
              {/* 姓名 */}
              <th style={{ minWidth: 65, position: 'sticky', left: 0, background: '#fafafa', zIndex: 6 }}>
                <span>姓名</span>
              </th>
              {/* 系数 */}
              <th style={{ minWidth: 50, position: 'sticky', left: 65, background: '#fafafa', zIndex: 6 }}>
                <span>系数</span>
              </th>
              {/* 保密权限 */}
              <th style={{ minWidth: 60, position: 'sticky', left: 115, background: '#fafafa', zIndex: 6 }}>
                <span>保密权限</span>
              </th>
              {/* 测试类型 */}
              <th style={{ minWidth: 65, position: 'sticky', left: 175, background: '#fafafa', zIndex: 6 }}>
                <span>测试类型</span>
              </th>
              {/* 熟悉模块 */}
              <th style={{ minWidth: 140, position: 'sticky', left: 240, background: '#fafafa', zIndex: 6 }}>
                <span>熟悉模块</span>
              </th>
              {weekDates.map((date) => {
                const isWeekend = [0, 6].includes(date.day());
                return (
                  <th key={date.format('YYYY-MM-DD')} style={{
                    minWidth: 100,
                    background: isWeekend ? '#fff7e6' : '#fafafa',
                  }}>
                    <div style={{ color: isWeekend ? '#fa8c16' : undefined }}>
                      {DAY_LABELS[date.day()]}
                    </div>
                    <div style={{ fontSize: 10, color: isWeekend ? '#fa8c16' : '#666' }}>
                      {date.format('MM-DD')}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredStaffs.map(staff => (
              <tr key={staff.id}>
                {/* Sticky columns */}
                <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 12, whiteSpace: 'nowrap' }}>
                  <strong>{staff.name}</strong>
                </td>
                <td style={{ position: 'sticky', left: 65, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, textAlign: 'center' }}>
                  <Tag color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'} style={{ fontSize: 10, padding: '0 2px' }}>
                    {staff.currentCoefficient?.toFixed(1) || '1.0'}
                  </Tag>
                </td>
                <td style={{ position: 'sticky', left: 115, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, textAlign: 'center' }}>
                  {staff.confidentialClearance ? (
                    <Tag color="red" style={{ fontSize: 10, padding: '0 4px' }}>保密</Tag>
                  ) : (
                    <span style={{ color: '#ccc' }}>-</span>
                  )}
                </td>
                <td style={{ position: 'sticky', left: 175, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, color: '#666' }}>
                  {staff.testType || '-'}
                </td>
                <td style={{ position: 'sticky', left: 240, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, color: '#666' }}>
                  {staff.familiarModules ? (
                    <Tooltip title={staff.familiarModules}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                        {staff.familiarModules}
                      </div>
                    </Tooltip>
                  ) : '-'}
                </td>

                {/* Date columns */}
                {weekDates.map((date) => {
                  const dateStr = date.format('YYYY-MM-DD');
                  const daySchedules = getSchedulesForStaffAndDate(schedules, staff.id, dateStr);
                  const totalPercent = getTotalPercentage(schedules, staff.id, dateStr);
                  const dailyStatus = getDailyStatus(dailyStatuses, staff.id, dateStr);
                  const statusPercentage = getDailyStatusPercentage(dailyStatuses, staff.id, dateStr);
                  const maxCapacity = getMaxCapacity(staff, dateStr, dailyStatuses);
                  const hasConflict = totalPercent > maxCapacity;
                  const isWeekendColumn = [0, 6].includes(date.day());
                  const canAssign = isAvailableForAssignment(dailyStatuses, staff.id, dateStr);

                  const statusBgColor = dailyStatus && dailyStatus !== 'AVAILABLE'
                    ? `${DailyStatusColors[dailyStatus as DailyAvailabilityStatus]}18`
                    : undefined;

                  const cellBackground = hasConflict ? '#fff1f0'
                    : statusBgColor || (isWeekendColumn ? '#fff7e6' : '#fff');

                  let cellCursor: React.CSSProperties['cursor'] = 'default';
                  if (selectedDemand) {
                    cellCursor = canAssign ? 'copy' : 'not-allowed';
                  } else if (canManageDailyAvailability) {
                    cellCursor = 'pointer';
                  }

                  const popoverKey = `${staff.id}-${dateStr}`;
                  const isStatusPopoverOpen = statusPopoverOpen === popoverKey;

                  // Status card
                  const statusCardNode = dailyStatus && dailyStatus !== 'AVAILABLE' ? (
                    <div
                      className="status-card"
                      style={{
                        background: `${DailyStatusColors[dailyStatus as DailyAvailabilityStatus]}18`,
                        borderLeft: `3px solid ${DailyStatusColors[dailyStatus as DailyAvailabilityStatus]}`,
                      }}
                    >
                      <div style={{ color: DailyStatusColors[dailyStatus as DailyAvailabilityStatus], fontWeight: 500 }}>
                        {DailyStatusLabels[dailyStatus as DailyAvailabilityStatus]}
                      </div>
                      <div style={{ fontSize: 10, color: '#666' }}>
                        {statusPercentage < 100 ? `${statusPercentage}%` : ''}
                      </div>
                    </div>
                  ) : null;

                  const idleNode = (!dailyStatus || dailyStatus === 'AVAILABLE') && daySchedules.length === 0 ? (
                    <div style={{ color: '#ccc', fontSize: 10, padding: '8px 0', cursor: canManageDailyAvailability ? 'pointer' : undefined }}>
                      空闲
                    </div>
                  ) : null;

                  // Status popover
                  const statusPopoverProps = {
                    content: (
                      <div style={{ minWidth: 200 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>状态</span>
                            <Select
                              value={statusDraft}
                              onChange={(val) => onStatusDraftChange(val)}
                              style={{ flex: 1 }}
                              size="small"
                              options={(['AVAILABLE', 'OTHER_TASKS', 'SECONDED', 'ON_LEAVE', 'COMPENSATORY_LEAVE'] as DailyAvailabilityStatus[]).map(s => ({
                                value: s,
                                label: <span style={{ color: DailyStatusColors[s] }}>{DailyStatusLabels[s]}</span>,
                              }))}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>投入百分比</div>
                            <InputNumber
                              min={0} max={100} step={5}
                              value={statusDraft === 'AVAILABLE' ? 100 : statusPctDraft}
                              onChange={(val) => onStatusPctDraftChange(val ?? 100)}
                              disabled={statusDraft === 'AVAILABLE'}
                              style={{ width: '100%' }}
                              addonAfter="%"
                              size="small"
                            />
                          </div>
                          <Divider style={{ margin: '4px 0' }} />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button size="small" onClick={() => onStatusPopoverOpen(null)}>取消</Button>
                            <Button type="primary" size="small" onClick={() => {
                              if (statusDraft === 'AVAILABLE') {
                                onStatusChange(staff, dateStr, 'AVAILABLE');
                              } else {
                                onStatusChange(staff, dateStr, statusDraft, statusPctDraft);
                              }
                            }}>确定</Button>
                          </div>
                        </div>
                      </div>
                    ),
                    title: `${staff.name} - ${dateStr}`,
                    trigger: 'click' as const,
                    open: isStatusPopoverOpen,
                    onOpenChange: (open: boolean) => {
                      if (open) {
                        onStatusDraftChange((dailyStatus || 'AVAILABLE') as DailyAvailabilityStatus);
                        onStatusPctDraftChange(statusPercentage);
                        onStatusPopoverOpen(popoverKey);
                      } else {
                        onStatusPopoverOpen(null);
                      }
                    },
                    placement: 'bottom' as const,
                  };

                  const cellContent = (
                    <div>
                      {canManageDailyAvailability ? (
                        <>
                          {statusCardNode ? (
                            <Popover {...statusPopoverProps}>{statusCardNode}</Popover>
                          ) : idleNode ? (
                            <Popover {...statusPopoverProps}>{idleNode}</Popover>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {statusCardNode}
                          {idleNode}
                        </>
                      )}
                      {daySchedules.map(schedule => (
                        <div
                          key={schedule.id}
                          className="schedule-item"
                          draggable
                          style={{
                            background: `${getVersionTypeColor(schedule.versionType)}20`,
                            borderLeft: `3px solid ${getVersionTypeColor(schedule.versionType)}`,
                            marginBottom: 1,
                            padding: '1px 18px 1px 4px',
                            position: 'relative',
                            cursor: 'grab',
                            fontSize: 11,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            whiteSpace: 'nowrap',
                          }}
                          onClick={() => onEditSchedule(schedule)}
                          onDragStart={(e) => onScheduleDragStart(e, schedule)}
                          onDragEnd={onScheduleDragEnd}
                        >
                          <span
                            className="product-name"
                            style={{
                              color: getVersionTypeColor(schedule.versionType),
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              paddingRight: 4,
                            }}
                          >
                            {schedule.product}
                          </span>
                          <span style={{ fontSize: 10, color: '#666', flexShrink: 0 }}>
                            {schedule.percentage >= 100
                              ? `${schedule.percentage}%`
                              : `${schedule.percentage}%`}
                          </span>
                          <div style={{ position: 'absolute', top: 0, right: 0 }}>
                            <Popconfirm
                              title="确定删除？"
                              onConfirm={(e) => {
                                e?.stopPropagation();
                                onDeleteSchedule(schedule);
                              }}
                              okText="确定"
                              cancelText="取消"
                            >
                              <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                style={{ fontSize: 9, padding: '0 1px', height: 14, width: 14 }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </Popconfirm>
                          </div>
                        </div>
                      ))}
                    </div>
                  );

                  const cellKey = `${staff.id}-${dateStr}`;

                  return (
                    <td
                      key={dateStr}
                      style={{
                        background: cellBackground,
                        cursor: cellCursor,
                        padding: 0,
                      }}
                      onDrop={() => {
                        onCellDragOver(null);
                        if (draggedSchedule) {
                          onScheduleTransfer(draggedSchedule, staff, dateStr);
                        } else {
                          onDrop(staff, dateStr);
                        }
                      }}
                      onDragOver={(e) => {
                        if (selectedDemand || draggedSchedule) {
                          e.preventDefault();
                          onCellDragOver(cellKey);
                        }
                      }}
                    >
                      <div
                        className={dragOverCell === cellKey ? 'drop-active' : ''}
                        style={{
                          width: '100%',
                          minHeight: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {cellContent}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* 空闲可用工作量汇总行 — 固定在底部 */}
            <tr style={{ position: 'sticky', bottom: 0, zIndex: 3, background: '#f0f5ff', fontWeight: 500, boxShadow: '0 -2px 4px rgba(0,0,0,0.08)' }}>
              <td colSpan={5} style={{ position: 'sticky', left: 0, background: '#f0f5ff', zIndex: 4, padding: '6px 8px', fontSize: 12, whiteSpace: 'nowrap', borderTop: '2px solid #1677ff' }}>
                <span
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => setFilterModalOpen(true)}
                >
                  空闲可用工作量
                  {excludedTestTypes.length > 0 && (
                    <Tag color="orange" style={{ fontSize: 10, marginLeft: 4, lineHeight: '14px', padding: '0 3px' }}>
                      已排除{excludedTestTypes.length}类
                    </Tag>
                  )}
                </span>
                <Modal
                  title="空闲工作量统计范围"
                  open={filterModalOpen}
                  onCancel={() => setFilterModalOpen(false)}
                  onOk={() => setFilterModalOpen(false)}
                  width={360}
                  destroyOnClose={false}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: '#999' }}>取消勾选的测试类型不计入空闲工作量统计：</div>
                    {allTestTypes.length === 0 && <span style={{ color: '#999', fontSize: 12 }}>暂无测试类型</span>}
                    {allTestTypes.map(t => (
                      <Checkbox
                        key={t}
                        checked={!excludedTestTypes.includes(t)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setExcludedTestTypes(prev => prev.filter(x => x !== t));
                          } else {
                            setExcludedTestTypes(prev => [...prev, t]);
                          }
                        }}
                      >
                        {t}
                      </Checkbox>
                    ))}
                    {allTestTypes.length > 0 && (
                      <>
                        <Divider style={{ margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setExcludedTestTypes([])}>全选</Button>
                          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setExcludedTestTypes([...allTestTypes])}>全不选</Button>
                        </div>
                      </>
                    )}
                  </div>
                </Modal>
              </td>
              {weekDates.map(date => {
                const dateStr = date.format('YYYY-MM-DD');
                const freeWorkload = calculateDailyFreeWorkload(workloadStaffs, schedules, dateStr, dailyStatuses);
                const isWeekend = [0, 6].includes(date.day());
                return (
                  <td
                    key={dateStr}
                    style={{
                      padding: '6px 2px',
                      fontSize: 13,
                      textAlign: 'center',
                      fontWeight: 600,
                      background: isWeekend ? '#e6f4ff' : '#f0f5ff',
                      borderTop: '2px solid #1677ff',
                    }}
                  >
                    <span style={{ color: freeWorkload > 0 ? '#1677ff' : '#999' }}>
                      {freeWorkload.toFixed(1)}
                    </span>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ScheduleTimeline;
