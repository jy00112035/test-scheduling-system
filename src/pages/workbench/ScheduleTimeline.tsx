// ============================================================
// ScheduleTimeline — 人员×日期时间轴矩阵
// Phase 1: 保留现有拖拽分配、编辑、删除、状态管理等全部功能
// ============================================================

import React from 'react';
import { Card, Space, DatePicker, Select, InputNumber, Tag, Button, Popconfirm, Popover, Divider, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ScheduleItem, DemandItem, StaffItem, DailyStatusEntry } from './workbenchTypes';
import {
  getWeekDates,
  DAY_LABELS,
  getSchedulesForStaffAndDate,
  getTotalPercentage,
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
  filterTestTypes: string[];
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
  onFilterTestTypesChange: (types: string[]) => void;
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
  filterTestTypes,
  filterProducts,
  canManageDailyAvailability,
  userTestType,
  userRoles,
  statusPopoverOpen,
  statusDraft,
  statusPctDraft,
  onWeekChange,
  onFilterTestTypesChange,
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

  // 筛选后的员工
  const filteredStaffs = staffs.filter(s => {
    if (s.status !== 'active') return false;
    // 测试组长只看本组
    if (userRoles?.includes('testLead') && userTestType && s.testType !== userTestType) return false;
    if (filterTestTypes.length > 0 && s.testType && !filterTestTypes.includes(s.testType)) return false;
    if (filterProducts.length > 0) {
      const weekDateStrs = weekDates.map(d => d.format('YYYY-MM-DD'));
      const hasMatchingSchedule = schedules.some(
        sch => sch.staffId === s.id && weekDateStrs.includes(sch.date) && filterProducts.includes(sch.product)
      );
      if (!hasMatchingSchedule) return false;
    }
    return true;
  });

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
        <DatePicker
          picker="week"
          value={weekViewDate}
          onChange={(date) => date && onWeekChange(date)}
          allowClear={false}
          style={{ width: 130 }}
        />
      }
      style={{ flex: 1, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ padding: 0, overflow: 'auto', flex: 1, minHeight: 0, overscrollBehavior: 'contain' }}
    >
      {/* 筛选控件 */}
      <div style={{
        padding: '8px 12px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        flexWrap: 'wrap',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
      }}>
        <span style={{ fontSize: 13, color: '#666' }}>筛选:</span>
        <Select
          mode="multiple"
          placeholder="测试类型"
          style={{ minWidth: 180 }}
          value={filterTestTypes}
          onChange={onFilterTestTypesChange}
          allowClear
          maxTagCount={2}
          options={[...new Set(staffs.filter(s => s.status === 'active').map(s => s.testType).filter(Boolean))]
            .map(t => ({ label: t, value: t }))}
        />
        <span style={{ fontSize: 13, color: '#666', marginLeft: 12 }}>产品:</span>
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
      </div>

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
            <tr style={{ position: 'sticky', top: 40, zIndex: 5 }}>
              <th style={{ minWidth: 45, position: 'sticky', left: 0, background: '#fafafa', zIndex: 6 }}>姓名</th>
              <th style={{ minWidth: 10, position: 'sticky', left: 45, background: '#fafafa', zIndex: 6 }}>系数</th>
              <th style={{ minWidth: 50, position: 'sticky', left: 55, background: '#fafafa', zIndex: 6 }}>保密权限</th>
              <th style={{ minWidth: 45, position: 'sticky', left: 105, background: '#fafafa', zIndex: 6 }}>测试类型</th>
              <th style={{ minWidth: 140, position: 'sticky', left: 150, background: '#fafafa', zIndex: 6 }}>熟悉模块</th>
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
                <td style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 12 }}>
                  <strong>{staff.name}</strong>
                </td>
                <td style={{ position: 'sticky', left: 45, background: '#fff', zIndex: 1, padding: '4px 2px' }}>
                  <Tag color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'} style={{ fontSize: 10, padding: '0 2px' }}>
                    {staff.currentCoefficient?.toFixed(1) || '1.0'}
                  </Tag>
                </td>
                <td style={{ position: 'sticky', left: 55, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, textAlign: 'center' }}>
                  {staff.confidentialClearance ? (
                    <Tag color="red" style={{ fontSize: 10, padding: '0 4px' }}>保密</Tag>
                  ) : (
                    <span style={{ color: '#ccc' }}>-</span>
                  )}
                </td>
                <td style={{ position: 'sticky', left: 105, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, color: '#666' }}>
                  {staff.testType || '-'}
                </td>
                <td style={{ position: 'sticky', left: 150, background: '#fff', zIndex: 1, padding: '4px 2px', fontSize: 11, color: '#666' }}>
                  {staff.familiarModules ? (
                    <Tooltip title={staff.familiarModules}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                        {staff.familiarModules}
                      </div>
                    </Tooltip>
                  ) : '-'}
                </td>

                {/* Date columns */}
                {weekDates.map((date, dayIndex) => {
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
          </tbody>
        </table>
      </div>
    </Card>
  );
};

export default ScheduleTimeline;
