import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Tag, Select, Input, Button, Space, Modal, Form, message, Drawer, Descriptions, Typography,
} from 'antd';
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { api } from '../services/api';
import type { Feedback, FeedbackStatus, FeedbackType, FeedbackQueryParams } from '../types';

const { TextArea } = Input;
const { Text } = Typography;

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  PENDING: '待处理',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  CLOSED: '已关闭',
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  PENDING: 'orange',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  CLOSED: 'default',
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  BUG: 'Bug',
  FEATURE: '功能需求',
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  BUG: 'red',
  FEATURE: 'purple',
};

const FeedbackManagement: React.FC = () => {
  const [data, setData] = useState<Feedback[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Filters
  const [filterType, setFilterType] = useState<FeedbackType | undefined>();
  const [filterStatus, setFilterStatus] = useState<FeedbackStatus | undefined>();
  const [filterSubmitter, setFilterSubmitter] = useState('');

  // Status update modal
  const [statusModalVisible, setStatusModalVisible] = useState(false);
  const [currentFeedback, setCurrentFeedback] = useState<Feedback | null>(null);
  const [statusForm] = Form.useForm();

  // Detail drawer
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailFeedback, setDetailFeedback] = useState<Feedback | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: FeedbackQueryParams = {
        type: filterType,
        status: filterStatus,
        submitterId: filterSubmitter || undefined,
        page,
        size: pageSize,
      };
      const result = await api.getFeedbackList(params);
      setData(result.content);
      setTotal(result.totalElements);
    } catch (error: unknown) {
      message.error((error as Error)?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus, filterSubmitter, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setPage(0);
    fetchData();
  };

  const handleResetFilters = () => {
    setFilterType(undefined);
    setFilterStatus(undefined);
    setFilterSubmitter('');
    setPage(0);
  };

  const handleOpenStatusModal = (feedback: Feedback) => {
    setCurrentFeedback(feedback);
    statusForm.setFieldsValue({
      status: feedback.status,
      adminNote: feedback.adminNote || '',
    });
    setStatusModalVisible(true);
  };

  const handleUpdateStatus = async () => {
    try {
      const values = await statusForm.validateFields();
      if (!currentFeedback) return;
      await api.updateFeedbackStatus(currentFeedback.id, {
        status: values.status as FeedbackStatus,
        adminNote: values.adminNote || undefined,
      });
      message.success('状态更新成功');
      setStatusModalVisible(false);
      fetchData();
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      message.error((error as Error)?.message || '更新失败');
    }
  };

  const handleViewDetail = (feedback: Feedback) => {
    setDetailFeedback(feedback);
    setDetailVisible(true);
  };

  const handleExport = async () => {
    try {
      const params: FeedbackQueryParams = {
        type: filterType,
        status: filterStatus,
        submitterId: filterSubmitter || undefined,
      };
      const list = await api.exportFeedbackList(params);
      if (list.length === 0) {
        message.warning('暂无数据可导出');
        return;
      }
      const rows = list.map((f) => ({
        'ID': f.id,
        '类型': TYPE_LABELS[f.type],
        '标题': f.title,
        '描述': f.description,
        '提交人': f.submitterName,
        '状态': STATUS_LABELS[f.status],
        '管理员备注': f.adminNote || '',
        '提交时间': dayjs(f.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        '更新时间': dayjs(f.updatedAt).format('YYYY-MM-DD HH:mm:ss'),
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '反馈列表');
      XLSX.writeFile(workbook, `反馈导出_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`);
      message.success(`成功导出 ${rows.length} 条反馈`);
    } catch (error: unknown) {
      message.error((error as Error)?.message || '导出失败');
    }
  };

  const columns = [
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: FeedbackType) => (
        <Tag color={TYPE_COLORS[type]}>{TYPE_LABELS[type]}</Tag>
      ),
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '提交人',
      dataIndex: 'submitterName',
      key: 'submitterName',
      width: 100,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: FeedbackStatus) => (
        <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_: unknown, record: Feedback) => (
        <Space size="small">
          <Button size="small" onClick={() => handleViewDetail(record)}>
            详情
          </Button>
          <Button size="small" type="primary" onClick={() => handleOpenStatusModal(record)}>
            处理
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>反馈管理</h2>

      {/* Filters */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="类型筛选"
          style={{ width: 140 }}
          allowClear
          value={filterType}
          onChange={(v) => { setFilterType(v); setPage(0); }}
          options={[
            { label: 'Bug', value: 'BUG' },
            { label: '功能需求', value: 'FEATURE' },
          ]}
        />
        <Select
          placeholder="状态筛选"
          style={{ width: 140 }}
          allowClear
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(0); }}
          options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }))}
        />
        <Input
          placeholder="提交人搜索"
          style={{ width: 160 }}
          value={filterSubmitter}
          onChange={(e) => setFilterSubmitter(e.target.value)}
          onPressEnter={handleSearch}
          suffix={<SearchOutlined />}
        />
        <Button onClick={handleSearch}>搜索</Button>
        <Button onClick={handleResetFilters}>重置</Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport}>导出 Excel</Button>
      </Space>

      {/* Table */}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page + 1,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => {
            setPage(p - 1);
            setPageSize(ps);
          },
        }}
      />

      {/* Status Update Modal */}
      <Modal
        title="处理反馈"
        open={statusModalVisible}
        onOk={handleUpdateStatus}
        onCancel={() => setStatusModalVisible(false)}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        {currentFeedback && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>{currentFeedback.title}</Text>
            <br />
            <Text type="secondary">{currentFeedback.description}</Text>
          </div>
        )}
        <Form form={statusForm} layout="vertical">
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value }))}
            />
          </Form.Item>
          <Form.Item name="adminNote" label="处理备注">
            <TextArea rows={3} placeholder="可选：添加处理备注" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        title="反馈详情"
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        width={500}
      >
        {detailFeedback && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="ID">{detailFeedback.id}</Descriptions.Item>
            <Descriptions.Item label="类型">
              <Tag color={TYPE_COLORS[detailFeedback.type]}>{TYPE_LABELS[detailFeedback.type]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="标题">{detailFeedback.title}</Descriptions.Item>
            <Descriptions.Item label="描述">{detailFeedback.description}</Descriptions.Item>
            <Descriptions.Item label="提交人">{detailFeedback.submitterName}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_COLORS[detailFeedback.status]}>{STATUS_LABELS[detailFeedback.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="管理员备注">{detailFeedback.adminNote || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交时间">
              {dayjs(detailFeedback.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {dayjs(detailFeedback.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </div>
  );
};

export default FeedbackManagement;
