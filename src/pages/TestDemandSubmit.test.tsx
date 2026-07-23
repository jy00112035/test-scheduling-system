import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'antd';
import { message } from 'antd';
import TestDemandSubmit from './TestDemandSubmit';
import api from '../services/api';
import * as drafts from '../utils/draftStorage';
import type { TestDemand, TestModule } from '../types';

vi.mock('../context/UserRoleContext', () => ({ useUserRole: () => ({ userName: '测试经理' }) }));

const configs = [
  { id: 1, fieldName: 'testType', fieldType: 'select', options: '功能测试', description: '', required: true, sortOrder: 1 },
  { id: 2, fieldName: 'versionType', fieldType: 'select', options: '功能版本', description: '', required: true, sortOrder: 2 },
  { id: 3, fieldName: 'versionPhase', fieldType: 'select', options: '测试中', description: '', required: true, sortOrder: 3 },
  { id: 4, fieldName: 'priority', fieldType: 'select', options: '高', description: '', required: true, sortOrder: 4 },
];

const moduleFixture: TestModule = {
  id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true, sortOrder: 1,
  lockVersion: 0, createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-01T00:00:00Z', referenced: false,
};

const formData = {
  product: '示例产品', version: 'v2', dateRange: [dayjs('2026-08-01'), dayjs('2026-08-02')],
  versionType: '功能版本', versionPhase: '测试中', priority: '高', testDeviceCount: 1, confidential: false,
};

const editDemand: TestDemand = {
  id: '7', product: '历史产品', version: 'v1', startDate: '2026-08-01T00:00:00', endDate: '2026-08-02T00:00:00',
  manpowerDemand: 3, versionType: '功能版本', versionPhase: '测试中', description: '', status: 'rejected', submittedBy: '测试经理', createdAt: '',
  priority: '高', testDeviceCount: 1, manpowerDetails: [
    { testType: '功能测试', manpowerDemand: 2 }, { testType: '历史小组', manpowerDemand: 1, remark: '历史备注' },
  ],
  specialModuleDemands: [{ id: 1, demandId: 7, moduleId: 11, manpowerDemand: 1, moduleName: '支付模块', testType: '功能测试', enabled: true, createdAt: '', updatedAt: '', allocatedManpower: 0, remainingManpower: 1 }],
};

function renderPage(props: Partial<React.ComponentProps<typeof TestDemandSubmit>> = {}) {
  return render(<BrowserRouter><TestDemandSubmit onBack={() => undefined} {...props} /></BrowserRouter>);
}

