import React, { useState, useEffect, useCallback } from 'react';
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
  Tabs,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { TestDemand } from '../types';
import TestDemandSubmit from './TestDemandSubmit';
import DemandRevisionForm from './DemandRevisionForm';
import { api } from '../services/api';
import * as XLSX from 'xlsx';

const { Option } = Select;
const { Search } = Input;
const { RangePicker } = DatePicker;

const TestDemandList: React.FC = () => {
  const [demands, setDemands] = useState<TestDemand[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingDemand, setEditingDemand] = useState<TestDemand | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportDateRange, setExportDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisingDemand, setRevisingDemand] = useState<TestDemand | null>(null);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [closingDemand, setClosingDemand] = useState<TestDemand | null>(null);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeInfo, setCloseInfo] = useState<{
    pastScheduledManpower: number;
    manpowerSatisfied: boolean;
    deletedScheduleCount: number;
    message: string;
  } | null>(null);

  const fetchDemands = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDemands({
        status: activeTab !== 'all' ? activeTab : undefined,
        product: productFilter !== 'all' ? productFilter : undefined,
        search: searchText || undefined,
      });
      setDemands(data);
    } catch (error: any) {
      message.error(error.message || '获取需求列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, productFilter, searchText]);

  const fetchStatusCounts = async () => {
    try {
      const counts = await api.getDemandStatusCounts();
      setStatusCounts(counts);
    } catch (error: any) {
      // counts are non-critical, fail silently
    }
  };

  useEffect(() => {
    fetchStatusCounts();
  }, []);

  useEffect(() => {
    fetchDemands();
  }, [activeTab, productFilter, searchText, fetchDemands, refreshKey]);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleProductChange = (value: string) => {
    setProductFilter(value);
    setPagination(prev => ({ ...prev, current: 1 }));
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
      case 'revision_pending':
        return 'cyan';
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
      case 'revision_pending':
        return '变更待审批';
      default:
        return status;
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteDemand(id);
      setDemands(demands.filter(d => d.id !== id));
      message.success('测试需求已删除');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleCloseClick = async (demand: TestDemand) => {
    setClosingDemand(demand);
    setCloseLoading(true);
    setCloseModalVisible(true);
    try {
      const res = await api.previewCloseDemand(demand.id);
      setCloseInfo({
        pastScheduledManpower: res.pastScheduledManpower ?? 0,
        manpowerSatisfied: res.manpowerSatisfied ?? true,
        deletedScheduleCount: res.futureScheduleCount ?? 0,
        message: '',
      });
    } catch (error: any) {
      message.error(error.message || '获取关闭信息失败');
      setCloseModalVisible(false);
      setClosingDemand(null);
    } finally {
      setCloseLoading(false);
    }
  };

  const handleCloseConfirm = async () => {
    if (!closingDemand) return;
    setCloseLoading(true);
    try {
      const res = await api.closeDemand(closingDemand.id);
      setDemands(demands.map(d =>
        d.id === closingDemand.id ? { ...d, status: 'completed' as const } : d
      ));
      message.success(res?.message || '测试需求已关闭');
    } catch (error: any) {
      message.error(error.message || '关闭失败');
    } finally {
      setCloseLoading(false);
      setCloseModalVisible(false);
      setClosingDemand(null);
      setCloseInfo(null);
    }
  };

  const handleEdit = (demand: TestDemand) => {
    setEditingDemand(demand);
    setShowSubmitModal(true);
  };

  const handleSubmitSuccess = () => {
    setShowSubmitModal(false);
    setEditingDemand(null);
    setFormDirty(false);
    fetchStatusCounts();
    setRefreshKey(k => k + 1);
    message.success('操作成功！');
  };

  const handleRevision = (demand: TestDemand) => {
    setRevisingDemand(demand);
    setShowRevisionModal(true);
  };

  const handleRevisionSuccess = () => {
    setShowRevisionModal(false);
    setRevisingDemand(null);
    fetchStatusCounts();
    setRefreshKey(k => k + 1);
    message.success('需求变更已提交审批');
  };

  const handleModalClose = useCallback(() => {
    if (formDirty) {
      setShowLeaveConfirm(true);
    } else {
      setShowSubmitModal(false);
    }
  }, [formDirty]);

  const handleSaveDraftAndLeave = () => {
    window.dispatchEvent(new CustomEvent('save-demand-draft'));
    setShowSubmitModal(false);
    setShowLeaveConfirm(false);
    setFormDirty(false);
    message.success('草稿已保存');
  };

  const handleLeaveWithoutSaving = () => {
    window.dispatchEvent(new CustomEvent('clear-demand-draft'));
    setShowSubmitModal(false);
    setShowLeaveConfirm(false);
    setFormDirty(false);
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
        '版本阶段': d.versionPhase || '',
        '优先级': d.priority || '',
        '保密项目': d.confidential ? '是' : '否',
        '测试周期开始': dayjs(d.startDate).format('YYYY-MM-DD'),
        '测试周期结束': dayjs(d.endDate).format('YYYY-MM-DD'),
        '人力需求(人/天)': d.manpowerDemand,
        '技术一组(人/天)': d.manpowerSummary?.find(s => s.testType === '技术一组')?.totalManpower ?? '',
        '技术二组(人/天)': d.manpowerSummary?.find(s => s.testType === '技术二组')?.totalManpower ?? '',
        '技术三组(人/天)': d.manpowerSummary?.find(s => s.testType === '技术三组')?.totalManpower ?? '',
        '功能集组(人/天)': d.manpowerSummary?.find(s => s.testType === '功能集组')?.totalManpower ?? '',
        '样机数量': d.testDeviceCount ?? '',
        '状态': d.status,
        '提交人': d.submittedByName || d.submittedBy || '',
        '备注': d.description || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '测试需求');

      const colWidths = [
        { wch: 20 }, { wch: 10 }, { wch: 8 }, { wch: 8 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 30 },
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
      title: '技术一组',
      key: 'group_tech1',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const summary = record.manpowerSummary?.find(s => s.testType === '技术一组');
        return summary ? `${summary.totalManpower} 人/天` : '-';
      },
    },
    {
      title: '技术二组',
      key: 'group_tech2',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const summary = record.manpowerSummary?.find(s => s.testType === '技术二组');
        return summary ? `${summary.totalManpower} 人/天` : '-';
      },
    },
    {
      title: '技术三组',
      key: 'group_tech3',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const summary = record.manpowerSummary?.find(s => s.testType === '技术三组');
        return summary ? `${summary.totalManpower} 人/天` : '-';
      },
    },
    {
      title: '功能集组',
      key: 'group_func',
      width: 90,
      align: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const summary = record.manpowerSummary?.find(s => s.testType === '功能集组');
        return summary ? `${summary.totalManpower} 人/天` : '-';
      },
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
      dataIndex: 'submittedByName',
      key: 'submittedByName',
      width: 100,
      render: (text: string, record: TestDemand) => text || record.submittedBy || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      render: (_: any, record: TestDemand) => {
        const isSubmitted = record.status === 'submitted';
        const isPending = record.status === 'pending';
        const isScheduled = record.status === 'scheduled';
        const isCompleted = record.status === 'completed';
        const isRejected = record.status === 'rejected';
        const isRevisionPending = record.status === 'revision_pending';
        const canEdit = isRejected;
        const canRevise = isPending || isScheduled;
        const canClose = isScheduled || isPending;
        const canDelete = isSubmitted || isRejected;

        if (isCompleted) return null;

        return (
          <Space size="small">
            {canEdit && (
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              >
                编辑
              </Button>
            )}
            {canRevise && (
              <Button
                type="link"
                size="small"
                icon={<FormOutlined />}
                onClick={() => handleRevision(record)}
              >
                变更
              </Button>
            )}
            {canClose && (
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleCloseClick(record)}
              >
                关闭
              </Button>
            )}
            {canDelete && (
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
            {isRevisionPending && (
              <Tag color="cyan">变更审批中</Tag>
            )}
          </Space>
        );
      },
    },
  ];

  const STATUS_ITEMS = [
    { key: 'submitted', label: '待审批', color: '#722ed1' },
    { key: 'pending', label: '待排期', color: '#fa8c16' },
    { key: 'scheduled', label: '已排期', color: '#1890ff' },
    { key: 'completed', label: '已完成', color: '#52c41a' },
    { key: 'rejected', label: '已退回', color: '#ff4d4f' },
    { key: 'revision_pending', label: '变更待审批', color: '#13c2c2' },
  ];

  const products = [...new Set(demands.map(d => d.product))];

  const tabItems = [
    { key: 'all', label: `全部 (${statusCounts.all ?? 0})` },
    ...STATUS_ITEMS.map(item => ({
      key: item.key,
      label: `${item.label} (${statusCounts[item.key] ?? 0})`,
    })),
  ];

  return (
    <div>
      {/* Status cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(6, 1fr)',
        gap: 12,
        marginBottom: 16,
      }}>
        {STATUS_ITEMS.map(item => (
          <Card
            key={item.key}
            size="small"
            hoverable
            style={{
              cursor: 'pointer',
              borderColor: activeTab === item.key ? item.color : undefined,
              borderWidth: activeTab === item.key ? 2 : 1,
            }}
            onClick={() => handleTabChange(item.key)}
          >
            <Statistic
              title={<span style={{ color: item.color, fontWeight: 500 }}>{item.label}</span>}
              value={statusCounts[item.key] ?? 0}
              valueStyle={{ color: item.color, fontSize: 28 }}
            />
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 16 }}>
        {/* Tabs */}
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          items={tabItems}
          style={{ marginBottom: 8 }}
        />

        {/* Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Space wrap>
            <Search
              placeholder="搜索产品或版本"
              onSearch={handleSearch}
              style={{ width: 200 }}
              allowClear
            />
            <Select
              placeholder="筛选产品"
              value={productFilter}
              onChange={handleProductChange}
              style={{ width: 150 }}
              allowClear
            >
              <Option value="all">全部产品</Option>
              {products.map(product => (
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
          dataSource={demands}
          rowKey="id"
          bordered
          loading={loading}
          scroll={{ x: 1200, y: 'calc(100vh - 520px)' }}
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
        onCancel={handleModalClose}
        footer={null}
        width={800}
        destroyOnClose
      >
        <TestDemandSubmit
          onBack={handleSubmitSuccess}
          initialValues={editingDemand || undefined}
          isEdit={!!editingDemand}
          onDirtyChange={setFormDirty}
        />
      </Modal>

      <Modal
        title="确认离开"
        open={showLeaveConfirm}
        onCancel={() => setShowLeaveConfirm(false)}
        closable
        maskClosable
        zIndex={1050}
        footer={
          <Space>
            <Button danger onClick={handleLeaveWithoutSaving}>
              直接离开
            </Button>
            <Button type="primary" onClick={handleSaveDraftAndLeave}>
              保存草稿并离开
            </Button>
          </Space>
        }
        width={420}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ExclamationCircleOutlined style={{ fontSize: 24, color: '#faad14' }} />
          <span>您有未保存的更改，确定要离开吗？</span>
        </div>
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

      <Modal
        title="需求变更"
        open={showRevisionModal}
        onCancel={() => setShowRevisionModal(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        {revisingDemand && (
          <DemandRevisionForm
            demand={revisingDemand}
            onSuccess={handleRevisionSuccess}
            onCancel={() => setShowRevisionModal(false)}
          />
        )}
      </Modal>

      <Modal
        title="关闭测试需求"
        open={closeModalVisible}
        onCancel={() => { setCloseModalVisible(false); setClosingDemand(null); setCloseInfo(null); }}
        footer={null}
        width={480}
        destroyOnClose
      >
        {closeLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>加载中...</div>
        ) : closeInfo ? (
          <div>
            {!closeInfo.manpowerSatisfied && (
              <div style={{
                backgroundColor: '#fff2f0',
                border: '1px solid #ffccc7',
                borderRadius: 6,
                padding: '12px 16px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
              }}>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>人力未全部满足</div>
                  <div style={{ color: '#666' }}>
                    截止今日已排班人力（{closeInfo.pastScheduledManpower}人天）不足需求人力（{closingDemand?.manpowerDemand}人天）。
                    关闭后将清理未来排班，是否确认？
                  </div>
                </div>
              </div>
            )}
            {closeInfo.manpowerSatisfied && closeInfo.deletedScheduleCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                将清理 {closeInfo.deletedScheduleCount} 条排班记录，是否确认关闭？
              </div>
            )}
            {closeInfo.manpowerSatisfied && closeInfo.deletedScheduleCount === 0 && (
              <div style={{ marginBottom: 16 }}>
                确定关闭此需求？
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={() => { setCloseModalVisible(false); setClosingDemand(null); setCloseInfo(null); }}>
                  取消
                </Button>
                <Button type="primary" danger onClick={handleCloseConfirm}>
                  确认关闭
                </Button>
              </Space>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default TestDemandList;
