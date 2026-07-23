import { describe, expect, it } from 'vitest';
import { getDraft, saveDraft } from './draftStorage';

describe('draft storage', () => {
  it('restores old drafts without special module rows', () => {
    localStorage.setItem('demand_draft_old', JSON.stringify({
      formData: {}, manpowerInputs: { 功能测试: 2 }, manpowerRemarks: { 功能测试: '保留备注' }, timestamp: 1,
    }));
    expect(getDraft('old')).toMatchObject({ specialModuleDemands: [], manpowerRemarks: { 功能测试: '保留备注' } });
  });

  it('round-trips UI-only disabled-history metadata without adding it to API payload concerns', () => {
    saveDraft('history', {
      formData: {}, manpowerInputs: { 功能测试: 2 }, manpowerRemarks: {},
      specialModuleDemands: [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1, historicalManpowerDemand: 1 }],
    });
    expect(getDraft('history')?.specialModuleDemands).toEqual([
      { moduleId: 11, testType: '功能测试', manpowerDemand: 1, historicalManpowerDemand: 1 },
    ]);
  });
});