describe('TestDemandSubmit special module requests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined, addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue(configs);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([moduleFixture]);
    vi.spyOn(drafts, 'getDraft').mockReturnValue(null);
  });

  it('creates with write-only special rows and configured manpower details', async () => {
    vi.spyOn(drafts, 'getDraft').mockReturnValue({
      formData, manpowerInputs: { 功能测试: 2 }, manpowerRemarks: { 功能测试: '保留备注' }, timestamp: 1,
      specialModuleDemands: [{ moduleId: 11, testType: '功能测试', manpowerDemand: 1, historicalManpowerDemand: 1 }],
    });
    vi.spyOn(Modal, 'confirm').mockImplementation((options: any) => { options.onOk(); return {} as any; });
    const createDemand = vi.spyOn(api, 'createDemand').mockResolvedValue({});

    renderPage();
    const user = userEvent.setup();
    await screen.findByDisplayValue('示例产品');
    await user.click(screen.getByRole('button', { name: /提交需求/ }));

    await waitFor(() => expect(createDemand).toHaveBeenCalledTimes(1));
    expect(createDemand.mock.calls[0][0]).toMatchObject({
      manpowerDetails: [{ testType: '功能测试', manpowerDemand: 2, remark: '保留备注' }],
      specialModuleDemands: [{ moduleId: 11, manpowerDemand: 1 }],
    });
    expect(createDemand.mock.calls[0][0].specialModuleDemands[0]).toEqual({ moduleId: 11, manpowerDemand: 1 });
  });

  it('updates rejected fields before resubmitting and retains the historical remark', async () => {
    const updateDemand = vi.spyOn(api, 'updateDemand').mockResolvedValue({});
    const resubmitDemand = vi.spyOn(api, 'resubmitDemand').mockResolvedValue({ ...editDemand, status: 'submitted' });
    renderPage({ initialValues: editDemand, isEdit: true });
    const user = userEvent.setup();
    await screen.findByDisplayValue('历史产品');
    await user.click(screen.getByRole('button', { name: /保存修改/ }));

    await waitFor(() => expect(updateDemand).toHaveBeenCalledTimes(1));
    expect(updateDemand.mock.calls[0][0]).toBe(7);
    expect(updateDemand.mock.calls[0][1].manpowerDetails).toEqual(expect.arrayContaining([
      { testType: '功能测试', manpowerDemand: 2, remark: undefined },
      { testType: '历史小组', manpowerDemand: 1, remark: '历史备注' },
    ]));
    expect(updateDemand.mock.calls[0][1].specialModuleDemands).toEqual([{ moduleId: 11, manpowerDemand: 1 }]);
    expect(updateDemand.mock.calls[0][1]).not.toHaveProperty('status');
    expect(updateDemand.mock.calls[0][1]).not.toHaveProperty('submittedBy');
    expect(resubmitDemand).toHaveBeenCalledWith(7);
    expect(updateDemand.mock.invocationCallOrder[0]).toBeLessThan(resubmitDemand.mock.invocationCallOrder[0]);
  });

  it('does not resubmit or report success when the rejected update fails', async () => {
    vi.spyOn(api, 'updateDemand').mockRejectedValue(new Error('更新失败'));
    const resubmitDemand = vi.spyOn(api, 'resubmitDemand').mockResolvedValue({ ...editDemand, status: 'submitted' });
    const getDemand = vi.spyOn(api, 'getDemand').mockResolvedValue(editDemand);
    const success = vi.spyOn(message, 'success');
    const failure = vi.spyOn(message, 'error');
    const onBack = vi.fn();
    renderPage({ initialValues: editDemand, isEdit: true, onBack });
    const user = userEvent.setup();
    await screen.findByDisplayValue('历史产品');

    await user.click(screen.getByRole('button', { name: /保存修改/ }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith('更新失败'));
    expect(resubmitDemand).not.toHaveBeenCalled();
    expect(getDemand).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('refetches authoritative rejected data and never reports success when resubmit fails', async () => {
    vi.spyOn(api, 'updateDemand').mockResolvedValue({});
    vi.spyOn(api, 'resubmitDemand').mockRejectedValue(new Error('重新提交失败'));
    const authoritative = { ...editDemand, product: '服务器权威产品' };
    const getDemand = vi.spyOn(api, 'getDemand').mockResolvedValue(authoritative);
    const success = vi.spyOn(message, 'success');
    const failure = vi.spyOn(message, 'error');
    const onBack = vi.fn();
    renderPage({ initialValues: editDemand, isEdit: true, onBack });
    const user = userEvent.setup();
    await screen.findByDisplayValue('历史产品');

    await user.click(screen.getByRole('button', { name: /保存修改/ }));

    await waitFor(() => expect(getDemand).toHaveBeenCalledWith(7));
    expect(await screen.findByDisplayValue('服务器权威产品')).toBeInTheDocument();
    expect(failure).toHaveBeenCalledWith('重新提交失败');
    expect(success).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it.each(['submitted', 'pending'] as const)(
    'treats authoritative %s status as success after a resubmit response is lost', async (status) => {
    vi.spyOn(api, 'updateDemand').mockResolvedValue({});
    vi.spyOn(api, 'resubmitDemand').mockRejectedValue(new Error('网络连接中断'));
    const getDemand = vi.spyOn(api, 'getDemand').mockResolvedValue({ ...editDemand, status });
    const success = vi.spyOn(message, 'success');
    const failure = vi.spyOn(message, 'error');
    const onBack = vi.fn();
    renderPage({ initialValues: editDemand, isEdit: true, onBack });
    const user = userEvent.setup();
    await screen.findByDisplayValue('历史产品');

    await user.click(screen.getByRole('button', { name: /保存修改/ }));

    await waitFor(() => expect(getDemand).toHaveBeenCalledWith(7));
    await waitFor(() => expect(success).toHaveBeenCalledWith('测试需求已更新并重新提交，请等待项目经理审批！'));
    await new Promise((resolve) => window.setTimeout(resolve, 550));
    expect(failure).not.toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not run the delayed success navigation after the submit session unmounts', async () => {
    vi.spyOn(api, 'updateDemand').mockResolvedValue({});
    vi.spyOn(api, 'resubmitDemand').mockResolvedValue({ ...editDemand, status: 'submitted' });
    const onBack = vi.fn();
    const page = renderPage({ initialValues: editDemand, isEdit: true, onBack });
    const user = userEvent.setup();
    await screen.findByDisplayValue('历史产品');

    await user.click(screen.getByRole('button', { name: /保存修改/ }));
    await waitFor(() => expect(api.resubmitDemand).toHaveBeenCalledWith(7));
    page.unmount();
    await new Promise((resolve) => window.setTimeout(resolve, 550));

    expect(onBack).not.toHaveBeenCalled();
  });

  it('keeps configured group fields usable when module loading fails and disables new special rows', async () => {
    vi.spyOn(api, 'getTestModules').mockRejectedValue(new Error('模块配置不可用'));
    renderPage();

    expect(await screen.findByRole('spinbutton', { name: '功能测试小组总人力' })).toBeEnabled();
    expect(await screen.findByText('模块配置不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新增特殊模块需求/ })).toBeDisabled();
  });

  it('marks and targets the overflow group and special row without submitting', async () => {
    vi.spyOn(drafts, 'getDraft').mockReturnValue({
      formData, manpowerInputs: { 功能测试: 1 }, manpowerRemarks: {}, timestamp: 1,
      specialModuleDemands: [{ moduleId: 11, testType: '功能测试', manpowerDemand: 2 }],
    });
    vi.spyOn(Modal, 'confirm').mockImplementation((options: any) => { options.onOk(); return {} as any; });
    const createDemand = vi.spyOn(api, 'createDemand').mockResolvedValue({});
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    renderPage();
    const user = userEvent.setup();
    const total = await screen.findByRole('spinbutton', { name: '功能测试小组总人力' });
    await user.click(screen.getByRole('button', { name: /提交需求/ }));
    const row = screen.getByRole('spinbutton', { name: '人力需求 1' });
    expect(total).toHaveAttribute('aria-invalid', 'true');
    const overflowDescription = total.getAttribute('aria-describedby');
    expect(overflowDescription).toBe('demand-overflow-功能测试');
    expect(document.getElementById(overflowDescription as string)).toHaveTextContent('特殊模块人力不能超过小组总人力');
    expect(row).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(total);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(createDemand).not.toHaveBeenCalled();
  });

  it('marks and focuses the first missing special module without submitting', async () => {
    vi.spyOn(drafts, 'getDraft').mockReturnValue({
      formData, manpowerInputs: { 功能测试: 1 }, manpowerRemarks: {}, timestamp: 1,
      specialModuleDemands: [{ testType: '功能测试', manpowerDemand: 1 }],
    });
    vi.spyOn(Modal, 'confirm').mockImplementation((options: any) => { options.onOk(); return {} as any; });
    const createDemand = vi.spyOn(api, 'createDemand').mockResolvedValue({});
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    renderPage();
    const user = userEvent.setup();
    const moduleControl = await screen.findByRole('combobox', { name: '特殊模块 1' });
    await user.click(screen.getByRole('button', { name: /提交需求/ }));
    expect(moduleControl).toHaveAttribute('aria-invalid', 'true');
    expect(document.activeElement).toBe(moduleControl);
    expect(scrollIntoView).toHaveBeenCalled();
    expect(createDemand).not.toHaveBeenCalled();
  });
});
