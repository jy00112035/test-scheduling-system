import { Button, InputNumber, Select, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SpecialModuleDemandInput, TestModule } from '../types';
import { validateSpecialModuleRows } from '../utils/specialModuleCalculations';

interface SpecialModuleDemandEditorProps {
  rows: SpecialModuleDemandInput[];
  modules: TestModule[];
  manpowerByTestType: Record<string, number>;
  onChange: (rows: SpecialModuleDemandInput[]) => void;
  disabled?: boolean;
  canEditModules?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components -- Exported pure interaction contract for focused editor tests.
export const resetSpecialModuleRowForTestType = (testType: string): SpecialModuleDemandInput => ({ testType });

const validationMessages: Record<string, string> = {
  SPECIAL_MODULE_REQUIRED: '请选择特殊模块',
  SPECIAL_MODULE_MANPOWER_INVALID: '人力需求必须大于零且最多一位小数',
  SPECIAL_MODULE_DUPLICATE: '同一特殊模块只能填写一次',
  MODULE_GROUP_MISMATCH: '特殊模块所属小组无有效总人力',
  MODULE_NOT_FOUND: '特殊模块不存在',
  MODULE_DISABLED_FOR_NEW_DEMAND: '停用模块只能保留原人力',
  SPECIAL_MODULE_EXCEEDS_GROUP: '特殊模块人力不能超过小组总人力',
};

const SpecialModuleDemandEditor: React.FC<SpecialModuleDemandEditorProps> = ({
  rows,
  modules,
  manpowerByTestType,
  onChange,
  disabled = false,
  canEditModules = true,
}) => {
  const validation = validateSpecialModuleRows(manpowerByTestType, rows, modules);
  const updateRow = (index: number, row: SpecialModuleDemandInput) => {
    onChange(rows.map((item, itemIndex) => itemIndex === index ? row : item));
  };

  return (
    <div>
      {rows.map((row, index) => {
        const selectedModule = modules.find((module) => module.id === row.moduleId);
        const authoritativeTestType = selectedModule?.testType ?? row.testType;
        const rowInvalid = validation.rowIndexes?.includes(index) ?? false;
        const rowErrorId = `special-module-row-error-${index}`;
        const availableModules = modules.filter((module) =>
          module.testType === authoritativeTestType && (module.enabled || module.id === row.moduleId),
        );
        const selectedByOtherRows = new Set(rows
          .filter((_, itemIndex) => itemIndex !== index)
          .map((item) => item.moduleId)
          .filter((moduleId): moduleId is number => moduleId !== undefined));
        return (
          <Space key={`${row.moduleId ?? 'new'}-${index}`} align="start" wrap style={{ display: 'flex', marginBottom: 8 }}>
            <Select
              aria-label={`小组 ${index + 1}`}
              placeholder="选择小组"
              value={authoritativeTestType || undefined}
              style={{ width: 150 }}
              status={rowInvalid && validation.fieldTarget === 'testType' ? 'error' : undefined}
              aria-invalid={rowInvalid && validation.fieldTarget === 'testType'}
              aria-describedby={rowInvalid && validation.fieldTarget === 'testType' ? rowErrorId : undefined}
              onChange={(testType) => updateRow(index, resetSpecialModuleRowForTestType(testType))}
              disabled={disabled || !canEditModules}
              options={Object.entries(manpowerByTestType)
                .filter(([, manpower]) => manpower > 0)
                .map(([testType]) => ({ value: testType, label: testType }))}
            />
            <Select
              aria-label={`特殊模块 ${index + 1}`}
              placeholder="选择特殊模块"
              disabled={disabled || !canEditModules || !authoritativeTestType}
              value={row.moduleId}
              style={{ width: 180 }}
              status={rowInvalid && validation.fieldTarget === 'moduleId' ? 'error' : undefined}
              aria-invalid={rowInvalid && validation.fieldTarget === 'moduleId'}
              aria-describedby={rowInvalid && validation.fieldTarget === 'moduleId' ? rowErrorId : undefined}
              onChange={(moduleId) => updateRow(index, { ...row, moduleId })}
              options={availableModules.map((module) => ({
                value: module.id,
                label: module.enabled ? module.moduleName : (
                  <span>{module.moduleName} <Tag color="default">已停用</Tag></span>
                ),
                disabled: !module.enabled || selectedByOtherRows.has(module.id),
              }))}
            />
            <InputNumber
              aria-label={`人力需求 ${index + 1}`}
              min={0.1}
              max={999999999.9}
              step={0.1}
              precision={1}
              value={row.manpowerDemand}
              disabled={disabled || (selectedModule?.enabled === false && row.historicalManpowerDemand === row.manpowerDemand)}
              status={rowInvalid && (validation.fieldTarget === 'manpowerDemand' || validation.fieldTarget === 'groupTotal') ? 'error' : undefined}
              aria-invalid={rowInvalid && (validation.fieldTarget === 'manpowerDemand' || validation.fieldTarget === 'groupTotal')}
              aria-describedby={rowInvalid && (validation.fieldTarget === 'manpowerDemand' || validation.fieldTarget === 'groupTotal') ? rowErrorId : undefined}
              placeholder="人力需求"
              addonAfter="人/天"
              onChange={(manpowerDemand) => updateRow(index, { ...row, manpowerDemand: manpowerDemand ?? undefined })}
            />
            {rowInvalid && <span id={rowErrorId} style={{ color: '#cf1322' }}>{validationMessages[validation.errorCode ?? '']}</span>}
            <Button
              aria-label={`删除特殊模块需求 ${index + 1}`}
              icon={<DeleteOutlined />}
              onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
              disabled={disabled}
            />
          </Space>
        );
      })}
      {!validation.valid && validation.errorCode === 'SPECIAL_MODULE_EXCEEDS_GROUP' && (
        <div role="alert" style={{ color: '#cf1322', marginBottom: 8 }}>
          {validation.testType}的小组特殊模块人力不能超过总人力
        </div>
      )}
      {!validation.valid && validation.errorCode === 'SPECIAL_MODULE_DUPLICATE' && (
        <div role="alert" style={{ color: '#cf1322', marginBottom: 8 }}>同一特殊模块只能填写一次</div>
      )}
      {!validation.valid && validation.errorCode !== 'SPECIAL_MODULE_EXCEEDS_GROUP' && validation.errorCode !== 'SPECIAL_MODULE_DUPLICATE' && (
        <div role="alert" style={{ color: '#cf1322', marginBottom: 8 }}>请完善特殊模块、人力需求和所属小组</div>
      )}
      <Button icon={<PlusOutlined />} disabled={disabled || !canEditModules} onClick={() => onChange([...rows, { testType: '' }])}>
        新增特殊模块需求
      </Button>
    </div>
  );
};

export default SpecialModuleDemandEditor;
