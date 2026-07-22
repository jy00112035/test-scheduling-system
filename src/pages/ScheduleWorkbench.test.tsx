import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: {
    getPendingDemands: vi.fn(),
    getSchedules: vi.fn(),
    getStaff: vi.fn(),
    getDailyStatuses: vi.fn(),
    getFieldConfigs: vi.fn(),
    validateSchedule: vi.fn(),
    createSchedule: vi.fn(),
    createSchedulesBatch: vi.fn(),
    moveSchedule: vi.fn(),
    classifySchedule: vi.fn(),
    recommendScheduleDraft: vi.fn(),
    batchPublishSchedules: vi.fn(),
    publishSchedules: vi.fn(),
    deleteSchedule: vi.fn(),
    deleteSchedulesByDemand: vi.fn(),
    updateDemandPriority: vi.fn(),
  },
  confirm: vi.fn(),
  warning: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('../services/api', () => ({ api: mocks.api }));
vi.mock('../context/UserRoleContext', () => ({
  useUserRole: () => ({ hasPermission: () => true, hasRole: () => true }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { testType: '功能测试', roles: ['resourceManager'] } }),
}));
vi.mock('./workbench/WorkbenchSummaryBar', () => ({
  default: (props: any) => <div>
    <button onClick={props.onDateRecommend}>按指定日期排班</button>
    <button onClick={props.onFullAllocateRecommend}>按全部需求排班</button>
    <button onClick={props.onPublishAll}>发布全部待发布排班</button>
  </div>,
}));
vi.mock('./workbench/DemandQueue', () => ({
  default: (props: any) => <div>
    <button onClick={() => props.onSelectDemand(1001)}>选择需求</button>
    <button onClick={() => props.onViewDetail(props.demands[0])}>查看需求</button>
    <button onClick={() => props.onAllocationTargetDragStart({
      dataTransfer: { effectAllowed: '', setDragImage: vi.fn() },
    }, {
      kind: 'special', demandId: 1001, demandManpowerDetailId: 301,
      demandSpecialModuleId: 501, testType: '功能测试', moduleId: 11,
      moduleName: '支付模块', remainingManpower: 1,
    })}>拖动特殊模块</button>
  </div>,
}));
vi.mock('./workbench/ScheduleTimeline', () => ({
  default: (props: any) => <div>
    <span data-testid="schedule-count">{props.schedules.length}</span>
    <button onClick={() => props.onDrop(props.staffs[0], '2026-07-22')}>放置目标</button>
    <button onClick={() => props.onScheduleTransfer(props.schedules[0], props.staffs[0], '2026-07-23')}>移动排班</button>
  </div>,
}));
vi.mock('./workbench/IssuePublishPanel', () => ({ default: () => null }));

vi.mock('antd', async importOriginal => {
  const actual = await importOriginal<typeof import('antd')>();
  const Modal = actual.Modal;
  Modal.confirm = mocks.confirm;
  Modal.warning = mocks.warning;
  return {
    ...actual,
    Modal,
    message: {
      ...actual.message,
      loading: () => vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
      error: mocks.messageError,
    },
  };
});

import ScheduleWorkbench from './ScheduleWorkbench';

const demand = {
  id: 1001,
  product: '示例产品',
  version: 'v2',
  startDate: '2026-07-20T00:00:00',
  endDate: '2026-07-31T00:00:00',
  manpowerDemand: 2,
  versionType: '维护',
  status: 'pending',
  manpowerFullySatisfied: false,
  requiresHistoricalClassification: false,
  manpowerDetails: [{ id: 301, testType: '功能测试', manpowerDemand: 2 }],
  manpowerSummary: [{ testType: '功能测试', totalManpower: 2, specialManpower: 1, generalManpower: 1 }],
  specialModuleDemands: [{
    id: 501, demandId: 1001, moduleId: 11, moduleName: '支付模块',
    testType: '功能测试', enabled: true, manpowerDemand: 1,
    allocatedManpower: 0, remainingManpower: 1,
    createdAt: '2026-07-01T00:00:00', updatedAt: '2026-07-01T00:00:00',
  }],
};

