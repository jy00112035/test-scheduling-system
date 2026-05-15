import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Select,
  Form,
  Modal,
  message,
  Popconfirm,
  Tag,
  InputNumber,
  Upload,
  Alert,
  Tooltip,
  Switch,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUserRole } from '../context/UserRoleContext';

const { Option } = Select;

interface Staff {
  id: number;
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: 'active' | 'leave' | 'resigned';
  role?: string;
  familiarModules?: string;
  confidentialClearance?: boolean;
}

interface FieldConfig {
  id: number;
  fieldName: string;
  fieldType: 'select' | 'input' | 'textArea';
  options: string;
  description: string;
  required: boolean;
  sortOrder: number;
}

interface ImportRow {
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: 'active';
  roles: string[];
  familiarModules: string;
  confidentialClearance: boolean;
}

const roleMapping: Record<string, string> = {
  '测试经理': 'testManager',
  '资源主管': 'resourceManager',
  '项目经理': 'projectManager',
  '测试执行人员': 'testExecutor',
  '字段管理员': 'fieldAdmin',
  '测试组长': 'testLead',
};

const roleLabels: Record<string, string> = {
  testManager: '测试经理',
  resourceManager: '资源主管',
  projectManager: '项目经理',
  testExecutor: '测试执行人员',
  fieldAdmin: '字段管理员',
  testLead: '测试组长',
};

