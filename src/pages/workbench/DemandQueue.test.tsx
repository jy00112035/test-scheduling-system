import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DemandQueue from './DemandQueue';
import {
  filterAssignedDemands,
  filterPendingDemands,
  isStaffEligibleForAllocationTarget,
} from './workbenchCalculations';
import type { DemandItem } from './workbenchTypes';

function demand(overrides: Partial<Omit<DemandItem, 'requiresHistoricalClassification'>> & {
  requiresHistoricalClassification?: boolean | null;
} = {}): DemandItem {
  const item = {
    id: 1001,
    product: '示例产品',
    version: 'v2.0.0',
    startDate: '2026-07-22T00:00:00',
    endDate: '2026-07-31T00:00:00',
    manpowerDemand: 8,
    versionType: '维护',
    status: 'pending',
    manpowerFullySatisfied: false,
    requiresHistoricalClassification: false,
    ...overrides,
  };
  return {
    ...item,
    requiresHistoricalClassification: item.requiresHistoricalClassification ?? false,
  };
}

describe('workbench demand fulfillment classification', () => {
  it('keeps demand pending until every module and general bucket is satisfied', () => {
    const item = demand({
      manpowerFullySatisfied: false,
      specialModuleDemands: [{
        id: 501,
        demandId: 1001,
        moduleId: 11,
        moduleName: '支付模块',
        testType: '功能测试',
        enabled: true,
        manpowerDemand: 2,
        allocatedManpower: 1,
        remainingManpower: 1,
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      }],
    });

    const aggregateSchedules = [{
      id: 1,
      staffId: 10,
      demandId: item.id,
      date: '2026-07-22',
      percentage: 800,
      product: item.product,
      versionType: item.versionType,
    }];

    expect(filterAssignedDemands([item], aggregateSchedules, [10], [])).toEqual([]);
    expect(filterPendingDemands([item], aggregateSchedules, [10], [])).toEqual([item]);
  });

  it('keeps legacy demand pending when detailed fulfillment is absent', () => {
    const item = demand();

    expect(filterAssignedDemands([item], [], [], [])).toEqual([]);
    expect(filterPendingDemands([item], [], [], [])).toEqual([item]);
  });

  it('keeps a satisfied demand pending while historical classification is required', () => {
    const item = demand({
      manpowerFullySatisfied: true,
      requiresHistoricalClassification: true,
    });

    expect(filterAssignedDemands([item], [], [], [])).toEqual([]);
    expect(filterPendingDemands([item], [], [], [])).toEqual([item]);
  });

  it.each([null, undefined])(
    'accepts a satisfied demand when historical classification is %s',
    (requiresHistoricalClassification) => {
      const item = demand({
        manpowerFullySatisfied: true,
        requiresHistoricalClassification,
      });

      expect(filterAssignedDemands([item], [], [], [])).toEqual([item]);
      expect(filterPendingDemands([item], [], [], [])).toEqual([]);
    },
  );
});

