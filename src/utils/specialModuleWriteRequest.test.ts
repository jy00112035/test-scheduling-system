import { expect, it } from 'vitest';
import { buildSpecialModuleWriteRequests } from './specialModuleWriteRequest';

it('strips UI-only special module fields from write requests', () => {
  expect(buildSpecialModuleWriteRequests([{ moduleId: 11, testType: '功能测试', manpowerDemand: 2, historicalManpowerDemand: 1 }])).toEqual([
    { moduleId: 11, manpowerDemand: 2 },
  ]);
});
