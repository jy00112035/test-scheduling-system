import * as XLSX from 'xlsx';

export const MODULE_IMPORT_TEMPLATE_FILENAME = '特殊模块导入模板.xlsx';
export const MODULE_IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MODULE_IMPORT_MAX_ROWS = 500;

export interface ModuleImportRow {
  moduleName: string;
  testType: string;
  sortOrder: number;
  rowErrors: string[];
  retryError?: string;
}

export function classifyModuleImportLimits(fileSize: number, rowCount?: number) {
  if (fileSize > MODULE_IMPORT_MAX_FILE_SIZE) return 'fileTooLarge' as const;
  if (rowCount !== undefined && rowCount > MODULE_IMPORT_MAX_ROWS) return 'tooManyRows' as const;
  return null;
}

/**
 * Create a standalone module import template workbook with two sheets:
 * "特殊模块导入" (data) and "填写说明" (guidance).
 */
export function createModuleImportTemplateWorkbook(testTypes: string[]): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const dataSheet = XLSX.utils.aoa_to_sheet([[
    '模块名称', '所属小组', '排序',
  ]]);
  const guidanceSheet = XLSX.utils.aoa_to_sheet([
    ['特殊模块导入填写说明'],
    ['模块名称：必填，不能与已有模块名称重复，最长100个字符。'],
    ['所属小组：必填，必须为系统中已配置的测试类型之一。'],
    ['排序：必填，数字≥1，数字越小越靠前。'],
    [`单个文件不超过 ${MODULE_IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB，最多 ${MODULE_IMPORT_MAX_ROWS} 行数据。`],
    [''],
    ['可选小组列表：', ...testTypes],
  ]);
  XLSX.utils.book_append_sheet(workbook, dataSheet, '特殊模块导入');
  XLSX.utils.book_append_sheet(workbook, guidanceSheet, '填写说明');
  return workbook;
}

/**
 * Create a single "特殊模块导入" worksheet for appending to the personnel
 * import template.  Returns the sheet without wrapping it in a workbook.
 */
export function createModuleSheetForStaffTemplate(): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([[
    '模块名称', '所属小组', '排序',
  ]]);
}

/** Parse raw JSON rows (from XLSX.utils.sheet_to_json) into ModuleImportRow[]. */
export function parseModuleImportRows(
  jsonRows: Record<string, unknown>[],
  validTestTypes: string[],
  existingModuleNameTypePairs: Set<string>,
): ModuleImportRow[] {
  if (jsonRows.length === 0) return [];

  // Detect column headers bilingually
  const sample = jsonRows[0];
  const keyModuleName = Object.keys(sample).find(
    k => k === '模块名称' || k.toLowerCase() === 'modulename',
  );
  const keyTestType = Object.keys(sample).find(
    k => k === '所属小组' || k.toLowerCase() === 'testtype',
  );
  const keySortOrder = Object.keys(sample).find(
    k => k === '排序' || k.toLowerCase() === 'sortorder',
  );

  if (!keyModuleName || !keyTestType || !keySortOrder) {
    const missing: string[] = [];
    if (!keyModuleName) missing.push('模块名称');
    if (!keyTestType) missing.push('所属小组');
    if (!keySortOrder) missing.push('排序');
    throw new Error(`缺少必要列：${missing.join('、')}。请使用下载的模板文件。`);
  }

  const testTypeSet = new Set(validTestTypes.map(t => t.trim()));
  const pairsInBatch = new Set<string>();
  const rows: ModuleImportRow[] = [];

  for (let i = 0; i < jsonRows.length; i++) {
    const raw = jsonRows[i];
    const rowErrors: string[] = [];

    const moduleName = String(raw[keyModuleName] ?? '').trim();
    const testType = String(raw[keyTestType] ?? '').trim();
    const sortOrderRaw = String(raw[keySortOrder] ?? '').trim();
    const pairKey = `${moduleName}|${testType}`;

    // Validate module name
    if (!moduleName) {
      rowErrors.push('模块名称不能为空');
    } else if (moduleName.length > 100) {
      rowErrors.push('模块名称不能超过100个字符');
    } else if (existingModuleNameTypePairs.has(pairKey)) {
      rowErrors.push(`模块已存在：${moduleName}（${testType}）`);
    } else if (pairsInBatch.has(pairKey)) {
      rowErrors.push('模块名称与批量内其他行重复（同小组下名称相同）');
    } else {
      pairsInBatch.add(pairKey);
    }

    // Validate test type
    if (!testType) {
      rowErrors.push('所属小组不能为空');
    } else if (!testTypeSet.has(testType)) {
      rowErrors.push(`无效的小组类型：${testType}`);
    }

    // Validate sort order
    let sortOrder = 1;
    if (sortOrderRaw) {
      const parsed = Number(sortOrderRaw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        rowErrors.push('排序必须为≥1的整数');
      } else {
        sortOrder = parsed;
      }
    }

    rows.push({ moduleName, testType, sortOrder, rowErrors, retryError: undefined });
  }

  return rows;
}
