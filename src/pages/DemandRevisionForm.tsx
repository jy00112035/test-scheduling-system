import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Form,
  DatePicker,
  InputNumber,
  Input,
  Select,
  Switch,
  Button,
  Space,
  message,
  Alert,
  Card,
  Descriptions,
  Table,
  Tag,
  Popconfirm,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { TestDemand, DemandManpowerDetail, RevisionRequest } from '../types';

interface FieldConfig {
  id: number;
  fieldName: string;
  fieldType: 'select' | 'input' | 'textArea';
  options: string;
  description: string;
  required: boolean;
  sortOrder: number;
}
import { api } from '../services/api';

const { RangePicker } = DatePicker;
const { TextArea } = Input;

interface DemandRevisionFormProps {
  demand: TestDemand;
  onSuccess: () => void;
  onCancel: () => void;
}

const DemandRevisionForm: React.FC<DemandRevisionFormProps> = ({
  demand,
  onSuccess,
  onCancel,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [manpowerDetails, setManpowerDetails] = useState<DemandManpowerDetail[]>([]);
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [scheduleInfo, setScheduleInfo] = useState<{
    pastSchedules: Array<{ testType: string; usedManpower: number }>;
    totalSchedules: number;
  }>({ pastSchedules: [], totalSchedules: 0 });

  const nextTempId = useRef(-1);

  const handleAddTestType = () => {
    const newDetail = {
      id: nextTempId.current--,
      demandId: Number(demand.id),
      testType: '',
      manpowerDemand: 0,
      isNew: true,
    } as any;
    setManpowerDetails(prev => [...prev, newDetail]);
  };

  const handleDeleteTestType = (id: number) => {
    setManpowerDetails(prev => prev.filter(d => d.id !== id));
  };

  const handleTestTypeChange = (id: number, value: string) => {
    setManpowerDetails(prev =>
      prev.map(d => (d.id === id ? { ...d, testType: value } : d))
    );
  };

  const getSelectOptions = (fieldName: string) => {
    const config = fieldConfigs.find(c => c.fieldName === fieldName);
    if (config && config.options) {
      return config.options.split(',').filter(o => o.trim());
    }
    return [];
  };

  const loadDemandDetails = useCallback(async () => {
    try {
      const demandDetail = await api.getDemand(Number(demand.id));
      setManpowerDetails(demandDetail.manpowerDetails || []);

      // 计算已使用的人力（过去排班）
      const schedules = await api.getSchedulesByRange(
        '2000-01-01',
        dayjs().format('YYYY-MM-DD')
      );
      const demandSchedules = schedules.filter((s: any) => s.demandId === Number(demand.id));
      const pastSchedules = demandSchedules.filter((s: any) =>
        dayjs(s.date).isBefore(dayjs(), 'day')
      );

      // 按测试类型分组计算已使用人力
      const usedByType: Record<string, number> = {};
      pastSchedules.forEach((s: any) => {
        const matchedDetail = demandDetail.manpowerDetails?.find(
          (d: DemandManpowerDetail) => d.id === s.demandManpowerDetailId
        );
        if (matchedDetail) {
          usedByType[matchedDetail.testType] = (usedByType[matchedDetail.testType] || 0) + s.percentage / 100;
        }
      });

      setScheduleInfo({
        pastSchedules: Object.entries(usedByType).map(([testType, usedManpower]) => ({
          testType,
          usedManpower,
        })),
        totalSchedules: demandSchedules.length,
      });

      // 设置表单初始值
      form.setFieldsValue({
        dateRange: [dayjs(demandDetail.startDate), dayjs(demandDetail.endDate)],
        product: demandDetail.product,
        version: demandDetail.version,
        versionType: demandDetail.versionType,
        versionPhase: demandDetail.versionPhase,
        priority: demandDetail.priority,
        confidential: demandDetail.confidential ?? false,
        description: demandDetail.description,
        testDeviceCount: demandDetail.testDeviceCount,
      });
    } catch (error: any) {
      message.error(error.message || '获取需求详情失败');
    }
  }, [demand.id, form]);

  useEffect(() => {
    loadDemandDetails();
    api.getFieldConfigs().then(setFieldConfigs).catch(() => {});
  }, [loadDemandDetails]);

  const getUsedManpower = (testType: string): number => {
    const found = scheduleInfo.pastSchedules.find(s => s.testType === testType);
    return found ? found.usedManpower : 0;
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const [startDate, endDate] = values.dateRange;

      // 校验新增行
      const newRows = manpowerDetails.filter(d => (d as any).isNew);
      for (const row of newRows) {
        if (!row.testType) {
          message.warning('请选择或输入测试类型');
          return;
        }
        const val = values[`manpower_${row.id}`];
        if (val == null || val <= 0) {
          message.warning(`请为「${row.testType}」输入人力配额`);
          return;
        }
      }

      // 构建人力详情列表（过滤掉空行）
      const updatedDetails: DemandManpowerDetail[] = manpowerDetails
        .filter(d => !((d as any).isNew) || d.testType)
        .map(detail => ({
          ...detail,
          manpowerDemand: values[`manpower_${detail.id}`] ?? detail.manpowerDemand,
        }));

      const request: RevisionRequest = {
        startDate: startDate.format('YYYY-MM-DDTHH:mm:ss'),
        endDate: endDate.format('YYYY-MM-DDTHH:mm:ss'),
        product: values.product,
        version: values.version,
        versionType: values.versionType,
        versionPhase: values.versionPhase,
        priority: values.priority,
        confidential: values.confidential,
        description: values.description,
        testDeviceCount: values.testDeviceCount,
        manpowerDetails: updatedDetails,
      };

      await api.submitRevision(Number(demand.id), request);
      onSuccess();
    } catch (error: any) {
      message.error(error.message || '提交变更失败');
    } finally {
      setLoading(false);
    }
  };

  const submittedTypes = manpowerDetails.filter(d => !(d as any).isNew).map(d => d.testType).filter(Boolean);
  const testTypeOptions = getSelectOptions('testType').filter(opt => !submittedTypes.includes(opt));

  const columns = [
    {
      title: '测试类型',
      dataIndex: 'testType',
      key: 'testType',
      render: (value: string, record: DemandManpowerDetail) => {
        if ((record as any).isNew) {
          return (
            <Select
              showSearch
              mode="tags"
              maxCount={1}
              placeholder="选择或输入测试类型"
              value={value ? [value] : []}
              onChange={(vals: string[]) => handleTestTypeChange(record.id!, vals[vals.length - 1] || '')}
              style={{ width: '100%' }}
              options={testTypeOptions.map(t => ({ label: t, value: t }))}
            />
          );
        }
        return value;
      },
    },
    {
      title: '当前配额（人天）',
      dataIndex: 'manpowerDemand',
      key: 'manpowerDemand',
      render: (value: number, record: DemandManpowerDetail) =>
        (record as any).isNew ? '-' : `${value} 人天`,
    },
    {
      title: '已使用（过去排班）',
      key: 'usedManpower',
      render: (_: any, record: DemandManpowerDetail) => {
        if ((record as any).isNew) return '-';
        const used = getUsedManpower(record.testType);
        return `${used.toFixed(1)} 人天`;
      },
    },
    {
      title: '新配额（人天）',
      key: 'newManpower',
      render: (_: any, record: DemandManpowerDetail) => (
        <Form.Item
          name={`manpower_${record.id}`}
          initialValue={record.manpowerDemand}
          rules={[
            { required: true, message: '请输入人力配额' },
            {
              validator: async (_, value) => {
                const used = getUsedManpower(record.testType);
                if (value < used) {
                  throw new Error(`不能低于已使用的 ${used.toFixed(1)} 人天`);
                }
              },
            },
          ]}
          style={{ marginBottom: 0 }}
        >
          <InputNumber
            min={0}
            max={9999}
            precision={1}
            style={{ width: 120 }}
          />
        </Form.Item>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_: any, record: DemandManpowerDetail) =>
        (record as any).isNew ? (
          <Popconfirm title="确认删除？" onConfirm={() => handleDeleteTestType(record.id!)}>
            <Button type="link" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        ) : null,
    },
  ];

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Alert
        message="需求变更说明"
        description={
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>可修改产品信息、测试周期、人力需求等所有字段</li>
            <li>已排班的人力（无论过去未来）系统自动保护，不能修改</li>
            <li>缩短周期时，周期外的未来排班将自动删除</li>
            <li>减少人力时，超额的未来排班将自动删除（按时间从后往前）</li>
            <li>变更后需要重新审批</li>
          </ul>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="当前状态">
          <Tag color="blue">{demand.status === 'pending' ? '待排期' : '已排期'}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="已排班数量">{scheduleInfo.totalSchedules} 条</Descriptions.Item>
      </Descriptions>

      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Form.Item name="product" label="产品" rules={[{ required: true, message: '请输入产品名称' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="version" label="版本号">
          <Input />
        </Form.Item>
        <Form.Item name="versionType" label="版本类型" rules={[{ required: true, message: '请选择版本类型' }]}>
          <Select placeholder="请选择版本类型">
            {getSelectOptions('versionType').map(opt => (
              <Select.Option key={opt} value={opt}>{opt}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="versionPhase" label="版本阶段">
          <Select placeholder="请选择版本阶段" allowClear>
            {getSelectOptions('versionPhase').map(opt => (
              <Select.Option key={opt} value={opt}>{opt}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="priority" label="优先级">
          <Select placeholder="请选择优先级" allowClear>
            {getSelectOptions('priority').map(opt => (
              <Select.Option key={opt} value={opt}>{opt}</Select.Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item name="confidential" label="保密项目" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="testDeviceCount" label="样机数量">
          <InputNumber min={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="备注">
          <TextArea rows={3} />
        </Form.Item>
      </Card>

      <Card title="测试周期" style={{ marginBottom: 16 }}>
        <Form.Item
          name="dateRange"
          label="测试周期"
          rules={[{ required: true, message: '请选择测试周期' }]}
        >
          <RangePicker
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Card>

      <Card
        title="人力需求配额"
        style={{ marginBottom: 16 }}
        extra={
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddTestType}>
            新增测试类型
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={manpowerDetails}
          rowKey="id"
          pagination={false}
          bordered
          size="small"
        />
      </Card>

      <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            提交变更审批
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default DemandRevisionForm;
