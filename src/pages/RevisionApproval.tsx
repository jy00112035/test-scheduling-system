import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  message,
  Popconfirm,
  Modal,
  Descriptions,
  Alert,
  InputNumber,
  Form,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  EditOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { TestDemand, RevisionDiffResponse, RevisionRequest } from '../types';
import { api } from '../services/api';

const RevisionApproval: React.FC = () => {
  const [demands, setDemands] = useState<TestDemand[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDemand, setSelectedDemand] = useState<TestDemand | null>(null);
  const [diffData, setDiffData] = useState<RevisionDiffResponse | null>(null);
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [approveWithChangesVisible, setApproveWithChangesVisible] = useState(false);
  const [approveForm] = Form.useForm();

  useEffect(() => {
    fetchDemands();
  }, []);

  const fetchDemands = async () => {
    setLoading(true);
    try {
      const data = await api.getRevisionPendingApprovals();
      setDemands(data);
    } catch (error: any) {
      message.error(error.message || '获取变更待审批列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDiff = async (demand: TestDemand) => {
    try {
      const diff = await api.getRevisionDiff(Number(demand.id));
      setDiffData(diff);
      setSelectedDemand(demand);
      setDiffModalVisible(true);
    } catch (error: any) {
      message.error(error.message || '获取变更详情失败');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveRevision(Number(id));
      message.success('变更已批准');
      fetchDemands();
    } catch (error: any) {
      message.error(error.message || '批准失败');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await api.rejectRevision(Number(id));
      message.success('变更已退回');
      fetchDemands();
    } catch (error: any) {
      message.error(error.message || '退回失败');
    }
  };

  const handleApproveWithChanges = (demand: TestDemand) => {
    setSelectedDemand(demand);
    approveForm.resetFields();
    setApproveWithChangesVisible(true);
  };

  const handleSubmitApproveWithChanges = async (values: any) => {
    if (!selectedDemand) return;

    try {
      const request: RevisionRequest = {
        manpowerDetails: values.manpowerDetails,
      };
      await api.approveRevisionWithChanges(Number(selectedDemand.id), request);
      message.success('修改并批准变更成功');
      setApproveWithChangesVisible(false);
      fetchDemands();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '产品信息',
      dataIndex: 'product',
      key: 'product',
      width: 150,
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (text: string) => text || '-',
    },
    {
      title: '版本类型',
      dataIndex: 'versionType',
      key: 'versionType',
      width: 100,
    },
    {
      title: '测试周期',
      key: 'dateRange',
      width: 220,
      render: (_: any, record: TestDemand) => (
        <span style={{ whiteSpace: 'nowrap' }}>
          {dayjs(record.startDate).format('YYYY-MM-DD')} ~ {dayjs(record.endDate).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      title: '人力需求',
      dataIndex: 'manpowerDemand',
      key: 'manpowerDemand',
      width: 100,
      align: 'right' as const,
      render: (value: number) => `${value} 人/天`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: () => <Tag color="cyan">变更待审批</Tag>,
    },
    {
      title: '提交人',
      dataIndex: 'submittedBy',
      key: 'submittedBy',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 250,
      fixed: 'right' as const,
      render: (_: any, record: TestDemand) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDiff(record)}
          >
            查看变更
          </Button>
          <Popconfirm
            title="确定批准此变更？"
            onConfirm={() => handleApprove(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              icon={<CheckOutlined />}
              style={{ color: '#52c41a' }}
            >
              批准
            </Button>
          </Popconfirm>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleApproveWithChanges(record)}
          >
            修改后批准
          </Button>
          <Popconfirm
            title="确定退回此变更？"
            onConfirm={() => handleReject(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<CloseOutlined />}
            >
              退回
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card>
        <Table
          columns={columns}
          dataSource={demands}
          rowKey="id"
          bordered
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* 变更详情弹窗 */}
      <Modal
        title="变更详情"
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={null}
        width={800}
      >
        {diffData && (
          <div>
            <Descriptions column={2} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="产品">{selectedDemand?.product}</Descriptions.Item>
              <Descriptions.Item label="版本">{selectedDemand?.version || '-'}</Descriptions.Item>
              <Descriptions.Item label="提交人">{diffData.submittedBy}</Descriptions.Item>
              <Descriptions.Item label="提交时间">
                {dayjs(diffData.submittedAt).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            {diffData.changes && diffData.changes.length > 0 && (
              <Card title="变更内容" size="small" style={{ marginBottom: 16 }}>
                <Table
                  dataSource={diffData.changes}
                  rowKey="field"
                  pagination={false}
                  bordered
                  size="small"
                  columns={[
                    { title: '字段', dataIndex: 'field', key: 'field', width: 150 },
                    { title: '原值', dataIndex: 'oldValue', key: 'oldValue', width: 200 },
                    { title: '新值', dataIndex: 'newValue', key: 'newValue', width: 200 },
                  ]}
                />
              </Card>
            )}

            {diffData.deletedSchedules && diffData.deletedSchedules.length > 0 && (
              <Card title="自动删除的排班" size="small">
                <Alert
                  message={`共删除 ${diffData.deletedSchedules.length} 条排班记录`}
                  type="warning"
                  showIcon
                  style={{ marginBottom: 8 }}
                />
                <Table
                  dataSource={diffData.deletedSchedules}
                  rowKey="id"
                  pagination={false}
                  bordered
                  size="small"
                  columns={[
                    { title: '人员', dataIndex: 'staffName', key: 'staffName', width: 100 },
                    {
                      title: '日期',
                      dataIndex: 'date',
                      key: 'date',
                      width: 120,
                      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
                    },
                    {
                      title: '百分比',
                      dataIndex: 'percentage',
                      key: 'percentage',
                      width: 100,
                      render: (value: number) => `${value}%`,
                    },
                    { title: '原因', dataIndex: 'reason', key: 'reason', width: 150 },
                  ]}
                />
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* 修改后批准弹窗 */}
      <Modal
        title="修改后批准"
        open={approveWithChangesVisible}
        onCancel={() => setApproveWithChangesVisible(false)}
        footer={null}
        width={600}
      >
        <Form form={approveForm} layout="vertical" onFinish={handleSubmitApproveWithChanges}>
          <Alert
            message="说明"
            description="您可以修改人力需求配额后批准此变更。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          {selectedDemand?.manpowerDetails?.map(detail => (
            <Form.Item
              key={detail.id}
              label={`${detail.testType}（当前: ${detail.manpowerDemand} 人天）`}
              name={['manpowerDetails', String(detail.id), 'manpowerDemand']}
              initialValue={detail.manpowerDemand}
            >
              <InputNumber min={0} max={9999} precision={1} style={{ width: '100%' }} />
            </Form.Item>
          ))}

          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space>
              <Button onClick={() => setApproveWithChangesVisible(false)}>取消</Button>
              <Button type="primary" htmlType="submit">
                修改并批准
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RevisionApproval;
