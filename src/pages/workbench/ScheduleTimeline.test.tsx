import { fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import ScheduleTimeline from './ScheduleTimeline';
import type { AllocationTarget, ScheduleItem } from './workbenchTypes';

const noop = vi.fn();
const staffs = [
  {
    id: 1, name: '张三', empNo: 'T1', testType: '功能测试',
    initialCoefficient: 1, currentCoefficient: 1, status: 'active', familiarModules: [],
  },
  {
    id: 2, name: '李四', empNo: 'T2', testType: '性能测试',
    initialCoefficient: 1, currentCoefficient: 1, status: 'active',
    familiarModules: [
      {
        id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true,
        sortOrder: 1, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true,
      },
      {
        id: 12, moduleName: '登录模块', testType: '性能测试', enabled: false,
        sortOrder: 2, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true,
      },
    ],
  },
];

const movingSchedule: ScheduleItem = {
  id: 9001, demandId: 1001, staffId: 1, date: '2026-07-20', percentage: 100,
  demandManpowerDetailId: 301, demandSpecialModuleId: 501,
  product: '示例产品', versionType: '维护', published: false,
};

function renderTimeline(options: {
  target?: AllocationTarget | null;
  draggedSchedule?: ScheduleItem | null;
  schedules?: ScheduleItem[];
  dragOverCell?: string | null;
  onDrop?: ReturnType<typeof vi.fn>;
  onScheduleTransfer?: ReturnType<typeof vi.fn>;
  onCellDragOver?: ReturnType<typeof vi.fn>;
  onScheduleDragStart?: ReturnType<typeof vi.fn>;
  onEditSchedule?: ReturnType<typeof vi.fn>;
} = {}) {
  return render(<ScheduleTimeline
    staffs={staffs}
    schedules={options.schedules || []}
    weekViewDate={dayjs('2026-07-20')}
    dailyStatuses={new Map()}
    selectedDemand={null}
    draggedAllocationTarget={options.target ?? null}
    draggedSchedule={options.draggedSchedule ?? null}
    dragOverCell={options.dragOverCell ?? null}
    dragOverTrash={false}
    filterProducts={[]}
    canManageDailyAvailability={false}
    statusPopoverOpen={null}
    statusDraft="AVAILABLE"
    statusPctDraft={100}
    onWeekChange={noop}
    onFilterProductsChange={noop}
    onDrop={options.onDrop || noop}
    onScheduleTransfer={options.onScheduleTransfer || noop}
    onScheduleDragStart={options.onScheduleDragStart || noop}
    onScheduleDragEnd={noop}
    onCellDragOver={options.onCellDragOver || noop}
    onTrashDragOver={noop}
    onTrashDrop={noop}
    onEditSchedule={options.onEditSchedule || noop}
    onDeleteSchedule={noop}
    onStatusPopoverOpen={noop}
    onStatusChange={noop}
    onStatusDraftChange={noop}
    onStatusPctDraftChange={noop}
  />);
}

describe('ScheduleTimeline module eligibility', () => {
  it('blocks unfamiliar special moves and allows familiar cross-group staff', () => {
    const onScheduleTransfer = vi.fn();
    const onCellDragOver = vi.fn();
    renderTimeline({
      target: {
        kind: 'special', demandId: 1001, demandManpowerDetailId: 301,
        demandSpecialModuleId: 501, testType: '功能测试', moduleId: 11,
        moduleName: '支付模块', remainingManpower: 0,
      },
      draggedSchedule: movingSchedule,
      dragOverCell: '1-2026-07-20',
      onScheduleTransfer,
      onCellDragOver,
    });

    const unfamiliar = screen.getAllByLabelText('张三：不熟悉支付模块')[0];
    expect(unfamiliar).toHaveStyle({ cursor: 'not-allowed' });
    expect(unfamiliar.querySelector('.drop-active')).toBeNull();
    fireEvent.dragOver(unfamiliar);
    fireEvent.drop(unfamiliar);
    expect(onScheduleTransfer).not.toHaveBeenCalled();

    const familiar = screen.getAllByLabelText('李四：可分配支付模块')[0];
    fireEvent.dragOver(familiar);
    fireEvent.drop(familiar);
    expect(onCellDragOver).toHaveBeenCalledWith('2-2026-07-20');
    expect(onScheduleTransfer).toHaveBeenCalledWith(movingSchedule, staffs[1], '2026-07-20');
    expect(screen.getByText('功能测试: 支付模块')).toBeInTheDocument();
    expect(screen.getByText('性能测试: 登录模块（已停用）')).toBeInTheDocument();
  });

  it('blocks a general move to staff in the wrong group', () => {
    const onScheduleTransfer = vi.fn();
    renderTimeline({
      target: {
        kind: 'general', demandId: 1001, demandManpowerDetailId: 301,
        testType: '功能测试', remainingManpower: 0,
      },
      draggedSchedule: { ...movingSchedule, demandSpecialModuleId: null },
      dragOverCell: '2-2026-07-20',
      onScheduleTransfer,
    });

    const wrongGroup = screen.getAllByLabelText('李四：当前不可分配')[0];
    expect(wrongGroup).toHaveStyle({ cursor: 'not-allowed' });
    expect(wrongGroup.querySelector('.drop-active')).toBeNull();
    fireEvent.drop(wrongGroup);
    expect(onScheduleTransfer).not.toHaveBeenCalled();
  });

  it('blocks moving an unclassified historical schedule', () => {
    const onScheduleTransfer = vi.fn();
    renderTimeline({
      target: null,
      draggedSchedule: {
        ...movingSchedule,
        demandManpowerDetailId: null,
        demandSpecialModuleId: null,
      },
      onScheduleTransfer,
    });

    const cell = screen.getAllByLabelText('张三：排班需先归类')[0];
    fireEvent.dragOver(cell);
    fireEvent.drop(cell);
    expect(onScheduleTransfer).not.toHaveBeenCalled();
  });

  it('shows individual delete only for draft schedules', () => {
    renderTimeline({
      schedules: [
        { ...movingSchedule, product: '草稿排班' },
        { ...movingSchedule, id: 9002, product: '已发布排班', published: true },
      ],
    });

    expect(screen.getByRole('button', { name: '删除排班 草稿排班' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除排班 已发布排班' })).not.toBeInTheDocument();
  });

  it('supports keyboard editing for drafts and keeps published cards immutable', () => {
    const onEditSchedule = vi.fn();
    const onScheduleDragStart = vi.fn();
    const draft = { ...movingSchedule, product: '草稿排班' };
    const published = {
      ...movingSchedule, id: 9002, product: '已发布排班', published: true,
    };
    renderTimeline({
      schedules: [draft, published],
      onEditSchedule,
      onScheduleDragStart,
    });

    const draftCard = screen.getByRole('button', { name: '编辑排班 草稿排班' });
    const publishedCard = screen.getByRole('button', { name: '已发布排班 已发布排班' });
    expect(draftCard).toHaveAttribute('tabindex', '0');
    expect(draftCard).toHaveAttribute('draggable', 'true');
    expect(draftCard).toHaveAttribute('aria-disabled', 'false');
    expect(publishedCard).toHaveAttribute('tabindex', '-1');
    expect(publishedCard).toHaveAttribute('draggable', 'false');
    expect(publishedCard).toHaveAttribute('aria-disabled', 'true');

    fireEvent.keyDown(draftCard, { key: 'Enter' });
    fireEvent.keyDown(draftCard, { key: ' ' });
    fireEvent.dragStart(draftCard);
    expect(onEditSchedule).toHaveBeenCalledTimes(2);
    expect(onEditSchedule).toHaveBeenCalledWith(draft);
    expect(onScheduleDragStart).toHaveBeenCalledWith(expect.anything(), draft);

    fireEvent.click(publishedCard);
    fireEvent.keyDown(publishedCard, { key: 'Enter' });
    fireEvent.dragStart(publishedCard);
    expect(onEditSchedule).toHaveBeenCalledTimes(2);
    expect(onScheduleDragStart).toHaveBeenCalledTimes(1);
  });

  it('activates only eligible cells from the keyboard for a selected target', () => {
    const onDrop = vi.fn();
    renderTimeline({
      target: {
        kind: 'special', demandId: 1001, demandManpowerDetailId: 301,
        demandSpecialModuleId: 501, testType: '功能测试', moduleId: 11,
        moduleName: '支付模块', remainingManpower: 1,
      },
      onDrop,
    });

    const ineligible = screen.getAllByLabelText('张三：不熟悉支付模块')[0];
    const eligible = screen.getAllByLabelText('李四：可分配支付模块')[0];
    expect(ineligible).toHaveAttribute('aria-disabled', 'true');
    expect(ineligible).toHaveAttribute('tabindex', '-1');
    expect(eligible).toHaveAttribute('aria-disabled', 'false');
    expect(eligible).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(ineligible, { key: 'Enter' });
    fireEvent.keyDown(eligible, { key: 'Enter' });
    fireEvent.keyDown(eligible, { key: ' ' });

    expect(onDrop).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenCalledWith(staffs[1], '2026-07-20');
  });
});
