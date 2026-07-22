import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemandApproval from './DemandApproval';
import api from '../services/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const demand = (id: number, product: string) => ({
  id, product, version: 'v1', versionType: '功能', startDate: '2026-08-01T00:00:00',
  endDate: '2026-08-02T00:00:00', manpowerDemand: 2, priority: '高', specialModuleDemands: [],
  manpowerDetails: [{ testType: '功能测试', manpowerDemand: 2, remark: `${product}备注` }],
});

describe('DemandApproval edit loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
      nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
  });

  it('keeps the newest demand detail session when an older request resolves last', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([demand(1, '需求A'), demand(2, '需求B')]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([
      { fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高,中' },
    ]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([]);
    vi.spyOn(api, 'getDemand').mockImplementation((id: number) => id === 1 ? first.promise : second.promise);

    render(<DemandApproval />);
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: /修改后批准/ });
    await user.click(buttons[0]);
    await user.click(buttons[1]);
    second.resolve(demand(2, '需求B'));

    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveTextContent('需求B');
    first.resolve(demand(1, '需求A'));
    expect(modal).not.toHaveTextContent('需求A');
  });

  it('preserves historical details and sends write-only special rows with disabled fallback', async () => {
    const full = {
      ...demand(3, '历史需求'),
      specialModuleDemands: [{ id: 9, demandId: 3, moduleId: 11, moduleName: '支付模块', testType: '功能测试', enabled: false, manpowerDemand: 1, createdAt: '', updatedAt: '', allocatedManpower: null, remainingManpower: null }],
      manpowerDetails: [{ testType: '功能测试', manpowerDemand: 2 }, { testType: '历史小组', manpowerDemand: 1, remark: '保留备注' }],
    };
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([full]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([{ fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高' }]);
    vi.spyOn(api, 'getTestModules').mockRejectedValue(new Error('模块不可用'));
    vi.spyOn(api, 'getDemand').mockResolvedValue(full);
    const approve = vi.spyOn(api, 'approveDemandWithChanges').mockResolvedValue({});
    render(<DemandApproval />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /修改后批准/ }));
    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveTextContent('支付模块');
    expect(modal).toHaveTextContent('已停用');
    expect(modal).toHaveTextContent('历史小组');
    expect(modal).toHaveTextContent('保留备注');
    expect(screen.getByRole('button', { name: /新增特殊模块需求/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '修改并批准' }));
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
    expect(approve.mock.calls[0][1]).toMatchObject({
      manpowerDetails: expect.arrayContaining([{ testType: '功能测试', manpowerDemand: 2 }, { testType: '历史小组', manpowerDemand: 1, remark: '保留备注' }]),
      specialModuleDemands: [{ moduleId: 11, manpowerDemand: 1 }],
    });
  });

  it('does not populate an edit modal after unmounting before detail resolution', async () => {
    const pending = deferred<any>();
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([demand(4, '待卸载')]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([{ fieldName: 'testType', options: '功能测试' }]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([]);
    vi.spyOn(api, 'getDemand').mockReturnValue(pending.promise);
    const { unmount } = render(<DemandApproval />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /修改后批准/ }));
    unmount();
    pending.resolve(demand(4, '待卸载'));
    await Promise.resolve();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses fresh disabled detail metadata over an enabled cached module', async () => {
    const full = { ...demand(5, '状态刷新'), specialModuleDemands: [{ id: 1, demandId: 5, moduleId: 11, moduleName: '支付模块', testType: '功能测试', enabled: false, manpowerDemand: 1, createdAt: '', updatedAt: '', allocatedManpower: null, remainingManpower: null }] };
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([full]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([{ fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高' }]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([{ id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, sortOrder: 0, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true }]);
    vi.spyOn(api, 'getDemand').mockResolvedValue(full);
    render(<DemandApproval />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /修改后批准/ }));
    expect(await screen.findByText('已停用')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '人力需求 1' })).toBeDisabled();
  });

  it('uses fresh enabled detail metadata over a disabled cached module', async () => {
    const full = { ...demand(6, '状态恢复'), specialModuleDemands: [{ id: 1, demandId: 6, moduleId: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, manpowerDemand: 1, createdAt: '', updatedAt: '', allocatedManpower: null, remainingManpower: null }] };
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([full]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([{ fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高' }]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([{ id: 11, moduleName: '支付模块', testType: '功能测试', enabled: false, sortOrder: 0, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true }]);
    vi.spyOn(api, 'getDemand').mockResolvedValue(full);
    render(<DemandApproval />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /修改后批准/ }));
    expect(await screen.findByRole('spinbutton', { name: '人力需求 1' })).toBeEnabled();
    expect(screen.queryByText('已停用')).not.toBeInTheDocument();
  });

  it('focuses and scrolls to the first invalid special row without approving', async () => {
    const full = { ...demand(7, '校验需求'), specialModuleDemands: [] };
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([full]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([{ fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高' }]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([]);
    vi.spyOn(api, 'getDemand').mockResolvedValue(full);
    const approve = vi.spyOn(api, 'approveDemandWithChanges').mockResolvedValue({});
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<DemandApproval />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /修改后批准/ }));
    await user.click(screen.getByRole('button', { name: /新增特殊模块需求/ }));
    const group = screen.getByRole('combobox', { name: '小组 1' });
    await user.click(screen.getByRole('button', { name: '修改并批准' }));
    expect(group).toHaveAttribute('aria-invalid', 'true');
    const errorId = group.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId as string)).toHaveTextContent('特殊模块所属小组无有效总人力');
    expect(document.getElementById(errorId as string)).not.toHaveTextContent('SPECIAL_MODULE_REQUIRED');
    expect(document.activeElement).toBe(group);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
  });
});
