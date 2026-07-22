import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StaffManagement from './StaffManagement';
import { api } from '../services/api';
import type { FamiliarModule, TestModule } from '../types';
import * as XLSX from 'xlsx';
import { message } from 'antd';

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { testType: '功能测试' } }) }));
vi.mock('../context/UserRoleContext', () => ({
  useUserRole: () => ({ hasRole: () => false, hasPermission: () => true, roles: ['testManager'] }),
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
});
