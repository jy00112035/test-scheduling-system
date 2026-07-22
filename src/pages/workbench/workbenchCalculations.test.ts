import { describe, expect, it } from 'vitest';
import {
  groupSchedulesByDemandOwnership,
  normalizeSchedulePercentage,
} from './workbenchCalculations';
import type { DemandItem, ScheduleItem } from './workbenchTypes';

describe('normalizeSchedulePercentage', () => {
  it.each([
    [4, 10],
    [57, 60],
    [106, 100],
    [Number.NaN, 100],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeSchedulePercentage(input)).toBe(expected);
  });
});

describe('groupSchedulesByDemandOwnership', () => {
  it('counts a cross-group special schedule in its owning demand group', () => {
    const demand = {
      id: 1001,
      product: '示例产品',
      startDate: '2026-07-20',
      endDate: '2026-07-31',
      manpowerDemand: 2,
      versionType: '维护',
      status: 'pending',
      manpowerFullySatisfied: false,
      requiresHistoricalClassification: false,
      manpowerDetails: [{ id: 301, testType: '功能测试', manpowerDemand: 2 }],
      specialModuleDemands: [{
        id: 501, demandId: 1001, moduleId: 11, moduleName: '支付模块',
        testType: '功能测试', enabled: true, manpowerDemand: 1,
        allocatedManpower: 1, remainingManpower: 0, createdAt: '', updatedAt: '',
      }],
    } satisfies DemandItem;
    const owned: ScheduleItem = {
      id: 9001, demandId: 1001, staffId: 20, date: '2026-07-22', percentage: 100,
      demandManpowerDetailId: 301, demandSpecialModuleId: 501,
      product: '示例产品', versionType: '维护', published: false,
    };
    const historical: ScheduleItem = {
      ...owned,
      id: 9002,
      demandManpowerDetailId: null,
      demandSpecialModuleId: null,
      percentage: 50,
    };

    const result = groupSchedulesByDemandOwnership(demand, [owned, historical]);

    expect(result.allocatedByDetailId).toEqual({ 301: 1 });
    expect(result.unclassifiedSchedules).toEqual([historical]);
  });
});