const staff = {
  id: 20, name: '张三', empNo: 'T20', testType: '性能测试',
  initialCoefficient: 1, currentCoefficient: 1, status: 'active',
  familiarModules: [{
    id: 11, moduleName: '支付模块', testType: '功能测试', enabled: true,
    sortOrder: 1, lockVersion: 0, createdAt: '', updatedAt: '', referenced: true,
  }],
};

const schedule = {
  id: 9001, demandId: 1001, staffId: 20, date: '2026-07-22', percentage: 100,
  demandManpowerDetailId: 301, demandSpecialModuleId: 501,
  product: '示例产品', versionType: '维护', published: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function renderLoaded(schedules: any[] = [schedule], demandOverrides = {}) {
  mocks.api.getPendingDemands.mockResolvedValue([{ ...demand, ...demandOverrides }]);
  mocks.api.getSchedules.mockResolvedValue(schedules);
  mocks.api.getStaff.mockResolvedValue([staff]);
  mocks.api.getDailyStatuses.mockResolvedValue([]);
  mocks.api.getFieldConfigs.mockResolvedValue([]);
  const rendered = render(<ScheduleWorkbench />);
  await waitFor(() => expect(mocks.api.getPendingDemands).toHaveBeenCalled());
  await screen.findByText('选择需求');
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  const nativeGetComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
    nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  mocks.confirm.mockImplementation((options: any) => options.onOk?.());
  mocks.api.recommendScheduleDraft.mockResolvedValue({ generatedSchedules: [], fulfillment: [] });
  mocks.api.batchPublishSchedules.mockResolvedValue({ success: [{ demandId: 1001, scheduleCount: 1 }], failed: [] });
});

