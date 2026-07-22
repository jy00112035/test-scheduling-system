import type { ManpowerSummary, SpecialModuleDemandInput } from '../types';

export interface SpecialModuleValidationResult {
  valid: boolean;
  errorCode?: 'SPECIAL_MODULE_EXCEEDS_GROUP' | 'SPECIAL_MODULE_REQUIRED' | 'SPECIAL_MODULE_MANPOWER_INVALID' | 'SPECIAL_MODULE_DUPLICATE' | 'MODULE_GROUP_MISMATCH';
  testType?: string;
}

const toTenths = (value: number) => Math.round(value * 10);

const fromTenths = (value: number) => value / 10;

export function calculateManpowerSummary(
  manpowerByTestType: Record<string, number>,
  rows: SpecialModuleDemandInput[],
): ManpowerSummary[] {
  return Object.entries(manpowerByTestType).map(([testType, totalManpower]) => {
    const specialManpower = fromTenths(rows
      .filter((row) => row.testType === testType)
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
): SpecialModuleValidationResult {
  const selectedModuleIds = new Set<number>();
  for (const row of rows) {
    const { moduleId, manpowerDemand } = row;
    if (moduleId === undefined || !Number.isInteger(moduleId)) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_REQUIRED', testType: row.testType };
    }
    if (!Number.isFinite(manpowerDemand) || manpowerDemand === undefined || manpowerDemand <= 0 || Math.round(manpowerDemand * 10) !== manpowerDemand * 10) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_MANPOWER_INVALID', testType: row.testType };
    }
    if (!row.testType || !Object.prototype.hasOwnProperty.call(manpowerByTestType, row.testType) || manpowerByTestType[row.testType] <= 0) {
      return { valid: false, errorCode: 'MODULE_GROUP_MISMATCH', testType: row.testType };
    }
    if (selectedModuleIds.has(moduleId)) {
      return { valid: false, errorCode: 'SPECIAL_MODULE_DUPLICATE', testType: row.testType };
    }
    selectedModuleIds.add(moduleId);
  }

  const summary = calculateManpowerSummary(manpowerByTestType, rows);
  const overflow = summary.find((item) => item.generalManpower < 0);
  return overflow
    ? { valid: false, errorCode: 'SPECIAL_MODULE_EXCEEDS_GROUP', testType: overflow.testType }
    : { valid: true };
}
