import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Popconfirm, message, Tag, Modal, DatePicker, InputNumber, Divider, Select } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { DemandManpowerDetail, SpecialModuleDemandInput, TestModule } from '../types';
import SpecialModuleDemandEditor from '../components/SpecialModuleDemandEditor';
import { calculateManpowerSummary, validateSpecialModuleRows } from '../utils/specialModuleCalculations';

const { RangePicker } = DatePicker;

const DemandApproval: React.FC = () => {
  const [pendingDemands, setPendingDemands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // 修改后批准 Modal 状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingDemand, setEditingDemand] = useState<any>(null);
  const [editDateRange, setEditDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [originalManpower, setOriginalManpower] = useState<Record<string, number>>({});
  const [editManpower, setEditManpower] = useState<Record<string, number>>({});
  const [editLoading, setEditLoading] = useState(false);
  const [testTypes, setTestTypes] = useState<string[]>([]);
  const [originalPriority, setOriginalPriority] = useState<string>('');
  const [editPriority, setEditPriority] = useState<string>('');
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [editSpecialModuleRows, setEditSpecialModuleRows] = useState<SpecialModuleDemandInput[]>([]);

  useEffect(() => {
    fetchPending();
    fetchTestTypes();
    let active = true;
    api.getTestModules().then((items) => {
      if (active) setModules(items);
    }).catch((error: any) => {
      if (active) message.error(error.message || '获取特殊模块配置失败');
    });
    return () => { active = false; };
  }, []);

  const fetchTestTypes = async () => {
    try {
      const configs = await api.getFieldConfigs();
      const typeConfig = configs.find((c: any) => c.fieldName === 'testType');
      if (typeConfig && typeConfig.options) {
        const types = typeConfig.options.split(',').filter((o: string) => o.trim());
        setTestTypes(types);
      }
      const priorityConfig = configs.find((c: any) => c.fieldName === 'priority');
      if (priorityConfig && priorityConfig.options) {
        setPriorityOptions(priorityConfig.options.split(',').filter((o: string) => o.trim()));
      }
    } catch (error) {
      // ignore
    }
  };

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

  const refreshCounts = () => window.dispatchEvent(new CustomEvent('refresh-pending-counts'));

  const handleApprove = async (id: number) => {
    try {
      await api.approveDemand(id);
      message.success('已批准');
      setPendingDemands(prev => prev.filter(d => d.id !== id));
      setSelectedRowKeys(prev => prev.filter(k => k !== id));
      refreshCounts();
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
      refreshCounts();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const openEditModal = async (record: any) => {
    setEditingDemand(record);
    setEditDateRange([
      dayjs(record.startDate),
      dayjs(record.endDate),
    ]);

    let details: DemandManpowerDetail[] = [];
    let specialRows: SpecialModuleDemandInput[] = (record.specialModuleDemands ?? []).map((row: any) => ({
      moduleId: row.moduleId, testType: row.testType, manpowerDemand: row.manpowerDemand,
    }));
    let priority = record.priority || '';
    try {
      const fullDemand = await api.getDemand(record.id);
      if (fullDemand.manpowerDetails) {
        details = fullDemand.manpowerDetails;
      }
      if (fullDemand.priority) {
        priority = fullDemand.priority;
      }
      specialRows = (fullDemand.specialModuleDemands ?? specialRows).map((row: any) => ({
        moduleId: row.moduleId, testType: row.testType, manpowerDemand: row.manpowerDemand,
      }));
    } catch (e) {
      if (record.manpowerDetails) {
        details = record.manpowerDetails;
      }
    }

    const orig: Record<string, number> = {};
    details.forEach((d: DemandManpowerDetail) => {
      orig[d.testType] = d.manpowerDemand;
    });
    setOriginalManpower(orig);
    setEditManpower({ ...orig });
    setEditSpecialModuleRows(specialRows);
    setOriginalPriority(priority);
    setEditPriority(priority);
    setEditModalOpen(true);
  };

  const handleEditApprove = async () => {
    if (!editDateRange || !editingDemand) return;

    // 构建按测试类型分组的人力需求明细
    const manpowerDetails = testTypes
      .filter(tt => (editManpower[tt] || 0) > 0)
      .map(tt => ({
        testType: tt,
        manpowerDemand: editManpower[tt],
      }));

    if (manpowerDetails.length === 0) {
      message.warning('请至少为一个测试类型填写人力需求');
      return;
    }
    const specialValidation = validateSpecialModuleRows(editManpower, editSpecialModuleRows);
    if (!specialValidation.valid) {
      message.warning(specialValidation.errorCode === 'SPECIAL_MODULE_EXCEEDS_GROUP'
        ? `${specialValidation.testType}小组的特殊模块人力超过总人力`
        : '请完善特殊模块人力需求');
      return;
    }

    setEditLoading(true);
    try {
      await api.approveDemandWithChanges(editingDemand.id, {
        startDate: editDateRange[0].format('YYYY-MM-DDTHH:mm:ss'),
        endDate: editDateRange[1].format('YYYY-MM-DDTHH:mm:ss'),
        manpowerDetails,
        specialModuleDemands: editSpecialModuleRows.map((row) => ({
          moduleId: row.moduleId as number,
          manpowerDemand: row.manpowerDemand as number,
        })),
        priority: editPriority,
      });
      message.success('修改并批准成功');
      refreshCounts();
      setEditModalOpen(false);
      setEditingDemand(null);
      setPendingDemands(prev => prev.filter(d => d.id !== editingDemand.id));
      setSelectedRowKeys(prev => prev.filter(k => k !== editingDemand.id));
    } catch (error: any) {
      message.error(error.message || '操作失败');
    } finally {
      setEditLoading(false);
    }
  };

  const handleBatchApprove = async () => {
    try {
      await api.batchApproveDemands(selectedRowKeys as number[]);
      message.success(`已批量批准 ${selectedRowKeys.length} 个需求`);
      refreshCounts();
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
      refreshCounts();
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
      title: '保密项目', dataIndex: 'confidential', key: 'confidential', width: 90,
      render: (v: boolean) => v ? <Tag color="red">是</Tag> : <Tag>否</Tag>,
    },
    {
      title: '优先级', dataIndex: 'priority', key: 'priority', width: 80,
      render: (p: string) => {
        const colorMap: Record<string, string> = { '高': 'red', '中': 'orange', '低': 'green' };
        return p ? <Tag color={colorMap[p] || 'default'}>{p}</Tag> : '-';
      },
    },
    {
      title: '人力需求', dataIndex: 'manpowerDemand', key: 'manpowerDemand', width: 100,
      render: (v: number) => `${v} 人/天`,
    },
    {
      title: '人力拆分', key: 'manpowerSummary', width: 220,
      render: (_: any, record: any) => calculateManpowerSummary(
        (record.manpowerDetails ?? []).reduce((result: Record<string, number>, item: DemandManpowerDetail) => ({
          ...result, [item.testType]: item.manpowerDemand,
        }), {}),
        (record.specialModuleDemands ?? []).map((row: any) => ({
          moduleId: row.moduleId, testType: row.testType, manpowerDemand: row.manpowerDemand,
        })),
      ).map((summary) => (
        <div key={summary.testType}>{summary.testType}：总 {summary.totalManpower.toFixed(1)} / 特殊 {summary.specialManpower.toFixed(1)} / 通用 {summary.generalManpower.toFixed(1)}</div>
      )),
    },
    { title: '备注', dataIndex: 'description', key: 'description', width: 120, render: (t: string) => t || '-' },
    { title: '提交人', dataIndex: 'submittedBy', key: 'submittedBy', width: 100 },
    {
      title: '提交时间', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: '操作', key: 'action', width: 280,
      render: (_: any, record: any) => (
        <Space>
          <Popconfirm title="确认批准此需求？" onConfirm={() => handleApprove(record.id)} okText="批准" cancelText="取消">
            <Button type="link" size="small" icon={<CheckOutlined />} style={{ color: '#52c41a' }}>批准</Button>
          </Popconfirm>
          <Button type="link" size="small" icon={<EditOutlined />} style={{ color: '#fa8c16' }} onClick={() => openEditModal(record)}>
            修改后批准
          </Button>
          <Popconfirm title="确认退回此需求？需求将返回给测试经理修改。" onConfirm={() => handleReject(record.id)} okText="退回" cancelText="取消" okType="danger">
            <Button type="link" size="small" danger icon={<CloseOutlined />}>退回</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 96px)' }}>
      <div style={{ marginBottom: 16, position: 'sticky', top: 0, zIndex: 10, background: '#f0f2f5', paddingTop: 4, paddingBottom: 8 }}>
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
        sticky={{ offsetHeader: 48 }}
        scroll={{ x: 1600 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={false}
        locale={{ emptyText: '暂无待审批的测试需求' }}
      />

      <Modal
        title="修改并批准测试需求"
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); setEditingDemand(null); }}
        footer={null}
        width={600}
        destroyOnClose
      >
        {editingDemand && (
          <div>
            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#666' }}>产品信息：</span>
                <strong>{editingDemand.product}</strong>
              </div>
              {editingDemand.version && (
                <div style={{ marginBottom: 8 }}>
                  <span style={{ color: '#666' }}>版本号：</span>
                  <strong>{editingDemand.version}</strong>
                </div>
              )}
              <div>
                <span style={{ color: '#666' }}>版本类型：</span>
                <Tag color="blue">{editingDemand.versionType}</Tag>
              </div>
            </div>

            <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f5f5f5', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>需求优先级</span>
                <Tag color={originalPriority === '高' ? 'red' : originalPriority === '中' ? 'orange' : 'green'}>
                  {originalPriority || '未设置'}
                </Tag>
                <span style={{ color: '#999', fontSize: 12 }}>→</span>
                <Select
                  value={editPriority || undefined}
                  onChange={(val) => setEditPriority(val)}
                  style={{ width: 120 }}
                  placeholder="选择优先级"
                >
                  {priorityOptions.map(opt => (
                    <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                  ))}
                </Select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>测试周期</div>
              <RangePicker
                value={editDateRange}
                onChange={(dates) => setEditDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>人力需求（按测试类型）</div>
              <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                {/* 表头 */}
                <div style={{
                  display: 'flex', alignItems: 'center', marginBottom: 8,
                  padding: '4px 12px', fontSize: 12, color: '#666',
                }}>
                  <span style={{ minWidth: 90 }}>测试类型</span>
                  <span style={{ marginLeft: 12, width: 100, textAlign: 'center' }}>测试经理提交</span>
                  <span style={{ marginLeft: 12, width: 100, textAlign: 'center' }}>项目经理修改</span>
                </div>
                {testTypes.map(testType => (
                  <div key={testType} style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 10,
                    padding: '8px 12px',
                    background: '#fff',
                    borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}>
                    <Tag color="blue" style={{ minWidth: 80, textAlign: 'center', marginRight: 0 }}>
                      {testType}
                    </Tag>
                    <span style={{ marginLeft: 12, width: 100, textAlign: 'center', fontWeight: 500 }}>
                      {originalManpower[testType] || 0} 人/天
                    </span>
                    <InputNumber
                      min={0}
                      step={0.1}
                      precision={1}
                      style={{ width: 120, marginLeft: 12 }}
                      placeholder="0"
                      addonAfter="人/天"
                      value={editManpower[testType] ?? 0}
                      onChange={(val) => setEditManpower(prev => ({
                        ...prev,
                        [testType]: val ?? 0,
                      }))}
                    />
                  </div>
                ))}
                <Divider style={{ margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
                  <span style={{ color: '#666' }}>
                    原始总计：<span style={{ fontWeight: 500, color: '#333' }}>
                      {Object.values(originalManpower).reduce((sum, v) => sum + (v || 0), 0).toFixed(1)}
                    </span> 人/天
                  </span>
                  <span>
                    修改后总计：<span style={{ color: '#1890ff', fontWeight: 600, fontSize: 15 }}>
                      {Object.values(editManpower).reduce((sum, v) => sum + (v || 0), 0).toFixed(1)}
                    </span> 人/天
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>特殊模块人力需求</div>
              <SpecialModuleDemandEditor
                rows={editSpecialModuleRows}
                modules={modules}
                manpowerByTestType={editManpower}
                onChange={setEditSpecialModuleRows}
              />
              {calculateManpowerSummary(editManpower, editSpecialModuleRows).map((summary) => (
                <div key={summary.testType} style={{ marginTop: 6, fontSize: 12, color: '#666' }}>
                  {summary.testType}：总人力 {summary.totalManpower.toFixed(1)}，特殊模块 {summary.specialManpower.toFixed(1)}，通用人力 {summary.generalManpower.toFixed(1)} 人/天
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <Button onClick={() => { setEditModalOpen(false); setEditingDemand(null); }}>
                取消
              </Button>
              <Button type="primary" loading={editLoading} onClick={handleEditApprove}>
                修改并批准
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DemandApproval;
