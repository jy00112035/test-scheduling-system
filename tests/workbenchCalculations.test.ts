import {
  filterAssignedDemands,
  filterPendingDemands,
} from '../src/pages/workbench/workbenchCalculations';
import type {
  DemandItem,
  ScheduleItem,
} from '../src/pages/workbench/workbenchTypes';

const demand: DemandItem = {
  id: 1,
  product: '测试项目',
  startDate: '2026-07-14',
  endDate: '2026-07-31',
  manpowerDemand: 3,
  versionType: '维护',
  status: 'pending',
};

const schedule = (id: number, percentage: number): ScheduleItem => ({
  id,
  demandId: demand.id,
  staffId: id,
  date: `2026-07-${14 + id}`,
  percentage,
  product: demand.product,
  versionType: demand.versionType,
  published: false,
});

function assertIds(label: string, actual: DemandItem[], expected: number[]): void {
  const actualIds = actual.map(item => item.id);
  if (JSON.stringify(actualIds) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualIds)}`);
  }
}

const partialSchedules = [schedule(1, 100), schedule(2, 100)];
const fullyAllocatedSchedules = [...partialSchedules, schedule(3, 100)];
const staffIds = [1, 2, 3];

assertIds(
  'partially allocated demand stays pending',
  filterPendingDemands([demand], partialSchedules, staffIds, []),
  [demand.id],
);
assertIds(
  'partially allocated demand is not assigned',
  filterAssignedDemands([demand], partialSchedules, staffIds, []),
  [],
);
assertIds(
  'fully allocated demand leaves pending',
  filterPendingDemands([demand], fullyAllocatedSchedules, staffIds, []),
  [],
);
assertIds(
  'fully allocated demand becomes assigned',
  filterAssignedDemands([demand], fullyAllocatedSchedules, staffIds, []),
  [demand.id],
);
