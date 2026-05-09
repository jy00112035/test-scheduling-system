import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Tag } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';

const DemandApproval: React.FC = () => {
  const [pendingDemands, setPendingDemands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await api.getPendingDemandApprovals();
      setPendingDemands(data);
    } catch (error: any) {
      message.error(error.message || '获取待审批需求列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await api.approveDemand(id);
      message.success('已批准');
      setPendingDemands(prev => prev.filter(d => d.id !== id));
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.rejectDemand(id);
      message.success('已退回');
      setPendingDemands(prev => prev.filter(d => d.id !== id));
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleBatchApprove = async () => {
    try {
      await api.batchApproveDemands(selectedRowKeys as number[]);
      message.success(`已批量批准 ${selectedRowKeys.length} 个需求`);
      setPendingDemands(prev => prev.filter(d => !selectedRowKeys.includes(d.id)));
      setSelectedRowKeys([]);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleBatchReject = async () => {
    try {
      await api.batchRejectDemands(selectedRowKeys as number[]);
      message.success(`已批量退回 ${selectedRowKeys.length} 个需求`);
      setPendingDemands(prev => prev.filter(d => !selectedRowKeys.includes(d.id)));
      setSelectedRowKeys([]);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const columns = [
    { title: '产品信息', dataIndex: 'product', key: 'product', width: 140 },
    { title: '版本号', dataIndex: 'version', key: 'version', width: 100, render: (t: string) => t || '-' },
    {
      title: '版本类型', dataIndex: 'versionType', key: 'versionType', width: 100,
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: '测试周期', key: 'dateRange', width: 200,
      render: (_: any, record: any) => (
        <span>
          {record.startDate ? dayjs(record.startDate).format('YYYY-MM-DD') : '-'}
          {' ~ '}
          {record.endDate ? dayjs(record.endDate).format('YYYY-MM-DD') : '-'}
        </span>
      ),
    },
    {
      title: '人力需求', dataIndex: 'manpowerDemand', key: 'manpowerDemand', width: 100,
      render: (v: number) => `${v} 人/天`,
    },
    { title: '提交人', dataIndex: 'submittedBy', key: 'submittedBy', width: 100 },
    {
      title: '提交时间', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Popconfirm title="确认批准此需求？" onConfirm={() => handleApprove(record.id)} okText="批准" cancelText="取消">
            <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>批准</Button>
          </Popconfirm>
          <Popconfirm title="确认退回此需求？需求将返回给测试经理修改。" onConfirm={() => handleReject(record.id)} okText="退回" cancelText="取消" okType="danger">
            <Button type="link" size="small" danger icon={<CloseOutlined />}>退回</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        {selectedRowKeys.length > 0 && (
          <Space>
            <Popconfirm
              title={`确认批准选中的 ${selectedRowKeys.length} 个需求？`}
              onConfirm={handleBatchApprove}
              okText="批准"
              cancelText="取消"
            >
              <Button icon={<CheckOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }}>
                批量批准 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`确认退回选中的 ${selectedRowKeys.length} 个需求？`}
              onConfirm={handleBatchReject}
              okText="退回"
              cancelText="取消"
              okType="danger"
            >
              <Button danger icon={<CloseOutlined />}>
                批量退回 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          </Space>
        )}
      </div>
      <Table
        columns={columns}
        dataSource={pendingDemands}
        rowKey="id"
        loading={loading}
        bordered
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={false}
        locale={{ emptyText: '暂无待审批的测试需求' }}
      />
    </div>
  );
};

export default DemandApproval;
