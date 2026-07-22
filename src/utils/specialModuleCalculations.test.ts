import { describe, expect, it } from 'vitest';
import {
  calculateManpowerSummary,
  validateSpecialModuleRows,
} from './specialModuleCalculations';

describe('special module calculations', () => {
  it('subtracts special manpower from its group without increasing total', () => {
    const summary = calculateManpowerSummary(
      { 功能测试: 8 },
      [
        { moduleId: 11, testType: '功能测试', manpowerDemand: 2 },
        { moduleId: 12, testType: '功能测试', manpowerDemand: 1.5 },
      ],
    );

    expect(summary).toEqual([
      { testType: '功能测试', totalManpower: 8, specialManpower: 3.5, generalManpower: 4.5 },
    ]);
  });

  it('returns SPECIAL_MODULE_EXCEEDS_GROUP for overflow', () => {
    expect(validateSpecialModuleRows({ 功能测试: 3 }, [
      { moduleId: 11, testType: '功能测试', manpowerDemand: 3.5 },
    ])).toMatchObject({ valid: false, errorCode: 'SPECIAL_MODULE_EXCEEDS_GROUP' });
  });
});
