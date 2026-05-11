import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Popconfirm, message, Tag } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { useUserRole } from '../context/UserRoleContext';

const roleLabels: Record<string, string> = {
  testManager: '测试经理',
  resourceManager: '资源主管',
  projectManager: '项目经理',
  testExecutor: '测试执行人员',
  fieldAdmin: '字段管理员',
  testLead: '测试组长',
};

const RegistrationApproval: React.FC = () => {
  const { roles } = useUserRole();
  const [pendingUsers, setPendingUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    fetchPending();
  }, []);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const data = await api.getPendingApprovals();
      setPendingUsers(data);
    } catch (error: any) {
      message.error(error.message || '获取待审批列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await api.approveUser(id);
      message.success('已批准');
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.rejectUser(id);
      message.success('已拒绝');
      setPendingUsers(prev => prev.filter(u => u.id !== id));
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleBatchApprove = async () => {
    try {
      await api.batchApproveUsers(selectedRowKeys as number[]);
      message.success(`已批量批准 ${selectedRowKeys.length} 个用户`);
      setPendingUsers(prev => prev.filter(u => !selectedRowKeys.includes(u.id)));
      setSelectedRowKeys([]);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const handleBatchReject = async () => {
    try {
      await api.batchRejectUsers(selectedRowKeys as number[]);
      message.success(`已批量拒绝 ${selectedRowKeys.length} 个用户`);
      setPendingUsers(prev => prev.filter(u => !selectedRowKeys.includes(u.id)));
      setSelectedRowKeys([]);
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const isResourceManager = roles.includes('resourceManager' as any);
  const isProjectManager = roles.includes('projectManager' as any);
  let title = '注册审批';
  if (isResourceManager && !isProjectManager) {
    title = '注册审批 — 测试执行人员';
  } else if (isProjectManager && !isResourceManager) {
    title = '注册审批 — 其他角色';
  }

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 140 },
    { title: '显示名称', dataIndex: 'displayName', key: 'displayName', width: 120 },
    {
      title: '申请角色', dataIndex: 'role', key: 'role', width: 140,
      render: (r: string) => <Tag color="blue">{roleLabels[r] || r}</Tag>,
    },
    {
      title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作', key: 'action', width: 180,
      render: (_: any, record: any) => (
        <Space>
          <Popconfirm title="确认批准此注册申请？" onConfirm={() => handleApprove(record.id)} okText="批准" cancelText="取消">
            <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>批准</Button>
          </Popconfirm>
          <Popconfirm title="确认拒绝此注册申请？此操作不可撤销。" onConfirm={() => handleReject(record.id)} okText="拒绝" cancelText="取消" okType="danger">
            <Button type="link" size="small" danger icon={<CloseOutlined />}>拒绝</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title={title}>
      <div style={{ marginBottom: 16 }}>
        {selectedRowKeys.length > 0 && (
          <Space>
            <Popconfirm
              title={`确认批准选中的 ${selectedRowKeys.length} 个注册申请？`}
              onConfirm={handleBatchApprove}
              okText="批准"
              cancelText="取消"
            >
              <Button icon={<CheckOutlined />} style={{ borderColor: '#52c41a', color: '#52c41a' }}>
                批量批准 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
            <Popconfirm
              title={`确认拒绝选中的 ${selectedRowKeys.length} 个注册申请？此操作不可撤销。`}
              onConfirm={handleBatchReject}
              okText="拒绝"
              cancelText="取消"
              okType="danger"
            >
              <Button danger icon={<CloseOutlined />}>
                批量拒绝 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          </Space>
        )}
      </div>
      <Table
        columns={columns}
        dataSource={pendingUsers}
        rowKey="id"
        loading={loading}
        bordered
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={false}
        locale={{ emptyText: '暂无待审批的注册申请' }}
      />
    </Card>
  );
};

export default RegistrationApproval;