describe('DemandQueue allocation targets', () => {
  it('matches general targets by test group', () => {
    const target = {
      kind: 'general' as const,
      demandId: 1001,
      demandManpowerDetailId: 301,
      testType: '功能测试',
      remainingManpower: 1,
    };
    const baseStaff = {
      id: 10,
      name: '张三',
      empNo: 'T10',
      initialCoefficient: 1,
      currentCoefficient: 1,
      status: 'active',
      familiarModules: [],
    };

    expect(isStaffEligibleForAllocationTarget({ ...baseStaff, testType: '功能测试' }, target)).toBe(true);
    expect(isStaffEligibleForAllocationTarget({ ...baseStaff, testType: '性能测试' }, target)).toBe(false);
  });

  it('renders and drags special and general buckets independently', () => {
    const item = demand({
      manpowerFullySatisfied: false,
      manpowerDetails: [{
        id: 301,
        testType: '功能测试',
        manpowerDemand: 5,
      }],
      manpowerSummary: [{
        testType: '功能测试',
        totalManpower: 5,
        specialManpower: 2,
        generalManpower: 3,
      }],
      specialModuleDemands: [{
        id: 501,
        demandId: 1001,
        moduleId: 11,
        moduleName: '支付模块',
        testType: '功能测试',
        enabled: true,
        manpowerDemand: 2,
        allocatedManpower: 1,
        remainingManpower: 1,
        createdAt: '2026-07-01T00:00:00',
        updatedAt: '2026-07-01T00:00:00',
      }],
    });
    const onAllocationTargetDragStart = vi.fn();

    render(<DemandQueue
      demands={[item]}
      schedules={[]}
      staffs={[]}
      selectedDemandId={null}
      selectedDemandIds={new Set()}
      pendingChangeDemandIds={new Set()}
      unfulfilledDemands={new Set()}
      filterDemandTestTypes={[]}
      priorityOptions={[]}
      editingPriorityId={null}
      canManagePriority={false}
      onFilterChange={vi.fn()}
      onSelectDemand={vi.fn()}
      onViewDetail={vi.fn()}
      onClearDemand={vi.fn()}
      onPublishDemand={vi.fn()}
      onPriorityEdit={vi.fn()}
      onPriorityChange={vi.fn()}
      onAllocationTargetDragStart={onAllocationTargetDragStart}
      onAllocationTargetDragEnd={vi.fn()}
    />);

    const special = screen.getByRole('button', { name: '分配支付模块，剩余 1 人天' });
    const general = screen.getByRole('button', { name: '分配功能测试通用人力，剩余 3 人天' });

    expect(special).toHaveAttribute('draggable', 'true');
    expect(general).toHaveAttribute('draggable', 'true');

    fireEvent.dragStart(special);
    expect(onAllocationTargetDragStart).toHaveBeenLastCalledWith(expect.anything(), {
      kind: 'special',
      demandId: 1001,
      demandManpowerDetailId: 301,
      demandSpecialModuleId: 501,
      testType: '功能测试',
      moduleId: 11,
      moduleName: '支付模块',
      remainingManpower: 1,
    });

    fireEvent.dragStart(general);
    expect(onAllocationTargetDragStart).toHaveBeenLastCalledWith(expect.anything(), {
      kind: 'general',
      demandId: 1001,
      demandManpowerDetailId: 301,
      testType: '功能测试',
      remainingManpower: 3,
    });
  });

  it('disables publish while historical classification is required', () => {
    const item = demand({
      manpowerFullySatisfied: false,
      requiresHistoricalClassification: true,
    });
    render(<DemandQueue
      demands={[item]}
      schedules={[{
        id: 1, demandId: 1001, staffId: 10, date: '2026-07-22', percentage: 100,
        product: '示例产品', versionType: '维护', published: false,
      }]}
      staffs={[{
        id: 10, name: '张三', empNo: 'T10', initialCoefficient: 1,
        currentCoefficient: 1, status: 'active', familiarModules: [],
      }]}
      selectedDemandId={null}
      selectedDemandIds={new Set()}
      pendingChangeDemandIds={new Set()}
      unfulfilledDemands={new Set()}
      filterDemandTestTypes={[]}
      priorityOptions={[]}
      editingPriorityId={null}
      canManagePriority={false}
      onFilterChange={vi.fn()}
      onSelectDemand={vi.fn()}
      onViewDetail={vi.fn()}
      onClearDemand={vi.fn()}
      onPublishDemand={vi.fn()}
      onPriorityEdit={vi.fn()}
      onPriorityChange={vi.fn()}
      onAllocationTargetDragStart={vi.fn()}
      onAllocationTargetDragEnd={vi.fn()}
    />);

    expect(screen.getByRole('button', { name: '发布' })).toBeDisabled();
  });

  it('offers single publish from an assigned demand with an unpublished draft', () => {
    const onPublishDemand = vi.fn();
    render(<DemandQueue
      demands={[demand({ manpowerFullySatisfied: true })]}
      schedules={[{
        id: 1, demandId: 1001, staffId: 10, date: '2026-07-22', percentage: 100,
        product: '示例产品', versionType: '维护', published: false,
      }]}
      staffs={[]}
      selectedDemandId={null}
      selectedDemandIds={new Set()}
      pendingChangeDemandIds={new Set()}
      unfulfilledDemands={new Set()}
      filterDemandTestTypes={[]}
      priorityOptions={[]}
      editingPriorityId={null}
      canManagePriority={false}
      onFilterChange={vi.fn()}
      onSelectDemand={vi.fn()}
      onViewDetail={vi.fn()}
      onClearDemand={vi.fn()}
      onPublishDemand={onPublishDemand}
      onPriorityEdit={vi.fn()}
      onPriorityChange={vi.fn()}
      onAllocationTargetDragStart={vi.fn()}
      onAllocationTargetDragEnd={vi.fn()}
    />);

    fireEvent.click(screen.getByRole('tab', { name: '已分配 (1)' }));
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    expect(onPublishDemand).toHaveBeenCalledOnce();
    expect(onPublishDemand).toHaveBeenCalledWith(1001);
  });
});
