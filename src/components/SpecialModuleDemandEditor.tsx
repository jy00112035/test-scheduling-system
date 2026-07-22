import { Button, InputNumber, Select, Space, Tag } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { SpecialModuleDemandInput, TestModule } from '../types';
import { validateSpecialModuleRows } from '../utils/specialModuleCalculations';

interface SpecialModuleDemandEditorProps {
  rows: SpecialModuleDemandInput[];
  modules: TestModule[];
  manpowerByTestType: Record<string, number>;
  onChange: (rows: SpecialModuleDemandInput[]) => void;
}

const SpecialModuleDemandEditor: React.FC<SpecialModuleDemandEditorProps> = ({
  rows,
  modules,
  manpowerByTestType,
  onChange,
}) => {
  const validation = validateSpecialModuleRows(manpowerByTestType, rows);
  const updateRow = (index: number, row: SpecialModuleDemandInput) => {
    onChange(rows.map((item, itemIndex) => itemIndex === index ? row : item));
  };

  return (
    <div>
      {rows.map((row, index) => {
        const availableModules = modules.filter((module) =>
          module.testType === row.testType && (module.enabled || module.id === row.moduleId),
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
              value={row.testType || undefined}
              style={{ width: 150 }}
              onChange={(testType) => updateRow(index, { testType })}
              options={Object.entries(manpowerByTestType)
                .filter(([, manpower]) => manpower > 0)
                .map(([testType]) => ({ value: testType, label: testType }))}
            />
            <Select
              aria-label={`特殊模块 ${index + 1}`}
              placeholder="选择特殊模块"
              disabled={!row.testType}
              value={row.moduleId}
              style={{ width: 180 }}
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
              step={0.1}
              precision={1}
              value={row.manpowerDemand}
              placeholder="人力需求"
              addonAfter="人/天"
              onChange={(manpowerDemand) => updateRow(index, { ...row, manpowerDemand: manpowerDemand ?? undefined })}
            />
            <Button
              aria-label={`删除特殊模块需求 ${index + 1}`}
              icon={<DeleteOutlined />}
              onClick={() => onChange(rows.filter((_, itemIndex) => itemIndex !== index))}
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
      <Button icon={<PlusOutlined />} onClick={() => onChange([...rows, { testType: '' }])}>
        新增特殊模块需求
      </Button>
    </div>
  );
};

export default SpecialModuleDemandEditor;
