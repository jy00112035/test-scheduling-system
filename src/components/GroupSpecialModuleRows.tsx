import { Button, InputNumber, Select, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SpecialModuleDemandInput, TestModule } from '../types';
import { validateSpecialModuleRows } from '../utils/specialModuleCalculations';

interface GroupSpecialModuleRowsProps {
  testType: string;
  rows: SpecialModuleDemandInput[];
  allRows: SpecialModuleDemandInput[];
  modules: TestModule[];
  manpowerByTestType: Record<string, number>;
  onChange: (allRows: SpecialModuleDemandInput[]) => void;
  disabled?: boolean;
  canEditModules?: boolean;
}

const validationMessages: Record<string, string> = {
  SPECIAL_MODULE_REQUIRED: '请选择特殊模块',
  SPECIAL_MODULE_MANPOWER_INVALID: '人力需求必须大于零且最多一位小数',
  SPECIAL_MODULE_DUPLICATE: '同一特殊模块只能填写一次',
  MODULE_GROUP_MISMATCH: '特殊模块所属小组无有效总人力',
  MODULE_NOT_FOUND: '特殊模块不存在',
  MODULE_DISABLED_FOR_NEW_DEMAND: '停用模块只能保留原人力',
  SPECIAL_MODULE_EXCEEDS_GROUP: '特殊模块人力不能超过小组总人力',
};

const GroupSpecialModuleRows: React.FC<GroupSpecialModuleRowsProps> = ({
  testType,
  rows,
  allRows,
  modules,
  manpowerByTestType,
  onChange,
  disabled = false,
  canEditModules = true,
}) => {
  const validation = validateSpecialModuleRows(manpowerByTestType, allRows, modules);

  const availableModules = modules.filter(
    (m) => m.testType === testType && (m.enabled || rows.some((r) => r.moduleId === m.id)),
  );

  const selectedByOtherRows = new Set(
    allRows
      .filter((r) => r.testType !== testType || !rows.includes(r))
      .map((r) => r.moduleId)
      .filter((id): id is number => id !== undefined),
  );

  // Find indices in allRows that correspond to this group's rows
  const allRowIndices = rows.map((row) =>
    allRows.findIndex((r) => r === row),
  );

  const updateLocalRow = (localIndex: number, updated: SpecialModuleDemandInput) => {
    const newAllRows = [...allRows];
    const globalIndex = allRowIndices[localIndex];
    if (globalIndex >= 0) {
      newAllRows[globalIndex] = updated;
    }
    onChange(newAllRows);
  };

  const deleteLocalRow = (localIndex: number) => {
    const globalIndex = allRowIndices[localIndex];
    if (globalIndex >= 0) {
      onChange(allRows.filter((_, i) => i !== globalIndex));
    }
  };

  const addRow = () => {
    onChange([...allRows, { testType }]);
  };

  return (
    <div>
      {rows.map((row, localIndex) => {
        const selectedModule = modules.find((m) => m.id === row.moduleId);
        const globalIndex = allRowIndices[localIndex];
        const rowInvalid = validation.rowIndexes?.includes(globalIndex) ?? false;
        const rowErrorId = `special-module-row-error-${testType}-${localIndex}`;

        return (
          <div
            key={`${row.moduleId ?? 'new'}-${localIndex}`}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
          >
            <Select
              aria-label={`${testType} 特殊模块 ${localIndex + 1}`}
              placeholder="选择特殊模块"
              disabled={disabled || !canEditModules}
              value={row.moduleId}
              style={{ width: 180 }}
              status={rowInvalid && validation.fieldTarget === 'moduleId' ? 'error' : undefined}
              aria-invalid={rowInvalid && validation.fieldTarget === 'moduleId'}
              aria-describedby={rowInvalid && validation.fieldTarget === 'moduleId' ? rowErrorId : undefined}
              onChange={(moduleId) => updateLocalRow(localIndex, { ...row, moduleId })}
              options={availableModules.map((module) => ({
                value: module.id,
                label: module.enabled ? module.moduleName : (
                  <span>{module.moduleName} <Tag color="default">已停用</Tag></span>
                ),
                disabled: !module.enabled || selectedByOtherRows.has(module.id),
              }))}
            />
            <InputNumber
              aria-label={`${testType} 特殊模块人力 ${localIndex + 1}`}
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
              onChange={(manpowerDemand) => updateLocalRow(localIndex, { ...row, manpowerDemand: manpowerDemand ?? undefined })}
            />
            <Button
              aria-label={`删除 ${testType} 特殊模块需求 ${localIndex + 1}`}
              icon={<DeleteOutlined />}
              onClick={() => deleteLocalRow(localIndex)}
              disabled={disabled}
            />
            {rowInvalid && (
              <span id={rowErrorId} style={{ color: '#cf1322', fontSize: 12 }}>
                {validationMessages[validation.errorCode ?? '']}
              </span>
            )}
          </div>
        );
      })}
      <Button
        icon={<PlusOutlined />}
        disabled={disabled || !canEditModules}
        onClick={addRow}
        size="small"
      >
        新增特殊模块
      </Button>
    </div>
  );
};

export default GroupSpecialModuleRows;
