import { beforeEach, describe, expect, it, vi } from 'vitest';
import api, {
  type BatchPublishResponse,
  type ScheduleRecommendationRequest,
  type ScheduleWriteRequest,
} from './api';

function respond(data: unknown, message = 'success') {
  return new Response(JSON.stringify({ code: 200, message, data }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiService special-module contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.logout();
  });

  it('preserves backend business error code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 400,
      message: '人员不熟悉支付模块',
      data: { errorCode: 'STAFF_MODULE_NOT_FAMILIAR' },
    })));

    await expect(api.validateSchedule({} as ScheduleWriteRequest)).rejects.toMatchObject({
      message: '人员不熟悉支付模块',
      errorCode: 'STAFF_MODULE_NOT_FAMILIAR',
    });
  });

  it('uses the test-module CRUD endpoints', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respond([]))
      .mockResolvedValueOnce(respond({ id: 1 }))
      .mockResolvedValueOnce(respond({ id: 1 }))
      .mockResolvedValueOnce(respond(null));

    await api.getTestModules('功能测试', true);
    await api.createTestModule({ moduleName: '支付模块', testType: '功能测试', sortOrder: 1 });
    await api.updateTestModule(1, { moduleName: '支付模块', testType: '功能测试', sortOrder: 2 });
    await api.deleteTestModule(1);

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method, options?.body])).toEqual([
      ['/api/test-modules?testType=%E5%8A%9F%E8%83%BD%E6%B5%8B%E8%AF%95&enabled=true', undefined, undefined],
      ['/api/test-modules', 'POST', JSON.stringify({ moduleName: '支付模块', testType: '功能测试', sortOrder: 1 })],
      ['/api/test-modules/1', 'PUT', JSON.stringify({ moduleName: '支付模块', testType: '功能测试', sortOrder: 2 })],
      ['/api/test-modules/1', 'DELETE', undefined],
    ]);
  });

  it('migrates legacy staff modules through the staff endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ createdRelations: 2 }));

    await api.migrateLegacyStaffModules();

    expect(fetchMock).toHaveBeenCalledWith('/api/staff/modules/migrate-legacy', expect.objectContaining({
      method: 'POST',
    }));
  });

  it('sends recommendation, validation, move, and batch publish contracts', async () => {
    const recommendation: ScheduleRecommendationRequest = {
      mode: 'FIXED_RANGE',
      demandIds: [10],
      dateRange: { startDate: '2026-07-01', endDate: '2026-07-03' },
      fixedStaffIds: [20],
      excludedStaffIds: [21],
      includeSaturdays: false,
      includeSundays: false,
      replaceExistingDrafts: true,
    };
    const schedule: ScheduleWriteRequest = {
      demandId: 10,
      staffId: 20,
      date: '2026-07-01',
      percentage: 100,
      demandManpowerDetailId: 30,
      demandSpecialModuleId: 40,
    };
    const batch: BatchPublishResponse = { success: [], failed: [] };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respond({ generatedSchedules: [], fulfillment: [] }))
      .mockResolvedValueOnce(respond({ valid: true }))
      .mockResolvedValueOnce(respond({ id: 99 }))
      .mockResolvedValueOnce(respond(batch));

    await api.recommendScheduleDraft(recommendation);
    await api.validateSchedule(schedule);
    await api.moveSchedule(99, { staffId: 22, date: '2026-07-02', percentage: 50 });
    await api.batchPublishSchedules({ demandIds: [10, 11] });

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method, options?.body])).toEqual([
      ['/api/schedules/recommend/draft', 'POST', JSON.stringify(recommendation)],
      ['/api/schedules/validate', 'POST', JSON.stringify(schedule)],
      ['/api/schedules/99/move', 'POST', JSON.stringify({ staffId: 22, date: '2026-07-02', percentage: 50 })],
      ['/api/schedules/batch-publish', 'POST', JSON.stringify({ demandIds: [10, 11] })],
    ]);
  });

  it('keeps bearer authorization on new requests', async () => {
    api.setToken('test-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond([]));

    await api.getTestModules();

    expect(fetchMock).toHaveBeenCalledWith('/api/test-modules', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
    }));
  });
});
