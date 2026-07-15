// ============================================================
// ScheduleWorkbench — 人力排布工作台（页面容器）
// Phase 1 重构：拆分子组件，保留全部现有功能
// ============================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Button, Tag, Space, Modal, message, InputNumber, Descriptions, Divider,
  DatePicker, Checkbox, Card,
} from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { useUserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';
import { DailyAvailabilityStatus, DailyStatusLabels } from '../types';

// 子组件
import WorkbenchSummaryBar from './workbench/WorkbenchSummaryBar';
import DemandQueue from './workbench/DemandQueue';
import ScheduleTimeline from './workbench/ScheduleTimeline';
import IssuePublishPanel from './workbench/IssuePublishPanel';

// 工具
import {
  getWeekDates,
  getDemandDateRange,
  getVersionTypeColor,
  getPriorityColor,
  getDailyStatus,
  getDailyStatusPercentage,
  isAvailableForAssignment,
  detectConflicts,
  calculateBatchMetrics,
  sortDemandsByRisk,
  getHighRiskDemandDetails,
  saveDraftToLocalStorage,
  loadDraftFromLocalStorage,
  clearDraftFromLocalStorage,
} from './workbench/workbenchCalculations';

import type {
  ScheduleItem,
  DemandItem,
  StaffItem,
  DailyStatusEntry,
  ConflictDetail,
  UnfulfilledDetail,
  BatchMetrics,
} from './workbench/workbenchTypes';

const { confirm } = Modal;

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

  // 推荐排班
  const [dateRecModalOpen, setDateRecModalOpen] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [fullAllocModalOpen, setFullAllocModalOpen] = useState(false);
  const [includeSaturdays, setIncludeSaturdays] = useState(false);
  const [includeSundays, setIncludeSundays] = useState(false);
  const [selectedDemandIds, setSelectedDemandIds] = useState<Set<number>>(new Set());
  const [unfulfilledDemands, setUnfulfilledDemands] = useState<Set<number>>(new Set());
  const [unfulfilledDetails, setUnfulfilledDetails] = useState<UnfulfilledDetail[]>([]);

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

  // ---- 页面初始化 ----
  useEffect(() => {
    fetchData();
    fetchPriorityOptions();
    document.body.style.overflow = 'hidden';
    const contentEl = document.querySelector('.ant-layout-content') as HTMLElement | null;
    if (contentEl) {
      contentEl.style.overflow = 'hidden';
      contentEl.style.display = 'flex';
      contentEl.style.flexDirection = 'column';
    }
    return () => {
      document.body.style.overflow = '';
      if (contentEl) {
        contentEl.style.overflow = '';
        contentEl.style.display = '';
        contentEl.style.flexDirection = '';
      }
    };
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

  const fetchData = async () => {
    try {
      const [demandsData, schedulesData, staffData] = await Promise.all([
        api.getPendingDemands(),
        api.getSchedules(),
        api.getStaff(),
      ]);
      setDemands(demandsData);
      setSchedules(schedulesData.map((s: any) => ({
        ...s,
        id: s.id,
        staffId: s.staffId,
        date: s.date,
        percentage: s.percentage,
        product: s.product,
        versionType: s.versionType,
        demandId: s.demandId,
        testManager: s.testManager,
        published: s.published ?? false,
      })));
      setStaffs(staffData);

      // 加载每日可用状态
      try {
        const weekDates = getWeekDates(weekViewDate);
        const startStr = weekDates[0].format('YYYY-MM-DD');
        const endStr = weekDates[weekDates.length - 1].format('YYYY-MM-DD');
        const statuses = await api.getDailyStatuses(startStr, endStr);
        const map = new Map<string, DailyStatusEntry>();
        statuses.forEach((s: any) =>
          map.set(`${s.staffId}-${s.date}`, { status: s.status, percentage: s.percentage ?? 100 })
        );
        setDailyStatuses(map);
      } catch { /* 非关键 */ }
    } catch (error: any) {
      message.error(error.message || '获取数据失败');
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
  const getSortedDemands = useCallback((demandList: DemandItem[]) => {
    return sortDemandsByRisk(demandList, schedules, staffIds, priorityOptions);
  }, [schedules, staffIds, priorityOptions]);

  const getAvailableStaffForDate = useCallback((
    dateStr: string,
    loadMap: Map<string, number>,
    activeStaffs: StaffItem[],
    isConfidential = false
  ) => {
    return activeStaffs
      .filter(s => isAvailableForAssignment(dailyStatuses, s.id, dateStr))
      .map(s => {
        const key = `${s.id}-${dateStr}`;
        const used = loadMap.get(key) || 0;
        const maxCap = Math.floor((s.currentCoefficient || 1) * 100);
        const status = getDailyStatus(dailyStatuses, s.id, dateStr);
        const statusPct = getDailyStatusPercentage(dailyStatuses, s.id, dateStr);
        const availableCap = status && status !== 'AVAILABLE' ? maxCap * (1 - statusPct / 100) : maxCap;
        const capacity = Math.floor(availableCap) - used;
        return { ...s, capacity };
      })
      .filter(s => s.capacity >= 10)
      .sort((a, b) => {
        if (isConfidential) {
          if (a.confidentialClearance && !b.confidentialClearance) return -1;
          if (!a.confidentialClearance && b.confidentialClearance) return 1;
        }
        return b.capacity - a.capacity;
      });
  }, [dailyStatuses]);

  // 共享贪婪分配核心
  const runAllocationCore = useCallback((
    sortedDemands: DemandItem[],
    dateStrings: string[],
    activeStaffs: StaffItem[],
    existingSchedules: ScheduleItem[]
  ) => {
    const newSchedules: any[] = [];
    const loadMap = new Map<string, number>();
    const unfulfilledSet = new Set<number>();

    const hasMatchingStaff = new Map<number, Set<string>>();
    const dateCoverageMap = new Map<number, Set<string>>();
    const deviceBlockedCount = new Map<number, number>();
    const capacityBlockedCount = new Map<number, number>();

    existingSchedules.forEach(s => {
      const key = `${s.staffId}-${s.date}`;
      loadMap.set(key, (loadMap.get(key) || 0) + s.percentage);
    });

    const remainingByType = new Map<string, number>();
    for (const demand of sortedDemands) {
      if (demand.manpowerDetails && demand.manpowerDetails.length > 0) {
        (demand.manpowerDetails as any[]).forEach((d: any) => {
          remainingByType.set(`${demand.id}-${d.testType}`, Number(d.manpowerDemand));
        });
      } else {
        remainingByType.set(`${demand.id}-__ALL__`, Number(demand.manpowerDemand));
      }
      hasMatchingStaff.set(demand.id, new Set());
      dateCoverageMap.set(demand.id, new Set());
      deviceBlockedCount.set(demand.id, 0);
      capacityBlockedCount.set(demand.id, 0);
    }

    const demandNeededTypes = new Map<number, string[]>();
    for (const demand of sortedDemands) {
      demandNeededTypes.set(demand.id, (demand.manpowerDetails || []).length > 0
        ? (demand.manpowerDetails as any[]).map((d: any) => d.testType)
        : ['__ALL__']);
    }

    for (const demand of sortedDemands) {
      const neededTypes = demandNeededTypes.get(demand.id) || [];
      const matchSet = hasMatchingStaff.get(demand.id)!;
      for (const tt of neededTypes) {
        const hasStaff = activeStaffs.some((s: StaffItem) => {
          if (tt === '__ALL__') return true;
          return s.testType === tt;
        });
        if (hasStaff) matchSet.add(tt);
      }
    }

    const deviceStaffMap = new Map<string, Set<number>>();
    const completedDemands = new Set<number>();

    for (const dateStr of dateStrings) {
      const date = dayjs(dateStr);

      // 人员优先：每个人员的容量按需求优先级依次分配，剩余容量自动流转给下一个需求
      const hasConfidential = sortedDemands.some(d => !completedDemands.has(d.id) && d.confidential);
      const allAvailable = getAvailableStaffForDate(dateStr, loadMap, activeStaffs, hasConfidential);

      for (const staff of allAvailable) {
        if (staff.capacity < 5) continue;

        for (const demand of sortedDemands) {
          if (completedDemands.has(demand.id)) continue;
          if (date.isBefore(dayjs(demand.startDate), 'day')) continue;

          const neededTypes = demandNeededTypes.get(demand.id) || [];
          const deviceCount = demand.testDeviceCount;

          // 样机限制检查
          if (deviceCount && deviceCount > 0) {
            const dcKey = `${demand.id}-${dateStr}`;
            const assignedSet = deviceStaffMap.get(dcKey);
            const alreadyAssigned = assignedSet ? assignedSet.size : 0;
            if (!assignedSet?.has(staff.id) && alreadyAssigned >= deviceCount) {
              deviceBlockedCount.set(demand.id, (deviceBlockedCount.get(demand.id) || 0) + 1);
              continue;
            }
          }

          // 测试类型匹配
          const staffTestType = staff.testType;
          const matched = neededTypes.find((tt: string) => {
            if (tt === '__ALL__') return true;
            return tt === staffTestType;
          });
          if (!matched) continue;

          const matchSet = hasMatchingStaff.get(demand.id)!;
          matchSet.add(matched);

          const typeKey = `${demand.id}-${matched}`;
          const typeRemaining = remainingByType.get(typeKey) || 0;
          if (typeRemaining <= 0.001) continue;

          const maxAlloc = Math.min(staff.capacity, 100);
          const alloc = Math.min(Math.round(typeRemaining * 100), maxAlloc);
          if (alloc < 5) {
            capacityBlockedCount.set(demand.id, (capacityBlockedCount.get(demand.id) || 0) + 1);
            continue;
          }

          newSchedules.push({
            staffId: staff.id,
            demandId: demand.id,
            date: dateStr,
            percentage: alloc,
            product: demand.product,
            testManager: demand.submittedBy || '推荐排班',
            versionType: demand.versionType,
            version: demand.version,
          });

          const key = `${staff.id}-${dateStr}`;
          loadMap.set(key, (loadMap.get(key) || 0) + alloc);
          remainingByType.set(typeKey, typeRemaining - alloc / 100);
          dateCoverageMap.get(demand.id)!.add(dateStr);

          const dcKey = `${demand.id}-${dateStr}`;
          if (!deviceStaffMap.has(dcKey)) deviceStaffMap.set(dcKey, new Set());
          deviceStaffMap.get(dcKey)!.add(staff.id);

          // 更新人员剩余容量，以便分配给下一个需求
          staff.capacity -= alloc;

          // 检查需求是否完成
          const allDone = neededTypes.every((tt: string) =>
            (remainingByType.get(`${demand.id}-${tt}`) || 0) <= 0.001
          );
          if (allDone) completedDemands.add(demand.id);

          // 人员容量用尽，跳过剩余需求
          if (staff.capacity < 5) break;
        }
      }
      if (completedDemands.size === sortedDemands.length) break;
    }

    // 生成未满足详情
    const unfulfilledDetailsList: UnfulfilledDetail[] = [];
    for (const demand of sortedDemands) {
      const neededTypes = demandNeededTypes.get(demand.id) || [];
      const totalRemaining = neededTypes.reduce((sum, tt) =>
        sum + Math.max(0, remainingByType.get(`${demand.id}-${tt}`) || 0), 0
      );
      if (totalRemaining <= 0.001) {
        // 即使人力已满足，仍检测是否超出期限
        const demandSchedules = newSchedules.filter(s => s.demandId === demand.id);
        const endDate = dayjs(demand.endDate);
        const overdueDates = demandSchedules
          .filter(s => dayjs(s.date).isAfter(endDate, 'day'))
          .map(s => s.date);
        const uniqueOverdueDates = [...new Set(overdueDates)].sort();
        const overdueDays = uniqueOverdueDates.length;

        if (overdueDays > 0) {
          unfulfilledDetailsList.push({
            product: demand.product,
            shortage: 0,
            details: [],
            reasons: [`排班超出完成期限 ${overdueDays} 天（最晚至 ${uniqueOverdueDates[uniqueOverdueDates.length - 1]}）`],
            overdueDays,
            overdueDates: uniqueOverdueDates,
          });
          unfulfilledSet.add(demand.id);
        }
        continue;
      }

      unfulfilledSet.add(demand.id);
      const reasons: string[] = [];
      const perTypeDetails: Array<{ testType: string; shortage: number }> = [];

      for (const tt of neededTypes) {
        const remaining = Math.max(0, remainingByType.get(`${demand.id}-${tt}`) || 0);
        if (remaining <= 0.001) continue;
        const typeShortage = Math.round(remaining * 10) / 10;
        const matchSet = hasMatchingStaff.get(demand.id) || new Set();
        const displayType = tt === '__ALL__' ? '总计' : tt;
        perTypeDetails.push({ testType: displayType, shortage: typeShortage });
        if (!matchSet.has(tt)) {
          reasons.push(`缺少「${displayType}」类型的测试人员`);
        }
      }

      const capBlocked = capacityBlockedCount.get(demand.id) || 0;
      if (capBlocked > 0) {
        reasons.push(`员工日容量不足（${capBlocked} 次因容量<5%被跳过）`);
      }

      const devBlocked = deviceBlockedCount.get(demand.id) || 0;
      if (devBlocked > 0) {
        reasons.push(`样机数量限制（${devBlocked} 次因达到设备上限被跳过）`);
      }

      const demandTotalDays = dayjs(demand.endDate).diff(dayjs(demand.startDate), 'day') + 1;
      const coveredDays = dateCoverageMap.get(demand.id)?.size || 0;
      if (coveredDays < demandTotalDays) {
        reasons.push(`排班日期仅覆盖 ${coveredDays}/${demandTotalDays} 天`);
      }

      if (reasons.length === 0) {
        reasons.push('人力需求超出可用资源总量');
      }

      // 检测排班是否超出需求期限
      const demandSchedules = newSchedules.filter(s => s.demandId === demand.id);
      const endDate = dayjs(demand.endDate);
      const overdueDates = demandSchedules
        .filter(s => dayjs(s.date).isAfter(endDate, 'day'))
        .map(s => s.date);
      const uniqueOverdueDates = [...new Set(overdueDates)].sort();
      const overdueDays = uniqueOverdueDates.length;

      if (overdueDays > 0) {
        reasons.push(`排班超出完成期限 ${overdueDays} 天（最晚至 ${uniqueOverdueDates[uniqueOverdueDates.length - 1]}）`);
      }

      unfulfilledDetailsList.push({
        product: demand.product,
        shortage: Math.round(totalRemaining * 10) / 10,
        details: perTypeDetails,
        reasons,
        overdueDays: overdueDays > 0 ? overdueDays : undefined,
        overdueDates: uniqueOverdueDates.length > 0 ? uniqueOverdueDates : undefined,
      });
    }

    return { newSchedules, unfulfilledSet, unfulfilledDetailsList };
  }, [getAvailableStaffForDate]);

  const persistRecommendation = useCallback(async (
    newSchedules: any[],
    activeStaffs: StaffItem[]
  ) => {
    const publishedForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && s.published
    );
    const otherDemandSchedules = schedules.filter(s =>
      !selectedDemandIds.has(s.demandId || 0)
    );
    const preservedSchedules: ScheduleItem[] = [...publishedForSelected, ...otherDemandSchedules];

    const unpublishdForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && !s.published
    );
    for (const s of unpublishdForSelected) {
      await api.deleteSchedule(s.id);
    }

    const savedSchedules = newSchedules.length > 0
      ? await api.createSchedulesBatch(newSchedules)
      : [];

    const mappedSchedules: ScheduleItem[] = savedSchedules.map((s: any) => ({
      id: s.id,
      staffId: s.staffId,
      demandId: s.demandId,
      date: s.date,
      percentage: s.percentage,
      product: s.product,
      testManager: s.testManager,
      versionType: s.versionType,
      version: s.version,
      published: s.published ?? false,
    }));

    setSchedules([...preservedSchedules, ...mappedSchedules]);

    // 冲突检测
    const conflicts: ConflictDetail[] = detectConflicts(newSchedules, activeStaffs, dailyStatuses);
    setConflictDetails(conflicts);
  }, [schedules, selectedDemandIds, dailyStatuses]);

  const runDateRecommendation = async () => {
    setDateRecModalOpen(false);
    const loadingMsg = message.loading({ content: '正在生成推荐方案...', key: 'date-rec', duration: 0 });

    const pendingDemands = demands.filter(d => selectedDemandIds.has(d.id));
    if (pendingDemands.length === 0) { loadingMsg(); message.warning('没有待排期的需求'); return; }

    const activeStaffs = staffs.filter(s => s.status === 'active');
    if (activeStaffs.length === 0) { loadingMsg(); message.warning('没有可用的测试人员'); return; }

    const sortedDemands = getSortedDemands(pendingDemands);
    const dateStrings = Array.from(selectedDates).sort();

    const publishedForSelected = schedules.filter(s => selectedDemandIds.has(s.demandId || 0) && s.published);
    const otherDemandSchedules = schedules.filter(s => !selectedDemandIds.has(s.demandId || 0));
    const existingForLoad = [...publishedForSelected, ...otherDemandSchedules];

    const { newSchedules, unfulfilledSet, unfulfilledDetailsList } = runAllocationCore(
      sortedDemands, dateStrings, activeStaffs, existingForLoad
    );

    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

    // 剔除不可发布的需求，使"发布本批"按钮准确反映可发布数量
    setSelectedDemandIds(prev => {
      const next = new Set(prev);
      unfulfilledSet.forEach(id => next.delete(id));
      return next;
    });

    // 超期预警
    const overdueList = unfulfilledDetailsList.filter(u => u.overdueDays && u.overdueDays > 0);
    if (overdueList.length > 0) {
      const overdueInfo = overdueList
        .map(u => `• ${u.product}：超出期限 ${u.overdueDays} 天`)
        .join('\n');

      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '排班超出完成期限预警',
          icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
          content: (
            <div>
              <p>以下需求的排班日期已超出完成期限：</p>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#fffbe6', padding: 8, borderRadius: 4, fontSize: 13 }}>
                {overdueInfo}
              </pre>
              <p style={{ marginTop: 8, color: '#666' }}>是否仍要保存排班方案？</p>
            </div>
          ),
          okText: '继续保存',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        loadingMsg();
        message.info('已取消排班');
        return;
      }
    }

    try {
      await persistRecommendation(newSchedules, activeStaffs);
    } catch (err: any) {
      loadingMsg();
      message.error(err.message || '保存排班失败');
      return;
    }
    loadingMsg();

    if (unfulfilledDetailsList.length > 0) {
      const products = unfulfilledDetailsList.map(u => `${u.product}(缺口${u.shortage}人/天)`).join('、');
      message.warning({
        content: `推荐排班完成：${newSchedules.length} 条草稿，${unfulfilledDetailsList.length} 个需求未满足 — ${products}，详见下方分析`,
        duration: 6,
      });
    } else {
      message.success(`推荐排班完成：共生成 ${newSchedules.length} 条草稿排班，全部需求已满足，请点击卡片发布`);
    }
  };

  const runFullAllocateRecommendation = async () => {
    setFullAllocModalOpen(false);
    const loadingMsg = message.loading({ content: '正在生成推荐方案...', key: 'full-alloc', duration: 0 });

    const pendingDemands = demands.filter(d => selectedDemandIds.has(d.id));
    if (pendingDemands.length === 0) { loadingMsg(); message.warning('没有待排期的需求'); return; }

    const activeStaffs = staffs.filter(s => s.status === 'active');
    if (activeStaffs.length === 0) { loadingMsg(); message.warning('没有可用的测试人员'); return; }

    const sortedDemands = getSortedDemands(pendingDemands);
    const today = dayjs();
    let globalStart = today;
    for (const d of sortedDemands) {
      const dStart = dayjs(d.startDate);
      if (dStart.isBefore(globalStart, 'day')) globalStart = dStart;
    }
    const globalEnd = today.add(90, 'day');
    const allDates = getDemandDateRange(globalStart, globalEnd);
    const filteredDates = allDates.filter(d => {
      const dow = d.day();
      if (dow === 6 && !includeSaturdays) return false;
      if (dow === 0 && !includeSundays) return false;
      return true;
    });
    const dateStrings = filteredDates.map(d => d.format('YYYY-MM-DD')).sort();

    const publishedForSelected = schedules.filter(s => selectedDemandIds.has(s.demandId || 0) && s.published);
    const otherDemandSchedules = schedules.filter(s => !selectedDemandIds.has(s.demandId || 0));
    const existingForLoad = [...publishedForSelected, ...otherDemandSchedules];

    const { newSchedules, unfulfilledSet, unfulfilledDetailsList } = runAllocationCore(
      sortedDemands, dateStrings, activeStaffs, existingForLoad
    );

    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

    // 剔除不可发布的需求，使"发布本批"按钮准确反映可发布数量
    setSelectedDemandIds(prev => {
      const next = new Set(prev);
      unfulfilledSet.forEach(id => next.delete(id));
      return next;
    });

    // 超期预警
    const overdueList = unfulfilledDetailsList.filter(u => u.overdueDays && u.overdueDays > 0);
    if (overdueList.length > 0) {
      const overdueInfo = overdueList
        .map(u => `• ${u.product}：超出期限 ${u.overdueDays} 天`)
        .join('\n');

      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          title: '排班超出完成期限预警',
          icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
          content: (
            <div>
              <p>以下需求的排班日期已超出完成期限：</p>
              <pre style={{ whiteSpace: 'pre-wrap', background: '#fffbe6', padding: 8, borderRadius: 4, fontSize: 13 }}>
                {overdueInfo}
              </pre>
              <p style={{ marginTop: 8, color: '#666' }}>是否仍要保存排班方案？</p>
            </div>
          ),
          okText: '继续保存',
          cancelText: '取消',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        loadingMsg();
        message.info('已取消排班');
        return;
      }
    }

    try {
      await persistRecommendation(newSchedules, activeStaffs);
    } catch (err: any) {
      loadingMsg();
      message.error(err.message || '保存排班失败');
      return;
    }
    loadingMsg();

    if (unfulfilledDetailsList.length > 0) {
      const products = unfulfilledDetailsList.map(u => `${u.product}(缺口${u.shortage}人/天)`).join('、');
      message.warning({
        content: `推荐排班完成：${newSchedules.length} 条草稿，${unfulfilledDetailsList.length} 个需求未满足 — ${products}，详见下方分析`,
        duration: 6,
      });
    } else {
      message.success(`推荐排班完成：共生成 ${newSchedules.length} 条草稿排班，全部需求已满足，请点击卡片发布`);
    }
  };

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
        try {
          for (const s of unpublishdSchedules) {
            await api.deleteSchedule(s.id);
          }
          setSchedules(prev => prev.filter(s => s.published));
          setPendingChangeDemandIds(new Set());
          setConflictDetails([]);
          clearDraftFromLocalStorage();
          message.success(`已清除 ${unpublishdSchedules.length} 条未发布排班`);
        } catch (err: any) {
          message.error(err.message || '清除失败');
        }
      },
    });
  };

  // ---- 发布全部 ----
  const handlePublishAll = () => {
    // 筛选可发布需求：有草稿排班即可
    const publishableDemands = demands.filter(d => {
      const hasDraft = schedules.some(s => s.demandId === d.id && !s.published);
      return hasDraft;
    });

    if (publishableDemands.length === 0) {
      message.info('没有可发布的排班（需有草稿排班）');
      return;
    }

    confirm({
      title: '确认发布',
      content: `确定要发布全部 ${publishableDemands.length} 个需求的草稿排班吗？`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        setPublishAllLoading(true);
        let successCount = 0;
        let failCount = 0;
        const failedDetails: Array<{ demandId: number; product: string; reason: string }> = [];
        try {
          for (const demand of publishableDemands) {
            try {
              const hasPendingChanges = pendingChangeDemandIds.has(demand.id);
              if (hasPendingChanges) {
                await api.deleteSchedulesByDemand(demand.id);
                const currentSchedules = schedules.filter(s => s.demandId === demand.id);
                if (currentSchedules.length > 0) {
                  await api.createSchedulesBatch(currentSchedules.map(s => ({
                    staffId: s.staffId, demandId: s.demandId, date: s.date,
                    percentage: s.percentage, product: s.product,
                    testManager: s.testManager || '测试经理', versionType: s.versionType,
                  })));
                }
              }
              await api.publishSchedules(demand.id);
              successCount++;
            } catch (err: any) {
              const errMsg = err?.message || err?.response?.data?.message || String(err);
              console.error(`发布需求 ${demand.id} (${demand.product}) 失败:`, err);
              failedDetails.push({ demandId: demand.id, product: demand.product, reason: errMsg });
              failCount++;
            }
          }
          // 清除所有状态
          setPendingChangeDemandIds(new Set());
          setSelectedDemandIds(new Set());
          setConflictDetails([]);
          setUnfulfilledDemands(new Set());
          clearDraftFromLocalStorage();
          if (failCount === 0) {
            message.success(`已成功发布 ${successCount} 个需求的排班`);
          } else {
            Modal.warning({
              title: '发布结果',
              content: (
                <div>
                  <p>发布完成：{successCount} 成功，{failCount} 失败</p>
                  {failedDetails.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p><strong>失败详情：</strong></p>
                      {failedDetails.map((f, i) => (
                        <p key={i} style={{ color: '#ff4d4f', margin: '4px 0' }}>
                          「{f.product}」(ID: {f.demandId})：{f.reason}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ),
            });
          }
          fetchData();
        } catch (err: any) {
          message.error(err.message || '发布失败');
        } finally {
          setPublishAllLoading(false);
        }
      },
    });
  };

  // ---- 发布 ----
  const handlePublishDemand = async (demandId: number) => {
    const demandSchedules = schedules.filter(s => s.demandId === demandId);
    const hasPendingChanges = pendingChangeDemandIds.has(demandId);
    if (demandSchedules.length === 0 && !hasPendingChanges) {
      message.warning('该需求暂无排班数据');
      return;
    }
    try {
      if (hasPendingChanges) {
        await api.deleteSchedulesByDemand(demandId);
        const currentSchedules = schedules.filter(s => s.demandId === demandId);
        if (currentSchedules.length > 0) {
          await api.createSchedulesBatch(currentSchedules.map(s => ({
            staffId: s.staffId, demandId: s.demandId, date: s.date,
            percentage: s.percentage, product: s.product,
            testManager: s.testManager || '测试经理', versionType: s.versionType,
          })));
        }
      }
      await api.publishSchedules(demandId);
      setPendingChangeDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
      setSelectedDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
      message.success('排期已发布');
      fetchData();
    } catch (err: any) {
      message.error(err.message || '发布失败');
    }
  };

  // ---- 清除 ----
  const handleClearDemand = (demandId: number) => {
    const demandSchedules = schedules.filter(s => s.demandId === demandId);
    const pubCount = demandSchedules.filter(s => s.published).length;
    const draftCount = demandSchedules.length - pubCount;
    const hasPendingChanges = pendingChangeDemandIds.has(demandId);

    if (demandSchedules.length === 0 && !hasPendingChanges) {
      message.info('该需求暂无排班数据');
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
        try {
          for (const s of demandSchedules) {
            await api.deleteSchedule(s.id);
          }
          setSchedules(prev => prev.filter(s => s.demandId !== demandId));
          setPendingChangeDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
          message.success(`已清除 ${demandSchedules.length} 条排班`);
          fetchData();
        } catch (err: any) {
          message.error(err.message || '清除失败');
        }
      },
    });
  };

  // ---- 拖拽：需求 → 单元格 ----
  const handleDragStart = useCallback((e: React.DragEvent, demand: DemandItem) => {
    setSelectedDemand(demand);
    e.dataTransfer.effectAllowed = 'copy';

    const demandSchedules = schedules.filter(s => s.demandId === demand.id);
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const remaining = Math.max(0, Number(demand.manpowerDemand || 0) - allocatedDays);

    const dragPreview = document.createElement('div');
    dragPreview.style.cssText = `
      padding: 8px 14px; background: #fff;
      border: 2px solid ${demand.confidential ? '#ff4d4f' : '#1890ff'};
      border-radius: 8px; font-size: 13px; white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: inline-flex;
      align-items: center; gap: 8px; position: absolute; top: -1000px; left: -1000px;
    `;
    dragPreview.innerHTML = `
      <strong>${demand.product}</strong>
      <span style="color:#1890ff;font-weight:500">${remaining.toFixed(1)}人/天</span>
      ${demand.confidential ? '<span style="color:#ff4d4f;font-size:11px;border:1px solid #ff4d4f;border-radius:3px;padding:0 4px">保密</span>' : ''}
    `;
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    setTimeout(() => document.body.removeChild(dragPreview), 0);
  }, [schedules]);

  // ---- 拖拽：排班卡片 ----
  const handleScheduleDragStart = useCallback((e: React.DragEvent, schedule: ScheduleItem) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSchedule(schedule);
    setSelectedDemand(null);
  }, []);

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
  const handleScheduleTransfer = async (schedule: ScheduleItem, targetStaff: StaffItem, targetDate: string) => {
    if (schedule.staffId === targetStaff.id && schedule.date === targetDate) {
      setDraggedSchedule(null);
      return;
    }

    if (!isAvailableForAssignment(dailyStatuses, targetStaff.id, targetDate)) {
      const statusLabel = DailyStatusLabels[getDailyStatus(dailyStatuses, targetStaff.id, targetDate) as DailyAvailabilityStatus];
      message.warning(`${targetStaff.name}今日「${statusLabel}」，不参与测试`);
      setDraggedSchedule(null);
      return;
    }

    // 保密权限校验
    const transferDemand = demands.find(d => d.id === schedule.demandId);
    if (transferDemand?.confidential && !targetStaff.confidentialClearance) {
      Modal.warning({
        title: '无法转移保密需求',
        content: `${targetStaff.name} 不具备保密权限，无法参与保密项目「${transferDemand.product}」的测试。`,
      });
      setDraggedSchedule(null);
      return;
    }

    const coeff = targetStaff.currentCoefficient || 1;
    const statusPct = getDailyStatusPercentage(dailyStatuses, targetStaff.id, targetDate);
    const status = getDailyStatus(dailyStatuses, targetStaff.id, targetDate);
    const statusFactor = status && status !== 'AVAILABLE' ? (1 - statusPct / 100) : 1;
    const maxPercentage = Math.round(coeff * 100 * statusFactor);
    const transferPercentage = Math.min(schedule.percentage, maxPercentage);

    // 样机数量校验
    const overloadDates = getDeviceOverloadDates(schedule.demandId, targetStaff.id, [targetDate], schedule.id);
    if (overloadDates.length > 0) {
      const demand = demands.find(d => d.id === schedule.demandId);
      if (demand) {
        const confirmed = await confirmDeviceOverload(demand.product, overloadDates, demand.testDeviceCount!);
        if (!confirmed) {
          setDraggedSchedule(null);
          return;
        }
      }
    }

    if (schedule.published) {
      const tempId = -(Date.now() + Math.floor(Math.random() * 1000));
      const newSchedule: ScheduleItem = {
        id: tempId, staffId: targetStaff.id, demandId: schedule.demandId,
        date: targetDate, percentage: transferPercentage, product: schedule.product,
        testManager: schedule.testManager || '测试经理',
        versionType: schedule.versionType, version: schedule.version,
        published: false,
      };
      setSchedules(prev => [...prev.filter(s => s.id !== schedule.id), newSchedule]);
      setPendingChangeDemandIds(prev => new Set(prev).add(schedule.demandId!));
      message.success(`已转移至 ${targetStaff.name}（草稿），请点击发布生效`);
      setDraggedSchedule(null);
      return;
    }

    try {
      await api.deleteSchedule(schedule.id);
      const created = await api.createSchedule({
        staffId: targetStaff.id, demandId: schedule.demandId, date: targetDate,
        percentage: transferPercentage, product: schedule.product,
        testManager: schedule.testManager || '测试经理',
        versionType: schedule.versionType, version: schedule.version,
      });
      setSchedules(prev => [
        ...prev.filter(s => s.id !== schedule.id),
        { ...created, id: created.id, staffId: created.staffId, demandId: created.demandId,
          date: created.date, percentage: created.percentage, product: created.product,
          testManager: created.testManager, versionType: created.versionType, published: created.published },
      ]);
      message.success(`已转移至 ${targetStaff.name}`);
    } catch (err: any) {
      message.error(err.message || '转移失败');
    } finally {
      setDraggedSchedule(null);
    }
  };

  // ---- 拖拽：需求放到单元格 ----
  const handleDrop = useCallback((staff: StaffItem, date: string) => {
    if (!selectedDemand) return;
    if (!isAvailableForAssignment(dailyStatuses, staff.id, date)) {
      const statusLabel = DailyStatusLabels[getDailyStatus(dailyStatuses, staff.id, date) as DailyAvailabilityStatus];
      message.warning(`${staff.name}今日「${statusLabel}」，不参与测试`);
      return;
    }

    // 保密权限校验
    if (selectedDemand.confidential && !staff.confidentialClearance) {
      Modal.warning({
        title: '无法分配保密需求',
        content: `${staff.name} 不具备保密权限，无法参与保密项目「${selectedDemand.product}」的测试。`,
      });
      return;
    }

    const demandSchedules = schedules.filter(s => s.demandId === selectedDemand.id);
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    if (allocatedDays >= Number(selectedDemand.manpowerDemand || 0)) {
      message.warning('测试人力需求已满足，无需继续分配');
      return;
    }

    const coeff = staff.currentCoefficient || 1;
    const sPct = getDailyStatusPercentage(dailyStatuses, staff.id, date);
    const s = getDailyStatus(dailyStatuses, staff.id, date);
    const sFactor = s && s !== 'AVAILABLE' ? (1 - sPct / 100) : 1;
    setAssignTarget({ staff, date });
    setAssignDays(1);
    setAssignPercentage(Math.round(coeff * 100 * sFactor));
    setAssignModalVisible(true);
  }, [selectedDemand, schedules, dailyStatuses]);

  // ---- 分配确认 ----
  const handleAssignConfirm = async () => {
    if (!assignTarget || !selectedDemand) return;

    // 保密权限校验
    if (selectedDemand.confidential && !assignTarget.staff.confidentialClearance) {
      Modal.warning({
        title: '无法分配保密需求',
        content: `${assignTarget.staff.name} 不具备保密权限，无法参与保密项目「${selectedDemand.product}」的测试。`,
      });
      return;
    }

    const demandSchedules = schedules.filter(s => s.demandId === selectedDemand.id);
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const remaining = Number(selectedDemand.manpowerDemand || 0) - allocatedDays;
    const thisAllocation = (assignDays * assignPercentage) / 100;

    if (thisAllocation > remaining) {
      message.warning(`测试人力需求已满足，剩余可分配 ${remaining.toFixed(1)} 人/天，本次分配超出需求`);
      return;
    }

    // 样机数量校验
    const assignDates = Array.from({ length: assignDays }, (_, i) =>
      dayjs(assignTarget.date).add(i, 'day').format('YYYY-MM-DD'),
    );
    const overloadDates = getDeviceOverloadDates(selectedDemand.id, assignTarget.staff.id, assignDates);
    if (overloadDates.length > 0) {
      const confirmed = await confirmDeviceOverload(selectedDemand.product, overloadDates, selectedDemand.testDeviceCount!);
      if (!confirmed) return;
    }

    setAssignLoading(true);
    try {
      const newSchedules = [];
      for (let i = 0; i < assignDays; i++) {
        const currentDate = dayjs(assignTarget.date).add(i, 'day').format('YYYY-MM-DD');
        newSchedules.push({
          staffId: assignTarget.staff.id, demandId: selectedDemand.id,
          date: currentDate, percentage: assignPercentage,
          product: selectedDemand.product,
          testManager: selectedDemand.submittedBy || '测试经理',
          versionType: selectedDemand.versionType, version: selectedDemand.version,
        });
      }
      const savedSchedules = await api.createSchedulesBatch(newSchedules);
      setSchedules(prev => [...prev, ...savedSchedules.map((s: any) => ({
        id: s.id, staffId: s.staffId, demandId: s.demandId,
        date: s.date, percentage: s.percentage, product: s.product,
        testManager: s.testManager, versionType: s.versionType, published: s.published,
      }))]);
      message.success(`已安排「${selectedDemand.product}」给 ${assignTarget.staff.name}，连续 ${assignDays} 天`);
      setAssignModalVisible(false);
      setSelectedDemand(null);
      setAssignTarget(null);
    } catch (error: any) {
      message.error(error.message || '分配失败');
    } finally {
      setAssignLoading(false);
    }
  };

  // ---- 删除排班 ----
  const handleDeleteSchedule = async (schedule: ScheduleItem) => {
    if (schedule.published) {
      setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      setPendingChangeDemandIds(prev => new Set(prev).add(schedule.demandId!));
      message.success('已移除排班（草稿），请点击发布生效');
      return;
    }
    try {
      await api.deleteSchedule(schedule.id);
      setSchedules(prev => prev.filter(s => s.id !== schedule.id));
      message.success('已删除排班');
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  // ---- 编辑排班 ----
  const handleEditSchedule = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setEditPercentage(schedule.percentage);
    setEditModalVisible(true);
  };

  const handleEditConfirm = async () => {
    if (!editingSchedule) return;
    setEditLoading(true);

    if (editingSchedule.published) {
      const tempId = -(Date.now() + Math.floor(Math.random() * 1000));
      setSchedules(prev => [
        ...prev.filter(s => s.id !== editingSchedule.id),
        {
          id: tempId, staffId: editingSchedule.staffId,
          demandId: editingSchedule.demandId, date: editingSchedule.date,
          percentage: editPercentage, product: editingSchedule.product,
          testManager: editingSchedule.testManager || '测试经理',
          versionType: editingSchedule.versionType, version: editingSchedule.version,
          published: false,
        },
      ]);
      setPendingChangeDemandIds(prev => new Set(prev).add(editingSchedule.demandId!));
      setEditLoading(false);
      message.success('排班已更新（草稿），请点击发布生效');
      setEditModalVisible(false);
      setEditingSchedule(null);
      return;
    }

    try {
      await api.deleteSchedule(editingSchedule.id);
      const created = await api.createSchedule({
        staffId: editingSchedule.staffId, demandId: editingSchedule.demandId,
        date: editingSchedule.date, percentage: editPercentage,
        product: editingSchedule.product,
        testManager: editingSchedule.testManager || '测试经理',
        versionType: editingSchedule.versionType, version: editingSchedule.version,
      });
      setSchedules(prev => [
        ...prev.filter(s => s.id !== editingSchedule.id),
        { ...created, id: created.id, staffId: created.staffId, demandId: created.demandId,
          date: created.date, percentage: created.percentage, product: created.product,
          testManager: created.testManager, versionType: created.versionType, published: created.published },
      ]);
      message.success('排班已更新');
      setEditModalVisible(false);
      setEditingSchedule(null);
    } catch (error: any) {
      message.error(error.message || '更新失败');
    } finally {
      setEditLoading(false);
    }
  };

  // ---- 推荐弹窗：需求选择列表 ----
  const renderDemandSelectionList = () => {
    const eligibleDemands = demands.filter(d => {
      const demandSchedules = schedules.filter(s => s.demandId === d.id && staffIds.includes(s.staffId));
      const publishedAllocatedDays = demandSchedules.filter(s => s.published).reduce((sum, s) => sum + s.percentage / 100, 0);
      const hasRemaining = publishedAllocatedDays < Number(d.manpowerDemand || 0);
      return hasRemaining && (d.status === 'pending' || d.status === 'scheduled');
    });
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
  const handleDateRecommend = () => {
    const eligibleIds = demands
      .filter(d => {
        const demandSchedules = schedules.filter(s => s.demandId === d.id && staffIds.includes(s.staffId));
        const publishedAllocatedDays = demandSchedules.filter(s => s.published).reduce((sum, s) => sum + s.percentage / 100, 0);
        const hasRemaining = publishedAllocatedDays < Number(d.manpowerDemand || 0);
        return hasRemaining && (d.status === 'pending' || d.status === 'scheduled');
      })
      .map(d => d.id);
    setSelectedDemandIds(new Set(eligibleIds));
    setSelectedDates(new Set());
    setDateRecModalOpen(true);
  };

  const handleFullAllocateRecommend = () => {
    const eligibleIds = demands
      .filter(d => {
        const demandSchedules = schedules.filter(s => s.demandId === d.id && staffIds.includes(s.staffId));
        const publishedAllocatedDays = demandSchedules.filter(s => s.published).reduce((sum, s) => sum + s.percentage / 100, 0);
        const hasRemaining = publishedAllocatedDays < Number(d.manpowerDemand || 0);
        return hasRemaining && (d.status === 'pending' || d.status === 'scheduled');
      })
      .map(d => d.id);
    setSelectedDemandIds(new Set(eligibleIds));
    setIncludeSaturdays(false);
    setIncludeSundays(false);
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
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', overscrollBehavior: 'none', minHeight: 0 }}>
      {/* 顶部区域：总览条 + 冲突/缺口面板 */}
      <div style={{ flexShrink: 0, background: '#f0f2f5', paddingBottom: 8 }}>
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
          onDemandDragStart={handleDragStart}
          onDemandDragEnd={() => setDragOverCell(null)}
        />

        <ScheduleTimeline
          staffs={staffs}
          schedules={schedules}
          weekViewDate={weekViewDate}
          dailyStatuses={dailyStatuses}
          selectedDemand={selectedDemand}
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
        const alreadyAllocated = assignTarget && selectedDemand
          ? schedules.filter(s => s.demandId === selectedDemand.id).reduce((sum, s) => sum + s.percentage / 100, 0)
          : 0;
        const remaining = assignTarget && selectedDemand
          ? Number(selectedDemand.manpowerDemand || 0) - alreadyAllocated
          : 0;
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
            onCancel={() => { setAssignModalVisible(false); setSelectedDemand(null); setAssignTarget(null); }}
            footer={[
              <Button key="cancel" onClick={() => setAssignModalVisible(false)}>取消</Button>,
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
                  <Descriptions.Item label="需求周期">
                    {dayjs(selectedDemand.startDate).format('YYYY-MM-DD')} ~ {dayjs(selectedDemand.endDate).format('YYYY-MM-DD')}
                  </Descriptions.Item>
                  <Descriptions.Item label="需求人力">{selectedDemand.manpowerDemand} 人/天</Descriptions.Item>
                  <Descriptions.Item label="已分配">
                    <span style={{ color: alreadyAllocated >= Number(selectedDemand.manpowerDemand || 0) ? '#52c41a' : '#1890ff' }}>
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
                      min={1} max={Math.floor(assignTarget.staff.currentCoefficient * 100)}
                      value={assignPercentage} onChange={(v) => setAssignPercentage(v || 100)}
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
                      <li>需求总量：{selectedDemand.manpowerDemand} 人/天</li>
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
                  min={1} max={200}
                  value={editPercentage} onChange={(v) => setEditPercentage(v || 100)}
                  style={{ width: 100, marginLeft: 8 }}
                />
                <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>%</span>
              </div>
              <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
                <ul style={{ margin: 0, paddingLeft: 20, color: '#666' }}>
                  <li>输入 100 表示 1 人/天</li>
                  <li>输入 50 表示 0.5 人/天</li>
                  <li>输入 200 表示 2 人/天（可超过100%）</li>
                </ul>
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
        onCancel={() => { setDateRecModalOpen(false); setSelectedDates(new Set()); setSelectedDemandIds(new Set()); }}
        okText="开始排班" cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 || selectedDates.size === 0 }}
        width={520}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>选择排班日期（{selectedDates.size} 天已选）</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <DatePicker
              placeholder="选择任意日期（含过去）"
              format="YYYY-MM-DD"
              style={{ flex: 1 }}
              onChange={(date: dayjs.Dayjs | null) => {
                if (date) {
                  setSelectedDates(prev => { const next = new Set(prev); next.add(date.format('YYYY-MM-DD')); return next; });
                }
              }}
            />
          </div>
          <Checkbox
            checked={selectedDates.size === 8}
            indeterminate={selectedDates.size > 0 && selectedDates.size < 8}
            onChange={(e) => {
              if (e.target.checked) {
                const all = new Set<string>();
                for (let i = 0; i <= 7; i++) all.add(dayjs().add(i, 'day').format('YYYY-MM-DD'));
                setSelectedDates(all);
              } else { setSelectedDates(new Set()); }
            }}
            style={{ marginBottom: 6 }}
          ><span style={{ fontSize: 13, color: '#888' }}>近 8 天全选 / 取消全选</span></Checkbox>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const d = dayjs().add(i, 'day');
              const dateStr = d.format('YYYY-MM-DD');
              const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
              return (
                <Checkbox key={dateStr} checked={selectedDates.has(dateStr)}
                  onChange={(e) => {
                    const next = new Set(selectedDates);
                    if (e.target.checked) next.add(dateStr); else next.delete(dateStr);
                    setSelectedDates(next);
                  }}
                >{d.format('MM/DD')}({dayNames[d.day()]}){i === 0 ? ' 今天' : ''}</Checkbox>
              );
            })}
          </div>
          {(() => {
            const savedDates = Array.from(selectedDates).sort();
            return savedDates.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {savedDates.map(ds => (
                  <Tag key={ds} closable color="blue" onClose={() => {
                    setSelectedDates(prev => { const next = new Set(prev); next.delete(ds); return next; });
                  }}>{ds}</Tag>
                ))}
              </div>
            );
          })()}
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
          setFullAllocModalOpen(false); setIncludeSaturdays(false); setIncludeSundays(false); setSelectedDemandIds(new Set());
        }}
        okText="开始排班" cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 }}
        width={520}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>周末排班设置</div>
          <Space direction="vertical">
            <Checkbox checked={includeSaturdays} onChange={(e) => setIncludeSaturdays(e.target.checked)}>周六排班</Checkbox>
            <Checkbox checked={includeSundays} onChange={(e) => setIncludeSundays(e.target.checked)}>周日排班</Checkbox>
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
        destroyOnClose
      >
        {detailDemand && (
          <Descriptions column={2} bordered size="small" labelStyle={{ width: 100, whiteSpace: 'nowrap' }}>
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
            <Descriptions.Item label="优先级">
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
                  const demandTestTypes = new Set(detailDemand.manpowerDetails.map((md: any) => md.testType));
                  const demandSchedules = schedules.filter(s => s.demandId === detailDemand.id);
                  // 协调人力：按非需求测试类型分组
                  const coordMap = new Map<string, number>();
                  demandSchedules.forEach(s => {
                    const st = staffs.find(st => st.id === s.staffId);
                    if (st?.testType && !demandTestTypes.has(st.testType)) {
                      coordMap.set(st.testType, (coordMap.get(st.testType) || 0) + s.percentage / 100);
                    }
                  });
                  const coordRows = Array.from(coordMap.entries());
                  return (
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '52%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>测试类型</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>人力需求</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>需求缺口</th>
                          <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>协调人力</th>
                          <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>所需模块</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailDemand.manpowerDetails.map((md: any, idx: number) => {
                          const typeAllocated = demandSchedules
                            .filter(s => staffs.find(st => st.id === s.staffId)?.testType === md.testType)
                            .reduce((sum, s) => sum + s.percentage / 100, 0);
                          const gap = Number(md.manpowerDemand || 0) - typeAllocated;
                          const coordVal = coordMap.get(md.testType) || 0;
                          return (
                            <tr key={idx}>
                              <td style={{ padding: '2px 6px', color: '#1890ff' }}>{md.testType}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right' }}>{Number(md.manpowerDemand || 0).toFixed(1)}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right', color: gap > 0 ? '#faad14' : '#52c41a', fontWeight: 500 }}>{gap.toFixed(1)}</td>
                              <td style={{ padding: '2px 6px', textAlign: 'right' }}>{coordVal > 0 ? coordVal.toFixed(1) : '-'}</td>
                              <td style={{ padding: '2px 6px', color: '#888', wordBreak: 'break-word' }}>{md.remark || '-'}</td>
                            </tr>
                          );
                        })}
                        {coordRows.map(([testType, val], idx) => (
                          <tr key={`coord-${idx}`}>
                            <td style={{ padding: '2px 6px', color: '#ff4d4f', fontWeight: 500 }}>{testType}</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right' }}>-</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right' }}>-</td>
                            <td style={{ padding: '2px 6px', textAlign: 'right', color: '#ff4d4f', fontWeight: 500 }}>{val.toFixed(1)}</td>
                            <td style={{ padding: '2px 6px', color: '#888' }}>协调</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
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
