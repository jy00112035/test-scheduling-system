import { fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import ScheduleTimeline from './ScheduleTimeline';

const noop = vi.fn();

describe('ScheduleTimeline module eligibility', () => {
  it('highlights only familiar staff and renders structured historical module tags', () => {
    const onDrop = vi.fn();
    const onCellDragOver = vi.fn();
    render(<ScheduleTimeline
      staffs={[
        {
          id: 1,
          name: '张三',
          empNo: 'T1',
          testType: '功能测试',
          initialCoefficient: 1,
          currentCoefficient: 1,
          status: 'active',
          familiarModules: [],
        },
        {
          id: 2,
          name: '李四',
          empNo: 'T2',
          testType: '性能测试',
          initialCoefficient: 1,
          currentCoefficient: 1,
          status: 'active',
          familiarModules: [
            {
              id: 11,
              moduleName: '支付模块',
              testType: '功能测试',
              enabled: true,
              sortOrder: 1,
              lockVersion: 0,
              createdAt: '2026-07-01T00:00:00',
              updatedAt: '2026-07-01T00:00:00',
              referenced: true,
            },
            {
              id: 12,
              moduleName: '登录模块',
              testType: '性能测试',
              enabled: false,
              sortOrder: 2,
              lockVersion: 0,
              createdAt: '2026-07-01T00:00:00',
              updatedAt: '2026-07-01T00:00:00',
              referenced: true,
            },
          ],
        },
      ]}
      schedules={[]}
      weekViewDate={dayjs('2026-07-20')}
      dailyStatuses={new Map()}
      selectedDemand={null}
      draggedAllocationTarget={{
        kind: 'special',
        demandId: 1001,
        demandManpowerDetailId: 301,
        demandSpecialModuleId: 501,
        testType: '功能测试',
        moduleId: 11,
        moduleName: '支付模块',
        remainingManpower: 1,
      }}
      draggedSchedule={null}
      dragOverCell="1-2026-07-20"
      dragOverTrash={false}
      filterProducts={[]}
      canManageDailyAvailability={false}
      statusPopoverOpen={null}
      statusDraft="AVAILABLE"
      statusPctDraft={100}
      onWeekChange={noop}
      onFilterProductsChange={noop}
      onDrop={onDrop}
      onScheduleTransfer={noop}
      onScheduleDragStart={noop}
      onScheduleDragEnd={noop}
      onCellDragOver={onCellDragOver}
      onTrashDragOver={noop}
      onTrashDrop={noop}
      onEditSchedule={noop}
      onDeleteSchedule={noop}
      onStatusPopoverOpen={noop}
      onStatusChange={noop}
      onStatusDraftChange={noop}
      onStatusPctDraftChange={noop}
    />);

    const ineligibleCell = screen.getAllByLabelText('张三：不熟悉支付模块')[0];
    expect(ineligibleCell).toHaveStyle({ cursor: 'not-allowed' });
    expect(ineligibleCell.querySelector('.drop-active')).toBeNull();
    fireEvent.dragOver(ineligibleCell);
    fireEvent.drop(ineligibleCell);
    expect(onCellDragOver).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    expect(screen.getAllByLabelText('李四：可分配支付模块')[0]).toHaveStyle({ cursor: 'copy' });
    expect(screen.getByText('功能测试: 支付模块')).toBeInTheDocument();
    expect(screen.getByText('性能测试: 登录模块（已停用）')).toBeInTheDocument();
  });
});
