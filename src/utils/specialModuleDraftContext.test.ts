import { describe, expect, it } from 'vitest';
import { mergeEditDraftSpecialRows } from './specialModuleDraftContext';
import { validateSpecialModuleRows } from './specialModuleCalculations';
import type { DemandSpecialModule, TestModule } from '../types';

const persisted = [{ moduleId: 11, manpowerDemand: 1 } as DemandSpecialModule];
const disabled = [{ id: 11, moduleName: '支付', testType: '功能测试', enabled: false, sortOrder: 0, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true } as TestModule];

describe('edit draft special module context', () => {
  it('trusts only the persisted edit baseline when a module later becomes disabled', () => {
    const unchanged = mergeEditDraftSpecialRows(persisted, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1 }], true);
    const changed = mergeEditDraftSpecialRows(persisted, [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1.1 }], true);
    const forgedNew = mergeEditDraftSpecialRows([], [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1, historicalManpowerDemand: 1 }], false);
    expect(validateSpecialModuleRows({ 功能测试: 2 }, unchanged, disabled)).toMatchObject({ valid: true });
    expect(validateSpecialModuleRows({ 功能测试: 2 }, changed, disabled)).toMatchObject({ valid: false, errorCode: 'MODULE_DISABLED_FOR_NEW_DEMAND' });
    expect(validateSpecialModuleRows({ 功能测试: 2 }, forgedNew, disabled)).toMatchObject({ valid: false, errorCode: 'MODULE_DISABLED_FOR_NEW_DEMAND' });
  });
});
