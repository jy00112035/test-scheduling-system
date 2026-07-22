import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from 'antd';
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
  specialModuleDemands: [{ id: 1, demandId: 7, moduleId: 11, manpowerDemand: 1, moduleName: '支付模块', testType: '功能测试', enabled: true, createdAt: '', updatedAt: '', allocatedManpower: null, remainingManpower: null }],
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

  it('updates with configured and historical groups while retaining the historical remark', async () => {
    const updateDemand = vi.spyOn(api, 'updateDemand').mockResolvedValue({});
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
  });

  it('keeps configured group fields usable when module loading fails and disables new special rows', async () => {
    vi.spyOn(api, 'getTestModules').mockRejectedValue(new Error('模块配置不可用'));
    renderPage();

    expect(await screen.findByRole('spinbutton', { name: '功能测试小组总人力' })).toBeEnabled();
    expect(await screen.findByText('模块配置不可用')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新增特殊模块需求/ })).toBeDisabled();
  });
});
