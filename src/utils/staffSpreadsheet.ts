import * as XLSX from 'xlsx';
import type { FamiliarModule } from '../types';

export interface StaffSpreadsheetRecord {
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
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

const statusLabels: Record<string, string> = { active: '在职', leave: '休假', resigned: '离职' };

export function buildStaffExportRows(staffs: StaffSpreadsheetRecord[]) {
  return staffs.map(staff => ({
    工号: staff.empNo,
    姓名: staff.name,
    入职日期: staff.joinDate,
    所属项目: staff.groupName,
    测试类型: staff.testType || '',
    初始系数: staff.initialCoefficient,
    当前系数: staff.currentCoefficient,
    状态: statusLabels[staff.status] || staff.status,
    角色: (staff.roles?.length ? staff.roles : staff.role ? [staff.role] : []).join(', '),
    熟悉模块: Array.isArray(staff.familiarModules)
      ? staff.familiarModules.map(module => module.moduleName).join(', ')
      : staff.familiarModules || '',
    保密权限: staff.confidentialClearance ? '是' : '否',
  }));
}

export function createStaffImportTemplateWorkbook() {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([[
    '工号', '姓名', '入职日期', '所属项目', '测试类型', '初始系数', '当前系数', '角色', '熟悉模块', '保密权限',
  ]]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet([
    ['人员导入填写说明'],
    ['熟悉模块：使用全系统唯一模块名称，以英文逗号分隔。'],
    ['角色可使用英文角色代码或系统显示名称；保密权限填写 是 或 否。'],
  ]);
  XLSX.utils.book_append_sheet(workbook, dataSheet, '人员导入');
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, '填写说明');
  return workbook;
}
