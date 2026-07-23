import type { DemandSpecialModuleWriteRequest, SpecialModuleDemandInput } from '../types';
export const buildSpecialModuleWriteRequests = (rows: SpecialModuleDemandInput[]): DemandSpecialModuleWriteRequest[] => rows.map((row) => ({ moduleId: row.moduleId as number, manpowerDemand: row.manpowerDemand as number }));
