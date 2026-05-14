import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Space,
  Input,
  Select,
  Popconfirm,
  Modal,
  message,
  TagProps,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { TestDemand } from '../types';
import TestDemandSubmit from './TestDemandSubmit';
import { api } from '../services/api';

const { Option } = Select;
const { Search } = Input;

const TestDemandList: React.FC = () => {
  const [demands, setDemands] = useState<TestDemand[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingDemand, setEditingDemand] = useState<TestDemand | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDemands();
  }, []);

  const fetchDemands = async () => {
    setLoading(true);
    try {
      const data = await api.getDemands();
      setDemands(data);
    } catch (error: any) {
      message.error(error.message || '获取需求列表失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): TagProps['color'] => {
    switch (status) {
      case 'submitted':
        return 'purple';
      case 'pending':
        return 'orange';
      case 'scheduled':
        return 'blue';
      case 'completed':
        return 'green';
      case 'rejected':
        return 'red';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'submitted':
        return '待审批';
      case 'pending':
        return '待排期';
      case 'scheduled':
        return '已排期';
      case 'completed':
        return '已完成';
      case 'rejected':
        return '已退回';
      default:
        return status;
    }
  };

  const getVersionTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      '维护': '#1890ff',
      '在研': '#52c41a',
      '升级': '#faad14',
    };
    return colorMap[type] || '#1890ff';
  };

  const filteredDemands = demands.filter(demand => {
    const matchesSearch = !searchText ||
      demand.product.toLowerCase().includes(searchText.toLowerCase()) ||
      (demand.version && demand.version.toLowerCase().includes(searchText.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || demand.status === statusFilter;
    const matchesProduct = productFilter === 'all' || demand.product === productFilter;
    return matchesSearch && matchesStatus && matchesProduct;
  });

  const handleDelete = async (id: number) => {
    try {
      await api.deleteDemand(id);
      setDemands(demands.filter(d => d.id !== id));
      message.success('测试需求已删除');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleClose = async (id: number) => {
    try {
      await api.closeDemand(id);
      setDemands(demands.map(d =>
        d.id === id ? { ...d, status: 'completed' as const } : d
      ));
      message.success('测试需求已关闭');
    } catch (error: any) {
      message.error(error.message || '关闭失败');
    }
  };

  const handleEdit = (demand: TestDemand) => {
    setEditingDemand(demand);
    setShowSubmitModal(true);
  };

  const handleSubmitSuccess = () => {
    setShowSubmitModal(false);
    setEditingDemand(null);
    fetchDemands();
    message.success('操作成功！');
  };

  const columns = [
    {
      title: '产品信息',
      dataIndex: 'product',
      key: 'product',
      width: 150,
      fixed: 'left' as const,
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
      render: (type: string) => (
        <span style={{
          color: getVersionTypeColor(type),
          fontWeight: 500,
        }}>
          {type}
        </span>
      ),
    },
    {
      title: '版本阶段',
      dataIndex: 'versionPhase',
      key: 'versionPhase',
      width: 120,
      render: (phase: string) => phase || '-',
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (p: string) => {
        const colorMap: Record<string, string> = { '高': 'red', '中': 'orange', '低': 'green' };
        return p ? <Tag color={colorMap[p] || 'default'}>{p}</Tag> : '-';
      },
    },
    {
      title: '保密项目',
      dataIndex: 'confidential',
      key: 'confidential',
      width: 90,
      render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '测试周期',
      key: 'dateRange',
      width: 200,
      render: (_: any, record: TestDemand) => (
        <div>
          <div>{dayjs(record.startDate).format('YYYY-MM-DD')}</div>
          <div style={{ color: '#999', fontSize: 12 }}>
            ~ {dayjs(record.endDate).format('YYYY-MM-DD')}
          </div>
        </div>
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
      width: 90,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '提交人',
      dataIndex: 'submittedBy',
      key: 'submittedBy',
      width: 100,
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 110,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const isSubmitted = record.status === 'submitted';
        const isReadonly = record.status === 'pending' || record.status === 'scheduled';
        const isCompleted = record.status === 'completed';

        if (isCompleted || isSubmitted) return null;

        return (
          <Space size="small">
            {!isReadonly && (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
            )}
            <Popconfirm
              title="确定关闭此需求？"
              onConfirm={() => handleClose(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
              >
                关闭
              </Button>
            </Popconfirm>
            {!isReadonly && (
              <Popconfirm
                title="确定删除此需求？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space wrap>
            <Search
              placeholder="搜索产品或版本"
              onSearch={setSearchText}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="筛选状态"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              allowClear
            >
              <Option value="all">全部状态</Option>
              <Option value="submitted">待审批</Option>
              <Option value="pending">待排期</Option>
              <Option value="scheduled">已排期</Option>
              <Option value="completed">已完成</Option>
              <Option value="rejected">已退回</Option>
            </Select>
            <Select
              placeholder="筛选产品"
              value={productFilter}
              onChange={setProductFilter}
              style={{ width: 150 }}
              allowClear
            >
              <Option value="all">全部产品</Option>
              {demands.map(demand => demand.product).filter((product, index, self) => self.indexOf(product) === index).map(product => (
                <Option key={product} value={product}>
                  {product}
                </Option>
              ))}
            </Select>
          </Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDemand(null);
              setShowSubmitModal(true);
            }}
          >
            提交需求
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={filteredDemands}
          rowKey="id"
          bordered
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
        />
      </Card>

      <Modal
        title={editingDemand ? '编辑测试需求' : '提交测试需求'}
        open={showSubmitModal}
        onCancel={() => setShowSubmitModal(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <TestDemandSubmit
          onBack={handleSubmitSuccess}
          initialValues={editingDemand || undefined}
          isEdit={!!editingDemand}
        />
      </Modal>
    </div>
  );
};

export default TestDemandList;
