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
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { TestDemand } from '../types';
import TestDemandSubmit from './TestDemandSubmit';
import { api } from '../services/api';
import * as XLSX from 'xlsx';

const { Option } = Select;
const { Search } = Input;
const { RangePicker } = DatePicker;

const TestDemandList: React.FC = () => {
  const [demands, setDemands] = useState<TestDemand[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingDemand, setEditingDemand] = useState<TestDemand | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

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

  const handleExport = async () => {
    if (!exportDateRange || exportDateRange.length !== 2) {
      message.warning('请选择导出的日期范围');
      return;
    }
    setExportLoading(true);
    try {
      const startDate = exportDateRange[0].format('YYYY-MM-DD');
      const endDate = exportDateRange[1].format('YYYY-MM-DD');

      const allDemands = await api.getDemands();
      const filtered = allDemands.filter((d: TestDemand) => {
        const created = dayjs(d.createdAt).format('YYYY-MM-DD');
        return created >= startDate && created <= endDate;
      });

      if (filtered.length === 0) {
        message.info('所选日期范围内无需求数据');
        setExportLoading(false);
        return;
      }

      const rows = filtered.map((d: TestDemand) => ({
        '产品': d.product,
        '版本号': d.version || '',
        '版本类型': d.versionType || '',
        '版本阶段': d.versionPhase || '',
        '优先级': d.priority || '',
        '保密项目': d.confidential ? '是' : '否',
        '测试周期开始': dayjs(d.startDate).format('YYYY-MM-DD'),
        '测试周期结束': dayjs(d.endDate).format('YYYY-MM-DD'),
        '人力需求(人/天)': d.manpowerDemand,
        '样机数量': d.testDeviceCount ?? '',
        '状态': d.status,
        '提交人': d.submittedBy || '',
        '提交时间': dayjs(d.createdAt).format('YYYY-MM-DD'),
        '备注': d.description || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '测试需求');

      const colWidths = [
        { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
        { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
        { wch: 14 }, { wch: 30 },
      ];
      worksheet['!cols'] = colWidths;

      XLSX.writeFile(workbook, `测试需求导出_${startDate}_${endDate}.xlsx`);
      message.success(`成功导出 ${rows.length} 条需求记录`);
      setExportModalVisible(false);
    } catch (error: any) {
      message.error(error.message || '导出失败');
    } finally {
      setExportLoading(false);
    }
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
          <Space>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => setExportModalVisible(true)}
            >
              导出
            </Button>
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
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={filteredDemands}
          rowKey="id"
          bordered
          loading={loading}
          scroll={{ x: 1200, y: 'calc(100vh - 360px)' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
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

      <Modal
        title="导出测试需求"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        width={420}
        destroyOnClose
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ marginBottom: 4, fontWeight: 500 }}>提交日期范围</div>
            <RangePicker
              value={exportDateRange as any}
              onChange={(dates) => setExportDateRange(dates as [Dayjs, Dayjs] | null)}
              placeholder={['开始日期', '结束日期']}
              format="YYYY-MM-DD"
              allowClear
              style={{ width: '100%' }}
            />
          </div>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportLoading}
            onClick={handleExport}
            block
          >
            导出
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default TestDemandList;
