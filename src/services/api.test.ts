import { beforeEach, describe, expect, it, vi } from 'vitest';
import api, {
  type BatchPublishResponse,
  type BackendSchedule,
  type DemandSpecialModule,
  type DemandFulfillment,
  type RecommendationSchedule,
  type ScheduleRecommendationRequest,
  type ScheduleRecommendationResponse,
  type ScheduleWriteRequest,
  type TestModule,
  type TestModuleWriteRequest,
} from './api';

const moduleWriteRequest: TestModuleWriteRequest = {
  moduleName: '支付模块',
  testType: '功能测试',
  sortOrder: 1,
};

const completeModuleResponse: TestModule = {
  id: 1,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: true,
  sortOrder: 1,
  lockVersion: 0,
  createdAt: '2026-07-01T00:00:00',
  updatedAt: '2026-07-01T00:00:00',
  referenced: null,
};

// @ts-expect-error response metadata is required; write inputs use the separate type above
const incompleteModuleResponse: TestModule = {
  id: 1,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: true,
  sortOrder: 1,
};

const completeFulfillmentResponse: DemandFulfillment = {
  demandId: 10,
  fullySatisfied: false,
  requiresHistoricalClassification: false,
  specialModuleGaps: [{
    demandManpowerDetailId: 30,
    demandSpecialModuleId: 40,
    moduleId: 50,
    moduleName: '支付模块',
    testType: '功能测试',
    required: 2,
    allocated: 1,
    shortage: 1,
  }],
  generalGaps: [{
    demandManpowerDetailId: 30,
    demandSpecialModuleId: null,
    moduleId: null,
    moduleName: null,
    testType: '功能测试',
    required: 1,
    allocated: 0,
    shortage: 1,
  }],
  specialModules: [{
    demandManpowerDetailId: 30,
    demandSpecialModuleId: 40,
    moduleId: 50,
    moduleName: '支付模块',
    testType: '功能测试',
    required: 2,
    allocated: 1,
    remaining: 1,
  }],
  summary: [{
    demandManpowerDetailId: 30,
    testType: '功能测试',
    required: 3,
    specialRequired: 2,
    generalRequired: 1,
    specialAllocated: 1,
    generalAllocated: 0,
    specialRemaining: 1,
    generalRemaining: 1,
    shortage: 2,
  }],
  totalRequired: 3,
  totalAllocated: 1,
  totalShortage: 2,
};

void moduleWriteRequest;
void completeModuleResponse;
void incompleteModuleResponse;
void completeFulfillmentResponse;

const invalidSpecialGap: ScheduleRecommendationResponse['fulfillment'][number]['specialModuleGaps'][number] = {
  demandManpowerDetailId: 30,
  // @ts-expect-error special-module gaps always identify a concrete special-module row
  demandSpecialModuleId: null,
  shortage: 1,
  reasonCode: 'INSUFFICIENT_CAPACITY',
  reason: '可用人力容量不足',
};

const incompleteEnrichedModule: DemandSpecialModule = {
  id: 40,
  demandId: 10,
  moduleId: 50,
  manpowerDemand: 2,
  createdAt: '2026-07-01T00:00:00',
  updatedAt: '2026-07-01T00:00:00',
  // @ts-expect-error enriched module metadata is populated before the response is serialized
  moduleName: null,
  // @ts-expect-error enriched module metadata is populated before the response is serialized
  testType: null,
  // @ts-expect-error enriched module metadata is populated before the response is serialized
  enabled: null,
  // @ts-expect-error enriched allocation is authoritative and never null
  allocatedManpower: null,
  // @ts-expect-error enriched remaining manpower is authoritative and never null
  remainingManpower: null,
};

void invalidSpecialGap;
void incompleteEnrichedModule;

const legacyScheduleWithNullableFields: BackendSchedule = {
  id: 7,
  demandId: 8,
  staffId: 9,
  demandManpowerDetailId: 10,
  demandSpecialModuleId: null,
  date: '2026-07-01',
  percentage: 100,
  product: null,
  testManager: null,
  versionType: null,
  version: null,
  lockVersion: 0,
  published: null,
  createdAt: '2026-07-01T00:00:00',
};

void legacyScheduleWithNullableFields;

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

  it('updates a test-module enabled status', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ id: 1, enabled: false }));

    await api.setTestModuleStatus(1, false);

    expect(fetchMock).toHaveBeenCalledWith('/api/test-modules/1/status', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ enabled: false }),
    }));
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
    const generatedSchedule: RecommendationSchedule = {
      id: 99,
      demandId: 10,
      staffId: 20,
      demandManpowerDetailId: 30,
      demandSpecialModuleId: null,
      date: '2026-07-01',
      percentage: 100,
      product: '项目',
      testManager: null,
      versionType: '功能测试',
      version: null,
      lockVersion: 0,
      published: false,
      createdAt: '2026-07-01T00:00:00',
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respond({ generatedSchedules: [generatedSchedule], fulfillment: [] }))
      .mockResolvedValueOnce(respond({ valid: true }))
      .mockResolvedValueOnce(respond({
        ...generatedSchedule,
        staffId: 22,
        date: '2026-07-02',
        percentage: 50,
        product: null,
        versionType: null,
        published: null,
      }))
      .mockResolvedValueOnce(respond(batch));

    const recommendationResponse = await api.recommendScheduleDraft(recommendation);
    expect(recommendationResponse.generatedSchedules[0]).toEqual(generatedSchedule);
    await api.validateSchedule(schedule);
    const movedSchedule = await api.moveSchedule(99, { staffId: 22, date: '2026-07-02', percentage: 50 });
    expect(movedSchedule).toEqual({
      ...generatedSchedule,
      staffId: 22,
      date: '2026-07-02',
      percentage: 50,
      product: null,
      versionType: null,
      published: null,
    });
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

  it('classifies a historical schedule without placement fields', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({
      ...legacyScheduleWithNullableFields,
      demandManpowerDetailId: 30,
      demandSpecialModuleId: null,
    }));

    await api.classifySchedule(7, {
      demandManpowerDetailId: 30,
      demandSpecialModuleId: null,
    });

    expect(fetchMock).toHaveBeenCalledWith('/api/schedules/7/classify', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        demandManpowerDetailId: 30,
        demandSpecialModuleId: null,
      }),
    }));
  });

  it('clears demand schedules with default draft-only and explicit all scopes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => respond(null));

    await api.deleteSchedulesByDemand(10);
    await api.deleteSchedulesByDemand(11, 'all');

    expect(fetchMock.mock.calls.map(([url, options]) => [url, options?.method])).toEqual([
      ['/api/schedules/demand/10', 'DELETE'],
      ['/api/schedules/demand/11?scope=all', 'DELETE'],
    ]);
  });
});
