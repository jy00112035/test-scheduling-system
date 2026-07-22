import type { TestModule } from '../types';

export interface FamiliarModuleImportResult {
  moduleIds: number[];
  unmatched: string[];
  unavailable: string[];
}

export function parseFamiliarModuleNames(
  input: string | null | undefined,
  modules: TestModule[],
): FamiliarModuleImportResult {
  const names = Array.from(new Set(
    (input || '')
      .split(/[，,；;]/)
      .map(name => name.trim())
      .filter(Boolean),
  ));
  const modulesByName = new Map<string, TestModule[]>();

  modules.forEach(module => {
    const matches = modulesByName.get(module.moduleName) || [];
    matches.push(module);
    modulesByName.set(module.moduleName, matches);
  });

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
