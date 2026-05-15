import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Select,
  DatePicker,
  InputNumber,
  Button,
  Space,
  message,
  Tag,
  Divider,
  Switch,
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { TestDemand, DemandManpowerDetail } from '../types';
import { api } from '../services/api';
import { useUserRole } from '../context/UserRoleContext';

const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface FieldConfig {
  id: number;
  fieldName: string;
  fieldType: 'select' | 'input' | 'textArea';
  options: string;
  description: string;
  required: boolean;
  sortOrder: number;
}

interface TestDemandSubmitProps {
  onBack?: () => void;
  initialValues?: TestDemand;
  isEdit?: boolean;
}

const TestDemandSubmit: React.FC<TestDemandSubmitProps> = ({
  onBack,
  initialValues,
  isEdit = false,
}) => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { userName } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [manpowerInputs, setManpowerInputs] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchFieldConfigs();
  }, []);

  const fetchFieldConfigs = async () => {
    try {
      const configs = await api.getFieldConfigs();
      setFieldConfigs(configs);
    } catch (error) {
      console.error('获取字段配置失败', error);
    }
  };

  const getFieldConfig = (fieldName: string) => {
    return fieldConfigs.find(c => c.fieldName === fieldName);
  };

  const getSelectOptions = (fieldName: string) => {
    const config = getFieldConfig(fieldName);
    if (config && config.options) {
      return config.options.split(',').filter(o => o.trim());
    }
    return [];
  };

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue({
        ...initialValues,
        dateRange: [
          dayjs(initialValues.startDate),
          dayjs(initialValues.endDate),
        ],
      });
      // 回填各测试类型人力
      if (initialValues.manpowerDetails) {
        const map: Record<string, number> = {};
        initialValues.manpowerDetails.forEach((d: DemandManpowerDetail) => {
          map[d.testType] = d.manpowerDemand;
        });
        setManpowerInputs(map);
      }
    }
  }, [initialValues, form]);

  const handleVersionTypeChange = () => {
    form.setFieldValue('versionPhase', undefined);
  };

  const handleSubmit = async (values: any) => {
    // 构建按测试类型分组的人力需求明细
    const testTypes = getSelectOptions('testType');
    const manpowerDetails: DemandManpowerDetail[] = testTypes
      .filter(tt => (manpowerInputs[tt] || 0) > 0)
      .map(tt => ({
        testType: tt,
        manpowerDemand: manpowerInputs[tt],
      }));

    if (manpowerDetails.length === 0) {
      message.warning('请至少为一个测试类型填写人力需求');
      return;
    }

    setLoading(true);
    try {
      const demandData: any = {
        product: values.product,
        version: values.version || '',
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        manpowerDetails,
        versionType: values.versionType,
        versionPhase: values.versionPhase,
        description: values.description || '',
        confidential: values.confidential || false,
        priority: values.priority,
        testDeviceCount: values.testDeviceCount,
        status: 'submitted',
        submittedBy: userName || '测试经理',
      };

      if (isEdit && initialValues) {
        await api.updateDemand(Number(initialValues.id), demandData);
        message.success('测试需求已更新并重新提交，请等待项目经理审批！');
      } else {
        await api.createDemand(demandData);
        message.success('测试需求已成功提交，请等待项目经理审批！');
      }
      window.dispatchEvent(new CustomEvent('refresh-pending-counts'));

      setTimeout(() => {
        setLoading(false);
        if (onBack) {
          onBack();
        } else {
          navigate('/demands');
        }
      }, 500);
    } catch (error: any) {
      setLoading(false);
      message.error(error.message || '提交失败，请重试！');
    }
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => onBack ? onBack() : navigate('/demands')}
          >
            返回列表
          </Button>
          <span style={{ fontSize: '18px', fontWeight: 500 }}>
            {isEdit ? '编辑测试需求' : '提交测试需求'}
          </span>
        </Space>
      </Card>

      <Card>
        <style>{`
          .demand-form .ant-form-item {
            margin-bottom: 12px;
          }
        `}</style>
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 18 }}
          onFinish={handleSubmit}
          initialValues={{ confidential: false, testDeviceCount: null }}
          style={{ maxWidth: 800, margin: '0 auto' }}
          className="demand-form"
        >
          <Form.Item
            name="product"
            label="产品信息"
            rules={[{ required: true, message: '请输入产品信息' }]}
          >
            <Input placeholder="请输入产品名称" />
          </Form.Item>

          <Form.Item name="version" label="版本号">
            <Input placeholder="请输入版本号，如 v1.0.0" />
          </Form.Item>

          <Form.Item
            name="dateRange"
            label="测试周期"
            rules={[{ required: true, message: '请选择测试周期' }]}
          >
            <RangePicker
              style={{ width: '100%' }}
              placeholder={['开始日期', '结束日期']}
              format="YYYY-MM-DD"
              disabledDate={(current) =>
                current && current < dayjs().startOf('day')
              }
            />
          </Form.Item>

          <Form.Item label="人力需求（按测试类型）" required>
            <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
              <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                针对每个测试小组填写所需人力（人/天），不需要的小组填 0
              </div>
              {getSelectOptions('testType').map(testType => (
                <div key={testType} style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 10,
                  padding: '8px 12px',
                  background: '#fff',
                  borderRadius: 6,
                  border: '1px solid #f0f0f0',
                }}>
                  <Tag color="blue" style={{ minWidth: 80, textAlign: 'center' }}>
                    {testType}
                  </Tag>
                  <InputNumber
                    min={0}
                    step={0.1}
                    precision={1}
                    style={{ width: 120, marginLeft: 12 }}
                    placeholder="0"
                    addonAfter="人/天"
                    value={manpowerInputs[testType] ?? 0}
                    onChange={(val) => setManpowerInputs(prev => ({
                      ...prev,
                      [testType]: val ?? 0,
                    }))}
                  />
                </div>
              ))}
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                总计：
                <span style={{ color: '#1890ff', fontSize: 16 }}>
                  {(() => {
                    const total = Object.values(manpowerInputs).reduce((sum, v) => sum + (v || 0), 0);
                    return total.toFixed(1);
                  })()}
                </span> 人/天
              </div>
            </div>
          </Form.Item>

          <Form.Item
            name="versionType"
            label="版本类型"
            rules={[{ required: true, message: '请选择版本类型' }]}
          >
            <Select
              placeholder="请选择版本类型"
              onChange={handleVersionTypeChange}
            >
              {getSelectOptions('versionType').map((option, index) => (
                <Option key={index} value={option}>{option}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="versionPhase"
            label="版本所处阶段"
            rules={[{ required: true, message: '请选择版本所处阶段' }]}
          >
            <Select
              placeholder="请选择版本所处阶段"
            >
              {getSelectOptions('versionPhase').map((option, index) => (
                <Option key={index} value={option}>{option}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="priority"
            label="需求优先级"
            rules={[{ required: true, message: '请选择需求优先级' }]}
          >
            <Select placeholder="请选择需求优先级">
              {getSelectOptions('priority').map((option, index) => (
                <Option key={index} value={option}>{option}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="testDeviceCount"
            label="可提供样机数量"
            rules={[{ required: true, message: '请输入可提供的测试样机数量' }]}
          >
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="请输入样机数量" />
          </Form.Item>

          <Form.Item
            name="confidential"
            label="是否为保密项目"
            valuePropName="checked"
            rules={[{ required: true, message: '请选择是否为保密项目' }]}
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>

          <Form.Item name="description" label="备注说明">
            <TextArea
              rows={4}
              placeholder="请输入备注说明（选填）"
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 32 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={loading}
                size="large"
              >
                {isEdit ? '保存修改' : '提交需求'}
              </Button>
              <Button
                size="large"
                onClick={() => onBack ? onBack() : navigate('/demands')}
              >
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default TestDemandSubmit;
