import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestModuleConfigPanel from './TestModuleConfigPanel';
import api from '../services/api';
import type { TestModule } from '../types';

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
    await user.click(await screen.findByRole('switch', { name: '启用支付模块' }));

    await waitFor(() => expect(setStatus).toHaveBeenCalledWith(11, false));
    await waitFor(() => expect(getModules).toHaveBeenCalledTimes(2));
    expect(screen.getByText('停用')).toBeInTheDocument();
  });

  it('shows mutation errors and preserves the current row state', async () => {
    vi.spyOn(api, 'getTestModules').mockResolvedValue([moduleFixture()]);
    vi.spyOn(api, 'setTestModuleStatus').mockRejectedValue(new Error('模块状态更新失败'));

    render(<TestModuleConfigPanel testTypes={['功能测试']} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('switch', { name: '启用支付模块' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('模块状态更新失败');
    expect(screen.getByText('启用')).toBeInTheDocument();
  });
});
