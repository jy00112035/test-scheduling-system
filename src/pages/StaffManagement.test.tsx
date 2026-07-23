import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StaffManagement from './StaffManagement';
import { api } from '../services/api';
import type { FamiliarModule, TestModule } from '../types';
import * as XLSX from 'xlsx';
import { message } from 'antd';
import { buildStaffExportRows, STAFF_IMPORT_MAX_FILE_SIZE, STAFF_IMPORT_MAX_ROWS } from '../utils/staffSpreadsheet';

const actorContext = vi.hoisted(() => ({
  roles: ['admin'] as string[],
  testType: '功能测试',
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { testType: actorContext.testType } }),
}));
vi.mock('../context/UserRoleContext', () => ({
  useUserRole: () => ({
    hasRole: (role: string) => actorContext.roles.includes(role),
    hasPermission: () => true,
    roles: actorContext.roles,
  }),
}));

const moduleFixture = (overrides: Partial<TestModule> = {}): TestModule => ({
  id: 11,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: false,
  sortOrder: 10,
  lockVersion: 0,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  referenced: true,
  ...overrides,
});

const historicalModule = moduleFixture() as FamiliarModule;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function workbookData(rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '人员');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}

describe('StaffManagement familiar modules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    actorContext.roles = ['admin'];
    actorContext.testType = '功能测试';
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
      nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
    vi.spyOn(api, 'getStaff').mockResolvedValue([{
      id: 7, name: '张三', empNo: 'EMP007', joinDate: '2026-07-01', groupName: '功能测试组', testType: '功能测试',
      initialCoefficient: 0.3, currentCoefficient: 0.3, status: 'active', role: 'testExecutor', roles: ['testExecutor'],
      familiarModules: [historicalModule], confidentialClearance: false,
    }]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([
      { id: 1, fieldName: 'groupName', options: '功能测试组', fieldType: 'select', description: '', required: true, sortOrder: 1 },
      { id: 2, fieldName: 'testType', options: '功能测试,自动化测试', fieldType: 'select', description: '', required: true, sortOrder: 2 },
    ]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([
      historicalModule,
      moduleFixture({ id: 12, moduleName: '接口模块', testType: '自动化测试', enabled: true }),
    ]);
    vi.spyOn(api, 'getStaffRolesByEmpNo').mockResolvedValue(['testExecutor']);
  });

  it('treats combined test lead and executor roles as a restricted test lead', async () => {
    actorContext.roles = ['testLead', 'testExecutor'];
    vi.spyOn(api, 'getStaff').mockResolvedValue([
      {
        id: 7, name: '同组人员', empNo: 'EMP007', joinDate: '2026-07-01', groupName: '功能测试组',
        testType: '功能测试', initialCoefficient: 0.3, currentCoefficient: 0.3,
        status: 'active', roles: ['testExecutor'], familiarModules: [],
      },
      {
        id: 8, name: '跨组人员', empNo: 'EMP008', joinDate: '2026-07-01', groupName: '自动化测试组',
        testType: '自动化测试', initialCoefficient: 0.3, currentCoefficient: 0.3,
        status: 'active', roles: ['testExecutor'], familiarModules: [],
      },
    ]);

    render(<StaffManagement />);

    await screen.findByText('同组人员');
    expect(screen.queryByRole('button', { name: /添加人员/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /导入人员/ })).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();
    expect(screen.getAllByText('编辑')).toHaveLength(1);
  });

  it.each([
    { actor: 'resourceManager', offered: ['测试执行人员'], hidden: ['测试经理', '测试组长', '资源主管', '项目经理', '字段管理员'] },
    { actor: 'fieldAdmin', offered: ['测试执行人员'], hidden: ['测试经理', '测试组长', '资源主管', '项目经理', '字段管理员'] },
    { actor: 'projectManager', offered: ['测试执行人员', '测试经理', '测试组长', '资源主管'], hidden: ['项目经理', '字段管理员'] },
    { actor: 'admin', offered: ['测试执行人员', '测试经理', '测试组长', '资源主管', '项目经理', '字段管理员'], hidden: [] },
  ])('offers only backend-assignable roles and safe controls to $actor', async ({ actor, offered, hidden }) => {
    actorContext.roles = [actor];
    render(<StaffManagement />);
    const user = userEvent.setup();

    expect(await screen.findByRole('button', { name: /添加人员/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /导入人员/ })).toBeInTheDocument();
    expect(await screen.findByText('删除')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    await user.click(screen.getByRole('combobox', { name: '角色' }));
    for (const label of offered) {
      expect(await screen.findByText(label, { selector: '.ant-select-item-option-content' })).toBeInTheDocument();
    }
    for (const label of hidden) {
      expect(screen.queryByText(label, { selector: '.ant-select-item-option-content' })).not.toBeInTheDocument();
    }
  });

  it('keeps a restricted lead target role readonly and hides unsafe elevated-target actions', async () => {
    actorContext.roles = ['testLead', 'testExecutor'];
    vi.spyOn(api, 'getStaff').mockResolvedValue([
      {
        id: 7, name: '普通执行员', empNo: 'EMP007', joinDate: '2026-07-01', groupName: '功能测试组',
        testType: '功能测试', initialCoefficient: 0.3, currentCoefficient: 0.3,
        status: 'active', roles: ['testExecutor'], familiarModules: [],
      },
      {
        id: 8, name: '字段管理员目标', empNo: 'EMP008', joinDate: '2026-07-01', groupName: '功能测试组',
        testType: '功能测试', initialCoefficient: 0.3, currentCoefficient: 0.3,
        status: 'active', roles: ['fieldAdmin'], familiarModules: [],
      },
    ]);
    vi.spyOn(api, 'getStaffRolesByEmpNo').mockResolvedValue(['testExecutor']);
    render(<StaffManagement />);
    const user = userEvent.setup();

    await screen.findByText('字段管理员目标');
    expect(screen.getAllByText('编辑')).toHaveLength(1);
    await user.click(screen.getByText('编辑'));
    const roleSelector = await screen.findByRole('combobox', { name: '角色' });
    expect(roleSelector).toBeDisabled();
    expect(roleSelector.closest('.ant-select')).toHaveTextContent(/测试执行人员|testExecutor/);
  });

  it('preserves disabled historical modules and submits cross-group structured module ids', async () => {
    const updateStaff = vi.spyOn(api, 'updateStaff').mockResolvedValue({});
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    expect((await screen.findAllByText('功能测试: 支付模块 (已停用)')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('combobox', { name: '熟悉模块' }));
    await user.click(await screen.findByText('接口模块'));
    await user.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(1));
    expect(updateStaff.mock.calls[0][1]).toMatchObject({ familiarModuleIds: [11, 12] });
    expect(updateStaff.mock.calls[0][1]).not.toHaveProperty('familiarModules');
  });

  it('exports the currently filtered staff list with readable familiar module names', async () => {
    render(<StaffManagement />);
    const user = userEvent.setup();

    await screen.findByText('张三');
    await user.type(screen.getByPlaceholderText('搜索姓名或工号'), '张三{enter}');
    expect(screen.getByRole('button', { name: /导出人员/ })).toBeInTheDocument();
  });

  it('keeps the newest edit session when an older role request resolves last', async () => {
    const firstRoles = deferred<string[]>();
    const secondRoles = deferred<string[]>();
    vi.spyOn(api, 'getStaff').mockResolvedValue([
      { id: 7, name: '甲', empNo: 'EMP007', joinDate: '2026-07-01', groupName: '功能测试组', initialCoefficient: 0.3, currentCoefficient: 0.3, status: 'active', familiarModules: [historicalModule] },
      { id: 8, name: '乙', empNo: 'EMP008', joinDate: '2026-07-02', groupName: '自动化测试组', initialCoefficient: 0.5, currentCoefficient: 0.5, status: 'active', familiarModules: [] },
    ]);
    vi.spyOn(api, 'getStaffRolesByEmpNo')
      .mockReturnValueOnce(firstRoles.promise)
      .mockReturnValueOnce(secondRoles.promise);
    const updateStaff = vi.spyOn(api, 'updateStaff').mockResolvedValue({});
    render(<StaffManagement />);
    const user = userEvent.setup();

    const editButtons = await screen.findAllByText('编辑');
    await user.click(editButtons[0]);
    await user.click(editButtons[1]);
    secondRoles.resolve(['testExecutor']);
    expect(await screen.findByDisplayValue('乙')).toBeInTheDocument();
    firstRoles.resolve(['testManager']);
    await waitFor(() => expect(screen.getByDisplayValue('乙')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith(8, expect.objectContaining({ name: '乙' })));
  });

  it('does not reopen a canceled edit session after its role request resolves', async () => {
    const roles = deferred<string[]>();
    vi.spyOn(api, 'getStaffRolesByEmpNo').mockReturnValue(roles.promise);
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    await user.click(screen.getByRole('button', { name: /取\s*消/ }));
    roles.resolve(['testExecutor']);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not populate an edit session after unmounting during its role request', async () => {
    const roles = deferred<string[]>();
    vi.spyOn(api, 'getStaffRolesByEmpNo').mockReturnValue(roles.promise);
    const { unmount } = render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    unmount();
    roles.resolve(['testExecutor']);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument();
  });

  it('omits module ids for an unchanged legacy edit but sends an explicit clear', async () => {
    vi.spyOn(api, 'getStaff').mockResolvedValue([{
      id: 7, name: '旧数据', empNo: 'EMP007', joinDate: '2026-07-01', groupName: '功能测试组', initialCoefficient: 0.3, currentCoefficient: 0.3, status: 'active', familiarModules: '支付模块',
    }]);
    const updateStaff = vi.spyOn(api, 'updateStaff').mockResolvedValue({});
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(1));
    expect(updateStaff.mock.calls[0][1]).not.toHaveProperty('familiarModuleIds');
  });

  it('removes a disabled historical module, sends the resulting ids, and does not permit reselecting it', async () => {
    const updateStaff = vi.spyOn(api, 'updateStaff').mockResolvedValue({});
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    await user.click(await screen.findByLabelText('移除支付模块'));
    await user.click(screen.getByRole('combobox', { name: '熟悉模块' }));
    const disabledOption = await screen.findByText('支付模块');
    expect(disabledOption.closest('.ant-select-item-option')).toHaveClass('ant-select-item-option-disabled');
    await user.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => expect(updateStaff).toHaveBeenCalledWith(7, expect.objectContaining({ familiarModuleIds: [] })));
  });

  it('shows exact unmatched Excel module names and blocks batch import', async () => {
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const worksheet = XLSX.utils.json_to_sheet([{
      工号: 'EMP008', 姓名: '李四', 所属项目: '功能测试组', 测试类型: '功能测试', 熟悉模块: '接口模块；未知模块,接口模块',
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '人员');
    const workbookData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      readAsArrayBuffer() {
        this.onload?.({ target: { result: workbookData } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      const input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['placeholder'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      expect(await screen.findByText('未知：未知模块')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
      expect(createStaff).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('removes an invalid preview row so remaining valid rows can be imported', async () => {
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const worksheet = XLSX.utils.json_to_sheet([
      { 工号: 'EMP008', 姓名: '李四', 所属项目: '功能测试组', 熟悉模块: '未知模块' },
      { 工号: 'EMP009', 姓名: '王五', 所属项目: '功能测试组', 熟悉模块: '接口模块' },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '人员');
    const workbookData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      readAsArrayBuffer() { this.onload?.({ target: { result: workbookData } }); }
      abort() {}
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['placeholder'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      expect(await screen.findByText('未知：未知模块')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '移除李四' }));
      expect(screen.queryByText('未知：未知模块')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(createStaff).toHaveBeenCalledWith(expect.objectContaining({ empNo: 'EMP009', familiarModuleIds: [12] })));
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('imports deduplicated structured module ids without the legacy field', async () => {
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const worksheet = XLSX.utils.json_to_sheet([{
      工号: 'EMP009', 姓名: '王五', 所属项目: '功能测试组', 测试类型: '功能测试', 熟悉模块: '接口模块,接口模块',
    }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '人员');
    const workbookData = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      readAsArrayBuffer() {
        this.onload?.({ target: { result: workbookData } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      const input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['placeholder'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await user.click(await screen.findByRole('button', { name: '确认导入' }));

      await waitFor(() => expect(createStaff).toHaveBeenCalledWith(expect.objectContaining({ familiarModuleIds: [12] })));
      expect(createStaff.mock.calls[0][0]).not.toHaveProperty('familiarModules');
      expect(createStaff.mock.calls[0][0]).not.toHaveProperty('familiarModuleNames');
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('keeps the newer import preview when an earlier staff lookup resolves last', async () => {
    const firstLookup = deferred<any[]>();
    const secondLookup = deferred<any[]>();
    vi.spyOn(api, 'getStaff')
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(firstLookup.promise)
      .mockReturnValueOnce(secondLookup.promise);
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      static instances: TestFileReader[] = [];
      onload: ((event: any) => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { TestFileReader.instances.push(this); }
      readAsArrayBuffer() {}
      abort() {}
      emit(rows: Record<string, unknown>[]) {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '人员');
        this.onload?.({ target: { result: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      let input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['first'], 'first.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['second'], 'second.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      secondLookup.resolve([]);
      await waitFor(() => expect(TestFileReader.instances).toHaveLength(1));
      TestFileReader.instances[0].emit([{ 工号: 'EMP009', 姓名: '新文件' }]);
      expect(await screen.findByText('新文件')).toBeInTheDocument();
      firstLookup.resolve([]);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.getByText('新文件')).toBeInTheDocument();
      expect(screen.queryByText('first')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('does not reopen an import preview when a canceled reader resolves later', async () => {
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      static instance: TestFileReader | undefined;
      onload: ((event: any) => void) | null = null;
      constructor() { TestFileReader.instance = this; }
      readAsArrayBuffer() {}
      abort() {}
      emit() {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 工号: 'EMP010', 姓名: '过期文件' }]), '人员');
        this.onload?.({ target: { result: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['stale'], 'stale.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instance).toBeDefined());
      await user.click(screen.getByRole('button', { name: /取\s*消/ }));
      TestFileReader.instance?.emit();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText('过期文件')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('ignores an import reader callback after the page unmounts', async () => {
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      static instance: TestFileReader | undefined;
      onload: ((event: any) => void) | null = null;
      constructor() { TestFileReader.instance = this; }
      readAsArrayBuffer() {}
      abort() {}
      emit() {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 工号: 'EMP011', 姓名: '卸载后' }]), '人员');
        this.onload?.({ target: { result: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      const { unmount } = render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['stale'], 'unmount.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instance).toBeDefined());
      unmount();
      TestFileReader.instance?.emit();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(document.querySelector('[role="dialog"]')).not.toBeInTheDocument();
      expect(screen.queryByText('卸载后')).not.toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('returns to file selection and accepts a corrected reselected file', async () => {
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      static instances: TestFileReader[] = [];
      onload: ((event: any) => void) | null = null;
      constructor() { TestFileReader.instances.push(this); }
      readAsArrayBuffer() {}
      abort() {}
      emit(row: Record<string, unknown>) {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([row]), '人员');
        this.onload?.({ target: { result: XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } });
      }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      const file = new File(['bad'], 'staff.xlsx');
      let input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, file);
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instances).toHaveLength(1));
      TestFileReader.instances[0].emit({ 工号: 'EMP010', 姓名: '待修正', 熟悉模块: '未知模块' });
      expect(await screen.findByText('未知：未知模块')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '返回重新选择' }));
      expect(screen.queryByText('未知：未知模块')).not.toBeInTheDocument();
      input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, file);
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instances).toHaveLength(2));
      TestFileReader.instances[1].emit({ 工号: 'EMP010', 姓名: '已修正', 熟悉模块: '接口模块' });
      expect(await screen.findByText('已修正')).toBeInTheDocument();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('owns a staff save session so a double save only sends one update and cannot be canceled', async () => {
    const pendingUpdate = deferred<unknown>();
    const updateStaff = vi.spyOn(api, 'updateStaff').mockReturnValue(pendingUpdate.promise as any);
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    const save = screen.getByRole('button', { name: /保存/ });
    await user.click(save);
    await user.click(save);

    expect(updateStaff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /取\s*消/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    pendingUpdate.resolve({});
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑人员' })).not.toBeInTheDocument());
  });

  it('releases an owned staff save after rejection so the same modal can be saved again', async () => {
    const updateStaff = vi.spyOn(api, 'updateStaff')
      .mockRejectedValueOnce(new Error('保存失败'))
      .mockResolvedValueOnce({});
    render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('dialog', { name: '编辑人员' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存/ })).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: /保存/ }));
    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(2));
  });

  it('suppresses staff save completion after unmount', async () => {
    const pendingUpdate = deferred<unknown>();
    vi.spyOn(api, 'updateStaff').mockReturnValue(pendingUpdate.promise as any);
    const success = vi.spyOn(message, 'success');
    const { unmount } = render(<StaffManagement />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('编辑'));
    await user.click(screen.getByRole('button', { name: /保存/ }));
    unmount();
    pendingUpdate.resolve({});
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(success).not.toHaveBeenCalledWith('人员信息已更新');
  });

  it('owns an import save sequence, disabling close controls and ignoring a duplicate confirm', async () => {
    const firstCreate = deferred<unknown>();
    const createStaff = vi.spyOn(api, 'createStaff').mockReturnValueOnce(firstCreate.promise as any).mockResolvedValueOnce({ staff: {}, generatedPassword: '' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      readAsArrayBuffer() { this.onload?.({ target: { result: workbookData([
        { 工号: 'EMP020', 姓名: '甲', 所属项目: '功能测试组' },
        { 工号: 'EMP021', 姓名: '乙', 所属项目: '功能测试组' },
      ]) } }); }
      abort() {}
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      const confirm = await screen.findByRole('button', { name: '确认导入' });
      await user.click(confirm);
      await user.click(confirm);

      expect(createStaff).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: /取\s*消/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: '返回重新选择' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
      firstCreate.resolve({});
      await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(2));
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('stops an import sequence after unmount instead of issuing the next staff create', async () => {
    const firstCreate = deferred<unknown>();
    const createStaff = vi.spyOn(api, 'createStaff').mockReturnValue(firstCreate.promise as any);
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      readAsArrayBuffer() { this.onload?.({ target: { result: workbookData([
        { 工号: 'EMP022', 姓名: '甲', 所属项目: '功能测试组' },
        { 工号: 'EMP023', 姓名: '乙', 所属项目: '功能测试组' },
      ]) } }); }
      abort() {}
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      const { unmount } = render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await user.click(await screen.findByRole('button', { name: '确认导入' }));
      expect(createStaff).toHaveBeenCalledTimes(1);
      unmount();
      firstCreate.resolve({});
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(createStaff).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('keeps only failed import rows for retry after a partial commit', async () => {
    const createStaff = vi.spyOn(api, 'createStaff')
      .mockResolvedValueOnce({ staff: {}, generatedPassword: '' })
      .mockRejectedValueOnce(new Error('工号冲突'))
      .mockResolvedValueOnce({ staff: {}, generatedPassword: '' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader { onload: ((event: any) => void) | null = null; abort() {} readAsArrayBuffer() { this.onload?.({ target: { result: workbookData([
      { 工号: 'EMP030', 姓名: '已提交', 所属项目: '功能测试组' }, { 工号: 'EMP031', 姓名: '待重试', 所属项目: '功能测试组' },
    ]) } }); } }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />); const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['x'], 'x.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await user.click(await screen.findByRole('button', { name: '确认导入' }));
      expect(await screen.findByText('导入失败：工号冲突')).toBeInTheDocument();
      expect(screen.queryByText('已提交')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(3));
    } finally { Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader }); }
  });

  it('rejects an oversized import before constructing a FileReader', async () => {
    const OriginalFileReader = globalThis.FileReader;
    const readAsArrayBuffer = vi.fn();
    class TestFileReader { onload: ((event: any) => void) | null = null; readAsArrayBuffer = readAsArrayBuffer; abort() {} }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />); const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File([new Uint8Array(STAFF_IMPORT_MAX_FILE_SIZE + 1)], 'large.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      expect(await screen.findByText(/Excel文件不能超过/)).toBeInTheDocument();
      expect(readAsArrayBuffer).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: '确认导入' })).not.toBeInTheDocument();
    } finally { Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader }); }
  });

  it('paginates a large preview while saving every valid row', async () => {
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const rows = Array.from({ length: 21 }, (_, index) => ({ 工号: `EMP${100 + index}`, 姓名: `人员${index + 1}`, 所属项目: '功能测试组' }));
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader { onload: ((event: any) => void) | null = null; abort() {} readAsArrayBuffer() { this.onload?.({ target: { result: workbookData(rows) } }); } }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />); const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['x'], 'rows.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      expect(await screen.findByText('人员1')).toBeInTheDocument();
      expect(screen.queryByText('人员21')).not.toBeInTheDocument();
      const nextPages = screen.getAllByTitle('Next Page');
      await user.click(nextPages[nextPages.length - 1]);
      expect(await screen.findByText('人员21')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(21));
    } finally { Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader }); }
  });

  it('aborts and invalidates a removed upload before the same file is reselected', async () => {
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader { static instances: TestFileReader[] = []; onload: ((event: any) => void) | null = null; abort = vi.fn(); constructor() { TestFileReader.instances.push(this); } readAsArrayBuffer() {} }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />); const user = userEvent.setup(); const file = new File(['x'], 'same.xlsx');
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      let input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, file); await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instances).toHaveLength(1));
      await user.click(screen.getByTitle('Remove file'));
      expect(TestFileReader.instances[0].abort).toHaveBeenCalled();
      TestFileReader.instances[0].onload?.({ target: { result: workbookData([{ 工号: 'OLD', 姓名: '旧文件' }]) } });
      expect(screen.queryByText('旧文件')).not.toBeInTheDocument();
      input = document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement;
      await user.upload(input, file); await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await waitFor(() => expect(TestFileReader.instances).toHaveLength(2));
    } finally { Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader }); }
  });

  it('rejects a real workbook with 1001 data rows without preview or save', async () => {
    const createStaff = vi.spyOn(api, 'createStaff');
    const rows = Array.from({ length: STAFF_IMPORT_MAX_ROWS + 1 }, (_, index) => ({
      工号: `LIMIT${index + 1}`, 姓名: `边界人员${index + 1}`,
    }));
    const data = workbookData(rows);
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      abort() {}
      readAsArrayBuffer() { this.onload?.({ target: { result: data } }); }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'over-limit.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      expect(await screen.findByText(`Excel文件最多导入 ${STAFF_IMPORT_MAX_ROWS} 行数据`)).toBeInTheDocument();
      expect(screen.queryByText(`准备导入 ${STAFF_IMPORT_MAX_ROWS} 条人员数据`)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '确认导入' })).not.toBeInTheDocument();
      expect(createStaff).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('accepts a real workbook with exactly 1000 data rows', async () => {
    const rows = Array.from({ length: STAFF_IMPORT_MAX_ROWS }, (_, index) => ({
      工号: `EXACT${index + 1}`, 姓名: `边界人员${index + 1}`,
    }));
    const data = workbookData(rows);
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      abort() {}
      readAsArrayBuffer() { this.onload?.({ target: { result: data } }); }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'exact-limit.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      expect(await screen.findByText(`准备导入 ${STAFF_IMPORT_MAX_ROWS} 条人员数据`)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '确认导入' })).toBeEnabled();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('preserves numeric and string zero coefficients from an exported workbook in import payloads', async () => {
    const exportedRow = buildStaffExportRows([{
      name: '数值零', empNo: 'EMP060', joinDate: '2026-07-22', groupName: '功能测试组',
      initialCoefficient: 0, currentCoefficient: 0, status: 'active', roles: ['testExecutor'], familiarModules: [],
    }])[0];
    const data = workbookData([
      exportedRow,
      { ...exportedRow, 工号: 'EMP061', 姓名: '字符串零', 初始系数: '0', 当前系数: '0' },
    ]);
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      abort() {}
      readAsArrayBuffer() { this.onload?.({ target: { result: data } }); }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'zero-coefficients.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await user.click(await screen.findByRole('button', { name: '确认导入' }));

      await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(2));
      expect(createStaff.mock.calls.map(([row]) => ({
        empNo: row.empNo,
        initialCoefficient: row.initialCoefficient,
        currentCoefficient: row.currentCoefficient,
      }))).toEqual([
        { empNo: 'EMP060', initialCoefficient: 0, currentCoefficient: 0 },
        { empNo: 'EMP061', initialCoefficient: 0, currentCoefficient: 0 },
      ]);
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('disables import confirmation for invalid roles and statuses', async () => {
    const data = workbookData([{
      工号: 'EMP062', 姓名: '无效编码', 角色: '不存在角色', 状态: '未知状态',
    }]);
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      abort() {}
      readAsArrayBuffer() { this.onload?.({ target: { result: data } }); }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'invalid-codecs.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));

      expect(await screen.findByText('无效角色：不存在角色')).toBeInTheDocument();
      expect(screen.getByText('无效状态：未知状态')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

  it('keeps staff CRUD usable after module load failure and restores module actions on retry', async () => {
    const retryModules = deferred<TestModule[]>();
    vi.spyOn(api, 'getTestModules')
      .mockRejectedValueOnce(new Error('模块服务离线'))
      .mockReturnValueOnce(retryModules.promise);
    render(<StaffManagement />);
    const user = userEvent.setup();

    const warning = await screen.findByRole('alert');
    expect(warning).toHaveTextContent('熟悉模块不可用：模块服务离线');
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /添加人员/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /导入人员/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    expect(screen.getByRole('dialog', { name: '添加人员' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '熟悉模块' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /取\s*消/ }));

    await user.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByRole('button', { name: /导入人员/ })).toBeDisabled();
    retryModules.resolve([
      historicalModule,
      moduleFixture({ id: 12, moduleName: '接口模块', testType: '自动化测试', enabled: true }),
    ]);

    await waitFor(() => expect(screen.queryByText('熟悉模块不可用：模块服务离线')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /导入人员/ })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    await user.click(screen.getByRole('combobox', { name: '熟悉模块' }));
    expect(await screen.findByText('接口模块')).toBeInTheDocument();
  });

  it('keeps newer module retry success when an older retry fails afterward', async () => {
    const olderRetry = deferred<TestModule[]>();
    const newerRetry = deferred<TestModule[]>();
    vi.spyOn(api, 'getTestModules')
      .mockRejectedValueOnce(new Error('首次加载失败'))
      .mockReturnValueOnce(olderRetry.promise)
      .mockReturnValueOnce(newerRetry.promise);
    render(<StaffManagement />);
    const user = userEvent.setup();

    await screen.findByText('熟悉模块不可用：首次加载失败');
    await user.click(screen.getByRole('button', { name: '重试' }));
    await user.click(screen.getByRole('button', { name: '重试' }));
    newerRetry.resolve([
      historicalModule,
      moduleFixture({ id: 12, moduleName: '接口模块', testType: '自动化测试', enabled: true }),
    ]);
    await waitFor(() => expect(screen.getByRole('button', { name: /导入人员/ })).toBeEnabled());

    olderRetry.reject(new Error('过期重试失败'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText(/过期重试失败/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    await user.click(screen.getByRole('combobox', { name: '熟悉模块' }));
    expect(await screen.findByText('接口模块')).toBeInTheDocument();
  });

  it('suppresses module retry completion after unmount', async () => {
    const retryModules = deferred<TestModule[]>();
    vi.spyOn(api, 'getTestModules')
      .mockRejectedValueOnce(new Error('首次加载失败'))
      .mockReturnValueOnce(retryModules.promise);
    const warningMessage = vi.spyOn(message, 'warning');
    const errorMessage = vi.spyOn(message, 'error');
    const { unmount } = render(<StaffManagement />);
    const user = userEvent.setup();

    await screen.findByText('熟悉模块不可用：首次加载失败');
    await user.click(screen.getByRole('button', { name: '重试' }));
    unmount();
    retryModules.reject(new Error('卸载后的失败'));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(screen.queryByText(/卸载后的失败/)).not.toBeInTheDocument();
    expect(warningMessage).not.toHaveBeenCalledWith(expect.stringContaining('卸载后的失败'));
    expect(errorMessage).not.toHaveBeenCalledWith(expect.stringContaining('卸载后的失败'));
  });

  it('commits a created staff member when field-config refresh fails without public config writes', async () => {
    const configs = [
      { id: 1, fieldName: 'groupName', options: '功能测试组', fieldType: 'select', description: '', required: true, sortOrder: 1 },
      { id: 2, fieldName: 'testType', options: '功能测试,自动化测试', fieldType: 'select', description: '', required: true, sortOrder: 2 },
    ];
    vi.spyOn(api, 'getFieldConfigs')
      .mockResolvedValueOnce(configs as any)
      .mockRejectedValueOnce(new Error('字段配置服务不可用'));
    vi.spyOn(api, 'getStaff')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        id: 40, name: '已提交人员', empNo: 'EMP040', joinDate: '2026-07-22', groupName: '功能测试组',
        initialCoefficient: 0.3, currentCoefficient: 0.3, status: 'active', role: 'testExecutor', familiarModules: [],
      }]);
    const createStaff = vi.spyOn(api, 'createStaff').mockResolvedValue({ staff: {}, generatedPassword: '' });
    const updateFieldConfig = vi.spyOn(api, 'updateFieldConfig');
    const warning = vi.spyOn(message, 'warning');
    const success = vi.spyOn(message, 'success');
    const error = vi.spyOn(message, 'error');
    render(<StaffManagement />);
    const user = userEvent.setup();
    await waitFor(() => expect(api.getFieldConfigs).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: /添加人员/ }));
    await user.type(screen.getByLabelText('姓名'), '已提交人员');
    await user.type(screen.getByLabelText('工号'), 'EMP040');
    await user.type(screen.getByLabelText('入职日期'), '2026-07-22');
    await user.click(screen.getByRole('combobox', { name: '所属项目' }));
    const groupOptions = await screen.findAllByText('功能测试组');
    await user.click(groupOptions.find(option => option.classList.contains('ant-select-item-option-content'))!);
    await user.click(screen.getByRole('combobox', { name: '角色' }));
    const roleOptions = await screen.findAllByText('测试执行人员');
    await user.click(roleOptions.find(option => option.classList.contains('ant-select-item-option-content'))!);
    await user.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '添加人员' })).not.toBeInTheDocument());
    expect(warning).not.toHaveBeenCalledWith('人员已添加，但项目/测试类型选项同步失败');
    expect(updateFieldConfig).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('人员已添加，初始登录密码为 12345678');
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/操作失败|字段配置服务不可用/));
    expect(await screen.findByText('已提交人员')).toBeInTheDocument();
    expect(createStaff).toHaveBeenCalledTimes(1);
  });

  it('commits an updated staff member when field-config refresh fails without public config writes', async () => {
    const configs = [
      { id: 1, fieldName: 'groupName', options: '功能测试组', fieldType: 'select', description: '', required: true, sortOrder: 1 },
      { id: 2, fieldName: 'testType', options: '功能测试,自动化测试', fieldType: 'select', description: '', required: true, sortOrder: 2 },
    ];
    vi.spyOn(api, 'getFieldConfigs')
      .mockResolvedValueOnce(configs as any)
      .mockRejectedValueOnce(new Error('字段配置服务不可用'));
    const updateStaff = vi.spyOn(api, 'updateStaff').mockResolvedValue({});
    const updateFieldConfig = vi.spyOn(api, 'updateFieldConfig');
    const warning = vi.spyOn(message, 'warning');
    const success = vi.spyOn(message, 'success');
    const error = vi.spyOn(message, 'error');
    render(<StaffManagement />);
    const user = userEvent.setup();
    await waitFor(() => expect(api.getFieldConfigs).toHaveBeenCalledTimes(1));

    await user.click(await screen.findByText('编辑'));
    await user.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => expect(updateStaff).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '编辑人员' })).not.toBeInTheDocument());
    expect(warning).not.toHaveBeenCalledWith('人员已更新，但项目/测试类型选项同步失败');
    expect(updateFieldConfig).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledWith('人员信息已更新');
    expect(error).not.toHaveBeenCalledWith(expect.stringMatching(/操作失败|字段配置服务不可用/));
    expect(updateStaff).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed import row out of the retry set when config refresh and another create fail', async () => {
    const configs = [
      { id: 1, fieldName: 'groupName', options: '功能测试组', fieldType: 'select', description: '', required: true, sortOrder: 1 },
      { id: 2, fieldName: 'testType', options: '功能测试', fieldType: 'select', description: '', required: true, sortOrder: 2 },
    ];
    vi.spyOn(api, 'getFieldConfigs')
      .mockResolvedValueOnce(configs as any)
      .mockRejectedValueOnce(new Error('同步失败'))
      .mockResolvedValue(configs as any);
    const getStaff = vi.spyOn(api, 'getStaff')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValue([]);
    const createStaff = vi.spyOn(api, 'createStaff')
      .mockResolvedValueOnce({ staff: {}, generatedPassword: '' })
      .mockRejectedValueOnce(new Error('工号冲突'))
      .mockResolvedValueOnce({ staff: {}, generatedPassword: '' });
    const warning = vi.spyOn(message, 'warning');
    const updateFieldConfig = vi.spyOn(api, 'updateFieldConfig');
    const OriginalFileReader = globalThis.FileReader;
    class TestFileReader {
      onload: ((event: any) => void) | null = null;
      abort() {}
      readAsArrayBuffer() { this.onload?.({ target: { result: workbookData([
        { 工号: 'EMP050', 姓名: '已提交且同步失败', 所属项目: '新项目' },
        { 工号: 'EMP051', 姓名: '创建失败待重试', 所属项目: '功能测试组' },
      ]) } }); }
    }
    Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: TestFileReader });
    try {
      render(<StaffManagement />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /导入人员/ }));
      await user.upload(document.querySelector('.ant-modal input[type="file"]') as HTMLInputElement, new File(['rows'], 'staff.xlsx'));
      await user.click(screen.getByRole('button', { name: /确\s*定/ }));
      await user.click(await screen.findByRole('button', { name: '确认导入' }));

      expect(await screen.findByText('导入失败：工号冲突')).toBeInTheDocument();
      expect(screen.queryByText('已提交且同步失败')).not.toBeInTheDocument();
      expect(warning).not.toHaveBeenCalledWith('人员已导入，但项目/测试类型选项同步失败');
      expect(updateFieldConfig).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith('已成功导入 1 条，1 条待重试');
      await waitFor(() => expect(getStaff).toHaveBeenCalledTimes(3));

      await user.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(createStaff).toHaveBeenCalledTimes(3));
      expect(createStaff.mock.calls.map(([row]) => row.empNo)).toEqual(['EMP050', 'EMP051', 'EMP051']);
    } finally {
      Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: OriginalFileReader });
    }
  });

});