const StaffManagement: React.FC = () => {
  const { user } = useAuth();
  const { hasRole } = useUserRole();
  const isTestLead = hasRole('testLead');

  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [duplicateEmps, setDuplicateEmps] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    fetchStaffs();
    fetchFieldConfigs();
  }, []);

  const fetchStaffs = async () => {
    setLoading(true);
    try {
      const data = await api.getStaff();
      setStaffs(data);
    } catch (error: any) {
      message.error(error.message || '获取人员列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchFieldConfigs = async () => {
    try {
      const configs = await api.getFieldConfigs();
      setFieldConfigs(configs);
    } catch (error) {
      console.error('获取字段配置失败', error);
    }
  };

  const getFieldConfig = (fieldName: string) => {
    return fieldConfigs.find(c => c.fieldName === fieldName);
  };

  const getSelectOptions = (fieldName: string) => {
    const config = getFieldConfig(fieldName);
    if (config && config.options) {
      return config.options.split(',').filter(o => o.trim());
    }
    return [];
  };

  // 打开导入弹窗
  const openImportModal = () => {
    setImportStep(1);
    setImportData([]);
    setDuplicateEmps([]);
    setSelectedFile(null);
    setImportModalVisible(true);
  };

  // 下载导入模板
  const downloadTemplate = () => {
    const template = '工号,姓名,入职日期,所属项目,测试类型,初始系数,当前系数,角色,熟悉模块,保密权限\nEMP001,张三,2024-01-01,功能测试组,功能测试,0.3,0.3,测试执行人员;测试组长,登录模块;支付模块,是\nEMP002,李四,2024-01-15,自动化测试组,自动化测试,0.5,0.5,测试经理,自动化框架,否';
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = '人员导入模板.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // 处理文件选择
  const handleFileChange = (info: any) => {
    const file = info.file.originFileObj || info.file;
    if (file) {
      setSelectedFile(file);
    }
  };

  // 处理导入确认
  const processImport = async () => {
    if (!selectedFile) {
      message.error('请选择要导入的文件');
      return;
    }

    setImportLoading(true);
    setDuplicateEmps([]);
    setImportData([]);

    try {
      // 获取最新人员数据
      const latestStaffs = await api.getStaff();

      // 使用 xlsx 解析 Excel 文件
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (jsonData.length === 0) {
            message.error('Excel文件为空或格式错误');
            setImportLoading(false);
            return;
          }

          // 获取表头
          const headers = Object.keys(jsonData[0] as object);

          const empNoKey = headers.find(h => h === '工号' || h === 'empNo');
          const nameKey = headers.find(h => h === '姓名' || h === 'name');
          const joinDateKey = headers.find(h => h === '入职日期' || h === 'joinDate');
          const groupNameKey = headers.find(h => h === '所属项目' || h === 'groupName');
          const testTypeKey = headers.find(h => h === '测试类型' || h === 'testType');
          const initialCoefKey = headers.find(h => h === '初始系数' || h === 'initialCoefficient');
          const currentCoefKey = headers.find(h => h === '当前系数' || h === 'currentCoefficient');
          const roleKey = headers.find(h => h === '角色' || h === 'role');
          const familiarModulesKey = headers.find(h => h === '熟悉模块' || h === 'familiarModules');
          const confidentialClearanceKey = headers.find(h => h === '保密权限' || h === 'confidentialClearance');

          if (!empNoKey || !nameKey) {
            message.error(`Excel文件缺少必要列：工号、姓名。当前表头：${headers.join(', ')}`);
            setImportLoading(false);
            return;
          }

          // 解析数据
          const parsedData: ImportRow[] = [];
          const empNoSet = new Set<string>();

          for (const row of jsonData) {
            const rowObj = row as Record<string, any>;
            const empNo = String(rowObj[empNoKey] || '').trim();

            if (!empNo) continue;

            // 检查是否与已有数据重复
            if (latestStaffs.some((s: Staff) => s.empNo === empNo)) {
              empNoSet.add(empNo);
            }

            // 检查本次导入数据中是否重复
            if (parsedData.some(p => p.empNo === empNo)) {
              empNoSet.add(empNo);
            }

            // 处理日期格式
            let joinDate = rowObj[joinDateKey] || dayjs().format('YYYY-MM-DD');
            if (typeof joinDate === 'number') {
              // Excel 日期序列号转换
              joinDate = dayjs((joinDate - 25569) * 86400 * 1000).format('YYYY-MM-DD');
            } else if (typeof joinDate === 'string') {
              joinDate = dayjs(joinDate).format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD');
            }

            const rawRole = String(rowObj[roleKey] || '').trim();
            const roles: string[] = rawRole
              ? rawRole.split(';').map(r => roleMapping[r.trim()] || r.trim())
              : ['testExecutor'];

            const rowData: ImportRow = {
              name: String(rowObj[nameKey] || '').trim(),
              empNo: empNo,
              joinDate: joinDate,
              groupName: String(rowObj[groupNameKey] || '').trim(),
              testType: String(rowObj[testTypeKey] || '').trim() || undefined,
              initialCoefficient: parseFloat(String(rowObj[initialCoefKey] || '0.3')) || 0.3,
              currentCoefficient: parseFloat(String(rowObj[currentCoefKey] || '0.3')) || 0.3,
              status: 'active',
              roles,
              familiarModules: String(rowObj[familiarModulesKey] || '').trim(),
              confidentialClearance: ['是', 'true', '有', 'yes'].includes(String(rowObj[confidentialClearanceKey] || '').trim()),
            };
            parsedData.push(rowData);
          }

          if (empNoSet.size > 0) {
            setDuplicateEmps(Array.from(empNoSet));
            setImportData([]);
            setImportStep(2);
            setImportLoading(false);
            return;
          }

          setImportData(parsedData);
          setImportStep(2);
          setImportLoading(false);
        } catch (error) {
          console.error('解析Excel失败', error);
          message.error('解析Excel文件失败');
          setImportLoading(false);
        }
      };

      reader.readAsArrayBuffer(selectedFile);
    } catch (error) {
      message.error('获取人员数据失败');
      setImportLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    if (importData.length === 0) {
      message.error('没有可导入的数据');
      return;
    }

    setImportLoading(true);
    try {
      for (const row of importData) {
        await api.createStaff(row);
      }
      await syncFieldConfigs(importData);
      await fetchFieldConfigs();
      message.success(`成功导入 ${importData.length} 条人员数据`);
      setImportModalVisible(false);
      setImportData([]);
      fetchStaffs();
    } catch (error: any) {
      message.error(error.message || '导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImportCancel = () => {
    setImportModalVisible(false);
    setImportData([]);
    setDuplicateEmps([]);
    message.warning('已取消本次导入');
  };

  const handleAdd = () => {
    setEditingStaff(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = async (record: Staff) => {
    setEditingStaff(record);
    try {
      const roles = await api.getStaffRolesByEmpNo(record.empNo);
      form.setFieldsValue({
        ...record,
        joinDate: dayjs(record.joinDate),
        roles: roles && roles.length > 0 ? roles : ['testExecutor'],
        familiarModules: record.familiarModules || '',
        confidentialClearance: record.confidentialClearance || false,
      });
    } catch {
      form.setFieldsValue({
        ...record,
        joinDate: dayjs(record.joinDate),
        roles: ['testExecutor'],
        familiarModules: record.familiarModules || '',
        confidentialClearance: record.confidentialClearance || false,
      });
    }
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteStaff(id);
      setStaffs(staffs.filter(s => s.id !== id));
      message.success('人员信息已删除');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  const handleBatchDelete = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要删除的人员');
      return;
    }
    Modal.confirm({
      title: '确认批量删除',
      content: `确定要删除选中的 ${selectedRowKeys.length} 条人员数据吗？此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteStaffsBatch(selectedRowKeys as number[]);
          setStaffs(staffs.filter(s => !selectedRowKeys.includes(s.id)));
          setSelectedRowKeys([]);
          message.success(`成功删除 ${selectedRowKeys.length} 条人员数据`);
        } catch (error: any) {
          message.error(error.message || '批量删除失败');
        }
      },
    });
  };

  const syncFieldConfigs = async (rows: { groupName?: string; testType?: string }[]) => {
    const configs = await api.getFieldConfigs();
    const newGroupNames = [...new Set(rows.map(r => r.groupName).filter(Boolean))];
    const newTestTypes = [...new Set(rows.map(r => r.testType).filter(Boolean))];

    for (const config of configs) {
      const currentOptions = config.options ? config.options.split(',').filter((o: string) => o.trim()) : [];
      let newOptions: string[] | null = null;

      if (config.fieldName === 'groupName') {
        const merged = [...currentOptions];
        for (const name of newGroupNames) {
          if (!merged.includes(name)) merged.push(name);
        }
        if (merged.length > currentOptions.length) newOptions = merged;
      } else if (config.fieldName === 'testType') {
        const merged = [...currentOptions];
        for (const type of newTestTypes) {
          if (!merged.includes(type)) merged.push(type);
        }
        if (merged.length > currentOptions.length) newOptions = merged;
      }

      if (newOptions) {
        await api.updateFieldConfig(config.id, {
          ...config,
          options: newOptions.join(','),
        });
      }
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const staffData = {
        ...values,
        joinDate: values.joinDate.format('YYYY-MM-DD'),
        role: values.roles?.[0] || 'testExecutor',
        familiarModules: values.familiarModules || '',
        confidentialClearance: values.confidentialClearance || false,
      };

      if (editingStaff) {
        await api.updateStaff(editingStaff.id, staffData);
        message.success('人员信息已更新');
      } else {
        await api.createStaff(staffData);
        await syncFieldConfigs([staffData]);
        await fetchFieldConfigs();
        message.success('人员已添加，初始登录密码为 12345678');
      }

      setIsModalVisible(false);
      fetchStaffs();
    } catch (error: any) {
      message.error(error.message || '操作失败');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'leave':
        return 'warning';
      case 'resigned':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return '在职';
      case 'leave':
        return '休假';
      case 'resigned':
        return '离职';
      default:
        return status;
    }
  };

  const filteredStaffs = staffs.filter(staff =>
    staff.name.toLowerCase().includes(searchText.toLowerCase()) ||
    staff.empNo.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '工号',
      dataIndex: 'empNo',
      key: 'empNo',
      width: 100,
    },
    {
      title: '入职日期',
      dataIndex: 'joinDate',
      key: 'joinDate',
      width: 120,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD'),
    },
    {
      title: '所属项目',
      dataIndex: 'groupName',
      key: 'groupName',
      width: 120,
    },
    {
      title: '测试类型',
      dataIndex: 'testType',
      key: 'testType',
      width: 120,
      render: (testType: string) => testType || '-',
    },
    {
      title: '初始系数',
      dataIndex: 'initialCoefficient',
      key: 'initialCoefficient',
      width: 100,
      render: (value: number) => value?.toFixed(2) || '-',
    },
    {
      title: '当前系数',
      dataIndex: 'currentCoefficient',
      key: 'currentCoefficient',
      width: 100,
      render: (value: number) => (
        <Tag color={value === 1 ? 'green' : 'orange'}>
          {value?.toFixed(2) || '-'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {getStatusText(status)}
        </Tag>
      ),
    },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      width: 200,
      render: (_roles: string[], record: any) => {
        const displayRoles = _roles && _roles.length > 0 ? _roles : (record.role ? [record.role] : []);
        if (displayRoles.length === 0) return '-';
        return (
          <Space wrap size={[0, 2]}>
            {displayRoles.map((r: string) => (
              <Tag key={r} color="blue">{roleLabels[r] || r}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '保密权限',
      dataIndex: 'confidentialClearance',
      key: 'confidentialClearance',
      width: 80,
      render: (val: boolean) => (
        <Tag color={val ? 'red' : 'default'}>{val ? '有' : '无'}</Tag>
      ),
    },
    {
      title: '熟悉模块',
      dataIndex: 'familiarModules',
      key: 'familiarModules',
      width: 150,
      render: (text: string) => text ? (
        <Tooltip title={text}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {text}
          </div>
        </Tooltip>
      ) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Staff) => (
        <Space size="small">
          {(!isTestLead || (user?.testType && record.testType === user.testType)) && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          )}
          {!isTestLead && (
            <Popconfirm
              title="确定删除此人员？"
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
      ),
    },
  ];

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 96px)' }}>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8, position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 8, paddingBottom: 8 }}>
          {!isTestLead && selectedRowKeys.length > 0 && (
            <Popconfirm
              title={`确定删除选中的 ${selectedRowKeys.length} 条人员数据？`}
              onConfirm={handleBatchDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                批量删除 ({selectedRowKeys.length})
              </Button>
            </Popconfirm>
          )}
          <Input.Search
            placeholder="搜索姓名或工号"
            onSearch={setSearchText}
            style={{ width: 250 }}
            allowClear
          />
          {!isTestLead && (
            <Upload
              showUploadList={false}
              accept=".xlsx,.xls"
              beforeUpload={() => false}
              onChange={handleFileChange}
            >
              <Button icon={<UploadOutlined />} onClick={openImportModal}>
                导入人员
              </Button>
            </Upload>
          )}
          {!isTestLead && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
            >
              添加人员
            </Button>
          )}
        </div>

        <Table
          columns={columns}
          dataSource={filteredStaffs}
          rowKey="id"
          bordered
          sticky={{ offsetHeader: 48 }}
          loading={loading}
          rowSelection={isTestLead ? undefined : {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            pageSizeOptions: ['10', '20', '50', '100'],
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
            onShowSizeChange: (current, size) => {
              setPagination({ current: 1, pageSize: size });
            },
          }}
        />
      </Card>

      <Modal
        title={editingStaff ? '编辑人员' : '添加人员'}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 18 }}
          onFinish={handleSubmit}
          initialValues={{
            initialCoefficient: 0.3,
            currentCoefficient: 0.3,
            status: 'active',
          }}
        >
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>

          <Form.Item
            name="empNo"
            label="工号"
            rules={[{ required: true, message: '请输入工号' }]}
          >
            <Input placeholder="请输入工号" />
          </Form.Item>

          <Form.Item
            name="joinDate"
            label="入职日期"
            rules={[{ required: true, message: '请选择入职日期' }]}
          >
            <Input type="date" />
          </Form.Item>

          <Form.Item
            name="groupName"
            label="所属项目"
            rules={[{ required: true, message: '请选择所属项目' }]}
          >
            <Select placeholder="请选择所属项目">
              {getSelectOptions('groupName').map((option, index) => (
                <Option key={index} value={option}>{option}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="testType"
            label="测试类型"
          >
            <Select placeholder="请选择测试类型" allowClear>
              {getSelectOptions('testType').map((option, index) => (
                <Option key={index} value={option}>{option}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="initialCoefficient"
            label="初始系数"
            rules={[{ required: true, message: '请输入初始系数' }]}
          >
            <InputNumber
              min={0}
              max={1}
              step={0.1}
              style={{ width: '100%' }}
              placeholder="请输入初始系数"
            />
          </Form.Item>

          <Form.Item
            name="currentCoefficient"
            label="当前系数"
            rules={[{ required: true, message: '请输入当前系数' }]}
          >
            <InputNumber
              min={0}
              max={1}
              step={0.1}
              style={{ width: '100%' }}
              placeholder="请输入当前系数"
            />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select placeholder="请选择状态">
              <Option value="active">在职</Option>
              <Option value="leave">休假</Option>
              <Option value="resigned">离职</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="roles"
            label="角色"
            rules={[{ required: true, message: '请选择至少一个角色' }]}
          >
            <Select mode="multiple" placeholder="请选择角色（可多选）">
              <Option value="testManager">测试经理</Option>
              <Option value="testLead">测试组长</Option>
              <Option value="resourceManager">资源主管</Option>
              <Option value="projectManager">项目经理</Option>
              <Option value="testExecutor">测试执行人员</Option>
              <Option value="fieldAdmin">字段管理员</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="familiarModules"
            label="熟悉模块"
          >
            <Input.TextArea rows={2} placeholder="请输入熟悉的模块" />
          </Form.Item>

          <Form.Item
            name="confidentialClearance"
            label="保密权限"
            valuePropName="checked"
          >
            <Switch checkedChildren="有" unCheckedChildren="无" />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<SaveOutlined />}
              >
                保存
              </Button>
              <Button onClick={() => setIsModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入弹窗 */}
      <Modal
        title="导入人员"
        open={importModalVisible}
        onCancel={handleImportCancel}
        footer={null}
        width={600}
        destroyOnClose
      >
        {importStep === 1 ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={downloadTemplate}
                style={{ marginBottom: 16 }}
              >
                下载导入模板
              </Button>
              <Alert
                message="提示：Excel文件需要包含表头，支持的列有：工号、姓名、入职日期、所属项目、测试类型、初始系数、当前系数、角色"
                type="info"
                showIcon
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ marginRight: 8 }}>选择文件：</span>
              <Upload
                showUploadList={true}
                accept=".xlsx,.xls"
                beforeUpload={() => false}
                onChange={handleFileChange}
                fileList={selectedFile ? [{ uid: '-1', name: selectedFile.name, status: 'done', originFileObj: selectedFile }] : []}
              >
                <Button icon={<UploadOutlined />}>选择Excel文件</Button>
              </Upload>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleImportCancel}>取消</Button>
                <Button type="primary" onClick={processImport} loading={importLoading} disabled={!selectedFile}>
                  确定
                </Button>
              </Space>
            </div>
          </div>
        ) : duplicateEmps.length > 0 ? (
          <div>
            <Alert
              message="检测到重复工号"
              description={
                <div>
                  <p>以下工号已存在，取消本次导入：</p>
                  <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                    {duplicateEmps.map(emp => (
                      <li key={emp} style={{ color: '#ff4d4f' }}>{emp}</li>
                    ))}
                  </ul>
                </div>
              }
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Button type="primary" onClick={handleImportCancel}>
              关闭
            </Button>
          </div>
        ) : (
          <div>
            <Alert
              message={`准备导入 ${importData.length} 条人员数据`}
              description="请确认以下数据无误后点击确认导入"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Table
              dataSource={importData}
              rowKey="empNo"
              pagination={false}
              scroll={{ y: 300 }}
              size="small"
              columns={[
                { title: '工号', dataIndex: 'empNo', key: 'empNo', width: 100 },
                { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
                { title: '所属项目', dataIndex: 'groupName', key: 'groupName', width: 120 },
                { title: '测试类型', dataIndex: 'testType', key: 'testType', width: 100 },
                { title: '初始系数', dataIndex: 'initialCoefficient', key: 'initialCoefficient', width: 80 },
                { title: '当前系数', dataIndex: 'currentCoefficient', key: 'currentCoefficient', width: 80 },
                { title: '角色', dataIndex: 'roles', key: 'roles', width: 120,
                  render: (roles: string[]) => {
                    if (!roles || roles.length === 0) return '-';
                    return roles.map(r => roleLabels[r] || r).join('; ');
                  },
                },
                { title: '熟悉模块', dataIndex: 'familiarModules', key: 'familiarModules', width: 150,
                  render: (text: string) => text || '-',
                },
                { title: '保密权限', dataIndex: 'confidentialClearance', key: 'confidentialClearance', width: 80,
                  render: (val: boolean) => val ? '是' : '否',
                },
              ]}
            />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button onClick={handleImportCancel}>取消</Button>
                <Button type="primary" onClick={handleImportConfirm} loading={importLoading}>
                  确认导入
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StaffManagement;
