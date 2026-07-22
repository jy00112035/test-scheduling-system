import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
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
    <button onClick={props.onClearAllDrafts}>清除全部草稿</button>
    <button
      data-publish-loading={String(Boolean(props.publishLoading))}
      onClick={props.onPublishAll}
    >发布全部待发布排班</button>
  </div>,
}));
vi.mock('./workbench/DemandQueue', () => ({
  default: (props: any) => <div>
    <button onClick={() => props.onSelectDemand(1001)}>选择需求</button>
    <button onClick={() => props.onViewDetail(props.demands[0])}>查看需求</button>
    <button onClick={() => props.onClearDemand(1001)}>清除需求</button>
    <button onClick={() => props.onPublishDemand(1001)}>发布需求</button>
    <button onClick={() => props.onAllocationTargetDragStart({
      dataTransfer: { effectAllowed: '', setDragImage: vi.fn() },
    }, {
      kind: 'special', demandId: 1001, demandManpowerDetailId: 301,
      demandSpecialModuleId: 501, testType: '功能测试', moduleId: 11,
      moduleName: '支付模块', remainingManpower: 1,
    })}>拖动特殊模块</button>
    <button onClick={() => props.onAllocationTargetDragStart({
      dataTransfer: { effectAllowed: '', setDragImage: vi.fn() },
    }, {
      kind: 'general', demandId: 1001, demandManpowerDetailId: 301,
      testType: '功能测试', remainingManpower: 1,
    })}>拖动通用人力</button>
    <button onClick={props.onAllocationTargetDragEnd}>结束目标拖动</button>
  </div>,
}));
vi.mock('./workbench/ScheduleTimeline', () => ({
  default: (props: any) => <div>
    <span data-testid="schedule-count">{props.schedules.length}</span>
    <button onClick={() => props.onDrop(props.staffs[0], '2026-07-22')}>放置目标</button>
    <button onClick={() => props.onScheduleTransfer(props.schedules[0], props.staffs[0], '2026-07-23')}>移动排班</button>
    <button onClick={() => props.onDeleteSchedule(props.schedules[0])}>删除排班</button>
    <button onClick={() => props.onEditSchedule(props.schedules[0])}>编辑排班</button>
  </div>,
}));
vi.mock('./workbench/IssuePublishPanel', () => ({
  default: (props: any) => <div>
    <span data-testid="fulfillment-count">{props.fulfillment.length}</span>
    <span data-testid="publish-failure-count">{props.publishFailures.length}</span>
  </div>,
}));

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
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
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

