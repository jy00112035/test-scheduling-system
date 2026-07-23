import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { FamiliarModule } from '../types';
import { buildStaffExportRows, classifyStaffImportLimits, createStaffImportTemplateWorkbook, parseStaffRoles, parseStaffStatus, STAFF_IMPORT_MAX_FILE_SIZE, STAFF_IMPORT_MAX_ROWS, STAFF_IMPORT_TEMPLATE_FILENAME } from './staffSpreadsheet';

const historicalModule: FamiliarModule = {
  id: 11, moduleName: '支付模块', testType: '功能测试', enabled: false, sortOrder: 1,
  lockVersion: 0, createdAt: '', updatedAt: '', referenced: true,
};

describe('staff spreadsheet helpers', () => {
  it('exports readable structured and legacy familiar module names', () => {
    expect(buildStaffExportRows([
      {
        name: '张三', empNo: 'EMP001', joinDate: '2026-07-01', groupName: '功能测试组', testType: '功能测试',
        initialCoefficient: 0.3, currentCoefficient: 0.5, status: 'active', roles: ['testExecutor'],
        familiarModules: [historicalModule], confidentialClearance: true,
      },
      {
        name: '李四', empNo: 'EMP002', joinDate: '2026-07-02', groupName: '自动化测试组',
        initialCoefficient: 0.4, currentCoefficient: 0.4, status: 'leave', familiarModules: '历史模块',
      },
    ])).toEqual([
      expect.objectContaining({ 姓名: '张三', 熟悉模块: '支付模块', 保密权限: '是' }),
      expect.objectContaining({ 姓名: '李四', 熟悉模块: '历史模块', 状态: '休假' }),
    ]);
  });

  it('creates a genuine xlsx template with headers and durable familiar-module guidance', () => {
    const workbook = createStaffImportTemplateWorkbook();
    const dataSheet = workbook.Sheets[workbook.SheetNames[0]];
    const guidanceSheet = workbook.Sheets[workbook.SheetNames[1]];

    expect(STAFF_IMPORT_TEMPLATE_FILENAME).toBe('人员导入模板.xlsx');
    const headers = XLSX.utils.sheet_to_json<string[]>(dataSheet, { header: 1 })[0];
    const guidance = XLSX.utils.sheet_to_json<string[]>(guidanceSheet, { header: 1 }).flat().join('');
    expect(headers).toContain('熟悉模块');
    expect(headers).toContain('状态');
    expect(guidance).toContain('全系统唯一模块名称，以英文逗号分隔');
    expect(guidance).toContain('状态：填写 在职、休假、离职，或 active、leave、resigned；留空默认为在职');
    expect(XLSX.read(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), { type: 'array' }).SheetNames).toEqual(['人员导入', '填写说明']);
  });

  it('round trips multiple roles and every supported status without silent fallback', () => {
    const rows = buildStaffExportRows(['active', 'leave', 'resigned'].map(status => ({
      name: status, empNo: status, joinDate: '2026-07-01', groupName: '组', initialCoefficient: 0.3, currentCoefficient: 0.3,
      status, roles: ['testExecutor', 'testLead'], familiarModules: [],
    })));
    expect(rows.map(row => parseStaffRoles(row.角色).roles)).toEqual([['testExecutor', 'testLead'], ['testExecutor', 'testLead'], ['testExecutor', 'testLead']]);
    expect(rows.map(row => parseStaffStatus(row.状态).status)).toEqual(['active', 'leave', 'resigned']);
    expect(parseStaffRoles('不存在角色').invalid).toEqual(['不存在角色']);
    expect(parseStaffStatus('未知状态').invalid).toBe(true);
  });

  it.each([
    ['active', ['testExecutor']], ['leave', ['testManager', 'testLead']], ['resigned', ['fieldAdmin', 'projectManager']],
  ])('preserves status %s and roles %j through an export row', (status, roles) => {
    const row = buildStaffExportRows([{ name: '人员', empNo: 'EMP', joinDate: '2026-01-01', groupName: '组', initialCoefficient: 0.3, currentCoefficient: 0.3, status, roles, familiarModules: [] }])[0];
    expect(parseStaffStatus(row.状态)).toEqual({ status, invalid: false });
    expect(parseStaffRoles(row.角色)).toEqual({ roles, invalid: [] });
  });

  it('accepts exact import size and row boundaries and rejects the next value', () => {
    expect(classifyStaffImportLimits(STAFF_IMPORT_MAX_FILE_SIZE, STAFF_IMPORT_MAX_ROWS)).toBeNull();
    expect(classifyStaffImportLimits(STAFF_IMPORT_MAX_FILE_SIZE + 1)).toBe('fileTooLarge');
    expect(classifyStaffImportLimits(0, STAFF_IMPORT_MAX_ROWS + 1)).toBe('tooManyRows');
  });
});
