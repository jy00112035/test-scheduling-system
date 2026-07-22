// ============================================================
// ScheduleWorkbench — 人力排布工作台（页面容器）
// Phase 1 重构：拆分子组件，保留全部现有功能
// ============================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Button, Tag, Space, Modal, message, InputNumber, Descriptions, Divider,
  DatePicker, Checkbox, Card, Select, Alert,
} from 'antd';
import { CheckOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { useUserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';
import { DailyAvailabilityStatus, DailyStatusLabels } from '../types';
import type { ScheduleRecommendationResponse } from '../types';

// 子组件
import WorkbenchSummaryBar from './workbench/WorkbenchSummaryBar';
import DemandQueue from './workbench/DemandQueue';
import ScheduleTimeline from './workbench/ScheduleTimeline';
import IssuePublishPanel from './workbench/IssuePublishPanel';

// 工具
import {
  getWeekDates,
  getVersionTypeColor,
  getPriorityColor,
  getDailyStatus,
  getDailyStatusPercentage,
  isAvailableForAssignment,
  detectConflicts,
  calculateBatchMetrics,
  isStaffEligibleForAllocationTarget,
  getHighRiskDemandDetails,
  saveDraftToLocalStorage,
  loadDraftFromLocalStorage,
  clearDraftFromLocalStorage,
  normalizeSchedulePercentage,
  getAllocationTargetForSchedule,
  groupSchedulesByDemandOwnership,
} from './workbench/workbenchCalculations';

import type {
  ScheduleItem,
  DemandItem,
  StaffItem,
  DailyStatusEntry,
  ConflictDetail,
  UnfulfilledDetail,
  BatchMetrics,
  AllocationTarget,
} from './workbench/workbenchTypes';

const { confirm } = Modal;

interface PublishRun {
  session: number;
  mutationSession: number;
}

// ============================================================

const ScheduleWorkbench: React.FC = () => {
  // ---- 数据状态 ----
  const [demands, setDemands] = useState<DemandItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [staffs, setStaffs] = useState<StaffItem[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<DemandItem | null>(null);
  const [conflictDetails, setConflictDetails] = useState<ConflictDetail[]>([]);
  const [weekViewDate, setWeekViewDate] = useState<dayjs.Dayjs>(dayjs());

  // 分配弹窗
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ staff: StaffItem; date: string } | null>(null);
  const [assignPercentage, setAssignPercentage] = useState(100);
  const [assignDays, setAssignDays] = useState(1);
  const [assignLoading, setAssignLoading] = useState(false);

  // 编辑弹窗
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editPercentage, setEditPercentage] = useState(100);
  const [editLoading, setEditLoading] = useState(false);

  // 拖拽
  const [draggedSchedule, setDraggedSchedule] = useState<ScheduleItem | null>(null);
  const [draggedAllocationTarget, setDraggedAllocationTarget] = useState<AllocationTarget | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);

  // 待提交变更
  const [pendingChangeDemandIds, setPendingChangeDemandIds] = useState<Set<number>>(new Set());

  // 每日可用状态
  const [dailyStatuses, setDailyStatuses] = useState<Map<string, DailyStatusEntry>>(new Map());
  const [statusPopoverOpen, setStatusPopoverOpen] = useState<string | null>(null);
  const [statusPctDraft, setStatusPctDraft] = useState(100);
  const [statusDraft, setStatusDraft] = useState<DailyAvailabilityStatus>('AVAILABLE');

  // 筛选
  const [filterDemandTestTypes, setFilterDemandTestTypes] = useState<string[]>([]);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);

  // 详情弹窗
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailDemand, setDetailDemand] = useState<DemandItem | null>(null);
  const [classificationDrafts, setClassificationDrafts] = useState<Record<number, {
    demandManpowerDetailId?: number;
    demandSpecialModuleId?: number | null;
  }>>({});

  // 推荐排班
  const [dateRecModalOpen, setDateRecModalOpen] = useState(false);
  const [fixedDateRange, setFixedDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [fullAllocModalOpen, setFullAllocModalOpen] = useState(false);
  const [fixedIncludeSaturdays, setFixedIncludeSaturdays] = useState(false);
  const [fixedIncludeSundays, setFixedIncludeSundays] = useState(false);
  const [fullIncludeSaturdays, setFullIncludeSaturdays] = useState(false);
  const [fullIncludeSundays, setFullIncludeSundays] = useState(false);
  const [selectedDemandIds, setSelectedDemandIds] = useState<Set<number>>(new Set());
  const [fixedStaffIds, setFixedStaffIds] = useState<Set<number>>(new Set());
  const [excludedStaffIds, setExcludedStaffIds] = useState<Set<number>>(new Set());
  const [unfulfilledDemands, setUnfulfilledDemands] = useState<Set<number>>(new Set());
  const [unfulfilledDetails, setUnfulfilledDetails] = useState<UnfulfilledDetail[]>([]);
  const [recommendationFulfillment, setRecommendationFulfillment] = useState<ScheduleRecommendationResponse['fulfillment']>([]);
  const [publishFailures, setPublishFailures] = useState<Array<{ demandId: number; reasonCode: string; reason: string }>>([]);
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null);
  const [refreshRetryLoading, setRefreshRetryLoading] = useState(false);

  // 风险详情弹窗
  const [riskModalOpen, setRiskModalOpen] = useState(false);

  // 缺口详情弹窗
  const [gapModalOpen, setGapModalOpen] = useState(false);

  // 发布全部
  const [publishAllLoading, setPublishAllLoading] = useState(false);

  // 优先级编辑
  const [editingPriorityId, setEditingPriorityId] = useState<number | null>(null);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);

  const { hasPermission, hasRole } = useUserRole();
  const { user } = useAuth();
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const fetchGenerationRef = useRef(0);
  const scheduleMutationGenerationRef = useRef(0);
  const recommendationRunRef = useRef<number | null>(null);
  const publishRunRef = useRef<PublishRun | null>(null);
  const publishHttpInFlightRef = useRef<object | null>(null);
  const scheduleMutationIdsRef = useRef(new Set<number>());
  const classificationIdsRef = useRef(new Set<number>());
  const manualCreateRef = useRef(false);
  const dropValidationRef = useRef<number | null>(null);
  const allocationPhaseRef = useRef<'idle' | 'selected' | 'dragging' | 'validating' | 'modal' | 'submitting'>('idle');
  const refreshRetryRef = useRef(false);

  const resetAllocationSession = useCallback(() => {
    allocationPhaseRef.current = 'idle';
    dropValidationRef.current = null;
    setDraggedAllocationTarget(null);
    setSelectedDemand(null);
    setAssignTarget(null);
    setDragOverCell(null);
    setAssignModalVisible(false);
    setAssignPercentage(100);
    setAssignDays(1);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    const unmountSession = ++operationGenerationRef.current;
    scheduleMutationGenerationRef.current = unmountSession;
    fetchGenerationRef.current += 1;
    recommendationRunRef.current = null;
    publishRunRef.current = null;
    scheduleMutationIdsRef.current.clear();
    classificationIdsRef.current.clear();
    manualCreateRef.current = false;
    dropValidationRef.current = null;
    allocationPhaseRef.current = 'idle';
    refreshRetryRef.current = false;
  }, []);

  // ---- 页面初始化 ----
  useEffect(() => {
    void refreshAuthoritativeData().catch(() => {});
    fetchPriorityOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Legacy dependency behavior; refactor under dedicated tests.
  }, []);

  // ---- 草稿持久化：beforeunload ----
  useEffect(() => {
    const hasUnsaved = pendingChangeDemandIds.size > 0 || selectedDemandIds.size > 0;
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingChangeDemandIds, selectedDemandIds]);

  // ---- 草稿持久化：localStorage 自动保存 ----
  useEffect(() => {
    if (pendingChangeDemandIds.size > 0 || selectedDemandIds.size > 0) {
      const timer = setTimeout(() => {
        saveDraftToLocalStorage({
          selectedDemandIds: Array.from(selectedDemandIds),
          pendingChangeDemandIds: Array.from(pendingChangeDemandIds),
        });
      }, 2000); // 2 秒 debounce
      return () => clearTimeout(timer);
    } else {
      // 两个集合都为空时，清除草稿
      clearDraftFromLocalStorage();
    }
  }, [selectedDemandIds, pendingChangeDemandIds]);

  // ---- 草稿恢复 ----
  useEffect(() => {
    const draft = loadDraftFromLocalStorage();
    if (draft && (draft.selectedDemandIds.length > 0 || draft.pendingChangeDemandIds.length > 0)) {
      confirm({
        title: '恢复未完成的排班',
        content: '检测到上次未完成的排班操作，是否恢复选择的需求和待提交变更？',
        okText: '恢复',
        cancelText: '丢弃',
        onOk: () => {
          setSelectedDemandIds(new Set(draft.selectedDemandIds));
          setPendingChangeDemandIds(new Set(draft.pendingChangeDemandIds));
        },
        onCancel: () => {
          clearDraftFromLocalStorage();
        },
      });
    }
  }, []); // 仅在页面加载时执行一次

  // ---- 数据获取 ----
  const fetchPriorityOptions = async () => {
    try {
      const configs = await api.getFieldConfigs();
      const priorityConfig = configs.find((c: any) => c.fieldName === 'priority');
      if (priorityConfig?.options) {
        setPriorityOptions(priorityConfig.options.split(',').filter((o: string) => o.trim()));
      }
    } catch { /* ignore */ }
  };

  const invalidateSchedulingDiagnostics = () => {
    recommendationRunRef.current = null;
    setRecommendationFulfillment([]);
    setUnfulfilledDemands(new Set());
    setUnfulfilledDetails([]);
    setPublishFailures([]);
    setConflictDetails([]);
  };

  const beginScheduleMutation = () => ++operationGenerationRef.current;

  const completeScheduleMutation = (
    mutationSession: number,
    ownerPublishSession?: number,
  ) => {
    if (mutationSession <= scheduleMutationGenerationRef.current) return false;
    scheduleMutationGenerationRef.current = mutationSession;
    const activePublish = publishRunRef.current;
    if (activePublish
        && activePublish.session !== ownerPublishSession
        && activePublish.mutationSession < mutationSession) {
      publishRunRef.current = null;
    }
    setPublishFailures([]);
    return true;
  };

  const ownsScheduleMutation = (mutationSession: number) =>
    scheduleMutationGenerationRef.current === mutationSession;

  const acquirePublishHttpLock = () => {
    if (publishHttpInFlightRef.current) return null;
    const owner = {};
    publishHttpInFlightRef.current = owner;
    setPublishAllLoading(true);
    return owner;
  };

  const releasePublishHttpLock = (owner: object) => {
    if (publishHttpInFlightRef.current !== owner) return;
    publishHttpInFlightRef.current = null;
    if (mountedRef.current) setPublishAllLoading(false);
  };

  const refreshAuthoritativeData = async (
    options: { invalidateDiagnostics?: boolean } = {},
  ) => {
    if (options.invalidateDiagnostics) invalidateSchedulingDiagnostics();
    const fetchSession = ++fetchGenerationRef.current;
    try {
      const weekDates = getWeekDates(weekViewDate);
      const startStr = weekDates[0].format('YYYY-MM-DD');
      const endStr = weekDates[weekDates.length - 1].format('YYYY-MM-DD');
      const [demandsData, schedulesData, staffData, statuses] = await Promise.all([
        api.getPendingDemands(),
        api.getSchedules(),
        api.getStaff(),
        api.getDailyStatuses(startStr, endStr),
      ]);
      if (!mountedRef.current || fetchGenerationRef.current !== fetchSession) return false;
      const normalizedSchedules: ScheduleItem[] = schedulesData.map((s: any) => {
        const demand = demandsData.find((item: DemandItem) => item.id === s.demandId);
        return {
          ...s,
          id: s.id,
          staffId: s.staffId,
          date: s.date,
          percentage: s.percentage,
          product: s.product ?? demand?.product ?? '',
          versionType: s.versionType ?? demand?.versionType ?? '',
          version: s.version ?? demand?.version,
          demandId: s.demandId,
          testManager: s.testManager,
          published: s.published ?? false,
        };
      });
      const normalizedDemands: DemandItem[] = demandsData;
      const normalizedStaffs: StaffItem[] = staffData.map((staff: StaffItem & { familiarModules?: unknown }) => ({
        ...staff,
        familiarModules: Array.isArray(staff.familiarModules) ? staff.familiarModules : [],
      }));
      const statusMap = new Map<string, DailyStatusEntry>();
      statuses.forEach((status: any) => statusMap.set(
        `${status.staffId}-${status.date}`,
        { status: status.status, percentage: status.percentage ?? 100 },
      ));
      setDemands(normalizedDemands);
      setSchedules(normalizedSchedules);
      setStaffs(normalizedStaffs);
      setDailyStatuses(statusMap);
      setSelectedDemand(current => current
        ? normalizedDemands.find(demand => demand.id === current.id) || null
        : null);
      setDetailDemand(current => current
        ? normalizedDemands.find(demand => demand.id === current.id) || null
        : null);
      setRefreshFailure(null);
      return true;
    } catch (error: any) {
      if (!mountedRef.current || fetchGenerationRef.current !== fetchSession) return false;
      setRefreshFailure(error?.message || '获取数据失败');
      throw error;
    }
  };

  const reconcileAfterMutation = async (
    successMessage: string | null,
    staleWarning: string,
    options: { invalidateDiagnostics?: boolean } = { invalidateDiagnostics: true },
  ) => {
    try {
      const reconciled = await refreshAuthoritativeData(options);
      if (reconciled && mountedRef.current && successMessage) message.success(successMessage);
      return reconciled;
    } catch {
      if (mountedRef.current) message.warning(staleWarning);
      return false;
    }
  };

  const refreshAfterMutationFailure = async () => {
    try {
      await refreshAuthoritativeData({ invalidateDiagnostics: true });
    } catch { /* refresh alert owns the retry path */ }
  };

  const handleRetryRefresh = async () => {
    if (refreshRetryRef.current) return;
    refreshRetryRef.current = true;
    setRefreshRetryLoading(true);
    try {
      await refreshAuthoritativeData();
    } catch {
      // The latest owned failure remains visible in the alert.
    } finally {
      refreshRetryRef.current = false;
      if (mountedRef.current) setRefreshRetryLoading(false);
    }
  };

  // ---- 批次指标（派生） ----
  const staffIds = useMemo(() => staffs.map(s => s.id), [staffs]);

  const batchMetrics: BatchMetrics = useMemo(() => {
    return calculateBatchMetrics(
      demands, schedules, staffIds, selectedDemandIds,
      priorityOptions, unfulfilledDemands, conflictDetails, unfulfilledDetails
    );
  }, [demands, schedules, staffIds, selectedDemandIds, priorityOptions,
    unfulfilledDemands, conflictDetails, unfulfilledDetails]);

  const hasDraftSchedules = schedules.some(s => !s.published);

  const highRiskDetails = useMemo(() => {
    return getHighRiskDemandDetails(demands, schedules, staffIds, priorityOptions);
  }, [demands, schedules, staffIds, priorityOptions]);

  const timelineAllocationTarget = useMemo<AllocationTarget | null>(() => {
    if (draggedAllocationTarget) return draggedAllocationTarget;
    if (!draggedSchedule) return null;
    return getAllocationTargetForSchedule(demands, draggedSchedule);
  }, [demands, draggedAllocationTarget, draggedSchedule]);

  // ---- 每日状态操作 ----
  const handleStatusChange = async (staff: StaffItem, date: string, newStatus: string, percentage?: number) => {
    try {
      const pct = percentage ?? 100;
      await api.setDailyStatus(staff.id, date, newStatus, pct);
      const key = `${staff.id}-${date}`;
      const newMap = new Map(dailyStatuses);
      if (newStatus === 'AVAILABLE') {
        newMap.delete(key);
      } else {
        newMap.set(key, { status: newStatus, percentage: pct });
      }
      setDailyStatuses(newMap);
      setStatusPopoverOpen(null);
      const label = DailyStatusLabels[newStatus as DailyAvailabilityStatus];
      const pctSuffix = newStatus !== 'AVAILABLE' && pct < 100 ? `（${pct}%）` : '';
      message.success(`已将 ${staff.name} ${date} 状态设为「${label}${pctSuffix}」`);
    } catch (error: any) {
      message.error(error.message || '状态更新失败');
    }
  };

  // ---- 推荐排班 ----
  const runRecommendation = async (mode: 'FIXED_RANGE' | 'FULL_DEMAND') => {
    if (recommendationRunRef.current !== null) return;
    const demandIds = Array.from(selectedDemandIds).sort((a, b) => a - b);
    if (demandIds.length === 0) {
      message.warning('没有待排期的需求');
      return;
    }
    if (mode === 'FIXED_RANGE' && !fixedDateRange) {
      message.warning('请选择连续排班日期范围');
      return;
    }

    const session = beginScheduleMutation();
    recommendationRunRef.current = session;
    if (mode === 'FIXED_RANGE') {
      setDateRecModalOpen(false);
    } else {
      setFullAllocModalOpen(false);
    }
    const stopLoading = message.loading({
      content: '正在生成推荐方案...',
      key: mode === 'FIXED_RANGE' ? 'date-rec' : 'full-alloc',
      duration: 0,
    });

    try {
      const result = await api.recommendScheduleDraft({
        mode,
        demandIds,
        ...(mode === 'FIXED_RANGE' ? {
          dateRange: {
            startDate: fixedDateRange![0].format('YYYY-MM-DD'),
            endDate: fixedDateRange![1].format('YYYY-MM-DD'),
          },
        } : {}),
        fixedStaffIds: Array.from(fixedStaffIds).sort((a, b) => a - b),
        excludedStaffIds: Array.from(excludedStaffIds).sort((a, b) => a - b),
        includeSaturdays: mode === 'FIXED_RANGE'
          ? fixedIncludeSaturdays : fullIncludeSaturdays,
        includeSundays: mode === 'FIXED_RANGE'
          ? fixedIncludeSundays : fullIncludeSundays,
        replaceExistingDrafts: true,
      });
      if (!mountedRef.current) return;
      const mutationCurrent = completeScheduleMutation(session);
      const ownsRecommendation = mutationCurrent && recommendationRunRef.current === session;
      if (ownsRecommendation) {
        setRecommendationFulfillment(result.fulfillment);
        const unfulfilled = new Set(
          result.fulfillment
            .filter(item => !item.fullySatisfied || item.requiresHistoricalClassification)
            .map(item => item.demandId),
        );
        setUnfulfilledDemands(unfulfilled);
        setUnfulfilledDetails(result.fulfillment
          .filter(item => !item.fullySatisfied || item.requiresHistoricalClassification)
          .map(item => {
            const demand = demands.find(candidate => candidate.id === item.demandId);
            const gaps = [...item.specialModuleGaps, ...item.generalGaps];
            return {
              product: demand?.product || `需求 ${item.demandId}`,
              shortage: gaps.reduce((sum, gap) => sum + Number(gap.shortage || 0), 0),
              details: gaps.map(gap => ({
                testType: demand?.manpowerDetails?.find(
                  detail => detail.id === gap.demandManpowerDetailId,
                )?.testType || '未分类',
                shortage: Number(gap.shortage || 0),
              })),
              reasons: [
                ...gaps.map(gap => `[${gap.reasonCode}] ${gap.reason}`),
                ...(item.requiresHistoricalClassification ? ['历史排班尚未完成人力归属'] : []),
              ],
            };
          }));
        await reconcileAfterMutation(
          `推荐排班完成：共生成 ${result.generatedSchedules.length} 条草稿排班`,
          '推荐排班已生成，但数据刷新失败，请重试刷新',
          {},
        );
      } else {
        try {
          await refreshAuthoritativeData();
        } catch { /* latest refresh failure owns the retry path */ }
      }
    } catch (error: any) {
      if (!mountedRef.current || recommendationRunRef.current !== session) return;
      message.error(error?.message || '推荐排班失败');
      try {
        await refreshAuthoritativeData({ invalidateDiagnostics: true });
      } catch { /* refresh alert owns the retry path */ }
    } finally {
      stopLoading();
      if (recommendationRunRef.current === session) {
        recommendationRunRef.current = null;
      }
    }
  };

  const runDateRecommendation = () => runRecommendation('FIXED_RANGE');
  const runFullAllocateRecommendation = () => runRecommendation('FULL_DEMAND');

  // ---- 冲突检测 ----
  const handleConflictCheck = () => {
    const conflicts = detectConflicts(schedules, staffs, dailyStatuses);
    if (conflicts.length === 0) {
      message.success('排班无冲突！');
    } else {
      setConflictDetails(conflicts);
      message.warning(`检测到 ${conflicts.length} 个排班冲突！`);
    }
  };

  // ---- 清除未发布排班 ----
  const handleClearAllUnpublished = () => {
    const unpublishdSchedules = schedules.filter(s => !s.published);
    if (unpublishdSchedules.length === 0) { message.info('没有未发布的排班'); return; }
    confirm({
      title: '确认清除',
      content: `确定要清除全部 ${unpublishdSchedules.length} 条未发布排班吗？此操作不可恢复。`,
      okText: '确定',
      cancelText: '取消',
      okType: 'danger',
      onOk: async () => {
        const mutationSession = beginScheduleMutation();
        try {
          for (const s of unpublishdSchedules) {
            await api.deleteSchedule(s.id);
            if (mountedRef.current) completeScheduleMutation(mutationSession);
          }
          setSchedules(prev => prev.filter(s => s.published));
          setPendingChangeDemandIds(new Set());
          setConflictDetails([]);
          clearDraftFromLocalStorage();
          await reconcileAfterMutation(
            `已清除 ${unpublishdSchedules.length} 条未发布排班`,
            '排班已清除，但数据刷新失败，请重试刷新',
          );
        } catch (err: any) {
          message.error(err.message || '清除失败');
          await refreshAfterMutationFailure();
        }
      },
    });
  };

  // ---- 发布全部 ----
  const handlePublishAll = () => {
    if (publishHttpInFlightRef.current || publishRunRef.current !== null) return;
    const demandIds = demands
      .filter(demand => demand.requiresHistoricalClassification !== true
        && schedules.some(schedule => schedule.demandId === demand.id && !schedule.published))
      .map(demand => demand.id)
      .sort((a, b) => a - b);

    if (demandIds.length === 0) {
      message.info('没有可发布的排班');
      return;
    }

    confirm({
      title: '确认发布',
      content: `确定要发布全部 ${demandIds.length} 个需求的草稿排班吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        if (publishRunRef.current !== null) return;
        const requestOwner = acquirePublishHttpLock();
        if (!requestOwner) return;
        const mutationSession = beginScheduleMutation();
        const run: PublishRun = {
          session: mutationSession,
          mutationSession,
        };
        publishRunRef.current = run;
        try {
          let result;
          try {
            result = await api.batchPublishSchedules({ demandIds });
          } finally {
            releasePublishHttpLock(requestOwner);
          }
          if (!mountedRef.current) return;
          const mutationCurrent = completeScheduleMutation(mutationSession, run.session);
          const reconciled = mutationCurrent
            ? await reconcileAfterMutation(
              null,
              '批量发布已处理，但数据刷新失败，请重试刷新',
            )
            : await refreshAuthoritativeData().catch(() => false);
          if (!reconciled
              || publishRunRef.current !== run
              || !ownsScheduleMutation(mutationSession)) return;
          const succeeded = new Set(result.success.map(item => item.demandId));
          setPendingChangeDemandIds(previous => {
            const next = new Set(previous);
            succeeded.forEach(id => next.delete(id));
            return next;
          });
          setSelectedDemandIds(previous => {
            const next = new Set(previous);
            succeeded.forEach(id => next.delete(id));
            return next;
          });
          if (result.failed.length > 0) {
            Modal.warning({
              title: '发布结果',
              content: (
                <div>
                  <p>发布完成：{result.success.length} 成功，{result.failed.length} 失败</p>
                  {result.failed.map(failure => (
                    <p key={failure.demandId} style={{ color: '#ff4d4f', margin: '4px 0' }}>
                      [{failure.reasonCode}] {failure.reason}
                    </p>
                  ))}
                </div>
              ),
            });
          } else {
            message.success(`已成功发布 ${result.success.length} 个需求的排班`);
          }
          setPublishFailures(result.failed);
        } catch (error: any) {
          if (mountedRef.current && publishRunRef.current === run) {
            message.error(error?.message || '发布失败');
            await refreshAfterMutationFailure();
          }
        } finally {
          if (publishRunRef.current === run) {
            publishRunRef.current = null;
          }
        }
      },
    });
  };

  // ---- 发布 ----
  const handlePublishDemand = async (demandId: number) => {
    if (publishHttpInFlightRef.current || publishRunRef.current !== null) return;
    const demand = demands.find(item => item.id === demandId);
    if (demand?.requiresHistoricalClassification) {
      message.warning('历史排班尚未完成人力归属，无法发布');
      return;
    }
    if (!schedules.some(schedule => schedule.demandId === demandId)) {
      message.warning('该需求暂无排班数据');
      return;
    }

    const requestOwner = acquirePublishHttpLock();
    if (!requestOwner) return;
    const mutationSession = beginScheduleMutation();
    const run: PublishRun = {
      session: mutationSession,
      mutationSession,
    };
    publishRunRef.current = run;
    try {
      try {
        await api.publishSchedules(demandId);
      } finally {
        releasePublishHttpLock(requestOwner);
      }
      if (!mountedRef.current) return;
      const mutationCurrent = completeScheduleMutation(mutationSession, run.session);
      const reconciled = mutationCurrent
        ? await reconcileAfterMutation(
          null,
          '排期已发布，但数据刷新失败，请重试刷新',
        )
        : await refreshAuthoritativeData().catch(() => false);
      if (!reconciled
          || publishRunRef.current !== run
          || !ownsScheduleMutation(mutationSession)) return;
      setPendingChangeDemandIds(previous => {
        const next = new Set(previous);
        next.delete(demandId);
        return next;
      });
      setSelectedDemandIds(previous => {
        const next = new Set(previous);
        next.delete(demandId);
        return next;
      });
      message.success('排期已发布');
    } catch (error: any) {
      if (mountedRef.current && publishRunRef.current === run) {
        message.error(error?.message || '发布失败');
        await refreshAfterMutationFailure();
      }
    } finally {
      if (publishRunRef.current === run) publishRunRef.current = null;
    }
  };

  // ---- 清除 ----
  const handleClearDemand = (demandId: number) => {
    const demandSchedules = schedules.filter(s => s.demandId === demandId);
    const pubCount = demandSchedules.filter(s => s.published).length;
    const draftCount = demandSchedules.length - pubCount;
    const hasPendingChanges = pendingChangeDemandIds.has(demandId);
    const canClearPublished = hasRole('resourceManager') || hasRole('fieldAdmin');

    if (demandSchedules.length === 0 && !hasPendingChanges) {
      message.info('该需求暂无排班数据');
      return;
    }
    if (pubCount > 0 && !canClearPublished) {
      message.warning('仅资源经理或字段管理员可清理已发布排班');
      return;
    }

    const scheduleSummary = pubCount > 0 && draftCount > 0
      ? `${pubCount} 条已发布排班和 ${draftCount} 条草稿排班`
      : pubCount > 0
        ? `${pubCount} 条已发布排班`
        : `${draftCount} 条草稿排班`;

    confirm({
      title: '确认清除排班',
      content: `将清除该需求的全部 ${scheduleSummary}，已发布排班也将被删除，需求将恢复为待排期状态。此操作不可恢复，是否继续？`,
      okText: '确认清除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const mutationSession = beginScheduleMutation();
        try {
          await api.deleteSchedulesByDemand(demandId, pubCount > 0 ? 'all' : 'draft_only');
          if (!mountedRef.current) return;
          completeScheduleMutation(mutationSession);
          setPendingChangeDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
          await reconcileAfterMutation(
            `已清除 ${demandSchedules.length} 条排班`,
            '需求排班已清除，但数据刷新失败，请重试刷新',
          );
        } catch (err: any) {
          message.error(err.message || '清除失败');
          await refreshAfterMutationFailure();
        }
      },
    });
  };

  // ---- 拖拽：分配目标 → 单元格 ----
  const handleAllocationTargetDragStart = useCallback((
    event: React.DragEvent,
    target: AllocationTarget,
  ) => {
    event.dataTransfer.effectAllowed = 'copy';
    dropValidationRef.current = null;
    allocationPhaseRef.current = 'dragging';
    setDraggedAllocationTarget(target);
    setSelectedDemand(demands.find(demand => demand.id === target.demandId) || null);
  }, [demands]);

  const handleAllocationTargetSelect = useCallback((target: AllocationTarget) => {
    allocationPhaseRef.current = 'selected';
    dropValidationRef.current = null;
    setDraggedSchedule(null);
    setDraggedAllocationTarget(target);
    setSelectedDemand(demands.find(demand => demand.id === target.demandId) || null);
    setDragOverCell(null);
  }, [demands]);

  // ---- 拖拽：排班卡片 ----
  const handleScheduleDragStart = useCallback((e: React.DragEvent, schedule: ScheduleItem) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    resetAllocationSession();
    setDraggedSchedule(schedule);
  }, [resetAllocationSession]);

  const handleScheduleDragEnd = useCallback(() => {
    setDraggedSchedule(null);
    setDragOverCell(null);
    setDragOverTrash(false);
  }, []);

  // ---- 样机数量校验 ----
  const getDeviceOverloadDates = (
    demandId: number | undefined,
    staffId: number,
    dates: string[],
    excludeScheduleId?: number,
  ): { date: string; currentCount: number }[] => {
    if (!demandId) return [];
    const demand = demands.find(d => d.id === demandId);
    const deviceCount = demand?.testDeviceCount;
    if (!deviceCount) return [];

    return dates.reduce<{ date: string; currentCount: number }[]>((acc, date) => {
      const staffSet = new Set<number>();
      schedules.forEach(s => {
        if (s.demandId === demandId && s.date === date && s.id !== excludeScheduleId) {
          staffSet.add(s.staffId);
        }
      });
      if (!staffSet.has(staffId) && staffSet.size >= deviceCount) {
        acc.push({ date, currentCount: staffSet.size });
      }
      return acc;
    }, []);
  };

  const confirmDeviceOverload = (productName: string, overloadDates: { date: string; currentCount: number }[], deviceCount: number): Promise<boolean> => {
    const dateList = overloadDates.map(d => `${d.date}（已有${d.currentCount}人）`).join('、');
    return new Promise(resolve => {
      Modal.confirm({
        title: '样机数量不足',
        content: (
          <div>
            <p>「{productName}」以下日期安排人数将超过样机数量（{deviceCount} 台）：</p>
            <p style={{ color: '#faad14', fontWeight: 500 }}>{dateList}</p>
            <p>是否确定安排？</p>
          </div>
        ),
        okText: '确定安排',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  // ---- 拖拽：排班转移 ----
  const handleScheduleTransfer = async (
    schedule: ScheduleItem,
    targetStaff: StaffItem,
    targetDate: string,
  ) => {
    if (!schedule || scheduleMutationIdsRef.current.has(schedule.id)) return;
    if (schedule.staffId === targetStaff.id && schedule.date === targetDate) {
      setDraggedSchedule(null);
      return;
    }
    const allocationTarget = getAllocationTargetForSchedule(demands, schedule);
    if (!allocationTarget) {
      message.warning('历史排班需先完成人力归类后再移动');
      setDraggedSchedule(null);
      setDragOverCell(null);
      return;
    }
    if (!isStaffEligibleForAllocationTarget(targetStaff, allocationTarget)) {
      message.warning(allocationTarget.kind === 'special'
        ? `${targetStaff.name}不熟悉${allocationTarget.moduleName}`
        : `${targetStaff.name}不属于${allocationTarget.testType}`);
      setDraggedSchedule(null);
      setDragOverCell(null);
      return;
    }

    const overloadDates = getDeviceOverloadDates(
      schedule.demandId,
      targetStaff.id,
      [targetDate],
      schedule.id,
    );
    if (overloadDates.length > 0) {
      const demand = demands.find(item => item.id === schedule.demandId);
      if (demand && !await confirmDeviceOverload(
        demand.product,
        overloadDates,
        demand.testDeviceCount!,
      )) {
        setDraggedSchedule(null);
        return;
      }
    }

    scheduleMutationIdsRef.current.add(schedule.id);
    const mutationSession = beginScheduleMutation();
    try {
      const moved = await api.moveSchedule(schedule.id, {
        staffId: targetStaff.id,
        date: targetDate,
        percentage: normalizeSchedulePercentage(schedule.percentage),
      });
      if (!mountedRef.current) return;
      completeScheduleMutation(mutationSession);
      setSchedules(previous => previous.map(item => item.id === schedule.id
        ? {
          ...item,
          staffId: moved.staffId,
          date: moved.date,
          percentage: moved.percentage,
          demandManpowerDetailId: moved.demandManpowerDetailId,
          demandSpecialModuleId: moved.demandSpecialModuleId,
          product: moved.product ?? item.product,
          versionType: moved.versionType ?? item.versionType,
          version: moved.version ?? item.version,
          testManager: moved.testManager ?? item.testManager,
          published: moved.published ?? item.published,
        }
        : item));
      await reconcileAfterMutation(
        `已转移至 ${targetStaff.name}`,
        '排班移动已保存，但数据刷新失败，请重试刷新',
      );
    } catch (error: any) {
      if (mountedRef.current) {
        message.error(error?.message || '转移失败');
        await refreshAfterMutationFailure();
      }
    } finally {
      scheduleMutationIdsRef.current.delete(schedule.id);
      if (mountedRef.current) setDraggedSchedule(null);
    }
  };

  // ---- 拖拽：分配目标放到单元格 ----
  const handleDrop = async (staff: StaffItem, date: string) => {
    if (!draggedAllocationTarget || !selectedDemand || dropValidationRef.current !== null) return;
    if (!isAvailableForAssignment(dailyStatuses, staff.id, date)) {
      const statusLabel = DailyStatusLabels[
        getDailyStatus(dailyStatuses, staff.id, date) as DailyAvailabilityStatus
      ];
      message.warning(`${staff.name}今日「${statusLabel}」，不参与测试`);
      return;
    }

    const locallyEligible = isStaffEligibleForAllocationTarget(staff, draggedAllocationTarget);
    if (!locallyEligible && draggedAllocationTarget.kind === 'special') {
      message.warning(`${staff.name}不熟悉${draggedAllocationTarget.moduleName}`);
    }

    const coefficient = staff.currentCoefficient || 1;
    const statusPercentage = getDailyStatusPercentage(dailyStatuses, staff.id, date);
    const status = getDailyStatus(dailyStatuses, staff.id, date);
    const statusFactor = status && status !== 'AVAILABLE'
      ? (1 - statusPercentage / 100)
      : 1;
    const percentage = normalizeSchedulePercentage(Math.min(
      Math.round(coefficient * 100 * statusFactor),
      Math.round(draggedAllocationTarget.remainingManpower * 100),
    ));
    const session = ++operationGenerationRef.current;
    dropValidationRef.current = session;
    allocationPhaseRef.current = 'validating';
    try {
      const validation = await api.validateSchedule({
        demandId: draggedAllocationTarget.demandId,
        staffId: staff.id,
        date,
        percentage,
        demandManpowerDetailId: draggedAllocationTarget.demandManpowerDetailId,
        ...(draggedAllocationTarget.kind === 'special'
          ? { demandSpecialModuleId: draggedAllocationTarget.demandSpecialModuleId }
          : {}),
      });
      if (!validation.valid) throw new Error('排班校验未通过');
      if (!mountedRef.current || dropValidationRef.current !== session) return;
      setAssignTarget({ staff, date });
      setAssignDays(1);
      setAssignPercentage(percentage);
      setAssignModalVisible(true);
      allocationPhaseRef.current = 'modal';
    } catch (error: any) {
      if (mountedRef.current && dropValidationRef.current === session) {
        message.error(error?.message || '排班校验失败');
        resetAllocationSession();
        await refreshAfterMutationFailure();
      }
    } finally {
      if (dropValidationRef.current === session) dropValidationRef.current = null;
    }
  };

  // ---- 分配确认 ----
  const handleAssignConfirm = async () => {
    if (!assignTarget || !selectedDemand || !draggedAllocationTarget || manualCreateRef.current) {
      return;
    }

    const target = draggedAllocationTarget;
    const normalizedPercentage = normalizeSchedulePercentage(assignPercentage);
    const thisAllocation = (assignDays * normalizedPercentage) / 100;
    if (thisAllocation > target.remainingManpower) {
      message.warning(`剩余可分配 ${target.remainingManpower.toFixed(1)} 人天，本次分配超出明细需求`);
      return;
    }

    const assignDates = Array.from({ length: assignDays }, (_, index) =>
      dayjs(assignTarget.date).add(index, 'day').format('YYYY-MM-DD'),
    );
    const overloadDates = getDeviceOverloadDates(
      selectedDemand.id,
      assignTarget.staff.id,
      assignDates,
    );
    if (overloadDates.length > 0 && !await confirmDeviceOverload(
      selectedDemand.product,
      overloadDates,
      selectedDemand.testDeviceCount!,
    )) {
      return;
    }

    const requests = assignDates.map(date => ({
      demandId: target.demandId,
      staffId: assignTarget.staff.id,
      date,
      percentage: normalizedPercentage,
      demandManpowerDetailId: target.demandManpowerDetailId,
      ...(target.kind === 'special'
        ? { demandSpecialModuleId: target.demandSpecialModuleId }
        : {}),
    }));

    manualCreateRef.current = true;
    allocationPhaseRef.current = 'submitting';
    setAssignLoading(true);
    try {
      for (const request of requests) {
        const validation = await api.validateSchedule(request);
        if (!validation.valid) {
          throw new Error('排班校验未通过');
        }
      }
      const mutationSession = beginScheduleMutation();
      const saved = requests.length === 1
        ? [await api.createSchedule(requests[0])]
        : await api.createSchedulesBatch(requests);
      if (!mountedRef.current) return;
      completeScheduleMutation(mutationSession);
      setSchedules(previous => [
        ...previous,
        ...saved.map(schedule => ({
          id: schedule.id,
          staffId: schedule.staffId,
          demandId: schedule.demandId,
          demandManpowerDetailId: schedule.demandManpowerDetailId,
          demandSpecialModuleId: schedule.demandSpecialModuleId,
          date: schedule.date,
          percentage: schedule.percentage,
          product: schedule.product ?? selectedDemand.product,
          versionType: schedule.versionType ?? selectedDemand.versionType,
          version: schedule.version ?? selectedDemand.version,
          testManager: schedule.testManager ?? selectedDemand.submittedBy,
          published: schedule.published ?? false,
        })),
      ]);
      resetAllocationSession();
      await reconcileAfterMutation(
        '分配成功',
        '排班分配已保存，但数据刷新失败，请重试刷新',
      );
    } catch (error: any) {
      if (mountedRef.current) {
        message.error(error?.message || '分配失败');
        resetAllocationSession();
        await refreshAfterMutationFailure();
      }
    } finally {
      manualCreateRef.current = false;
      if (mountedRef.current) setAssignLoading(false);
    }
  };

  // ---- 删除排班 ----
  const handleDeleteSchedule = async (schedule: ScheduleItem) => {
    if (schedule.published) {
      message.warning('已发布排班请按需求整体清理');
      return;
    }
    if (scheduleMutationIdsRef.current.has(schedule.id)) return;
    scheduleMutationIdsRef.current.add(schedule.id);
    const mutationSession = beginScheduleMutation();
    try {
      await api.deleteSchedule(schedule.id);
      if (!mountedRef.current) return;
      completeScheduleMutation(mutationSession);
      setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      await reconcileAfterMutation(
        '已删除排班',
        '排班已删除，但数据刷新失败，请重试刷新',
      );
    } catch (error: any) {
      if (mountedRef.current) {
        message.error(error.message || '删除失败');
        await refreshAfterMutationFailure();
      }
    } finally {
      scheduleMutationIdsRef.current.delete(schedule.id);
    }
  };

  // ---- 编辑排班 ----
  const handleEditSchedule = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setEditPercentage(normalizeSchedulePercentage(schedule.percentage));
    setEditModalVisible(true);
  };

  const handleEditConfirm = async () => {
    if (!editingSchedule || scheduleMutationIdsRef.current.has(editingSchedule.id)) return;
    scheduleMutationIdsRef.current.add(editingSchedule.id);
    const mutationSession = beginScheduleMutation();
    setEditLoading(true);
    try {
      const moved = await api.moveSchedule(editingSchedule.id, {
        staffId: editingSchedule.staffId,
        date: editingSchedule.date,
        percentage: normalizeSchedulePercentage(editPercentage),
      });
      if (!mountedRef.current) return;
      completeScheduleMutation(mutationSession);
      setSchedules(previous => previous.map(schedule => schedule.id === editingSchedule.id
        ? {
          ...schedule,
          staffId: moved.staffId,
          date: moved.date,
          percentage: moved.percentage,
          demandManpowerDetailId: moved.demandManpowerDetailId,
          demandSpecialModuleId: moved.demandSpecialModuleId,
          product: moved.product ?? schedule.product,
          versionType: moved.versionType ?? schedule.versionType,
          version: moved.version ?? schedule.version,
          testManager: moved.testManager ?? schedule.testManager,
          published: moved.published ?? schedule.published,
        }
        : schedule));
      setEditModalVisible(false);
      setEditingSchedule(null);
      await reconcileAfterMutation(
        '排班已更新',
        '排班更新已保存，但数据刷新失败，请重试刷新',
      );
    } catch (error: any) {
      if (mountedRef.current) {
        message.error(error.message || '更新失败');
        await refreshAfterMutationFailure();
      }
    } finally {
      scheduleMutationIdsRef.current.delete(editingSchedule.id);
      if (mountedRef.current) setEditLoading(false);
    }
  };

  const handleClassifySchedule = async (schedule: ScheduleItem) => {
    if (!detailDemand || classificationIdsRef.current.has(schedule.id)) return;
    const draft = classificationDrafts[schedule.id];
    const demandManpowerDetailId = draft?.demandManpowerDetailId
      ?? detailDemand.manpowerDetails?.[0]?.id;
    if (demandManpowerDetailId == null) {
      message.warning('请选择小组明细');
      return;
    }

    classificationIdsRef.current.add(schedule.id);
    const mutationSession = beginScheduleMutation();
    try {
      await api.classifySchedule(schedule.id, {
        demandManpowerDetailId,
        demandSpecialModuleId: draft?.demandSpecialModuleId ?? null,
      });
      if (!mountedRef.current) return;
      completeScheduleMutation(mutationSession);
      await reconcileAfterMutation(
        '历史排班已归类',
        '历史排班归类已保存，但数据刷新失败，请重试刷新',
      );
    } catch (error: any) {
      if (mountedRef.current) {
        message.error(error?.message || '归类失败');
        try {
          await refreshAuthoritativeData({ invalidateDiagnostics: true });
        } catch { /* refresh alert owns the retry path */ }
      }
    } finally {
      classificationIdsRef.current.delete(schedule.id);
    }
  };

  // ---- 推荐弹窗：需求选择列表 ----
  const renderDemandSelectionList = () => {
    const eligibleDemands = demands.filter(d =>
      (d.manpowerFullySatisfied !== true || d.requiresHistoricalClassification === true)
      && (d.status === 'pending' || d.status === 'scheduled'));
    const allEligibleIds = eligibleDemands.map(d => d.id);
    const allSelected = allEligibleIds.length > 0 && allEligibleIds.every(id => selectedDemandIds.has(id));

    return (
      <>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedDemandIds.size > 0 && !allSelected}
          onChange={(e) => {
            if (e.target.checked) setSelectedDemandIds(new Set(allEligibleIds));
            else setSelectedDemandIds(new Set());
          }}
          style={{ marginBottom: 8 }}
        >
          <span style={{ fontSize: 13, color: '#888' }}>全选 / 取消全选</span>
        </Checkbox>
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 4 }}>
          {eligibleDemands.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 16, fontSize: 13 }}>没有可排期的需求</div>
          ) : (
            eligibleDemands.map(d => {
              const demandSchedules = schedules.filter(s => s.demandId === d.id);
              const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
              const remaining = Number(d.manpowerDemand) - allocatedDays;
              return (
                <div key={d.id} style={{ padding: '6px 8px', borderBottom: '1px solid #fafafa', display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedDemandIds.has(d.id)}
                    onChange={(e) => {
                      const next = new Set(selectedDemandIds);
                      if (e.target.checked) next.add(d.id); else next.delete(d.id);
                      setSelectedDemandIds(next);
                    }}
                  />
                  <div style={{ marginLeft: 8, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {d.product}
                      {d.priority && (
                        <Tag color={getPriorityColor(d.priority, priorityOptions)} style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }}>
                          {d.priority}
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {d.versionType} | {dayjs(d.startDate).format('MM/DD')}~{dayjs(d.endDate).format('MM/DD')}
                    </div>
                    {d.manpowerDetails && d.manpowerDetails.length > 0 && (
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {d.manpowerDetails.map((md: any) => `${md.testType}:${md.manpowerDemand}`).join(' | ')} 人/天
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#888' }}>
                      合计 {Number(d.manpowerDemand).toFixed(1)} 人/天
                      {allocatedDays > 0 ? ` | 已排 ${allocatedDays.toFixed(1)}` : ''}
                      {remaining > 0 ? ` | 剩余 ${remaining.toFixed(1)}` : ' | 已完成'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </>
    );
  };

  // ---- 推荐弹窗：打开 ----
  const getRecommendationEligibleDemandIds = () => demands
    .filter(demand => (demand.manpowerFullySatisfied !== true
      || demand.requiresHistoricalClassification === true)
      && (demand.status === 'pending' || demand.status === 'scheduled'))
    .map(demand => demand.id);

  const handleDateRecommend = () => {
    const eligibleIds = getRecommendationEligibleDemandIds();
    setSelectedDemandIds(new Set(eligibleIds));
    setFixedDateRange(null);
    setFixedIncludeSaturdays(false);
    setFixedIncludeSundays(false);
    setFixedStaffIds(new Set());
    setExcludedStaffIds(new Set());
    setDateRecModalOpen(true);
  };

  const handleFullAllocateRecommend = () => {
    const eligibleIds = getRecommendationEligibleDemandIds();
    setSelectedDemandIds(new Set(eligibleIds));
    setFullIncludeSaturdays(false);
    setFullIncludeSundays(false);
    setFixedStaffIds(new Set());
    setExcludedStaffIds(new Set());
    setFullAllocModalOpen(true);
  };

  // ---- 优先级 ----
  const handlePriorityChange = async (demandId: number, val: string) => {
    try {
      await api.updateDemandPriority(demandId, val);
      setDemands(prev => prev.map(d => d.id === demandId ? { ...d, priority: val } : d));
      message.success('优先级已更新');
    } catch (e: any) {
      message.error(e.message || '更新失败');
    }
    setEditingPriorityId(null);
  };

  // ============================================================
  // 渲染
  // ============================================================
  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部区域：总览条 + 冲突/缺口面板 */}
      <div style={{ flexShrink: 0, background: '#f0f2f5', paddingBottom: 8 }}>
        {refreshFailure && (
          <Alert
            type="error"
            showIcon
            message={`数据刷新失败：${refreshFailure}`}
            action={(
              <Button
                size="small"
                loading={refreshRetryLoading}
                onClick={handleRetryRefresh}
              >
                重试刷新
              </Button>
            )}
            style={{ marginBottom: 8 }}
          />
        )}
        <WorkbenchSummaryBar
          metrics={batchMetrics}
          hasDrafts={hasDraftSchedules}
          onDateRecommend={handleDateRecommend}
          onFullAllocateRecommend={handleFullAllocateRecommend}
          onConflictCheck={handleConflictCheck}
          onClearAllDrafts={handleClearAllUnpublished}
          onPublishAll={handlePublishAll}
          publishLoading={publishAllLoading}
          onHighRiskClick={() => setRiskModalOpen(true)}
          onGapClick={() => setGapModalOpen(true)}
        />
        <IssuePublishPanel
          conflicts={conflictDetails.map(c => ({
            ...c,
            totalPercent: c.totalPercent,
            maxCapacityPercent: c.maxCapacityPercent,
          }))}
          onDismissConflicts={() => {}}
          fulfillment={recommendationFulfillment}
          demands={demands}
          publishFailures={publishFailures}
        />
      </div>

      {/* 主体区域：左侧需求队列 + 右侧时间轴 */}
      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <DemandQueue
          demands={demands}
          schedules={schedules}
          staffs={staffs}
          selectedDemandId={selectedDemand?.id || null}
          selectedDemandIds={selectedDemandIds}
          pendingChangeDemandIds={pendingChangeDemandIds}
          unfulfilledDemands={unfulfilledDemands}
          filterDemandTestTypes={filterDemandTestTypes}
          priorityOptions={priorityOptions}
          editingPriorityId={editingPriorityId}
          canManagePriority={hasRole('resourceManager') || hasRole('projectManager')}
          onFilterChange={setFilterDemandTestTypes}
          onSelectDemand={(id) => {
            const next = new Set(selectedDemandIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelectedDemandIds(next);
          }}
          onViewDetail={(d) => { setDetailDemand(d); setDetailModalVisible(true); }}
          onClearDemand={handleClearDemand}
          onPublishDemand={handlePublishDemand}
          onPriorityEdit={setEditingPriorityId}
          onPriorityChange={handlePriorityChange}
          onAllocationTargetDragStart={handleAllocationTargetDragStart}
          onAllocationTargetDragEnd={() => {
            if (allocationPhaseRef.current === 'dragging') {
              resetAllocationSession();
            }
          }}
          selectedAllocationTarget={draggedSchedule ? null : draggedAllocationTarget}
          onAllocationTargetSelect={handleAllocationTargetSelect}
        />

        <ScheduleTimeline
          staffs={staffs}
          schedules={schedules}
          weekViewDate={weekViewDate}
          dailyStatuses={dailyStatuses}
          selectedDemand={selectedDemand}
          draggedAllocationTarget={timelineAllocationTarget}
          draggedSchedule={draggedSchedule}
          dragOverCell={dragOverCell}
          dragOverTrash={dragOverTrash}
          filterProducts={filterProducts}
          canManageDailyAvailability={hasPermission('manageDailyAvailability')}
          userTestType={user?.testType}
          userRoles={user?.roles}
          statusPopoverOpen={statusPopoverOpen}
          statusDraft={statusDraft}
          statusPctDraft={statusPctDraft}
          onWeekChange={setWeekViewDate}
          onFilterProductsChange={setFilterProducts}
          onDrop={handleDrop}
          onScheduleTransfer={handleScheduleTransfer}
          onScheduleDragStart={handleScheduleDragStart}
          onScheduleDragEnd={handleScheduleDragEnd}
          onCellDragOver={setDragOverCell}
          onTrashDragOver={setDragOverTrash}
          onTrashDrop={() => {
            if (draggedSchedule) {
              handleDeleteSchedule(draggedSchedule);
              setDraggedSchedule(null);
              setDragOverTrash(false);
            }
          }}
          onEditSchedule={handleEditSchedule}
          onDeleteSchedule={handleDeleteSchedule}
          onStatusPopoverOpen={setStatusPopoverOpen}
          onStatusChange={handleStatusChange}
          onStatusDraftChange={setStatusDraft}
          onStatusPctDraftChange={setStatusPctDraft}
        />
      </div>

      {/* ==== 弹窗 ==== */}

      {/* 分配弹窗 */}
      {(() => {
        const alreadyAllocated = draggedAllocationTarget
          ? Math.max(0, Number((draggedAllocationTarget.kind === 'special'
            ? selectedDemand?.specialModuleDemands?.find(
              item => item.id === draggedAllocationTarget.demandSpecialModuleId,
            )?.manpowerDemand
            : selectedDemand?.manpowerSummary?.find(
              item => item.testType === draggedAllocationTarget.testType,
            )?.generalManpower) || 0) - draggedAllocationTarget.remainingManpower)
          : 0;
        const remaining = draggedAllocationTarget?.remainingManpower || 0;
        const thisAllocation = (assignDays * assignPercentage) / 100;
        const exceeds = thisAllocation > remaining;
        const dateRangeDays = assignTarget && selectedDemand
          ? dayjs(selectedDemand.endDate).diff(dayjs(assignTarget.date), 'day') + 1
          : 1;
        const capacityMaxDays = assignPercentage > 0 ? Math.floor(remaining / (assignPercentage / 100)) : 0;
        const effectiveMaxDays = Math.min(dateRangeDays, Math.max(1, capacityMaxDays), 30);

        return (
          <Modal
            title="分配测试任务"
            open={assignModalVisible}
            onCancel={resetAllocationSession}
            footer={[
              <Button key="cancel" onClick={resetAllocationSession}>取消</Button>,
              <Button key="confirm" type="primary" loading={assignLoading} disabled={exceeds} onClick={handleAssignConfirm}>
                确认分配
              </Button>,
            ]}
          >
            {assignTarget && selectedDemand && (
              <div>
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="测试人员"><strong>{assignTarget.staff.name}</strong></Descriptions.Item>
                  <Descriptions.Item label="人员系数">
                    <Tag color={assignTarget.staff.currentCoefficient === 1.0 ? 'green' : 'orange'}>
                      {assignTarget.staff.currentCoefficient?.toFixed(2) || '1.00'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="分配需求">
                    <strong style={{ color: getVersionTypeColor(selectedDemand.versionType) }}>
                      {selectedDemand.product}
                    </strong>
                    <Tag style={{ marginLeft: 8 }}>{selectedDemand.versionPhase || selectedDemand.versionType}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="分配明细">
                    {draggedAllocationTarget?.kind === 'special'
                      ? `${draggedAllocationTarget.testType} / ${draggedAllocationTarget.moduleName}`
                      : `${draggedAllocationTarget?.testType || '-'} / 通用人力`}
                  </Descriptions.Item>
                  <Descriptions.Item label="需求周期">
                    {dayjs(selectedDemand.startDate).format('YYYY-MM-DD')} ~ {dayjs(selectedDemand.endDate).format('YYYY-MM-DD')}
                  </Descriptions.Item>
                  <Descriptions.Item label="明细剩余">{remaining.toFixed(1)} 人天</Descriptions.Item>
                  <Descriptions.Item label="已分配">
                    <span style={{ color: '#1890ff' }}>
                      {alreadyAllocated.toFixed(1)} 人/天
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="剩余可分配">
                    <span style={{ color: remaining <= 0 ? '#ff4d4f' : '#faad14', fontWeight: 600 }}>
                      {remaining <= 0 ? '已满足' : `${remaining.toFixed(1)} 人/天`}
                    </span>
                  </Descriptions.Item>
                </Descriptions>
                <Divider>设置投入比例</Divider>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 14, color: '#666' }}>从 </span>
                    <strong style={{ fontSize: 16, color: '#1890ff' }}>{dayjs(assignTarget.date).format('YYYY-MM-DD')}</strong>
                    <span style={{ fontSize: 14, color: '#666' }}> 开始，分配 </span>
                    <InputNumber
                      aria-label="分配投入比例"
                      min={10} max={100} step={10}
                      value={assignPercentage}
                      onChange={(value) => setAssignPercentage(normalizeSchedulePercentage(value))}
                      style={{ width: 100, margin: '0 8px' }}
                    />
                    <span style={{ fontSize: 14, color: '#666' }}>%（系数 {assignTarget.staff.currentCoefficient}）</span>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 14, color: '#666' }}>连续分配 </span>
                    <InputNumber
                      min={1} max={effectiveMaxDays}
                      value={assignDays} onChange={(v) => setAssignDays(v || 1)}
                      style={{ width: 80, margin: '0 8px' }}
                    />
                    <span style={{ fontSize: 14, color: '#666' }}> 天</span>
                  </div>
                  <div style={{
                    marginTop: 16, padding: 12,
                    background: exceeds ? '#fff1f0' : '#f6ffed',
                    border: exceeds ? '1px solid #ff4d4f' : '1px solid #b7eb8f',
                    borderRadius: 8,
                  }}>
                    {exceeds ? '⚠️ 分配超出需求：' : '分配说明：'}
                    <ul style={{ margin: '8px 0 0 20px', textAlign: 'left', color: exceeds ? '#ff4d4f' : '#666' }}>
                      <li>本次分配：{assignPercentage}% × {assignDays} 天 = <strong>{thisAllocation.toFixed(1)} 人/天</strong></li>
                      <li>明细剩余：{remaining.toFixed(1)} 人天</li>
                      <li>已分配：{alreadyAllocated.toFixed(1)} 人/天</li>
                      <li>剩余可分配：{remaining.toFixed(1)} 人/天</li>
                      {exceeds && <li style={{ fontWeight: 600 }}>超出 <span style={{ color: '#ff4d4f' }}>{(thisAllocation - remaining).toFixed(1)}</span> 人/天，无法分配</li>}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* 编辑弹窗 */}
      <Modal
        title="编辑排班"
        open={editModalVisible}
        onCancel={() => { setEditModalVisible(false); setEditingSchedule(null); }}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>取消</Button>,
          <Button key="confirm" type="primary" loading={editLoading} onClick={handleEditConfirm}>确认修改</Button>,
        ]}
      >
        {editingSchedule && (
          <div>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="测试人员">
                <strong>{staffs.find(s => s.id === editingSchedule.staffId)?.name || '-'}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="任务">
                <strong style={{ color: getVersionTypeColor(editingSchedule.versionType) }}>{editingSchedule.product}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="日期">{editingSchedule.date}</Descriptions.Item>
            </Descriptions>
            <Divider>修改投入比例</Divider>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>投入比例：</span>
                <InputNumber
                  aria-label="编辑投入比例"
                  min={10} max={100} step={10}
                  value={editPercentage}
                  onChange={(value) => setEditPercentage(normalizeSchedulePercentage(value))}
                  style={{ width: 100, marginLeft: 8 }}
                />
                <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>%</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 按指定日期排班弹窗 */}
      <Modal
        title="按指定日期排班"
        open={dateRecModalOpen}
        onOk={runDateRecommendation}
        onCancel={() => {
          setDateRecModalOpen(false);
          setFixedDateRange(null);
          setFixedIncludeSaturdays(false);
          setFixedIncludeSundays(false);
          setSelectedDemandIds(new Set());
          setFixedStaffIds(new Set());
          setExcludedStaffIds(new Set());
        }}
        okText="开始排班" cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 || !fixedDateRange }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Select
            mode="multiple"
            aria-label="固定人员"
            placeholder="固定人员"
            value={Array.from(fixedStaffIds)}
            onChange={(ids: number[]) => {
              setFixedStaffIds(new Set(ids));
              setExcludedStaffIds(previous => new Set(
                Array.from(previous).filter(id => !ids.includes(id)),
              ));
            }}
            options={staffs.map(staff => ({ value: staff.id, label: staff.name }))}
            style={{ width: '100%' }}
          />
          <Select
            mode="multiple"
            aria-label="排除人员"
            placeholder="排除人员"
            value={Array.from(excludedStaffIds)}
            onChange={(ids: number[]) => {
              setExcludedStaffIds(new Set(ids));
              setFixedStaffIds(previous => new Set(
                Array.from(previous).filter(id => !ids.includes(id)),
              ));
            }}
            options={staffs.map(staff => ({ value: staff.id, label: staff.name }))}
            style={{ width: '100%' }}
          />
        </Space>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>选择连续排班日期范围</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <DatePicker.RangePicker
              aria-label="连续排班日期范围"
              format="YYYY-MM-DD"
              style={{ flex: 1 }}
              value={fixedDateRange}
              onChange={(range) => {
                setFixedDateRange(range?.[0] && range[1]
                  ? [range[0], range[1]] : null);
              }}
            />
            <Button
              aria-label="选择未来 8 天连续范围"
              onClick={() => setFixedDateRange([dayjs(), dayjs().add(7, 'day')])}
            >未来 8 天</Button>
          </div>
          <div style={{ marginBottom: 8, color: '#666' }}>
            {fixedDateRange
              ? `${fixedDateRange[0].format('YYYY-MM-DD')} 至 ${fixedDateRange[1].format('YYYY-MM-DD')}`
              : '尚未选择连续日期范围'}
          </div>
          <Space direction="vertical">
            <Checkbox checked={fixedIncludeSaturdays}
              onChange={(event) => setFixedIncludeSaturdays(event.target.checked)}>
              固定范围包含周六
            </Checkbox>
            <Checkbox checked={fixedIncludeSundays}
              onChange={(event) => setFixedIncludeSundays(event.target.checked)}>
              固定范围包含周日
            </Checkbox>
          </Space>
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontWeight: 500, marginBottom: 8 }}>选择待排期需求（{selectedDemandIds.size} 个已选）</div>
        {renderDemandSelectionList()}
        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          仅对所选日期生成排班方案。已发布排班不受影响，新排班为草稿需手动发布。
        </div>
      </Modal>

      {/* 按全部需求排班弹窗 */}
      <Modal
        title="按全部需求排班"
        open={fullAllocModalOpen}
        onOk={runFullAllocateRecommendation}
        onCancel={() => {
          setFullAllocModalOpen(false);
          setFullIncludeSaturdays(false);
          setFullIncludeSundays(false);
          setSelectedDemandIds(new Set());
          setFixedStaffIds(new Set());
          setExcludedStaffIds(new Set());
        }}
        okText="开始排班" cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 }}
        width={520}
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Select
            mode="multiple"
            aria-label="固定人员"
            placeholder="固定人员"
            value={Array.from(fixedStaffIds)}
            onChange={(ids: number[]) => {
              setFixedStaffIds(new Set(ids));
              setExcludedStaffIds(previous => new Set(
                Array.from(previous).filter(id => !ids.includes(id)),
              ));
            }}
            options={staffs.map(staff => ({ value: staff.id, label: staff.name }))}
            style={{ width: '100%' }}
          />
          <Select
            mode="multiple"
            aria-label="排除人员"
            placeholder="排除人员"
            value={Array.from(excludedStaffIds)}
            onChange={(ids: number[]) => {
              setExcludedStaffIds(new Set(ids));
              setFixedStaffIds(previous => new Set(
                Array.from(previous).filter(id => !ids.includes(id)),
              ));
            }}
            options={staffs.map(staff => ({ value: staff.id, label: staff.name }))}
            style={{ width: '100%' }}
          />
        </Space>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>周末排班设置</div>
          <Space direction="vertical">
            <Checkbox checked={fullIncludeSaturdays}
              onChange={(e) => setFullIncludeSaturdays(e.target.checked)}>全部需求包含周六</Checkbox>
            <Checkbox checked={fullIncludeSundays}
              onChange={(e) => setFullIncludeSundays(e.target.checked)}>全部需求包含周日</Checkbox>
          </Space>
        </div>
        <Divider style={{ margin: '12px 0' }} />
        <div style={{ fontWeight: 500, marginBottom: 8 }}>选择待排期需求（{selectedDemandIds.size} 个已选）</div>
        {renderDemandSelectionList()}
        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          将持续分配（最长90天）直到满足全部需求人力。若排班日期超出需求完成期限，将弹出预警提示。已发布排班不受影响，新排班为草稿需手动发布。
        </div>
      </Modal>

      {/* 风险详情弹窗 */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            高风险需求详情（{highRiskDetails.length} 个）
          </span>
        }
        open={riskModalOpen}
        onCancel={() => setRiskModalOpen(false)}
        footer={null}
        width={800}
      >
        {highRiskDetails.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无高风险需求</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {highRiskDetails.map((item) => (
              <Card
                key={item.demandId}
                size="small"
                style={{ marginBottom: 12 }}
                title={
                  <span>
                    {item.product}
                    {item.confidential && <Tag color="red" style={{ marginLeft: 8 }}>保密</Tag>}
                  </span>
                }
                extra={
                  <span style={{ fontSize: 13, color: '#ff4d4f', fontWeight: 600 }}>
                    风险分：{item.riskScore}
                  </span>
                }
              >
                <Descriptions column={3} size="small" bordered>
                  <Descriptions.Item label="版本类型">
                    <Tag color="blue">{item.versionType}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="优先级">
                    {item.priority ? (
                      <Tag color={getPriorityColor(item.priority, priorityOptions)}>{item.priority}</Tag>
                    ) : '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="完成期限">
                    <span style={{ color: item.daysToEnd <= 0 ? '#ff4d4f' : item.daysToEnd <= 3 ? '#faad14' : undefined }}>
                      {dayjs(item.endDate).format('YYYY-MM-DD')}
                      {item.daysToEnd <= 0
                        ? `（已过期 ${Math.abs(item.daysToEnd)} 天）`
                        : `（剩余 ${item.daysToEnd} 天）`}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="总人力">{item.manpowerDemand.toFixed(1)} 人/天</Descriptions.Item>
                  <Descriptions.Item label="已排人力">{item.allocatedDays.toFixed(1)} 人/天</Descriptions.Item>
                  <Descriptions.Item label="剩余缺口">
                    <span style={{ color: item.remainingDays > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 600 }}>
                      {item.remainingDays.toFixed(1)} 人/天
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="风险因素" span={3}>
                    {item.riskFactors.map((factor, idx) => (
                      <Tag key={idx} color="error" style={{ marginBottom: 4 }}>{factor}</Tag>
                    ))}
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            ))}
          </div>
        )}
      </Modal>

      {/* 缺口详情弹窗 */}
      <Modal
        title={
          <span>
            <ExclamationCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
            预计缺口详情（{unfulfilledDetails.length} 个项目）
          </span>
        }
        open={gapModalOpen}
        onCancel={() => setGapModalOpen(false)}
        footer={null}
        width={800}
      >
        {unfulfilledDetails.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>暂无预计缺口</div>
        ) : (
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {unfulfilledDetails.map((item, idx) => (
              <Card
                key={idx}
                size="small"
                style={{ marginBottom: 12 }}
                title={
                  <span>
                    {item.product}
                    <Tag color="error" style={{ marginLeft: 8 }}>缺口 {item.shortage} 人/天</Tag>
                    {item.overdueDays && item.overdueDays > 0 && (
                      <Tag color="volcano" style={{ marginLeft: 4 }}>超期 {item.overdueDays} 天</Tag>
                    )}
                  </span>
                }
              >
                <Descriptions column={2} size="small" bordered>
                  {item.details.length > 0 && item.details.map((d, i) => (
                    <Descriptions.Item key={i} label={`${d.testType} 缺口`}>
                      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{d.shortage} 人/天</span>
                    </Descriptions.Item>
                  ))}
                  {item.details.length === 0 && (
                    <Descriptions.Item label="缺口" span={2}>
                      <span style={{ color: '#ff4d4f', fontWeight: 600 }}>{item.shortage} 人/天（人力已满足但排班超期）</span>
                    </Descriptions.Item>
                  )}
                  <Descriptions.Item label="缺口原因" span={2}>
                    {item.reasons.map((reason, i) => (
                      <Tag key={i} color="warning" style={{ marginBottom: 4 }}>{reason}</Tag>
                    ))}
                  </Descriptions.Item>
                  {item.overdueDates && item.overdueDates.length > 0 && (
                    <Descriptions.Item label="超期日期" span={2}>
                      {item.overdueDates.map((d, i) => (
                        <Tag key={i} color="volcano" style={{ marginBottom: 4 }}>{d}</Tag>
                      ))}
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </Card>
            ))}
          </div>
        )}
      </Modal>

      {/* 需求详情弹窗 */}
      <Modal
        title="需求详情"
        open={detailModalVisible}
        onCancel={() => { setDetailModalVisible(false); setDetailDemand(null); }}
        footer={null}
        width={750}
        destroyOnHidden
      >
        {detailDemand && (
          <Descriptions column={2} bordered size="small" styles={{ label: { width: 100, whiteSpace: 'nowrap' } }}>
            <Descriptions.Item label="产品信息" span={2}>{detailDemand.product}</Descriptions.Item>
            <Descriptions.Item label="版本号">{detailDemand.version || '-'}</Descriptions.Item>
            <Descriptions.Item label="保密项目">
              <Tag color={detailDemand.confidential ? 'red' : 'default'}>{detailDemand.confidential ? '是' : '否'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="版本类型">
              <Tag color={(() => {
                const cm: Record<string, string> = { '在研': 'green', '维护': 'blue', '升级': 'orange' };
                return cm[detailDemand.versionType] || 'default';
              })()}>{detailDemand.versionType || '-'}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="版本阶段">{detailDemand.versionPhase || '-'}</Descriptions.Item>
            <Descriptions.Item label="优先级" span={2}>
              {detailDemand.priority ? (
                <Tag color={getPriorityColor(detailDemand.priority, priorityOptions)}>{detailDemand.priority}</Tag>
              ) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label="测试周期" span={2}>
              {dayjs(detailDemand.startDate).format('YYYY-MM-DD')} ~ {dayjs(detailDemand.endDate).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="总人力">{Number(detailDemand.manpowerDemand || 0).toFixed(1)} 人/天</Descriptions.Item>
            <Descriptions.Item label="样机数量">{detailDemand.testDeviceCount != null ? `${detailDemand.testDeviceCount} 台` : '-'}</Descriptions.Item>
            <Descriptions.Item label="需求状态" span={2}>
              <Tag color={(() => {
                const sm: Record<string, string> = { submitted: 'purple', pending: 'orange', scheduled: 'blue', completed: 'green', rejected: 'red' };
                return sm[detailDemand.status] || 'default';
              })()}>
                {(() => {
                  const sl: Record<string, string> = { submitted: '待审批', pending: '待排期', scheduled: '已排期', completed: '已完成', rejected: '已退回' };
                  return sl[detailDemand.status] || detailDemand.status;
                })()}
              </Tag>
            </Descriptions.Item>
            {detailDemand.manpowerDetails && detailDemand.manpowerDetails.length > 0 && (
              <Descriptions.Item label="测试类型明细" span={2}>
                {(() => {
                  const demandSchedules = schedules.filter(s => s.demandId === detailDemand.id);
                  const ownership = groupSchedulesByDemandOwnership(detailDemand, demandSchedules);
                  return (
                    <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {(detailDemand.manpowerSummary || []).map(summary => {
                        const detail = detailDemand.manpowerDetails?.find(
                          item => item.testType === summary.testType,
                        );
                        const specialAllocated = (detailDemand.specialModuleDemands || [])
                          .filter(module => module.testType === summary.testType)
                          .reduce((sum, module) => sum + Number(module.allocatedManpower || 0), 0);
                        const generalAllocated = demandSchedules
                          .filter(schedule => schedule.demandManpowerDetailId === detail?.id
                            && schedule.demandSpecialModuleId == null)
                          .reduce((sum, schedule) => sum + schedule.percentage / 100, 0);
                        return (
                          <Tag key={summary.testType} style={{ margin: 0 }}>
                            {summary.testType}：总量 {summary.totalManpower} / 特殊分配 {specialAllocated} / 通用分配 {generalAllocated}
                          </Tag>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {(detailDemand.specialModuleDemands || []).map(module => (
                        <Tag key={module.id} color={module.enabled ? 'blue' : 'default'} style={{ margin: 0 }}>
                          {module.testType}: {module.moduleName}{!module.enabled && '（已停用）'}
                          {' '}{Number(module.allocatedManpower || 0)}/{module.manpowerDemand} 人天
                        </Tag>
                      ))}
                    </div>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '14%' }} /><col style={{ width: '44%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>测试类型</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>人力需求</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>已分配</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>需求缺口</th>
                          <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>所需模块</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailDemand.manpowerDetails.map((md: any, idx: number) => {
                          const typeAllocated = md.id == null ? 0 : ownership.allocatedByDetailId[md.id] || 0;
                          const gap = Math.max(0, Number(md.manpowerDemand || 0) - typeAllocated);
                          return (
                            <tr key={idx}>
                              <td style={{ padding: '2px 6px', color: '#1890ff' }}>{md.testType}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right' }}>{Number(md.manpowerDemand || 0).toFixed(1)}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right' }}>{typeAllocated.toFixed(1)}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right', color: gap > 0 ? '#faad14' : '#52c41a', fontWeight: 500 }}>{gap.toFixed(1)}</td>
                              <td style={{ padding: '2px 6px', color: '#888', wordBreak: 'break-word' }}>{md.remark || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </>
                  );
                })()}
              </Descriptions.Item>
            )}
            {detailDemand.requiresHistoricalClassification === true && (
              <Descriptions.Item label="历史排班归类" span={2}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <Tag color="warning" style={{ width: 'fit-content', margin: 0 }}>
                    归类完成前不可发布
                  </Tag>
                  {schedules
                    .filter(schedule => schedule.demandId === detailDemand.id
                      && schedule.demandManpowerDetailId == null
                      && schedule.demandSpecialModuleId == null)
                    .map(schedule => {
                      const draft = classificationDrafts[schedule.id];
                      const detailId = draft?.demandManpowerDetailId
                        ?? detailDemand.manpowerDetails?.[0]?.id;
                      const detail = detailDemand.manpowerDetails?.find(item => item.id === detailId);
                      const specialOptions = (detailDemand.specialModuleDemands || [])
                        .filter(item => item.testType === detail?.testType)
                        .map(item => ({
                          value: item.id,
                          label: `${item.moduleName}${item.enabled ? '' : '（已停用）'}`,
                        }));
                      const staff = staffs.find(item => item.id === schedule.staffId);
                      return (
                        <div
                          key={schedule.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(150px, 1fr) minmax(140px, 1fr) minmax(140px, 1fr) auto',
                            gap: 8,
                            alignItems: 'center',
                          }}
                        >
                          <span>
                            {staff?.name || schedule.staffId} / {schedule.date} / {schedule.percentage}%
                          </span>
                          <Select
                            aria-label={`排班 ${schedule.id} 小组明细`}
                            value={detailId}
                            options={(detailDemand.manpowerDetails || [])
                              .filter(item => item.id != null)
                              .map(item => ({ value: item.id!, label: item.testType }))}
                            onChange={(value: number) => setClassificationDrafts(previous => ({
                              ...previous,
                              [schedule.id]: {
                                demandManpowerDetailId: value,
                                demandSpecialModuleId: null,
                              },
                            }))}
                            size="small"
                          />
                          <Select
                            aria-label={`排班 ${schedule.id} 特殊模块明细`}
                            allowClear
                            placeholder="通用人力"
                            value={draft?.demandSpecialModuleId ?? undefined}
                            options={specialOptions}
                            onChange={(value?: number) => setClassificationDrafts(previous => ({
                              ...previous,
                              [schedule.id]: {
                                demandManpowerDetailId: detailId,
                                demandSpecialModuleId: value ?? null,
                              },
                            }))}
                            size="small"
                          />
                          <Button
                            aria-label={`归类排班 ${schedule.id}`}
                            icon={<CheckOutlined />}
                            size="small"
                            onClick={() => handleClassifySchedule(schedule)}
                          />
                        </div>
                      );
                    })}
                </div>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="备注说明" span={2}>{detailDemand.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交人">
              {(() => {
                const staff = staffs.find((s: StaffItem) => s.empNo === detailDemand.submittedBy || s.name === detailDemand.submittedBy);
                return staff ? `${staff.empNo} ${staff.name}` : (detailDemand.submittedBy || '-');
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="提交时间">
              {detailDemand.createdAt ? dayjs(detailDemand.createdAt).format('YYYY-MM-DD HH:mm') : '-'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleWorkbench;
