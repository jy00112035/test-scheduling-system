import { describe, expect, it } from 'vitest';
import {
  calculateManpowerSummary,
  validateSpecialModuleRows,
} from './specialModuleCalculations';
import type { TestModule } from '../types';

const moduleFixture = (overrides: Partial<TestModule> = {}): TestModule => ({
  id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, sortOrder: 1,
  lockVersion: 0, createdAt: '', updatedAt: '', referenced: false, ...overrides,
});

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
    ])).toMatchObject({ valid: false, errorCode: 'SPECIAL_MODULE_EXCEEDS_GROUP', rowIndexes: [0] });
  });

  it('rejects an unknown module ID against the authoritative module list', () => {
    expect(validateSpecialModuleRows(
      { 功能测试: 3 },
      [{ moduleId: 99, testType: '功能测试', manpowerDemand: 1 }],
      [moduleFixture()],
    )).toMatchObject({ valid: false, errorCode: 'MODULE_NOT_FOUND' });
  });

  it('uses the module current group instead of a stale row group', () => {
    const rows = [{ moduleId: 11, testType: '旧小组', manpowerDemand: 1 }];
    const modules = [moduleFixture({ testType: '功能测试' })];
    expect(validateSpecialModuleRows({ 功能测试: 3 }, rows, modules)).toMatchObject({ valid: true });
    expect(calculateManpowerSummary({ 功能测试: 3 }, rows, modules)[0]).toMatchObject({
      specialManpower: 1,
      generalManpower: 2,
    });
  });

  it('enforces backend decimal boundaries and disabled history rules', () => {
    const disabled = moduleFixture({ enabled: false });
    expect(validateSpecialModuleRows({ 功能测试: 999999999.9 }, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 999999999.9 }], [moduleFixture()]))
      .toMatchObject({ valid: true });
    expect(validateSpecialModuleRows({ 功能测试: 999999999.9 }, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 999999999.91 }], [moduleFixture()]))
      .toMatchObject({ valid: false, errorCode: 'SPECIAL_MODULE_MANPOWER_INVALID' });
    expect(validateSpecialModuleRows({ 功能测试: 3 }, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1 }], [disabled]))
      .toMatchObject({ valid: false, errorCode: 'MODULE_DISABLED_FOR_NEW_DEMAND' });
    expect(validateSpecialModuleRows({ 功能测试: 3 }, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1, historicalManpowerDemand: 1 }], [disabled]))
      .toMatchObject({ valid: true });
    expect(validateSpecialModuleRows({ 功能测试: 3 }, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1.1, historicalManpowerDemand: 1 }], [disabled]))
      .toMatchObject({ valid: false, errorCode: 'MODULE_DISABLED_FOR_NEW_DEMAND' });
  });
});
