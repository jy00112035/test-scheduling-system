import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Switch,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
  ExportOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useUserRole } from '../context/UserRoleContext';
import type { FamiliarModule, TestModule } from '../types';
import { createFamiliarModuleNameIndex, parseFamiliarModuleNames } from '../utils/staffModuleImport';
import {
  buildStaffExportRows,
  classifyStaffImportLimits,
  createStaffImportTemplateWorkbook,
  parseStaffRoles,
  parseStaffStatus,
  STAFF_IMPORT_MAX_FILE_SIZE,
  STAFF_IMPORT_MAX_ROWS,
  STAFF_IMPORT_TEMPLATE_FILENAME,
} from '../utils/staffSpreadsheet';
import {
  canAssignStaffRoles,
  canChangeStaffRoles,
  canCreateStaff,
  canDeleteStaff,
  canEditStaff,
  getStaffRoleOptions,
  getStaffTargetRoles,
} from '../utils/staffRolePolicy';

const { Option, OptGroup } = Select;

interface Staff {
  id: number;
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
  officeLocation?: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: 'active' | 'leave' | 'resigned';
  role?: string;
  roles?: string[];
  familiarModules?: FamiliarModule[];
  hasStructuredFamiliarModules?: boolean;
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
  officeLocation?: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: 'active' | 'leave' | 'resigned';
  roles: string[];
  familiarModuleIds: number[];
  familiarModuleNames: string;
  unmatchedModules: string[];
  unavailableModules: string[];
  rowErrors: string[];
  retryError?: string;
  confidentialClearance: boolean;
}

function parseImportCoefficient(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === '') return 0.3;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? 0.3 : parsed;
}

function normalizeFamiliarModules(familiarModules?: unknown): FamiliarModule[] {
  return Array.isArray(familiarModules) ? familiarModules : [];
}

