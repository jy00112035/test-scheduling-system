import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { FamiliarModule } from '../types';
import { buildStaffExportRows, createStaffImportTemplateWorkbook, STAFF_IMPORT_TEMPLATE_FILENAME } from './staffSpreadsheet';

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
    expect(XLSX.utils.sheet_to_json(dataSheet, { header: 1 })[0]).toContain('熟悉模块');
    expect(XLSX.utils.sheet_to_json(guidanceSheet, { header: 1 }).flat().join('')).toContain('全系统唯一模块名称，以英文逗号分隔');
    expect(XLSX.read(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }), { type: 'array' }).SheetNames).toEqual(['人员导入', '填写说明']);
  });
});
