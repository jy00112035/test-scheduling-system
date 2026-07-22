import type { TestModule } from '../types';

export interface FamiliarModuleImportResult {
  moduleIds: number[];
  unmatched: string[];
  unavailable: string[];
}
export type FamiliarModuleNameIndex = Map<string, TestModule[]>;

export function createFamiliarModuleNameIndex(modules: TestModule[]): FamiliarModuleNameIndex {
  return modules.reduce<FamiliarModuleNameIndex>((index, module) => {
    const matches = index.get(module.moduleName) || [];
    matches.push(module);
    index.set(module.moduleName, matches);
    return index;
  }, new Map());
}

export function parseFamiliarModuleNames(
  input: string | null | undefined,
  modules: TestModule[] | FamiliarModuleNameIndex,
): FamiliarModuleImportResult {
  const names = Array.from(new Set(
    (input || '')
      .split(/[，,；;]/)
      .map(name => name.trim())
      .filter(Boolean),
  ));
  const modulesByName = modules instanceof Map ? modules : createFamiliarModuleNameIndex(modules);

  return names.reduce<FamiliarModuleImportResult>((result, name) => {
    const matches = modulesByName.get(name);
    if (!matches || matches.length !== 1) {
      result.unmatched.push(name);
    } else if (!matches[0].enabled) {
      result.unavailable.push(name);
    } else {
      result.moduleIds.push(matches[0].id);
    }
    return result;
  }, { moduleIds: [], unmatched: [], unavailable: [] });
}