describe('ScheduleWorkbench backend scheduling flows', () => {
  it('validates the exact special target before create and keeps state on validation failure', async () => {
    mocks.api.validateSchedule
      .mockResolvedValueOnce({ valid: true })
      .mockRejectedValueOnce(new Error('人员不熟悉支付模块'));
    await renderLoaded([]);

    fireEvent.click(screen.getByText('拖动特殊模块'));
    fireEvent.click(screen.getByText('放置目标'));
    fireEvent.click(await screen.findByText('确认分配'));

    await waitFor(() => expect(mocks.api.validateSchedule).toHaveBeenCalledWith({
      demandId: 1001,
      staffId: 20,
      date: '2026-07-22',
      percentage: 100,
      demandManpowerDetailId: 301,
      demandSpecialModuleId: 501,
    }));
    expect(mocks.api.createSchedule).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('0');
    expect(mocks.messageError).toHaveBeenCalledWith('人员不熟悉支付模块');
  });

  it('creates only after validation succeeds', async () => {
    mocks.api.validateSchedule.mockResolvedValue({ valid: true });
    mocks.api.createSchedule.mockResolvedValue(schedule);
    await renderLoaded([]);

    fireEvent.click(screen.getByText('拖动特殊模块'));
    fireEvent.click(screen.getByText('放置目标'));
    const confirmButton = await screen.findByText('确认分配');
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(mocks.api.createSchedule).toHaveBeenCalledTimes(1));
    expect(mocks.api.validateSchedule.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.api.createSchedule.mock.invocationCallOrder[0]);
    expect(mocks.api.createSchedule).toHaveBeenCalledWith({
      demandId: 1001,
      staffId: 20,
      date: '2026-07-22',
      percentage: 100,
      demandManpowerDetailId: 301,
      demandSpecialModuleId: 501,
    });
  });

  it('moves an existing schedule through the ownership-preserving move endpoint', async () => {
    mocks.api.moveSchedule.mockResolvedValue({ ...schedule, date: '2026-07-23' });
    await renderLoaded();

    fireEvent.click(screen.getByText('移动排班'));

    await waitFor(() => expect(mocks.api.moveSchedule).toHaveBeenCalledWith(9001, {
      staffId: 20,
      date: '2026-07-23',
      percentage: 100,
    }));
    expect(mocks.api.deleteSchedule).not.toHaveBeenCalled();
    expect(mocks.api.createSchedule).not.toHaveBeenCalled();
  });

  it('guards duplicate moves and preserves the schedule after failure', async () => {
    const moving = deferred<any>();
    mocks.api.moveSchedule.mockReturnValue(moving.promise);
    await renderLoaded();

    fireEvent.click(screen.getByText('移动排班'));
    fireEvent.click(screen.getByText('移动排班'));
    expect(mocks.api.moveSchedule).toHaveBeenCalledTimes(1);

    moving.reject(new Error('排班数据已变化，请刷新后重试'));
    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('排班数据已变化，请刷新后重试'));
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('1');
  });

  it('sends FIXED_RANGE once with sorted dates and all controls', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByText('按指定日期排班'));
    fireEvent.click(await screen.findByText('近 8 天全选 / 取消全选'));
    const startButtons = await screen.findAllByText('开始排班');
    fireEvent.click(startButtons[0]);
    fireEvent.click(startButtons[0]);

    await waitFor(() => expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledTimes(1));
    const dates = Array.from({ length: 8 }, (_, index) => dayjs().add(index, 'day').format('YYYY-MM-DD')).sort();
    expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledWith({
      mode: 'FIXED_RANGE',
      demandIds: [1001],
      dateRange: { startDate: dates[0], endDate: dates[7] },
      fixedStaffIds: [],
      excludedStaffIds: [],
      includeSaturdays: false,
      includeSundays: false,
      replaceExistingDrafts: true,
    });
  });

  it('sends FULL_DEMAND without a date range', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByText('按全部需求排班'));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);

    await waitFor(() => expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledWith({
      mode: 'FULL_DEMAND',
      demandIds: [1001],
      fixedStaffIds: [],
      excludedStaffIds: [],
      includeSaturdays: false,
      includeSundays: false,
      replaceExistingDrafts: true,
    }));
  });

  it('ignores an unmounted recommendation completion', async () => {
    const recommendation = deferred<any>();
    mocks.api.recommendScheduleDraft.mockReturnValue(recommendation.promise);
    const { unmount } = await renderLoaded([]);
    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByText('按全部需求排班'));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);
    const initialFetches = mocks.api.getPendingDemands.mock.calls.length;

    unmount();
    recommendation.resolve({ generatedSchedules: [], fulfillment: [] });
    await Promise.resolve();

    expect(mocks.api.getPendingDemands).toHaveBeenCalledTimes(initialFetches);
  });

  it('batch publishes once and shows backend reason code and reason', async () => {
    mocks.api.batchPublishSchedules.mockResolvedValue({
      success: [],
      failed: [{ demandId: 1001, reasonCode: 'SPECIAL_MODULE_UNFULFILLED', reason: '支付模块仍缺少 0.5 人天' }],
    });
    await renderLoaded();

    fireEvent.click(screen.getByText('发布全部待发布排班'));
    fireEvent.click(screen.getByText('发布全部待发布排班'));

    await waitFor(() => expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1));
    expect(mocks.api.batchPublishSchedules).toHaveBeenCalledWith({ demandIds: [1001] });
    expect(mocks.api.publishSchedules).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalled();
    render(mocks.warning.mock.calls[0][0].content);
    expect(screen.getByText(/SPECIAL_MODULE_UNFULFILLED/)).toHaveTextContent('支付模块仍缺少 0.5 人天');
  });

  it('classifies a double-null historical schedule without changing placement', async () => {
    const historical = {
      ...schedule,
      id: 9002,
      demandManpowerDetailId: null,
      demandSpecialModuleId: null,
    };
    mocks.api.classifySchedule.mockResolvedValue({
      ...historical,
      demandManpowerDetailId: 301,
    });
    await renderLoaded([historical], { requiresHistoricalClassification: true });

    fireEvent.click(screen.getByText('查看需求'));
    const classifyButton = await screen.findByRole('button', { name: '归类排班 9002' });
    fireEvent.click(classifyButton);
    fireEvent.click(classifyButton);

    await waitFor(() => expect(mocks.api.classifySchedule).toHaveBeenCalledWith(9002, {
      demandManpowerDetailId: 301,
      demandSpecialModuleId: null,
    }));
    expect(mocks.api.classifySchedule.mock.calls[0][1]).not.toHaveProperty('staffId');
    expect(mocks.api.classifySchedule.mock.calls[0][1]).not.toHaveProperty('date');
    expect(mocks.api.classifySchedule.mock.calls[0][1]).not.toHaveProperty('percentage');
    expect(mocks.api.classifySchedule).toHaveBeenCalledTimes(1);
  });
});
