import React, { useState } from 'react';
import {
  Card,
  Form,
  Input,
  DatePicker,
  InputNumber,
  Button,
  Space,
  message,
  Descriptions,
  Tag,
  Modal,
  Table,
  Popconfirm,
  Select,
} from 'antd';
import {
  SaveOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { TestDemand } from '../types';

const { TextArea } = Input;
const { Option } = Select;

interface SupplementRequestProps {
  onBack?: () => void;
  demand?: TestDemand;
  currentManpower?: number;
}

interface SupplementRequestItem {
  id: string;
  reason: string;
  endDate: string;
  manpowerDemand: number;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  submittedAt: string;
}

const SupplementRequest: React.FC<SupplementRequestProps> = ({
  onBack,
  demand,
  currentManpower = 0,
}) => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [requests, setRequests] = useState<SupplementRequestItem[]>([
    {
      id: '1',
      reason: '发现了严重的性能问题，需要额外测试',
      endDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
      manpowerDemand: 5,
      status: 'pending',
      submittedAt: dayjs().format('YYYY-MM-DD HH:mm'),
    },
  ]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const newRequest: SupplementRequestItem = {
        id: `req_${Date.now()}`,
        reason: values.reason,
        endDate: values.endDate.format('YYYY-MM-DD'),
        manpowerDemand: values.manpowerDemand,
        status: 'pending',
        submittedAt: dayjs().format('YYYY-MM-DD HH:mm'),
      };

      setRequests([newRequest, ...requests]);
      message.success('补充测试申请已提交，请等待项目经理审批！');

      setTimeout(() => {
        setLoading(false);
        setShowSubmitModal(false);
        form.resetFields();
      }, 1000);
    } catch (error) {
      setLoading(false);
      message.error('提交失败，请重试！');
    }
  };

  const handleApprove = (id: string) => {
    setRequests(requests.map(r =>
      r.id === id ? { ...r, status: 'approved' } : r
    ));
    message.success('补充测试申请已批准！');
  };

  const handleReject = (id: string) => {
    setRequests(requests.map(r =>
      r.id === id ? { ...r, status: 'rejected' } : r
    ));
    message.success('补充测试申请已驳回！');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'orange';
      case 'approved':
        return 'green';
      case 'rejected':
        return 'red';
      case 'modified':
        return 'blue';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '待审批';
      case 'approved':
        return '已批准';
      case 'rejected':
        return '已驳回';
      case 'modified':
        return '已修改待确认';
      default:
        return status;
    }
  };

  const columns = [
    {
      title: '补充测试原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 250,
    },
    {
      title: '补充测试结束日期',
      dataIndex: 'endDate',
      key: 'endDate',
      width: 140,
    },
    {
      title: '补充人力需求',
      dataIndex: 'manpowerDemand',
      key: 'manpowerDemand',
      width: 120,
      align: 'right' as const,
      render: (value: number) => `${value} 人/天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'submittedAt',
      key: 'submittedAt',
      width: 160,
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right' as const,
      render: (_: any, record: SupplementRequestItem) => (
        <Space size="small">
          {record.status === 'pending' && (
            <>
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(record.id)}
              >
                批准
              </Button>
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
              >
                驳回
              </Button>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
              >
                修改后批准
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

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
            补充测试申请
          </span>
        </Space>
      </Card>

      {demand && (
        <Card style={{ marginBottom: 16 }} title="原测试需求信息">
          <Descriptions column={2} bordered>
            <Descriptions.Item label="产品信息">{demand.product}</Descriptions.Item>
            <Descriptions.Item label="版本号">{demand.version || '-'}</Descriptions.Item>
            <Descriptions.Item label="版本类型">{demand.versionType}</Descriptions.Item>
            <Descriptions.Item label="测试周期">
              {dayjs(demand.startDate).format('YYYY-MM-DD')} ~ {dayjs(demand.endDate).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="原测试需求人力">{demand.manpowerDemand} 人/天</Descriptions.Item>
            <Descriptions.Item label="当前已投入人力">
              <Tag color="blue">{currentManpower} 人/天</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态" span={2}>
              <Tag color="green">测试中</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowSubmitModal(true)}
          >
            提交补充测试申请
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={requests}
          rowKey="id"
          bordered
          scroll={{ x: 1000 }}
          pagination={false}
        />
      </Card>

      <Modal
        title="提交补充测试申请"
        open={showSubmitModal}
        onCancel={() => {
          setShowSubmitModal(false);
          form.resetFields();
        }}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="reason"
            label="补充测试原因"
            rules={[{ required: true, message: '请输入补充测试原因' }]}
          >
            <TextArea
              rows={4}
              placeholder="请输入补充测试原因"
              showCount
              maxLength={500}
            />
          </Form.Item>

          <Form.Item
            name="endDate"
            label="补充测试结束日期"
            rules={[{ required: true, message: '请选择补充测试结束日期' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              placeholder="请选择补充测试结束日期"
              format="YYYY-MM-DD"
              disabledDate={(current) =>
                current && current < dayjs().startOf('day')
              }
            />
          </Form.Item>

          <Form.Item
            name="manpowerDemand"
            label="补充测试人力需求"
            rules={[{ required: true, message: '请输入补充测试人力需求' }]}
          >
            <InputNumber
              min={0.1}
              step={0.1}
              precision={1}
              style={{ width: '100%' }}
              placeholder="请输入补充测试人力需求（人/天），支持小数如 3.8"
              addonAfter="人/天"
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
                loading={loading}
              >
                提交申请
              </Button>
              <Button onClick={() => {
                setShowSubmitModal(false);
                form.resetFields();
              }}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SupplementRequest;
