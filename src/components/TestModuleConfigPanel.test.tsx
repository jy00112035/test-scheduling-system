import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestModuleConfigPanel from './TestModuleConfigPanel';
import api from '../services/api';
import type { TestModule } from '../types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const moduleFixture = (overrides: Partial<TestModule> = {}): TestModule => ({
  id: 11,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: true,
  sortOrder: 10,
  lockVersion: 0,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  referenced: false,
  ...overrides,
});

describe('TestModuleConfigPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (!window.matchMedia) {
      window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      });
    }
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
      nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
  });

  it('locks name and group when a module is referenced', async () => {
    vi.spyOn(api, 'getTestModules').mockResolvedValue([
      moduleFixture({ referenced: true }),
    ]);

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: '编辑支付模块' }));

    expect(screen.getByLabelText('模块名称')).toBeDisabled();
    expect(screen.getByLabelText('所属小组')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '删除支付模块' })).not.toBeInTheDocument();
  });

  it('keeps identity editable and exposes deletion for an unreferenced module', async () => {
    vi.spyOn(api, 'getTestModules').mockResolvedValue([moduleFixture()]);

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '编辑支付模块' }));

    expect(screen.getByLabelText('模块名称')).toBeEnabled();
    expect(screen.getByLabelText('所属小组')).toBeEnabled();
    expect(screen.getByRole('button', { name: '删除支付模块' })).toBeInTheDocument();
  });

  it('sends the exact status mutation and refreshes the authoritative list', async () => {
    const getModules = vi.spyOn(api, 'getTestModules')
      .mockResolvedValueOnce([moduleFixture()])
      .mockResolvedValueOnce([moduleFixture({ enabled: false })]);
    const setStatus = vi.spyOn(api, 'setTestModuleStatus').mockResolvedValue(
      moduleFixture({ enabled: false }),
    );

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: '支付模块启用状态' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(11, false));
    await waitFor(() => expect(getModules).toHaveBeenCalledTimes(2));
    expect(screen.getByText('停用')).toBeInTheDocument();
  });

  it('shows mutation errors and preserves the current row state', async () => {
    vi.spyOn(api, 'getTestModules').mockResolvedValue([moduleFixture()]);
    vi.spyOn(api, 'setTestModuleStatus').mockRejectedValue(new Error('模块状态更新失败'));

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: '支付模块启用状态' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('模块状态更新失败');
    expect(screen.getByText('启用')).toBeInTheDocument();
  });

  it('keeps the newest refresh result when overlapping loads resolve out of order', async () => {
    const olderRefresh = deferred<TestModule[]>();
    const newerRefresh = deferred<TestModule[]>();
    const initialModules = [
      moduleFixture(),
      moduleFixture({ id: 12, moduleName: '搜索模块' }),
    ];
    const getModules = vi.spyOn(api, 'getTestModules')
      .mockResolvedValueOnce(initialModules)
      .mockImplementationOnce(() => olderRefresh.promise)
      .mockImplementationOnce(() => newerRefresh.promise);
    vi.spyOn(api, 'setTestModuleStatus').mockResolvedValue(moduleFixture({ enabled: false }));

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await screen.findByText('搜索模块');
    await user.click(screen.getByRole('switch', { name: '支付模块启用状态' }));
    await user.click(screen.getByRole('switch', { name: '搜索模块启用状态' }));
    await waitFor(() => expect(getModules).toHaveBeenCalledTimes(3));

    newerRefresh.resolve([moduleFixture({ moduleName: '新权威模块' })]);
    expect(await screen.findByText('新权威模块')).toBeInTheDocument();
    olderRefresh.resolve([moduleFixture({ moduleName: '旧过期模块' })]);
    await waitFor(() => expect(screen.queryByText('旧过期模块')).not.toBeInTheDocument());
    expect(screen.getByText('新权威模块')).toBeInTheDocument();
  });

  it('prevents double submit and keeps a saving modal session owned', async () => {
    const createRequest = deferred<TestModule>();
    vi.spyOn(api, 'getTestModules').mockResolvedValue([]);
    const createModule = vi.spyOn(api, 'createTestModule').mockReturnValue(createRequest.promise);

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('新增特殊模块'));
    await user.type(screen.getByLabelText('模块名称'), '库存模块');
    const saveButton = screen.getByText('保存').closest('button') as HTMLButtonElement;
    await user.click(saveButton);
    await user.click(saveButton);

    expect(createModule).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeDisabled();
    expect(screen.getByLabelText('模块名称')).toBeInTheDocument();

    createRequest.resolve(moduleFixture({ moduleName: '库存模块' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

});