function renderFamiliarModules(familiarModules?: FamiliarModule[]) {
  if (familiarModules && familiarModules.length > 0) {
    return (
      <Space wrap size={[0, 2]}>
        {familiarModules.map(module => (
          <Tag key={module.id} color={module.enabled ? 'blue' : 'default'}>
            {module.testType}: {module.moduleName}{!module.enabled && ' (已停用)'}
          </Tag>
        ))}
      </Space>
    );
  }
  return '-';
}

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
  const { roles } = useUserRole();
  const canCreate = canCreateStaff(roles);

  const [staffs, setStaffs] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingStaffRoles, setEditingStaffRoles] = useState<string[]>([]);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [fieldConfigs, setFieldConfigs] = useState<FieldConfig[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2>(1);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [duplicateEmps, setDuplicateEmps] = useState<string[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importUploadKey, setImportUploadKey] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const mountedRef = useRef(true);
  const moduleLoadGenerationRef = useRef(0);
  const editSessionRef = useRef(0);
  const importGenerationRef = useRef(0);
  const importReaderRef = useRef<FileReader | null>(null);
  const staffSaveSessionRef = useRef<number | null>(null);
  const importSaveGenerationRef = useRef(0);
  const importSaveSessionRef = useRef<number | null>(null);
  const familiarModuleEditRef = useRef({ session: 0, initialized: false, changed: false, isCreate: false });
  const selectedFamiliarModuleIds = Form.useWatch('familiarModuleIds', form) || [];
  const staffRoleOptions = useMemo(
    () => getStaffRoleOptions(roles, editingStaffRoles),
    [roles, editingStaffRoles],
  );

  useEffect(() => {
    mountedRef.current = true;
    fetchStaffs();
    fetchFieldConfigs();
    void fetchModules();
    return () => {
      mountedRef.current = false;
      moduleLoadGenerationRef.current += 1;
      editSessionRef.current += 1;
      importGenerationRef.current += 1;
      importSaveGenerationRef.current += 1;
      importReaderRef.current?.abort();
      importReaderRef.current = null;
      staffSaveSessionRef.current = null;
      importSaveSessionRef.current = null;
    };
  }, []);

  const fetchModules = async () => {
    const generation = ++moduleLoadGenerationRef.current;
    if (mountedRef.current) {
      setModulesLoading(true);
    }
    try {
      const moduleList = await api.getTestModules();
      if (mountedRef.current && generation === moduleLoadGenerationRef.current) {
        setModules(moduleList);
        setModulesError(null);
      }
    } catch (error: any) {
      if (mountedRef.current && generation === moduleLoadGenerationRef.current) {
        setModulesError(error.message || '模块配置加载失败');
      }
    } finally {
      if (mountedRef.current && generation === moduleLoadGenerationRef.current) {
        setModulesLoading(false);
      }
    }
  };

  const modulesById = useMemo(() => new Map(modules.map(module => [module.id, module])), [modules]);
  const groupedModules = useMemo(() => {
    const grouped = new Map<string, TestModule[]>();
    modules.forEach(module => {
      const group = grouped.get(module.testType) || [];
      group.push(module);
      grouped.set(module.testType, group);
    });
    return Array.from(grouped.entries());
  }, [modules]);

  const fetchStaffs = async () => {
    if (mountedRef.current) setLoading(true);
    try {
      const data = await api.getStaff();
      if (mountedRef.current) {
        setStaffs(data.map((staff: Staff & { familiarModules?: unknown }) => ({
          ...staff,
          familiarModules: normalizeFamiliarModules(staff.familiarModules),
          hasStructuredFamiliarModules: Array.isArray(staff.familiarModules),
        })));
      }
    } catch (error: any) {
      if (mountedRef.current) message.error(error.message || '获取人员列表失败');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const fetchFieldConfigs = async () => {
    try {
      const configs = await api.getFieldConfigs();
      if (mountedRef.current) setFieldConfigs(configs);
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

  const resetImportPreview = () => {
    if (importSaveSessionRef.current !== null) return;
    importGenerationRef.current += 1;
    importReaderRef.current?.abort();
    importReaderRef.current = null;
    setImportStep(1);
    setImportData([]);
    setDuplicateEmps([]);
    setSelectedFile(null);
    setImportLoading(false);
    setImportUploadKey(key => key + 1);
  };

  // 打开导入弹窗
  const openImportModal = () => {
    if (!canCreate) return;
    if (importSaveSessionRef.current !== null) return;
    resetImportPreview();
    setImportModalVisible(true);
  };

  // 下载导入模板
  const downloadTemplate = () => {
    XLSX.writeFile(createStaffImportTemplateWorkbook(), STAFF_IMPORT_TEMPLATE_FILENAME);
  };

  // 处理文件选择
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

  // 处理导入确认
  const processImport = async () => {
    if (importSaveSessionRef.current !== null) return;
    if (!selectedFile) {
      message.error('请选择要导入的文件');
      return;
    }
    if (classifyStaffImportLimits(selectedFile.size) === 'fileTooLarge') {
      message.error(`Excel文件不能超过 ${STAFF_IMPORT_MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }
    if (modulesLoading || modulesError) {
      message.error(modulesError || '模块配置仍在加载，暂不能解析熟悉模块');
      return;
    }

    const session = ++importGenerationRef.current;
    importReaderRef.current?.abort();
    importReaderRef.current = null;
    setImportLoading(true);
    setDuplicateEmps([]);
    setImportData([]);

    try {
      // 获取最新人员数据
      const latestStaffs = await api.getStaff();
      if (!mountedRef.current || session !== importGenerationRef.current) return;

      // 使用 xlsx 解析 Excel 文件
      const reader = new FileReader();
      importReaderRef.current = reader;
      reader.onload = (e) => {
        if (!mountedRef.current || session !== importGenerationRef.current) return;
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array', sheetRows: STAFF_IMPORT_MAX_ROWS + 2 });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

          if (classifyStaffImportLimits(selectedFile.size, jsonData.length) === 'tooManyRows') {
            message.error(`Excel文件最多导入 ${STAFF_IMPORT_MAX_ROWS} 行数据`);
            setImportLoading(false);
            if (importReaderRef.current === reader) importReaderRef.current = null;
            return;
          }

          if (jsonData.length === 0) {
            message.error('Excel文件为空或格式错误');
            setImportLoading(false);
            if (importReaderRef.current === reader) importReaderRef.current = null;
            return;
          }

          // 获取表头
          const headers = Object.keys(jsonData[0] as object);

          const empNoKey = headers.find(h => h === '工号' || h === 'empNo');
          const nameKey = headers.find(h => h === '姓名' || h === 'name');
          const joinDateKey = headers.find(h => h === '入职日期' || h === 'joinDate');
          const groupNameKey = headers.find(h => h === '所属项目' || h === 'groupName');
          const officeLocationKey = headers.find(h => h === '办公地点' || h === 'officeLocation');
          const testTypeKey = headers.find(h => h === '测试类型' || h === 'testType');
          const initialCoefKey = headers.find(h => h === '初始系数' || h === 'initialCoefficient');
          const currentCoefKey = headers.find(h => h === '当前系数' || h === 'currentCoefficient');
          const roleKey = headers.find(h => h === '角色' || h === 'role');
          const familiarModulesKey = headers.find(h => h === '熟悉模块' || h === 'familiarModules');
          const confidentialClearanceKey = headers.find(h => h === '保密权限' || h === 'confidentialClearance');
          const statusKey = headers.find(h => h === '状态' || h === 'status');

          if (!empNoKey || !nameKey) {
            message.error(`Excel文件缺少必要列：工号、姓名。当前表头：${headers.join(', ')}`);
            setImportLoading(false);
            if (importReaderRef.current === reader) importReaderRef.current = null;
            return;
          }

          // 解析数据
          const parsedData: ImportRow[] = [];
          const moduleNameIndex = createFamiliarModuleNameIndex(modules);
          const empNoSet = new Set<string>();
          const importedEmpNos = new Set<string>();
          const existingEmpNos = new Set(latestStaffs.map((staff: Staff) => staff.empNo));

          for (const row of jsonData) {
            const rowObj = row as Record<string, any>;
            const empNo = String(rowObj[empNoKey] || '').trim();

            if (!empNo) continue;

            // 检查是否与已有数据重复
            if (existingEmpNos.has(empNo)) {
              empNoSet.add(empNo);
            }

            // 检查本次导入数据中是否重复
            if (importedEmpNos.has(empNo)) {
              empNoSet.add(empNo);
            }
            importedEmpNos.add(empNo);

            // 处理日期格式
            let joinDate = joinDateKey ? rowObj[joinDateKey] : dayjs().format('YYYY-MM-DD');
            if (joinDate instanceof Date) {
              // Excel Date 对象直接转换
              joinDate = dayjs(joinDate).format('YYYY-MM-DD');
            } else if (typeof joinDate === 'number') {
              // Excel 日期序列号转换
              joinDate = dayjs((joinDate - 25569) * 86400 * 1000).format('YYYY-MM-DD');
            } else if (typeof joinDate === 'string') {
              const parsed = dayjs(joinDate);
              joinDate = parsed.isValid() ? parsed.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
            } else if (joinDate == null) {
              joinDate = dayjs().format('YYYY-MM-DD');
            }

            const parsedRoles = parseStaffRoles(roleKey ? rowObj[roleKey] : 'testExecutor');
            const parsedStatus = parseStaffStatus(statusKey ? rowObj[statusKey] : 'active');
            const rowErrors = [
              ...parsedRoles.invalid.map(role => `无效角色：${role}`),
              ...(!canAssignStaffRoles(
                roles,
                parsedRoles.roles.length ? parsedRoles.roles : ['testExecutor'],
              ) ? ['无权分配导入人员角色'] : []),
              ...(parsedStatus.invalid ? [`无效状态：${rowObj[statusKey!]}`] : []),
            ];

            const rowData: ImportRow = {
              name: String(rowObj[nameKey!] || '').trim(),
              empNo: empNo,
              joinDate: joinDate,
              groupName: groupNameKey ? String(rowObj[groupNameKey] || '').trim() : '',
              officeLocation: officeLocationKey ? String(rowObj[officeLocationKey] || '').trim() || undefined : undefined,
              testType: testTypeKey ? String(rowObj[testTypeKey] || '').trim() || undefined : undefined,
              initialCoefficient: initialCoefKey ? parseImportCoefficient(rowObj[initialCoefKey]) : 0.3,
              currentCoefficient: currentCoefKey ? parseImportCoefficient(rowObj[currentCoefKey]) : 0.3,
              status: parsedStatus.status as ImportRow['status'],
              roles: parsedRoles.roles.length ? parsedRoles.roles : ['testExecutor'],
              ...(() => {
                const familiarModuleNames = familiarModulesKey ? String(rowObj[familiarModulesKey] || '').trim() : '';
                const parsedModules = parseFamiliarModuleNames(familiarModuleNames, moduleNameIndex);
                return {
                  familiarModuleIds: parsedModules.moduleIds,
                  familiarModuleNames,
                  unmatchedModules: parsedModules.unmatched,
                  unavailableModules: parsedModules.unavailable,
                  rowErrors,
                };
              })(),
              confidentialClearance: confidentialClearanceKey ? ['是', 'true', '有', 'yes'].includes(String(rowObj[confidentialClearanceKey] || '').trim()) : false,
            };
            parsedData.push(rowData);
          }

          if (empNoSet.size > 0) {
            setDuplicateEmps(Array.from(empNoSet));
            setImportData([]);
            setImportStep(2);
            setImportLoading(false);
            if (importReaderRef.current === reader) importReaderRef.current = null;
            return;
          }

          setImportData(parsedData);
          setImportStep(2);
          setImportLoading(false);
          if (importReaderRef.current === reader) importReaderRef.current = null;
        } catch (error) {
          if (!mountedRef.current || session !== importGenerationRef.current) return;
          console.error('解析Excel失败', error);
          message.error('解析Excel文件失败');
          setImportLoading(false);
          if (importReaderRef.current === reader) importReaderRef.current = null;
        }
      };
      reader.onerror = () => {
        if (!mountedRef.current || session !== importGenerationRef.current) return;
        message.error('读取Excel文件失败');
        setImportLoading(false);
        if (importReaderRef.current === reader) importReaderRef.current = null;
      };

      reader.readAsArrayBuffer(selectedFile);
    } catch (error) {
      if (!mountedRef.current || session !== importGenerationRef.current) return;
      message.error('获取人员数据失败');
      setImportLoading(false);
    }
  };

  const hasImportErrors = duplicateEmps.length > 0 || importData.some(row => (
    row.unmatchedModules.length > 0
    || row.unavailableModules.length > 0
    || row.rowErrors.length > 0
  ));

  const handleImportConfirm = async () => {
    if (importSaveSessionRef.current !== null) return;
    if (importData.length === 0) {
      message.error('没有可导入的数据');
      return;
    }
    if (hasImportErrors) {
      message.error('存在无法导入的人员，请移除或修正后重试');
      return;
    }

    const session = ++importSaveGenerationRef.current;
    const ownsImportSave = () => (
      mountedRef.current
      && importSaveSessionRef.current === session
      && importSaveGenerationRef.current === session
    );
    importSaveSessionRef.current = session;
    setImportSaving(true);
    setImportLoading(true);
    try {
      const retryableRows: ImportRow[] = [];
      const committedRows: ImportRow[] = [];
      let successCount = 0;
      for (let index = 0; index < importData.length; index += 1) {
        const row = importData[index];
        const { familiarModuleNames: _names, unmatchedModules: _unmatched, unavailableModules: _unavailable, rowErrors: _rowErrors, retryError: _retryError, ...staffData } = row;
        try {
          await api.createStaff(staffData);
          successCount += 1;
          committedRows.push(row);
        } catch (error: any) {
          retryableRows.push({ ...row, retryError: error.message || '导入失败' });
          retryableRows.push(...importData.slice(index + 1));
          break;
        }
        if (!ownsImportSave()) return;
      }
      if (committedRows.length > 0) {
        await fetchFieldConfigs();
        if (!ownsImportSave()) return;
        fetchStaffs();
      }
      if (retryableRows.length > 0) {
        if (!ownsImportSave()) return;
        setImportData(retryableRows);
        message.warning(`已成功导入 ${successCount} 条，${retryableRows.length} 条待重试`);
        return;
      }
      if (!ownsImportSave()) return;
      message.success(`成功导入 ${importData.length} 条人员数据`);
      setImportModalVisible(false);
      setImportData([]);
    } catch (error: any) {
      if (ownsImportSave()) {
        message.error(error.message || '导入失败');
      }
    } finally {
      if (importSaveSessionRef.current === session) {
        importSaveSessionRef.current = null;
        if (mountedRef.current) {
          setImportSaving(false);
          setImportLoading(false);
        }
      }
    }
  };

  const handleImportCancel = () => {
    if (importSaveSessionRef.current !== null) return;
    resetImportPreview();
    setImportModalVisible(false);
    message.warning('已取消本次导入');
  };

  const handleAdd = () => {
    if (!canCreate) return;
    if (staffSaveSessionRef.current !== null) return;
    const session = ++editSessionRef.current;
    familiarModuleEditRef.current = { session, initialized: true, changed: false, isCreate: true };
    setEditingStaff(null);
    setEditingStaffRoles([]);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = async (record: Staff) => {
    if (!canEditStaff(roles, user?.testType, record)) return;
    if (staffSaveSessionRef.current !== null) return;
    const session = ++editSessionRef.current;
    const familiarModuleIds = record.hasStructuredFamiliarModules === false
      ? undefined
      : (record.familiarModules || []).map(module => module.id);
    familiarModuleEditRef.current = {
      session,
      initialized: familiarModuleIds !== undefined,
      changed: false,
      isCreate: false,
    };
    const recordRoles = record.roles?.length || record.role
      ? getStaffTargetRoles(record)
      : null;
    const openEditor = (resolvedRoles: string[]) => {
      if (!mountedRef.current || session !== editSessionRef.current) return;
      form.setFieldsValue({
        ...record,
        joinDate: dayjs(record.joinDate),
        roles: resolvedRoles,
        familiarModuleIds,
        confidentialClearance: record.confidentialClearance || false,
      });
      setEditingStaffRoles(resolvedRoles);
      setEditingStaff(record);
      setIsModalVisible(true);
    };
    try {
      const loadedRoles = await api.getStaffRolesByEmpNo(record.empNo);
      const resolvedRoles = loadedRoles?.length ? loadedRoles : recordRoles;
      if (!resolvedRoles) {
        if (mountedRef.current && session === editSessionRef.current) {
          message.error('人员角色加载失败，请重试');
        }
        return;
      }
      openEditor(resolvedRoles);
    } catch {
      if (!mountedRef.current || session !== editSessionRef.current) return;
      if (!recordRoles) {
        message.error('人员角色加载失败，请重试');
        return;
      }
      openEditor(recordRoles);
    }
  };

  const closeStaffModal = (force = false) => {
    if (staffSaveSessionRef.current !== null && !force) return;
    editSessionRef.current += 1;
    familiarModuleEditRef.current = { session: editSessionRef.current, initialized: false, changed: false, isCreate: false };
    setEditingStaff(null);
    setEditingStaffRoles([]);
    form.resetFields();
    setIsModalVisible(false);
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

  const handleSubmit = async (values: any) => {
    if (staffSaveSessionRef.current !== null) return;
    const session = editSessionRef.current;
    const ownsStaffSave = () => (
      mountedRef.current
      && staffSaveSessionRef.current === session
      && editSessionRef.current === session
    );
    staffSaveSessionRef.current = session;
    setStaffSaving(true);
    try {
      const { familiarModuleIds, ...staffValues } = values;
      const staffData = {
        ...staffValues,
        joinDate: dayjs(values.joinDate).format('YYYY-MM-DD'),
        confidentialClearance: values.confidentialClearance || false,
      } as Record<string, unknown>;
      const familiarModuleEdit = familiarModuleEditRef.current;
      if (!editingStaff || familiarModuleEdit.initialized || familiarModuleEdit.changed) {
        staffData.familiarModuleIds = familiarModuleIds || [];
      }

      if (editingStaff) {
        await api.updateStaff(editingStaff.id, staffData);
        if (!ownsStaffSave()) return;
        await fetchFieldConfigs();
        if (!ownsStaffSave()) return;
        message.success('人员信息已更新');
      } else {
        staffData.role = values.roles?.[0] || 'testExecutor';
        await api.createStaff(staffData);
        if (!ownsStaffSave()) return;
        await fetchFieldConfigs();
        if (!ownsStaffSave()) return;
        message.success('人员已添加，初始登录密码为 12345678');
      }

      if (!ownsStaffSave()) return;
      staffSaveSessionRef.current = null;
      setStaffSaving(false);
      closeStaffModal(true);
      fetchStaffs();
    } catch (error: any) {
      if (ownsStaffSave()) {
        message.error(error.message || '操作失败');
      }
    } finally {
      if (staffSaveSessionRef.current === session) {
        staffSaveSessionRef.current = null;
        if (mountedRef.current) {
          setStaffSaving(false);
        }
      }
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

  const exportStaffs = () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(buildStaffExportRows(filteredStaffs)),
      '人员数据',
    );
    XLSX.writeFile(workbook, `人员导出_${dayjs().format('YYYYMMDD')}.xlsx`);
  };

  const removeImportRow = (empNo: string) => {
    if (importSaveSessionRef.current !== null) return;
    setImportData(rows => rows.filter(row => row.empNo !== empNo));
  };

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
      title: '办公地点',
      dataIndex: 'officeLocation',
      key: 'officeLocation',
      width: 120,
      render: (value: string) => value || '-',
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
      render: (familiarModules: FamiliarModule[]) => renderFamiliarModules(familiarModules),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right' as const,
      render: (_: any, record: Staff) => (
        <Space size="small">
          {canEditStaff(roles, user?.testType, record) && (
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            >
              编辑
            </Button>
          )}
          {canDeleteStaff(roles, record) && (
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
        {modulesError && (
          <Alert
            type="warning"
            showIcon
            message={`熟悉模块不可用：${modulesError}`}
            action={<Button size="small" aria-label="重试" onClick={() => void fetchModules()}>重试</Button>}
            style={{ marginBottom: 16 }}
          />
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 8, position: 'sticky', top: 0, zIndex: 10, background: '#fff', paddingTop: 8, paddingBottom: 8 }}>
          {selectedRowKeys.length > 0 && (
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
          <Button icon={<ExportOutlined />} onClick={exportStaffs} aria-label="导出人员">
            导出人员
          </Button>
          {canCreate && (
            <Upload
              showUploadList={false}
              accept=".xlsx,.xls"
              beforeUpload={() => false}
              onChange={handleFileChange}
              disabled={modulesLoading || Boolean(modulesError)}
            >
              <Button icon={<UploadOutlined />} onClick={openImportModal} disabled={modulesLoading || Boolean(modulesError)}>
                导入人员
              </Button>
            </Upload>
          )}
          {canCreate && (
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
          scroll={{ x: 1600 }}
          loading={loading}
          rowSelection={canDeleteStaff(roles, { roles: ['testExecutor'] }) ? {
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            getCheckboxProps: record => ({ disabled: !canDeleteStaff(roles, record) }),
          } : undefined}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            pageSizeOptions: ['10', '20', '50', '100'],
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ current: page, pageSize });
            },
            onShowSizeChange: (_current, size) => {
              setPagination({ current: 1, pageSize: size });
            },
          }}
        />
      </Card>

      <Modal
        title={editingStaff ? '编辑人员' : '添加人员'}
        open={isModalVisible}
        onCancel={staffSaving ? undefined : () => closeStaffModal()}
        footer={null}
        width={600}
        confirmLoading={staffSaving}
        closable={!staffSaving}
        maskClosable={!staffSaving}
        keyboard={!staffSaving}
      >
        <Form
          form={form}
          layout="horizontal"
          labelCol={{ span: 6 }}
          wrapperCol={{ span: 18 }}
          onFinish={handleSubmit}
          onValuesChange={(changedValues) => {
            if (Object.prototype.hasOwnProperty.call(changedValues, 'familiarModuleIds')) {
              familiarModuleEditRef.current.changed = true;
            }
          }}
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
            name="officeLocation"
            label="办公地点"
            rules={[{ required: true, message: '请选择办公地点' }]}
          >
            <Select placeholder="请选择办公地点" allowClear>
              {getSelectOptions('officeLocation').map((option, index) => (
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
            <Select
              mode="multiple"
              placeholder="请选择角色（可多选）"
              disabled={Boolean(editingStaff) && !canChangeStaffRoles(roles)}
            >
              {staffRoleOptions.map(option => (
                <Option key={option.role} value={option.role} disabled={option.disabled}>
                  {roleLabels[option.role] || option.role}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="familiarModuleIds"
            label="熟悉模块"
          >
            <Select
              mode="multiple"
              placeholder={modulesError || '请选择熟悉模块'}
              loading={modulesLoading}
              disabled={modulesLoading || Boolean(modulesError)}
              optionLabelProp="label"
              tagRender={({ value, closable, onClose }) => {
                const module = modulesById.get(value as number);
                if (!module) return <Tag>{String(value)}</Tag>;
                return (
                  <Tag color={module.enabled ? 'blue' : 'default'}>
                    {module.testType}: {module.moduleName}{!module.enabled && ' (已停用)'}
                    {closable && (
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        aria-label={`移除${module.moduleName}`}
                        onMouseDown={event => event.preventDefault()}
                        onClick={onClose}
                        style={{ width: 16, minWidth: 16, height: 16, marginInlineStart: 2, padding: 0 }}
                      />
                    )}
                  </Tag>
                );
              }}
            >
              {groupedModules.map(([testType, moduleList]) => (
                <OptGroup key={testType} label={testType}>
                  {moduleList.map(module => (
                    <Option key={module.id} value={module.id} disabled={!module.enabled && !selectedFamiliarModuleIds.includes(module.id)} label={`${module.testType}: ${module.moduleName}${module.enabled ? '' : ' (已停用)'}`}>
                      <Space size={4}>
                        <span>{module.moduleName}</span>
                        {!module.enabled && <Typography.Text type="secondary">已停用</Typography.Text>}
                      </Space>
                    </Option>
                  ))}
                </OptGroup>
              ))}
            </Select>
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
                loading={staffSaving}
                disabled={staffSaving}
              >
                保存
              </Button>
              <Button onClick={() => closeStaffModal()} disabled={staffSaving}>
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
        onCancel={importSaving ? undefined : handleImportCancel}
        footer={null}
        width={600}
        destroyOnClose
        confirmLoading={importSaving}
        closable={!importSaving}
        maskClosable={!importSaving}
        keyboard={!importSaving}
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
                message="提示：Excel文件需要包含表头。熟悉模块使用全系统唯一模块名称，以英文逗号分隔。"
                type="info"
                showIcon
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ marginRight: 8 }}>选择文件：</span>
              <Upload
                key={importUploadKey}
                showUploadList={true}
                accept=".xlsx,.xls"
                beforeUpload={() => false}
                onChange={handleFileChange}
                fileList={selectedFile ? [{ uid: '-1', name: selectedFile.name, status: 'done' as const, originFileObj: selectedFile as any }] : []}
              >
                <Button icon={<UploadOutlined />}>选择Excel文件</Button>
              </Upload>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Space>
                <Button onClick={handleImportCancel} disabled={importSaving}>取消</Button>
                <Button type="primary" onClick={processImport} loading={importLoading} disabled={!selectedFile || importSaving}>
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
              pagination={{ pageSize: 20, showSizeChanger: false }}
              scroll={{ y: 300 }}
              size="small"
              columns={[
                { title: '工号', dataIndex: 'empNo', key: 'empNo', width: 100 },
                { title: '姓名', dataIndex: 'name', key: 'name', width: 80 },
                { title: '所属项目', dataIndex: 'groupName', key: 'groupName', width: 120 },
                { title: '办公地点', dataIndex: 'officeLocation', key: 'officeLocation', width: 100,
                  render: (text: string) => text || '-',
                },
                { title: '测试类型', dataIndex: 'testType', key: 'testType', width: 100 },
                { title: '初始系数', dataIndex: 'initialCoefficient', key: 'initialCoefficient', width: 80 },
                { title: '当前系数', dataIndex: 'currentCoefficient', key: 'currentCoefficient', width: 80 },
                { title: '角色', dataIndex: 'roles', key: 'roles', width: 120,
                  render: (roles: string[]) => {
                    if (!roles || roles.length === 0) return '-';
                    return roles.map(r => roleLabels[r] || r).join('; ');
                  },
                },
                { title: '熟悉模块', dataIndex: 'familiarModuleNames', key: 'familiarModuleNames', width: 150,
                  render: (text: string, row: ImportRow) => (
                    <Space direction="vertical" size={0}>
                      <span>{text || '-'}</span>
                      {row.unmatchedModules.length > 0 && <Typography.Text type="danger">未知：{row.unmatchedModules.join('、')}</Typography.Text>}
                      {row.unavailableModules.length > 0 && <Typography.Text type="danger">不可用（已停用）：{row.unavailableModules.join('、')}</Typography.Text>}
                      {row.rowErrors.map(error => <Typography.Text key={error} type="danger">{error}</Typography.Text>)}
                      {row.retryError && <Typography.Text type="danger">导入失败：{row.retryError}</Typography.Text>}
                    </Space>
                  ),
                },
                { title: '保密权限', dataIndex: 'confidentialClearance', key: 'confidentialClearance', width: 80,
                  render: (val: boolean) => val ? '是' : '否',
                },
                { title: '操作', key: 'action', width: 72,
                  render: (_: unknown, row: ImportRow) => (
                    <Button type="link" danger size="small" onClick={() => removeImportRow(row.empNo)} aria-label={`移除${row.name}`} disabled={importSaving}>
                      移除
                    </Button>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Space>
                <Button onClick={resetImportPreview} disabled={importSaving}>返回重新选择</Button>
                <Button onClick={handleImportCancel} disabled={importSaving}>取消</Button>
                <Button type="primary" onClick={handleImportConfirm} loading={importLoading} disabled={importSaving || importData.length === 0 || hasImportErrors}>
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
