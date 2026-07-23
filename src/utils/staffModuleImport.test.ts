import { describe, expect, it } from 'vitest';
import type { TestModule } from '../types';
import { createFamiliarModuleNameIndex, parseFamiliarModuleNames } from './staffModuleImport';

const moduleFixture = (overrides: Partial<TestModule> = {}): TestModule => ({
  id: 11,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: true,
  sortOrder: 10,
  lockVersion: 0,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  referenced: false,
  ...overrides,
});

describe('parseFamiliarModuleNames', () => {
  it('maps unique names and reports unknown module names', () => {
    const result = parseFamiliarModuleNames('支付模块；未知模块,支付模块', [moduleFixture()]);

    expect(result.moduleIds).toEqual([11]);
    expect(result.unmatched).toEqual(['未知模块']);
    expect(result.unavailable).toEqual([]);
  });

  it('accepts all supported separators and trims names in input order', () => {
    const result = parseFamiliarModuleNames(' 支付模块，登录模块; 支付模块；登录模块 ', [
      moduleFixture(),
      moduleFixture({ id: 12, moduleName: '登录模块' }),
    ]);

    expect(result.moduleIds).toEqual([11, 12]);
    expect(result.unmatched).toEqual([]);
  });

  it('returns empty arrays for empty input', () => {
    expect(parseFamiliarModuleNames('', [moduleFixture()])).toEqual({
      moduleIds: [],
      unmatched: [],
      unavailable: [],
    });
  });

  it('does not fuzzy match or silently map ambiguous duplicate module names', () => {
    const result = parseFamiliarModuleNames('支付模块,支付', [
      moduleFixture(),
      moduleFixture({ id: 12, testType: '自动化测试' }),
    ]);

    expect(result.moduleIds).toEqual([]);
    expect(result.unmatched).toEqual(['支付模块', '支付']);
  });

  it('reports disabled exact matches as unavailable instead of accepting them for a new import', () => {
    const result = parseFamiliarModuleNames('历史模块', [
      moduleFixture({ moduleName: '历史模块', enabled: false }),
    ]);

    expect(result.moduleIds).toEqual([]);
    expect(result.unmatched).toEqual([]);
    expect(result.unavailable).toEqual(['历史模块']);
  });

  it('accepts a prebuilt name index for batch parsing', () => {
    const index = createFamiliarModuleNameIndex([moduleFixture(), moduleFixture({ id: 12, moduleName: '登录模块' })]);
    expect(parseFamiliarModuleNames('支付模块,登录模块', index).moduleIds).toEqual([11, 12]);
  });
});
