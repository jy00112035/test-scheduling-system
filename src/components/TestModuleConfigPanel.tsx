import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Upload,
  message,
} from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import api from '../services/api';
import type { TestModule, TestModuleWriteRequest } from '../types';
import {
  MODULE_IMPORT_MAX_FILE_SIZE,
  MODULE_IMPORT_MAX_ROWS,
  MODULE_IMPORT_TEMPLATE_FILENAME,
  type ModuleImportRow,
  classifyModuleImportLimits,
  createModuleImportTemplateWorkbook,
  parseModuleImportRows,
} from '../utils/moduleSpreadsheet';

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
  const [pendingMutationIds, setPendingMutationIds] = useState<Set<number>>(new Set());
  const [savePending, setSavePending] = useState(false);
  const mountedRef = useRef(true);
  const loadGenerationRef = useRef(0);
  const pendingMutationRef = useRef(new Set<number>());
  const savePendingRef = useRef(false);
  const modalSessionRef = useRef(0);

  // ---- import state ----
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importData, setImportData] = useState<ModuleImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importUploadKey, setImportUploadKey] = useState(0);
  const importGenerationRef = useRef(0);
  const importReaderRef = useRef<FileReader | null>(null);
  const importSaveGenerationRef = useRef(0);
  const importSaveSessionRef = useRef<number | null>(null);

  const loadModules = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.getTestModules();
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setModules(data);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取特殊模块配置失败';
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setLoadError(errorMessage);
      }
    } finally {
      if (mountedRef.current && generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void loadModules();
    return () => {
      mountedRef.current = false;
    };
  }, [loadModules]);

  const showMutationError = (error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    const errorMessage = error instanceof Error ? error.message : fallback;
    setMutationError(errorMessage);
    message.error(errorMessage);
  };

  const openAdd = () => {
    if (savePendingRef.current) return;
    modalSessionRef.current += 1;
    setEditingModule(null);
    setMutationError(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 1, testType: testTypes[0] });
    setModalOpen(true);
  };

  const openEdit = (module: TestModule) => {
    if (savePendingRef.current) return;
    modalSessionRef.current += 1;
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
    if (savePendingRef.current || !mountedRef.current) return;
    const session = modalSessionRef.current;
    savePendingRef.current = true;
    setSavePending(true);
    setMutationError(null);
    try {
      if (editingModule) {
        await api.updateTestModule(editingModule.id, values);
        if (mountedRef.current && session === modalSessionRef.current) message.success('特殊模块已更新');
      } else {
        await api.createTestModule(values);
        if (mountedRef.current && session === modalSessionRef.current) message.success('特殊模块已添加');
      }
      if (mountedRef.current && session === modalSessionRef.current) {
        setModalOpen(false);
        await loadModules();
      }
    } catch (error) {
      if (session === modalSessionRef.current) showMutationError(error, '特殊模块操作失败');
    } finally {
      if (mountedRef.current && session === modalSessionRef.current) {
        savePendingRef.current = false;
        setSavePending(false);
      }
    }
  };

  const changeStatus = async (module: TestModule, enabled: boolean) => {
    if (pendingMutationRef.current.has(module.id) || !mountedRef.current) return;
    pendingMutationRef.current.add(module.id);
    setPendingMutationIds(new Set(pendingMutationRef.current));
    setMutationError(null);
    try {
      await api.setTestModuleStatus(module.id, enabled);
      if (mountedRef.current) {
        message.success(enabled ? '模块已启用' : '模块已停用');
        await loadModules();
      }
    } catch (error) {
      showMutationError(error, '模块状态更新失败');
    } finally {
      pendingMutationRef.current.delete(module.id);
      if (mountedRef.current) setPendingMutationIds(new Set(pendingMutationRef.current));
    }
  };

  const deleteModule = async (module: TestModule): Promise<void> => {
    if (pendingMutationRef.current.has(module.id) || !mountedRef.current) return;
    pendingMutationRef.current.add(module.id);
    setPendingMutationIds(new Set(pendingMutationRef.current));
    setMutationError(null);
    try {
      await api.deleteTestModule(module.id);
      if (mountedRef.current) {
        message.success('特殊模块已删除');
        await loadModules();
      }
    } catch (error) {
      showMutationError(error, '删除特殊模块失败');
    } finally {
      pendingMutationRef.current.delete(module.id);
      if (mountedRef.current) setPendingMutationIds(new Set(pendingMutationRef.current));
    }
  };

  // ---- import handlers ----
  const resetImportPreview = () => {
    const reader = importReaderRef.current;
    if (reader && reader.readyState !== FileReader.DONE) {
      reader.abort();
    }
    importReaderRef.current = null;
    importGenerationRef.current += 1;
    setImportData([]);
    setSelectedFile(null);
    setImportUploadKey(k => k + 1);
    setImportLoading(false);
  };

  const openImportModal = () => {
    if (savePendingRef.current) return;
    resetImportPreview();
    setImportStep(1);
    setImportModalVisible(true);
  };

  const downloadTemplate = () => {
    const workbook = createModuleImportTemplateWorkbook(testTypes);
    XLSX.writeFile(workbook, MODULE_IMPORT_TEMPLATE_FILENAME);
  };

  const handleFileChange = (info: any) => {
    if (importSaveSessionRef.current !== null) return;
    if (!info.fileList?.length) {
      resetImportPreview();
      return;
    }
    const file = info.file.originFileObj || info.file;
    if (file) {
      resetImportPreview();
      setSelectedFile(file);
    }
  };

  const processImport = () => {
    if (!selectedFile) return;
    const limitError = classifyModuleImportLimits(selectedFile.size);
    if (limitError === 'fileTooLarge') {
      message.error(`文件过大，最大支持 ${MODULE_IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    const generation = ++importGenerationRef.current;
    setImportLoading(true);

    const reader = new FileReader();
    importReaderRef.current = reader;

    reader.onload = (e) => {
      if (generation !== importGenerationRef.current || !mountedRef.current) return;
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', sheetRows: MODULE_IMPORT_MAX_ROWS + 2 });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonRows.length === 0) {
          message.error('文件中没有数据行');
          setImportLoading(false);
          return;
        }
        if (jsonRows.length > MODULE_IMPORT_MAX_ROWS) {
          message.error(`数据行数超过限制（最多 ${MODULE_IMPORT_MAX_ROWS} 行）`);
          setImportLoading(false);
          return;
        }

        const existingNameTypePairs = new Set(
          modules.map(m => `${m.moduleName}|${m.testType}`),
        );
        const rows = parseModuleImportRows(jsonRows, testTypes, existingNameTypePairs);
        setImportData(rows);
        setImportStep(2);
      } catch (err) {
        if (generation === importGenerationRef.current && mountedRef.current) {
          message.error(err instanceof Error ? err.message : '文件解析失败');
        }
      } finally {
        if (generation === importGenerationRef.current && mountedRef.current) {
          setImportLoading(false);
        }
      }
    };

    reader.onerror = () => {
      if (generation === importGenerationRef.current && mountedRef.current) {
        message.error('文件读取失败');
        setImportLoading(false);
      }
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  const handleImportConfirm = async () => {
    if (importSaveSessionRef.current !== null || !mountedRef.current) return;
    const validRows = importData.filter(row => row.rowErrors.length === 0);
    if (validRows.length === 0) return;

    const session = ++importSaveGenerationRef.current;
    importSaveSessionRef.current = session;
    setImportSaving(true);

    const modulesToCreate = validRows.map(row => ({
      moduleName: row.moduleName,
      testType: row.testType,
      sortOrder: row.sortOrder,
    }));

    try {
      if (session !== importSaveSessionRef.current || !mountedRef.current) return;
      await api.batchCreateTestModules(modulesToCreate);
      if (mountedRef.current) {
        message.success(`成功导入 ${validRows.length} 个模块`);
        setImportModalVisible(false);
        await loadModules();
      }
    } catch (error) {
      if (session === importSaveSessionRef.current && mountedRef.current) {
        const errorMessage = error instanceof Error ? error.message : '批量导入失败';
        message.error(errorMessage);
      }
    } finally {
      if (mountedRef.current && session === importSaveSessionRef.current) {
        importSaveSessionRef.current = null;
        setImportSaving(false);
      }
    }
  };

  const handleImportCancel = () => {
    if (importSaveSessionRef.current !== null) return;
    resetImportPreview();
    setImportModalVisible(false);
  };

  const removeImportRow = (index: number) => {
    setImportData(prev => prev.filter((_, i) => i !== index));
  };

  const hasImportErrors = importData.some(row => row.rowErrors.length > 0);

  // ---- import columns ----
  const importColumns = [
    { title: '序号', key: 'index', width: 60, render: (_: unknown, __: unknown, index: number) => index + 1 },
    { title: '模块名称', dataIndex: 'moduleName', key: 'moduleName' },
    { title: '所属小组', dataIndex: 'testType', key: 'testType' },
    { title: '排序', dataIndex: 'sortOrder', key: 'sortOrder' },
    {
      title: '错误信息', key: 'errors',
      render: (_: unknown, row: ModuleImportRow) => (
        <span style={{ color: '#ff4d4f', fontSize: 12 }}>
          {row.rowErrors.join('；')}
        </span>
      ),
    },
    {
      title: '操作', key: 'action',
      render: (_: unknown, __: ModuleImportRow, index: number) => (
        <Button
          type="link"
          danger
          size="small"
          disabled={importSaving}
          onClick={() => removeImportRow(index)}
        >
          移除
        </Button>
      ),
    },
  ];

  // ---- existing columns ----
  const columns = [
    { title: '模块名称', dataIndex: 'moduleName', key: 'moduleName' },
    { title: '所属小组', dataIndex: 'testType', key: 'testType' },
    {
      title: '启用状态', dataIndex: 'enabled', key: 'enabled',
      render: (_enabled: boolean, module: TestModule) => (
        <Space>
          <Switch
            checked={module.enabled}
            loading={pendingMutationIds.has(module.id)}
            disabled={pendingMutationIds.has(module.id)}
            aria-label={`${module.moduleName}启用状态`}
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
              disabled={savePending || pendingMutationIds.has(module.id)}
              onClick={() => openEdit(module)}
            />
          </Tooltip>
          {!module.referenced && (
            <Popconfirm
              title="确定删除此特殊模块吗？"
              okText="确定"
              cancelText="取消"
              onConfirm={() => deleteModule(module)}
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
                title="删除模块"
                aria-label={`删除${module.moduleName}`}
                loading={pendingMutationIds.has(module.id)}
                disabled={pendingMutationIds.has(module.id)}
              />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8 }}>
        <Button icon={<UploadOutlined />} onClick={openImportModal} disabled={savePending}>
          导入模块
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} disabled={savePending}>
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
        loading={loading && modules.length === 0}
        scroll={{ x: 850 }}
        locale={{ emptyText: loadError ? '加载失败' : '暂无特殊模块配置' }}
      />
      <Modal
        title={editingModule ? '编辑特殊模块' : '新增特殊模块'}
        open={modalOpen}
        onCancel={() => {
          if (!savePendingRef.current) setModalOpen(false);
        }}
        maskClosable={!savePending}
        keyboard={!savePending}
        closable={!savePending}
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
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={savePending} disabled={savePending}>保存</Button>
              <Button onClick={() => setModalOpen(false)} disabled={savePending}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* ---- 导入特殊模块 Modal ---- */}
      <Modal
        title="导入特殊模块"
        open={importModalVisible}
        onCancel={handleImportCancel}
        maskClosable={!importSaving}
        keyboard={!importSaving}
        closable={!importSaving}
        width={importStep === 2 ? 800 : 480}
        footer={
          importStep === 1
            ? [
                <Button key="cancel" onClick={handleImportCancel} disabled={importLoading}>
                  取消
                </Button>,
                <Button
                  key="next"
                  type="primary"
                  loading={importLoading}
                  disabled={!selectedFile || importLoading}
                  onClick={processImport}
                >
                  下一步
                </Button>,
              ]
            : [
                <Button
                  key="back"
                  onClick={() => { setImportStep(1); resetImportPreview(); }}
                  disabled={importSaving}
                >
                  返回重新选择
                </Button>,
                <Button key="cancel" onClick={handleImportCancel} disabled={importSaving}>
                  取消
                </Button>,
                <Button
                  key="confirm"
                  type="primary"
                  loading={importSaving}
                  disabled={importSaving || importData.length === 0 || hasImportErrors}
                  onClick={handleImportConfirm}
                >
                  确认导入 ({importData.filter(r => r.rowErrors.length === 0).length})
                </Button>,
              ]
        }
      >
        {importStep === 1 ? (
          <div>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <span>
                  请先下载模板，按格式填写后上传文件。支持 .xlsx / .xls 格式，
                  最大 {MODULE_IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB，
                  最多 {MODULE_IMPORT_MAX_ROWS} 行。
                </span>
              }
            />
            <div style={{ marginBottom: 16 }}>
              <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
                下载导入模板
              </Button>
            </div>
            <Upload
              key={importUploadKey}
              accept=".xlsx,.xls"
              maxCount={1}
              beforeUpload={() => false}
              onChange={handleFileChange}
              fileList={selectedFile ? [{ uid: '-1', name: selectedFile.name } as any] : []}
              onRemove={() => { resetImportPreview(); }}
            >
              <Button icon={<UploadOutlined />} loading={importLoading}>选择文件</Button>
            </Upload>
            {selectedFile && (
              <div style={{ marginTop: 8, color: '#888' }}>
                已选择：{selectedFile.name}（{(selectedFile.size / 1024).toFixed(1)} KB）
              </div>
            )}
          </div>
        ) : (
          <div>
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`共解析 ${importData.length} 行数据，其中 ${importData.filter(r => r.rowErrors.length > 0).length} 行有错误。请修正或移除错误行后确认导入。`}
            />
            <Table
              columns={importColumns}
              dataSource={importData}
              rowKey={(_, index) => String(index)}
              size="small"
              bordered
              scroll={{ x: 700, y: 300 }}
              rowClassName={(row: ModuleImportRow) =>
                row.rowErrors.length > 0 ? 'module-import-error-row' : ''
              }
              pagination={false}
            />
            <style>{'.module-import-error-row { background-color: #fff1f0; } .module-import-error-row:hover > td { background-color: #ffe7e7 !important; }'}</style>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TestModuleConfigPanel;
