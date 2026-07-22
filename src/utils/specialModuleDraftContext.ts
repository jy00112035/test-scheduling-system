import type { DemandSpecialModule, SpecialModuleDemandInput } from '../types';

export function mergeEditDraftSpecialRows(
  persistedRows: DemandSpecialModule[],
  restoredRows: SpecialModuleDemandInput[],
  isEdit: boolean,
): SpecialModuleDemandInput[] {
  const baselineByModuleId = new Map(persistedRows.map((row) => [row.moduleId, row.manpowerDemand]));
  return restoredRows.map((row) => ({
    ...row,
    historicalManpowerDemand: isEdit ? baselineByModuleId.get(row.moduleId as number) : undefined,
  }));
}
