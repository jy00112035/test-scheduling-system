import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import api from '../services/api';
import type { TestModule, TestModuleWriteRequest } from '../types';

interface TestModuleConfigPanelProps {
  testTypes: string[];
}

const TestModuleConfigPanel: React.FC<TestModuleConfigPanelProps> = ({ testTypes }) => {
  const [form] = Form.useForm<TestModuleWriteRequest>();
  const [modules, setModules] = useState<TestModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<TestModule | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<number | null>(null);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setModules(await api.getTestModules());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取特殊模块配置失败';
      setLoadError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);

  const showMutationError = (error: unknown, fallback: string) => {
    const errorMessage = error instanceof Error ? error.message : fallback;
    setMutationError(errorMessage);
    message.error(errorMessage);
  };

  const openAdd = () => {
    setEditingModule(null);
    setMutationError(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 1, testType: testTypes[0] });
    setModalOpen(true);
  };

  const openEdit = (module: TestModule) => {
    setEditingModule(module);
    setMutationError(null);
    form.setFieldsValue({
      moduleName: module.moduleName,
      testType: module.testType,
      sortOrder: module.sortOrder,
    });
    setModalOpen(true);
  };

  const submit = async (values: TestModuleWriteRequest) => {
    setMutationError(null);
    try {
      if (editingModule) {
        await api.updateTestModule(editingModule.id, values);
        message.success('特殊模块已更新');
      } else {
        await api.createTestModule(values);
        message.success('特殊模块已添加');
      }
      setModalOpen(false);
      await loadModules();
    } catch (error) {
      showMutationError(error, '特殊模块操作失败');
    }
  };

  const changeStatus = async (module: TestModule, enabled: boolean) => {
    setMutationError(null);
    setStatusLoadingId(module.id);
    try {
      await api.setTestModuleStatus(module.id, enabled);
      message.success(enabled ? '模块已启用' : '模块已停用');
      await loadModules();
    } catch (error) {
      showMutationError(error, '模块状态更新失败');
    } finally {
      setStatusLoadingId(null);
    }
  };

  const deleteModule = async (module: TestModule) => {
    setMutationError(null);
    try {
      await api.deleteTestModule(module.id);
      message.success('特殊模块已删除');
      await loadModules();
    } catch (error) {
      showMutationError(error, '删除特殊模块失败');
    }
  };

  const columns = [
    { title: '模块名称', dataIndex: 'moduleName', key: 'moduleName' },
    { title: '所属小组', dataIndex: 'testType', key: 'testType' },
    {
      title: '启用状态', dataIndex: 'enabled', key: 'enabled',
      render: (_enabled: boolean, module: TestModule) => (
        <Space>
          <Switch
            checked={module.enabled}
            loading={statusLoadingId === module.id}
            aria-label={`${module.enabled ? '启用' : '停用'}${module.moduleName}`}
            onChange={(enabled) => void changeStatus(module, enabled)}
          />
          <span>{module.enabled ? '启用' : '停用'}</span>
        </Space>
      ),
    },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder' },
    {
      title: '引用状态', dataIndex: 'referenced', key: 'referenced',
      render: (referenced: boolean | null) => (
        <Tag color={referenced ? 'orange' : 'default'}>{referenced ? '已引用' : '未引用'}</Tag>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_value: unknown, module: TestModule) => (
        <Space size="small">
          <Tooltip title="编辑模块">
            <Button
              type="link"
              icon={<EditOutlined />}
              aria-label={`编辑${module.moduleName}`}
              onClick={() => openEdit(module)}
            />
          </Tooltip>
          {!module.referenced && (
            <Popconfirm
              title="确定删除此特殊模块吗？"
              okText="确定"
              cancelText="取消"
              onConfirm={() => void deleteModule(module)}
            >
              <Tooltip title="删除模块">
                <Button
                  type="link"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={`删除${module.moduleName}`}
                />
              </Tooltip>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>
          新增特殊模块
        </Button>
      </div>
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />}
      {mutationError && <Alert type="error" showIcon message={mutationError} style={{ marginBottom: 16 }} />}
      <Table
        columns={columns}
        dataSource={modules}
        rowKey="id"
        bordered
        loading={loading}
        scroll={{ x: 850 }}
        locale={{ emptyText: loadError ? '加载失败' : '暂无特殊模块配置' }}
      />
      <Modal
        title={editingModule ? '编辑特殊模块' : '新增特殊模块'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="moduleName" label="模块名称" rules={[{ required: true, message: '请输入模块名称' }]}>
            <Input disabled={Boolean(editingModule?.referenced)} />
          </Form.Item>
          <Form.Item name="testType" label="所属小组" rules={[{ required: true, message: '请选择所属小组' }]}>
            <Select
              disabled={Boolean(editingModule?.referenced)}
              options={testTypes.map((testType) => ({ label: testType, value: testType }))}
            />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序" rules={[{ required: true, message: '请输入排序' }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>保存</Button>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TestModuleConfigPanel;
