import type { ManpowerSummary, SpecialModuleDemandInput, TestModule } from '../types';

export interface SpecialModuleValidationResult {
  valid: boolean;
  errorCode?: SpecialModuleValidationErrorCode;
  testType?: string;
  rowIndexes?: number[];
}

export type SpecialModuleValidationErrorCode =
  | 'SPECIAL_MODULE_EXCEEDS_GROUP'
  | 'SPECIAL_MODULE_REQUIRED'
  | 'SPECIAL_MODULE_MANPOWER_INVALID'
  | 'SPECIAL_MODULE_DUPLICATE'
  | 'MODULE_GROUP_MISMATCH'
  | 'MODULE_NOT_FOUND'
  | 'MODULE_DISABLED_FOR_NEW_DEMAND';

export const SPECIAL_MODULE_MAX_MANPOWER = 999999999.9;

const toTenths = (value: number) => Math.round(value * 10);

const fromTenths = (value: number) => value / 10;

export function calculateManpowerSummary(
  manpowerByTestType: Record<string, number>,
  rows: SpecialModuleDemandInput[],
  modules?: TestModule[],
): ManpowerSummary[] {
  return Object.entries(manpowerByTestType).map(([testType, totalManpower]) => {
    const specialManpower = fromTenths(rows
      .filter((row) => {
        const module = modules?.find((item) => item.id === row.moduleId);
        return (module?.testType ?? row.testType) === testType;
      })
      .reduce((total, row) => total + toTenths(Number(row.manpowerDemand) || 0), 0));

    return {
      testType,
      totalManpower,
      specialManpower,
      generalManpower: fromTenths(toTenths(totalManpower) - toTenths(specialManpower)),
    };
  });
}

export function validateSpecialModuleRows(
  manpowerByTestType: Record<string, number>,
  rows: SpecialModuleDemandInput[],
  modules?: TestModule[],
): SpecialModuleValidationResult {
  const selectedModuleIds = new Set<number>();
  for (const [index, row] of rows.entries()) {
    const { moduleId, manpowerDemand } = row;
    if (moduleId === undefined || !Number.isInteger(moduleId)) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_REQUIRED', testType: row.testType, rowIndexes: [index] };
    }
    if (!Number.isFinite(manpowerDemand) || manpowerDemand === undefined || manpowerDemand <= 0 || Math.round(manpowerDemand * 10) !== manpowerDemand * 10 || manpowerDemand > SPECIAL_MODULE_MAX_MANPOWER) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_MANPOWER_INVALID', testType: row.testType, rowIndexes: [index] };
    }
    if (selectedModuleIds.has(moduleId)) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_DUPLICATE', testType: row.testType, rowIndexes: rows.map((item, itemIndex) => item.moduleId === moduleId ? itemIndex : -1).filter((itemIndex) => itemIndex >= 0) };
    }
    selectedModuleIds.add(moduleId);
    const module = modules?.find((item) => item.id === moduleId);
    if (modules && !module) {
      return { valid: false, errorCode: 'MODULE_NOT_FOUND', testType: row.testType, rowIndexes: [index] };
    }
    const authoritativeTestType = module?.testType ?? row.testType;
    if (!authoritativeTestType || !Object.prototype.hasOwnProperty.call(manpowerByTestType, authoritativeTestType) || manpowerByTestType[authoritativeTestType] <= 0) {
      return { valid: false, errorCode: 'MODULE_GROUP_MISMATCH', testType: authoritativeTestType, rowIndexes: [index] };
    }
    if (module && !module.enabled && row.historicalManpowerDemand !== manpowerDemand) {
      return { valid: false, errorCode: 'MODULE_DISABLED_FOR_NEW_DEMAND', testType: authoritativeTestType, rowIndexes: [index] };
    }
  }

  const summary = calculateManpowerSummary(manpowerByTestType, rows, modules);
  const overflow = summary.find((item) => item.generalManpower < 0);
  return overflow
    ? {
      valid: false, errorCode: 'SPECIAL_MODULE_EXCEEDS_GROUP', testType: overflow.testType,
      rowIndexes: rows.map((row, index) => ((modules?.find((module) => module.id === row.moduleId)?.testType ?? row.testType) === overflow.testType ? index : -1)).filter((index) => index >= 0),
    }
    : { valid: true };
}