const recommendationFulfillment = {
  demandId: 1001,
  fullySatisfied: false,
  requiresHistoricalClassification: true,
  specialModuleGaps: [{
    demandManpowerDetailId: 301, demandSpecialModuleId: 501,
    shortage: 1, reasonCode: 'NO_QUALIFIED_STAFF', reason: '没有合格人员',
  }],
  generalGaps: [],
  specialModules: [{
    demandManpowerDetailId: 301, demandSpecialModuleId: 501,
    moduleId: 11, moduleName: '支付模块', testType: '功能测试',
    required: 1, allocated: 0, remaining: 1,
  }],
  summary: [{
    demandManpowerDetailId: 301, testType: '功能测试', required: 2,
    specialRequired: 1, generalRequired: 1,
    specialAllocated: 0, generalAllocated: 1,
    specialRemaining: 1, generalRemaining: 0, shortage: 1,
  }],
  totalRequired: 2,
  totalAllocated: 1,
  totalShortage: 1,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function renderLoaded(schedules: any[] = [schedule], demandOverrides = {}, staffOverrides = {}) {
  mocks.api.getPendingDemands.mockResolvedValue([{ ...demand, ...demandOverrides }]);
  mocks.api.getSchedules.mockResolvedValue(schedules);
  mocks.api.getStaff.mockResolvedValue([{ ...staff, ...staffOverrides }]);
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

  it('validates a general target before create without special ownership', async () => {
    mocks.api.validateSchedule.mockResolvedValue({ valid: true });
    mocks.api.createSchedule.mockResolvedValue({
      ...schedule,
      demandSpecialModuleId: null,
    });
    await renderLoaded([]);

    fireEvent.click(screen.getByText('拖动通用人力'));
    fireEvent.click(screen.getByText('放置目标'));
    fireEvent.click(await screen.findByText('确认分配'));

    const expectedRequest = {
      demandId: 1001,
      staffId: 20,
      date: '2026-07-22',
      percentage: 100,
      demandManpowerDetailId: 301,
    };
    await waitFor(() => expect(mocks.api.createSchedule).toHaveBeenCalledWith(expectedRequest));
    expect(mocks.api.validateSchedule).toHaveBeenCalledWith(expectedRequest);
    expect(mocks.api.validateSchedule.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.api.createSchedule.mock.invocationCallOrder[0]);
    expect(mocks.api.createSchedule.mock.calls[0][0]).not.toHaveProperty('demandSpecialModuleId');
  });

  it.each([
    [0.04, '10'],
    [1.8, '100'],
  ])('clamps coefficient %s to an allowed manual percentage', async (coefficient, expected) => {
    mocks.api.validateSchedule.mockResolvedValue({ valid: true });
    await renderLoaded([], {}, { currentCoefficient: coefficient });

    fireEvent.click(screen.getByText('拖动特殊模块'));
    fireEvent.click(screen.getByText('放置目标'));

    const input = await screen.findByRole('spinbutton', { name: '分配投入比例' });
    expect(input).toHaveAttribute('aria-valuemin', '10');
    expect(input).toHaveAttribute('aria-valuemax', '100');
    expect(input).toHaveAttribute('step', '10');
    expect(input).toHaveValue(expected);
  });

  it('normalizes edited percentage before sending the move request', async () => {
    mocks.api.moveSchedule.mockResolvedValue({ ...schedule, percentage: 60 });
    await renderLoaded();

    fireEvent.click(screen.getByText('编辑排班'));
    const input = await screen.findByRole('spinbutton', { name: '编辑投入比例' });
    expect(input).toHaveAttribute('aria-valuemin', '10');
    expect(input).toHaveAttribute('aria-valuemax', '100');
    expect(input).toHaveAttribute('step', '10');
    fireEvent.change(input, { target: { value: '57' } });
    fireEvent.click(screen.getByText('确认修改'));

    await waitFor(() => expect(mocks.api.moveSchedule).toHaveBeenCalledWith(9001, {
      staffId: 20,
      date: '2026-07-22',
      percentage: 60,
    }));
  });

  it('clears stale allocation state on modal cancel and unsuccessful drag end', async () => {
    mocks.api.validateSchedule.mockResolvedValue({ valid: true });
    await renderLoaded([]);

    fireEvent.click(screen.getByText('拖动特殊模块'));
    fireEvent.click(screen.getByText('放置目标'));
    await screen.findByRole('dialog', { name: '分配测试任务' });
    expect(mocks.api.validateSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '取 消' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '分配测试任务' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('放置目标'));
    expect(mocks.api.validateSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('拖动通用人力'));
    fireEvent.click(screen.getByText('结束目标拖动'));
    fireEvent.click(screen.getByText('放置目标'));
    expect(mocks.api.validateSchedule).toHaveBeenCalledTimes(1);
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

  it('does not dispatch an existing special move to unfamiliar staff', async () => {
    await renderLoaded([schedule], {}, { familiarModules: [] });

    fireEvent.click(screen.getByText('移动排班'));

    expect(mocks.api.moveSchedule).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('1');
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

  it('refreshes authoritative data and clears recommendation diagnostics after delete', async () => {
    mocks.api.recommendScheduleDraft.mockResolvedValue({
      generatedSchedules: [], fulfillment: [recommendationFulfillment],
    });
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: '按全部需求排班' }));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);
    await waitFor(() => expect(screen.getByTestId('fulfillment-count')).toHaveTextContent('1'));
    const fetchesBeforeDelete = mocks.api.getSchedules.mock.calls.length;
    mocks.api.getSchedules.mockResolvedValue([]);

    fireEvent.click(screen.getByText('删除排班'));

    await waitFor(() => expect(mocks.api.deleteSchedule).toHaveBeenCalledWith(9001));
    await waitFor(() => expect(mocks.api.getSchedules.mock.calls.length).toBeGreaterThan(fetchesBeforeDelete));
    expect(screen.getByTestId('fulfillment-count')).toHaveTextContent('0');
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('0');
  });

  it('retries only refresh when delete succeeded but reconciliation failed', async () => {
    await renderLoaded();
    mocks.api.getSchedules.mockResolvedValue([]);
    mocks.api.getPendingDemands.mockRejectedValueOnce(new Error('删除刷新失败'));

    fireEvent.click(screen.getByText('删除排班'));

    expect(await screen.findByRole('alert')).toHaveTextContent('数据刷新失败：删除刷新失败');
    expect(mocks.messageSuccess).not.toHaveBeenCalledWith('已删除排班');
    expect(mocks.messageWarning).toHaveBeenCalledWith('排班已删除，但数据刷新失败，请重试刷新');
    fireEvent.click(screen.getByRole('button', { name: '重试刷新' }));
    await waitFor(() => expect(screen.queryByText(/数据刷新失败/)).not.toBeInTheDocument());
    expect(mocks.api.deleteSchedule).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('0');
  });

  it('does not claim reconciliation when refreshed staff availability fails', async () => {
    await renderLoaded();
    mocks.api.getSchedules.mockResolvedValue([]);
    mocks.api.getDailyStatuses.mockRejectedValueOnce(new Error('可用状态刷新失败'));

    fireEvent.click(screen.getByText('删除排班'));

    expect(await screen.findByRole('alert')).toHaveTextContent('数据刷新失败：可用状态刷新失败');
    expect(mocks.messageSuccess).not.toHaveBeenCalledWith('已删除排班');
    expect(mocks.messageWarning).toHaveBeenCalledWith('排班已删除，但数据刷新失败，请重试刷新');
    fireEvent.click(screen.getByRole('button', { name: '重试刷新' }));
    await waitFor(() => expect(screen.queryByText(/数据刷新失败/)).not.toBeInTheDocument());
    expect(mocks.api.deleteSchedule).toHaveBeenCalledTimes(1);
  });

  it('defensively refuses individual deletion of a published schedule', async () => {
    await renderLoaded([{ ...schedule, published: true }]);

    fireEvent.click(screen.getByText('删除排班'));

    expect(mocks.api.deleteSchedule).not.toHaveBeenCalled();
    expect(mocks.messageWarning).toHaveBeenCalledWith('已发布排班请按需求整体清理');
  });

  it('ignores a recommendation response made stale by a schedule mutation', async () => {
    const recommendation = deferred<any>();
    mocks.api.recommendScheduleDraft.mockReturnValue(recommendation.promise);
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: '按全部需求排班' }));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);
    await waitFor(() => expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledOnce());
    mocks.api.getSchedules.mockResolvedValue([]);
    fireEvent.click(screen.getByText('删除排班'));
    await waitFor(() => expect(mocks.api.deleteSchedule).toHaveBeenCalledWith(9001));

    recommendation.resolve({ generatedSchedules: [], fulfillment: [recommendationFulfillment] });

    await waitFor(() => expect(screen.getByTestId('schedule-count')).toHaveTextContent('0'));
    expect(screen.getByTestId('fulfillment-count')).toHaveTextContent('0');
  });

  it('refreshes schedules and enriched demands after clearing all drafts', async () => {
    await renderLoaded();
    const scheduleFetches = mocks.api.getSchedules.mock.calls.length;
    const demandFetches = mocks.api.getPendingDemands.mock.calls.length;
    mocks.api.getSchedules.mockResolvedValue([]);

    fireEvent.click(screen.getByText('清除全部草稿'));

    await waitFor(() => expect(mocks.api.deleteSchedule).toHaveBeenCalledWith(9001));
    await waitFor(() => expect(mocks.api.getSchedules.mock.calls.length).toBeGreaterThan(scheduleFetches));
    expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(demandFetches);
  });

  it('refreshes schedules and enriched demands after clearing one demand', async () => {
    const published = { ...schedule, id: 9002, published: true };
    await renderLoaded([schedule, published]);
    const scheduleFetches = mocks.api.getSchedules.mock.calls.length;
    const demandFetches = mocks.api.getPendingDemands.mock.calls.length;
    mocks.api.getSchedules.mockResolvedValue([]);

    fireEvent.click(screen.getByText('清除需求'));

    await waitFor(() => expect(mocks.api.deleteSchedulesByDemand).toHaveBeenCalledWith(1001, 'all'));
    expect(mocks.api.deleteSchedulesByDemand).toHaveBeenCalledTimes(1);
    expect(mocks.api.deleteSchedule).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.api.getSchedules.mock.calls.length).toBeGreaterThan(scheduleFetches));
    expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(demandFetches);
  });

  it('keeps authoritative rows when atomic demand clear fails', async () => {
    const published = { ...schedule, id: 9002, published: true };
    mocks.api.deleteSchedulesByDemand.mockRejectedValue(new Error('无权清理已发布排班'));
    await renderLoaded([schedule, published]);
    const scheduleFetches = mocks.api.getSchedules.mock.calls.length;

    fireEvent.click(screen.getByText('清除需求'));

    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('无权清理已发布排班'));
    expect(mocks.api.deleteSchedulesByDemand).toHaveBeenCalledTimes(1);
    expect(mocks.api.deleteSchedule).not.toHaveBeenCalled();
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('2');
    expect(mocks.api.getSchedules.mock.calls.length).toBeGreaterThan(scheduleFetches);
  });

  it('single publish is guarded and refreshes backend authority', async () => {
    const publishing = deferred<void>();
    mocks.api.publishSchedules.mockReturnValue(publishing.promise);
    await renderLoaded();
    const fetchesBefore = mocks.api.getPendingDemands.mock.calls.length;

    fireEvent.click(screen.getByText('发布需求'));
    fireEvent.click(screen.getByText('发布需求'));
    expect(mocks.api.publishSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.api.publishSchedules).toHaveBeenCalledWith(1001);

    publishing.resolve();
    await waitFor(() => expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(fetchesBefore));
  });

  it('sends FIXED_RANGE once with the visible contiguous range and fixed-range weekend flags', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByRole('button', { name: '按指定日期排班' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择未来 8 天连续范围' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '固定范围包含周六' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '固定范围包含周日' }));
    const startButtons = await screen.findAllByText('开始排班');
    fireEvent.click(startButtons[0]);
    fireEvent.click(startButtons[0]);

    await waitFor(() => expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledTimes(1));
    expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledWith({
      mode: 'FIXED_RANGE',
      demandIds: [1001],
      dateRange: {
        startDate: dayjs().format('YYYY-MM-DD'),
        endDate: dayjs().add(7, 'day').format('YYYY-MM-DD'),
      },
      fixedStaffIds: [],
      excludedStaffIds: [],
      includeSaturdays: true,
      includeSundays: true,
      replaceExistingDrafts: true,
    });
  });

  it('sends FULL_DEMAND with its independent weekend flags and no date range', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByText('按全部需求排班'));
    fireEvent.click(screen.getByRole('checkbox', { name: '全部需求包含周日' }));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);

    await waitFor(() => expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledWith({
      mode: 'FULL_DEMAND',
      demandIds: [1001],
      fixedStaffIds: [],
      excludedStaffIds: [],
      includeSaturdays: false,
      includeSundays: true,
      replaceExistingDrafts: true,
    }));
  });

  it('resets fixed-range dates and weekends when the modal is canceled and reopened', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: '按指定日期排班' }));
    fireEvent.click(await screen.findByRole('button', { name: '选择未来 8 天连续范围' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '固定范围包含周六' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: '按指定日期排班' }));

    expect(screen.getByRole('checkbox', { name: '固定范围包含周六' })).not.toBeChecked();
    expect(screen.getByText('尚未选择连续日期范围')).toBeInTheDocument();
    const startButtons = await screen.findAllByText('开始排班');
    expect(startButtons[0].closest('button')).toBeDisabled();
    expect(screen.queryByText('近 8 天全选 / 取消全选')).not.toBeInTheDocument();
  });

  it('resets full-demand weekend flags when the modal is canceled and reopened', async () => {
    await renderLoaded([]);
    fireEvent.click(screen.getByRole('button', { name: '按全部需求排班' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '全部需求包含周六' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: '按全部需求排班' }));

    expect(screen.getByRole('checkbox', { name: '全部需求包含周六' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '全部需求包含周日' })).not.toBeChecked();
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

  it('shows retry without a success claim when recommendation refresh fails', async () => {
    await renderLoaded([]);
    mocks.api.getPendingDemands.mockRejectedValueOnce(new Error('需求刷新失败'));

    fireEvent.click(screen.getByText('选择需求'));
    fireEvent.click(screen.getByText('按全部需求排班'));
    fireEvent.click((await screen.findAllByText('开始排班'))[0]);

    expect(await screen.findByRole('alert')).toHaveTextContent('数据刷新失败：需求刷新失败');
    expect(mocks.messageSuccess).not.toHaveBeenCalledWith(expect.stringContaining('推荐排班完成'));
    expect(mocks.messageWarning).toHaveBeenCalledWith('推荐排班已生成，但数据刷新失败，请重试刷新');
    fireEvent.click(screen.getByRole('button', { name: '重试刷新' }));
    await waitFor(() => expect(screen.queryByText(/数据刷新失败/)).not.toBeInTheDocument());
    expect(mocks.api.recommendScheduleDraft).toHaveBeenCalledTimes(1);
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

  it('discards stale batch failures when a newer delete reconciles first', async () => {
    const batchRefresh = deferred<any[]>();
    mocks.api.batchPublishSchedules.mockResolvedValue({
      success: [],
      failed: [{ demandId: 1001, reasonCode: 'STALE_BATCH_FAILURE', reason: '旧批次失败原因' }],
    });
    await renderLoaded();
    mocks.api.getPendingDemands
      .mockReturnValueOnce(batchRefresh.promise)
      .mockResolvedValue([{ ...demand }]);
    mocks.api.getSchedules
      .mockResolvedValueOnce([schedule])
      .mockResolvedValue([]);

    fireEvent.click(screen.getByText('发布全部待发布排班'));
    await waitFor(() => expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(screen.getByText('删除排班'));
    await waitFor(() => expect(mocks.api.deleteSchedule).toHaveBeenCalledWith(9001));
    await waitFor(() => expect(screen.getByTestId('schedule-count')).toHaveTextContent('0'));

    batchRefresh.resolve([{ ...demand }]);
    await waitFor(() => expect(screen.getByText('发布全部待发布排班'))
      .toHaveAttribute('data-publish-loading', 'false'));

    expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(screen.getByTestId('publish-failure-count')).toHaveTextContent('0');
    expect(screen.queryByText(/STALE_BATCH_FAILURE|旧批次失败原因/)).not.toBeInTheDocument();
    expect(screen.getByTestId('schedule-count')).toHaveTextContent('0');
  });

  it('does not let an invalidated first batch clear a newer batch loading state', async () => {
    const firstRefresh = deferred<any[]>();
    const secondBatch = deferred<any>();
    mocks.api.batchPublishSchedules
      .mockResolvedValueOnce({ success: [{ demandId: 1001, scheduleCount: 1 }], failed: [] })
      .mockReturnValueOnce(secondBatch.promise);
    mocks.api.moveSchedule.mockResolvedValue({ ...schedule, date: '2026-07-23' });
    await renderLoaded();
    mocks.api.getPendingDemands
      .mockReturnValueOnce(firstRefresh.promise)
      .mockResolvedValue([{ ...demand }]);
    mocks.api.getSchedules
      .mockResolvedValueOnce([schedule])
      .mockResolvedValue([{ ...schedule, date: '2026-07-23' }]);

    const publishButton = screen.getByText('发布全部待发布排班');
    fireEvent.click(publishButton);
    await waitFor(() => expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(screen.getByText('移动排班'));
    await waitFor(() => expect(mocks.api.moveSchedule).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(publishButton).toHaveAttribute('data-publish-loading', 'false'));

    fireEvent.click(publishButton);
    expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(2);
    expect(publishButton).toHaveAttribute('data-publish-loading', 'true');

    await act(async () => {
      firstRefresh.resolve([{ ...demand }]);
      await firstRefresh.promise;
    });
    expect(publishButton).toHaveAttribute('data-publish-loading', 'true');
    expect(mocks.messageSuccess).not.toHaveBeenCalledWith(expect.stringContaining('已成功发布'));

    secondBatch.resolve({ success: [{ demandId: 1001, scheduleCount: 1 }], failed: [] });
    await waitFor(() => expect(publishButton).toHaveAttribute('data-publish-loading', 'false'));
  });

  it('holds the shared publish request lock after diagnostics ownership is invalidated', async () => {
    const batchRequest = deferred<any>();
    mocks.api.batchPublishSchedules.mockReturnValue(batchRequest.promise);
    mocks.api.moveSchedule.mockResolvedValue({ ...schedule, date: '2026-07-23' });
    mocks.api.publishSchedules.mockResolvedValue(undefined);
    await renderLoaded();
    mocks.api.getSchedules.mockResolvedValue([{ ...schedule, date: '2026-07-23' }]);

    const publishAllButton = screen.getByText('发布全部待发布排班');
    fireEvent.click(publishAllButton);
    await waitFor(() => expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1));
    expect(publishAllButton).toHaveAttribute('data-publish-loading', 'true');

    fireEvent.click(screen.getByText('移动排班'));
    await waitFor(() => expect(mocks.api.moveSchedule).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.api.getSchedules.mock.calls.length).toBeGreaterThan(1));

    fireEvent.click(publishAllButton);
    fireEvent.click(screen.getByText('发布需求'));
    expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1);
    expect(mocks.api.publishSchedules).not.toHaveBeenCalled();
    expect(publishAllButton).toHaveAttribute('data-publish-loading', 'true');

    await act(async () => {
      batchRequest.resolve({
        success: [],
        failed: [{ demandId: 1001, reasonCode: 'STALE_FAILURE', reason: '旧发布失败' }],
      });
      await batchRequest.promise;
    });
    await waitFor(() => expect(publishAllButton).toHaveAttribute('data-publish-loading', 'false'));

    fireEvent.click(screen.getByText('发布需求'));
    await waitFor(() => expect(mocks.api.publishSchedules).toHaveBeenCalledTimes(1));
    expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1);
  });

  it('releases the shared publish request lock when the owning request rejects', async () => {
    const batchRequest = deferred<any>();
    mocks.api.batchPublishSchedules.mockReturnValue(batchRequest.promise);
    mocks.api.publishSchedules.mockResolvedValue(undefined);
    await renderLoaded();

    const publishAllButton = screen.getByText('发布全部待发布排班');
    fireEvent.click(publishAllButton);
    await waitFor(() => expect(mocks.api.batchPublishSchedules).toHaveBeenCalledTimes(1));

    await act(async () => {
      batchRequest.reject(new Error('批量发布请求失败'));
      try {
        await batchRequest.promise;
      } catch { /* expected request failure */ }
    });
    await waitFor(() => expect(mocks.messageError).toHaveBeenCalledWith('批量发布请求失败'));
    await waitFor(() => expect(publishAllButton).toHaveAttribute('data-publish-loading', 'false'));

    fireEvent.click(screen.getByText('发布需求'));
    await waitFor(() => expect(mocks.api.publishSchedules).toHaveBeenCalledTimes(1));
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
    const demandFetches = mocks.api.getPendingDemands.mock.calls.length;
    mocks.api.getPendingDemands.mockResolvedValue([{
      ...demand, requiresHistoricalClassification: false,
    }]);

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
    await waitFor(() => expect(mocks.api.getPendingDemands.mock.calls.length).toBeGreaterThan(demandFetches));
  });

  it('retries only refresh when classification was saved but reconciliation failed', async () => {
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
    mocks.api.getPendingDemands.mockRejectedValueOnce(new Error('归类刷新失败'));

    fireEvent.click(screen.getByText('查看需求'));
    fireEvent.click(await screen.findByRole('button', { name: '归类排班 9002' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('数据刷新失败：归类刷新失败');
    expect(mocks.messageSuccess).not.toHaveBeenCalledWith('历史排班已归类');
    expect(mocks.messageWarning).toHaveBeenCalledWith('历史排班归类已保存，但数据刷新失败，请重试刷新');
    fireEvent.click(screen.getByRole('button', { name: '重试刷新' }));
    await waitFor(() => expect(screen.queryByText(/数据刷新失败/)).not.toBeInTheDocument());
    expect(mocks.api.classifySchedule).toHaveBeenCalledTimes(1);
  });
});
