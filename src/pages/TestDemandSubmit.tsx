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
} from 'antd';
import { SaveOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { TestDemand } from '../types';
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
    }
  }, [initialValues, form]);

  const handleVersionTypeChange = () => {
    form.setFieldValue('versionPhase', undefined);
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const demandData: Partial<TestDemand> = {
        product: values.product,
        version: values.version || '',
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        manpowerDemand: values.manpowerDemand,
        versionType: values.versionType,
        versionPhase: values.versionPhase,
        description: values.description || '',
        status: 'submitted',
        submittedBy: userName || '测试经理',
      };

      if (isEdit && initialValues) {
        await api.updateDemand(initialValues.id, demandData);
        message.success('测试需求已更新并重新提交，请等待项目经理审批！');
      } else {
        await api.createDemand(demandData);
        message.success('测试需求已成功提交，请等待项目经理审批！');
      }

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
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          style={{ maxWidth: 800, margin: '0 auto' }}
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

          <Form.Item
            name="manpowerDemand"
            label="人力需求"
            rules={[{ required: true, message: '请输入人力需求' }]}
          >
            <InputNumber
              min={0.1}
              step={0.1}
              precision={1}
              style={{ width: '100%' }}
              placeholder="请输入人力需求（人/天），支持小数如 3.8"
              addonAfter="人/天"
            />
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
