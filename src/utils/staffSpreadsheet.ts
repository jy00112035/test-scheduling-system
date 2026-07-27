import * as XLSX from 'xlsx';
import type { FamiliarModule } from '../types';
import { createModuleSheetForStaffTemplate } from './moduleSpreadsheet';

export interface StaffSpreadsheetRecord {
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
  officeLocation?: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: string;
  role?: string;
  roles?: string[];
  familiarModules?: FamiliarModule[] | string;
  confidentialClearance?: boolean;
}

export const STAFF_IMPORT_TEMPLATE_FILENAME = '人员导入模板.xlsx';
export const STAFF_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const STAFF_IMPORT_MAX_ROWS = 1000;

export function classifyStaffImportLimits(fileSize: number, rowCount?: number) {
  if (fileSize > STAFF_IMPORT_MAX_FILE_SIZE) return 'fileTooLarge' as const;
  if (rowCount !== undefined && rowCount > STAFF_IMPORT_MAX_ROWS) return 'tooManyRows' as const;
  return null;
}

export const staffRoleLabels: Record<string, string> = {
  testManager: '测试经理', resourceManager: '资源主管', projectManager: '项目经理',
  testExecutor: '测试执行人员', fieldAdmin: '字段管理员', testLead: '测试组长',
};
const roleCodes = new Set(Object.keys(staffRoleLabels));
const roleByLabel = new Map(Object.entries(staffRoleLabels).map(([code, label]) => [label, code]));
const statusLabels: Record<string, string> = { active: '在职', leave: '休假', resigned: '离职' };
const statusByLabel = new Map(Object.entries(statusLabels).map(([status, label]) => [label, status]));

export function serializeStaffRoles(roles?: string[], role?: string) {
  return (roles?.length ? roles : role ? [role] : []).map(value => staffRoleLabels[value] || value).join(';');
}

export function parseStaffRoles(input: unknown) {
  const values = String(input || '').split(/[;,，；]/).map(value => value.trim()).filter(Boolean);
  const roles = values.map(value => roleCodes.has(value) ? value : roleByLabel.get(value));
  return { roles: roles.filter((value): value is string => Boolean(value)), invalid: values.filter((_, index) => !roles[index]) };
}

export function parseStaffStatus(input: unknown) {
  const value = String(input || '').trim();
  if (!value) return { status: 'active', invalid: false };
  if (statusLabels[value]) return { status: value, invalid: false };
  const status = statusByLabel.get(value);
  return { status: status || 'active', invalid: !status };
}

export function buildStaffExportRows(staffs: StaffSpreadsheetRecord[]) {
  return staffs.map(staff => ({
    工号: staff.empNo,
    姓名: staff.name,
    入职日期: staff.joinDate,
    所属项目: staff.groupName,
    办公地点: staff.officeLocation || '',
    测试类型: staff.testType || '',
    初始系数: staff.initialCoefficient,
    当前系数: staff.currentCoefficient,
    状态: statusLabels[staff.status] || staff.status,
    角色: serializeStaffRoles(staff.roles, staff.role),
    熟悉模块: Array.isArray(staff.familiarModules)
      ? staff.familiarModules.map(module => module.moduleName).join(', ')
      : staff.familiarModules || '',
    保密权限: staff.confidentialClearance ? '是' : '否',
  }));
}

export function createStaffImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([[
    '工号', '姓名', '入职日期', '所属项目', '办公地点', '测试类型', '初始系数', '当前系数', '状态', '角色', '熟悉模块', '保密权限',
  ]]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet([
    ['人员导入填写说明'],
    ['熟悉模块：使用全系统唯一模块名称，以英文逗号分隔。'],
    ['角色可使用英文角色代码或系统显示名称，以英文分号分隔。'],
    ['状态：填写 在职、休假、离职，或 active、leave、resigned；留空默认为在职。'],
    [`单个文件不超过 ${STAFF_IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB，最多 ${STAFF_IMPORT_MAX_ROWS} 行数据。`],
    [''],
    ['提示：如需批量创建特殊模块定义，请在"特殊模块导入"工作表中填写，或使用字段配置页面的专用导入功能。'],
  ]);
  const moduleSheet = createModuleSheetForStaffTemplate();
  XLSX.utils.book_append_sheet(workbook, dataSheet, '人员导入');
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, '填写说明');
  XLSX.utils.book_append_sheet(workbook, moduleSheet, '特殊模块导入');
  return workbook;
}
