// ============================================================
// 人力排布工作台 — 计算工具函数
// 纯函数，无副作用，从 ScheduleWorkbench.tsx 提取
// ============================================================

import dayjs from 'dayjs';
import type { DemandItem, ScheduleItem, StaffItem, BatchMetrics, ConflictDetail, DailyStatusEntry, UnfulfilledDetail, HighRiskDemandDetail } from './workbenchTypes';

// ---- 常量 ----

export const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export const VERSION_TYPE_COLORS: Record<string, string> = {
  '维护': '#1890ff',
  '在研': '#52c41a',
  '升级': '#faad14',
};

export const PRIORITY_COLORS = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'magenta', 'geekblue'];

// ---- 日期工具 ----

export function getWeekDates(weekViewDate: dayjs.Dayjs): dayjs.Dayjs[] {
  return Array.from({ length: 7 }, (_, i) => weekViewDate.clone().add(i, 'day'));
}

export function getDemandDateRange(demandStart: dayjs.Dayjs, demandEnd: dayjs.Dayjs): dayjs.Dayjs[] {
  const dates: dayjs.Dayjs[] = [];
  let current = demandStart;
  while (current.isBefore(demandEnd, 'day') || current.isSame(demandEnd, 'day')) {
    dates.push(current);
    current = current.add(1, 'day');
  }
  return dates;
}

// ---- 颜色工具 ----

export function getVersionTypeColor(type: string): string {
  return VERSION_TYPE_COLORS[type] || '#1890ff';
}

export function getPriorityColor(priority: string, priorityOptions: string[]): string {
  const idx = priorityOptions.indexOf(priority);
  return idx >= 0 ? PRIORITY_COLORS[idx % PRIORITY_COLORS.length] : 'blue';
}

// ---- 排班查询 ----

export function getSchedulesForStaffAndDate(
  schedules: ScheduleItem[],
  staffId: number,
  date: string
): ScheduleItem[] {
  return schedules.filter(s => s.staffId === staffId && s.date === date);
}

export function getTotalPercentage(
  schedules: ScheduleItem[],
  staffId: number,
  date: string
): number {
  return getSchedulesForStaffAndDate(schedules, staffId, date)
    .reduce((sum, s) => sum + s.percentage, 0);
}

export function getDemandAllocatedDays(
  schedules: ScheduleItem[],
  demandId: number,
  staffIds: number[],
  publishedOnly = false
): number {
  const filtered = schedules.filter(s =>
    s.demandId === demandId &&
    staffIds.includes(s.staffId) &&
    (!publishedOnly || s.published)
  );
  return filtered.reduce((sum, s) => sum + s.percentage / 100, 0);
}

// ---- 每日可用状态 ----

export function getDailyStatus(
  dailyStatuses: Map<string, DailyStatusEntry>,
  staffId: number,
  date: string
): string | null {
  return dailyStatuses.get(`${staffId}-${date}`)?.status || null;
}

export function getDailyStatusPercentage(
  dailyStatuses: Map<string, DailyStatusEntry>,
  staffId: number,
  date: string
): number {
  return dailyStatuses.get(`${staffId}-${date}`)?.percentage ?? 100;
}

export function isAvailableForAssignment(
  dailyStatuses: Map<string, DailyStatusEntry>,
  staffId: number,
  date: string
): boolean {
  const status = getDailyStatus(dailyStatuses, staffId, date);
  if (status === null || status === 'AVAILABLE') return true;
  return getDailyStatusPercentage(dailyStatuses, staffId, date) < 100;
}

export function getMaxCapacity(
  staff: StaffItem,
  date: string,
  dailyStatuses: Map<string, DailyStatusEntry>
): number {
  const rawMax = (staff.currentCoefficient || 1) * 100;
  const status = getDailyStatus(dailyStatuses, staff.id, date);
  const statusPct = getDailyStatusPercentage(dailyStatuses, staff.id, date);
  const statusFactor = status && status !== 'AVAILABLE' ? (1 - statusPct / 100) : 1;
  return rawMax * statusFactor;
}

/**
 * 计算每天的空闲可用工作量
 * 空闲工作量 = Σ(每人空闲人天 × 系数)
 * 每人空闲人天 = (maxCapacity% - 已排百分比%) / 100
 */
export function calculateDailyFreeWorkload(
  staffs: StaffItem[],
  schedules: ScheduleItem[],
  date: string,
  dailyStatuses: Map<string, DailyStatusEntry>
): number {
  return staffs.reduce((total, staff) => {
    const maxCap = getMaxCapacity(staff, date, dailyStatuses);
    const used = getTotalPercentage(schedules, staff.id, date);
    const freePct = Math.max(0, maxCap - used);
    return total + (freePct / 100) * (staff.currentCoefficient || 1);
  }, 0);
}

// ---- 风险排序 ----

/**
 * 计算需求风险分数（越高越紧急）
 * 排序维度：endDate 距今天数 → 优先级 → 剩余人天 → 保密
 */
export function calculateRiskScore(
  demand: DemandItem,
  schedules: ScheduleItem[],
  staffIds: number[],
  priorityOptions: string[]
): number {
  let score = 0;

  // 截止日期距今天数（越小越紧急，取负值使越紧急分越高）
  const daysToEnd = dayjs(demand.endDate).diff(dayjs(), 'day');
  score += Math.max(0, 100 - daysToEnd * 5); // 已过期/临近得高分

  // 剩余人天（越多越需要关注）
  const allocated = getDemandAllocatedDays(schedules, demand.id, staffIds, true);
  const remaining = Number(demand.manpowerDemand || 0) - allocated;
  score += Math.min(remaining * 10, 50);

  // 优先级
  const priorityIdx = priorityOptions.indexOf(demand.priority || '');
  if (priorityIdx >= 0) {
    score += (priorityOptions.length - priorityIdx) * 10;
  }

  // 保密需求加分
  if (demand.confidential) {
    score += 20;
  }

  return score;
}

export function sortDemandsByRisk(
  demands: DemandItem[],
  schedules: ScheduleItem[],
  staffIds: number[],
  priorityOptions: string[]
): DemandItem[] {
  return [...demands].sort((a, b) => {
    const scoreA = calculateRiskScore(a, schedules, staffIds, priorityOptions);
    const scoreB = calculateRiskScore(b, schedules, staffIds, priorityOptions);
    return scoreB - scoreA;
  });
}

// ---- 需求筛选 ----

export function filterPendingDemands(
  demands: DemandItem[],
  schedules: ScheduleItem[],
  staffIds: number[],
  filterTestTypes: string[]
): DemandItem[] {
  return demands.filter(d => {
    // 需求没有任何排班记录（草稿或已发布）才算待排期
    const hasAnySchedule = schedules.some(s =>
      s.demandId === d.id && staffIds.includes(s.staffId)
    );
    const isUnscheduled = !hasAnySchedule;

    let matchesTestType = true;
    if (filterTestTypes.length > 0) {
      matchesTestType = (d.manpowerDetails || []).some((md) =>
        filterTestTypes.includes(md.testType)
      );
    }

    return isUnscheduled && matchesTestType;
  });
}

export function filterAssignedDemands(
  demands: DemandItem[],
  schedules: ScheduleItem[],
  staffIds: number[],
  filterTestTypes: string[]
): DemandItem[] {
  return demands.filter(d => {
    // 有任何排班记录（草稿或已发布）且需求未关闭，则属于已分配
    const hasAnySchedule = schedules.some(s =>
      s.demandId === d.id && staffIds.includes(s.staffId)
    );
    const isNotClosed = d.status !== 'completed';

    let matchesTestType = true;
    if (filterTestTypes.length > 0) {
      matchesTestType = (d.manpowerDetails || []).some((md) =>
        filterTestTypes.includes(md.testType)
      );
    }

    return hasAnySchedule && isNotClosed && matchesTestType;
  });
}

// ---- 冲突检测 ----

export function detectConflicts(
  schedules: ScheduleItem[],
  staffs: StaffItem[],
  dailyStatuses: Map<string, DailyStatusEntry>
): ConflictDetail[] {
  const staffDateMap = new Map<string, { staffId: number; date: string; total: number; name: string }>();

  schedules.forEach(schedule => {
    const key = `${schedule.staffId}-${schedule.date}`;
    const existing = staffDateMap.get(key);
    if (existing) {
      existing.total += schedule.percentage;
    } else {
      const staff = staffs.find(st => st.id === schedule.staffId);
      staffDateMap.set(key, {
        staffId: schedule.staffId,
        date: schedule.date,
        total: schedule.percentage,
        name: staff?.name || '未知',
      });
    }
  });

  const conflicts: ConflictDetail[] = [];
  staffDateMap.forEach(item => {
    const staff = staffs.find(st => st.id === item.staffId);
    const maxCapacity = getMaxCapacity(staff || { id: item.staffId, currentCoefficient: 1 } as StaffItem, item.date, dailyStatuses);
    if (item.total > maxCapacity) {
      conflicts.push({
        staffId: item.staffId,
        staffName: item.name,
        date: item.date,
        totalPercent: item.total,
        maxCapacityPercent: Math.floor(maxCapacity),
      });
    }
  });

  return conflicts;
}

// ---- 批次指标计算 ----

export function calculateBatchMetrics(
  demands: DemandItem[],
  schedules: ScheduleItem[],
  staffIds: number[],
  selectedDemandIds: Set<number>,
  priorityOptions: string[],
  unfulfilledDemands: Set<number>,
  conflictDetails: ConflictDetail[],
  unfulfilledDetails: UnfulfilledDetail[]
): BatchMetrics {
  const pendingDemands = filterPendingDemands(demands, schedules, staffIds, []);
  const sortedByRisk = sortDemandsByRisk(pendingDemands, schedules, staffIds, priorityOptions);

  // 高风险：风险分排序前 20%、已过期需求、排布超期需求（去重）
  const highRiskThreshold = Math.max(1, Math.ceil(sortedByRisk.length * 0.2));
  const highRiskSet = new Set<number>();
  sortedByRisk.slice(0, highRiskThreshold).forEach(d => highRiskSet.add(d.id));
  pendingDemands.filter(d => dayjs(d.endDate).isBefore(dayjs(), 'day')).forEach(d => highRiskSet.add(d.id));
  // 排布超期：已有排班但排班日期超出需求完成期限
  for (const demand of demands) {
    if (demand.status === 'completed' || highRiskSet.has(demand.id)) continue;
    const hasOverdueSchedule = schedules.some(s =>
      s.demandId === demand.id &&
      staffIds.includes(s.staffId) &&
      dayjs(s.date).isAfter(dayjs(demand.endDate), 'day')
    );
    if (hasOverdueSchedule) highRiskSet.add(demand.id);
  }
  const highRiskDemands = highRiskSet.size;

  // 草稿排班数量
  const draftCount = schedules.filter(s => !s.published).length;

  // 可发布需求：有草稿排班 + 无冲突 + 已满足（不依赖 selectedDemandIds，覆盖手动拖动场景）
  const publishableCount = demands.filter(d =>
    schedules.some(s => s.demandId === d.id && !s.published) &&
    !unfulfilledDemands.has(d.id) &&
    !conflictDetails.some(c =>
      schedules.some(s => s.demandId === d.id && s.staffId === c.staffId && s.date === c.date)
    )
  ).length;

  // 预计缺口人天
  const totalGap = unfulfilledDetails.reduce((sum, u) => sum + u.shortage, 0);

  return {
    totalPendingDemands: pendingDemands.length,
    highRiskDemands,
    selectedDemands: selectedDemandIds.size,
    estimatedGapDays: Math.round(totalGap * 10) / 10,
    draftScheduleCount: draftCount,
    publishableDemandCount: publishableCount,
    conflictCount: conflictDetails.length,
    unfulfilledCount: unfulfilledDetails.length,
  };
}

// ---- 高风险需求详情 ----

export function getHighRiskDemandDetails(
  demands: DemandItem[],
  schedules: ScheduleItem[],
  staffIds: number[],
  priorityOptions: string[]
): HighRiskDemandDetail[] {
  // 1. 待排期需求中按风险分排序取前 20%
  const pendingDemands = filterPendingDemands(demands, schedules, staffIds, []);
  const sortedByRisk = sortDemandsByRisk(pendingDemands, schedules, staffIds, priorityOptions);
  const highRiskThreshold = Math.max(1, Math.ceil(sortedByRisk.length * 0.2));
  const topRiskIds = new Set(sortedByRisk.slice(0, highRiskThreshold).map(d => d.id));

  // 2. 已过完成期限的待排期需求
  const overdueDemands = pendingDemands.filter(d => dayjs(d.endDate).isBefore(dayjs(), 'day'));

  const highRiskSet = new Set<number>();
  topRiskIds.forEach(id => highRiskSet.add(id));
  overdueDemands.forEach(d => highRiskSet.add(d.id));

  // 3. 排布超期：已有排班但排班日期超出需求完成期限（含已关闭之外的所有需求）
  for (const demand of demands) {
    if (demand.status === 'completed') continue;
    if (highRiskSet.has(demand.id)) continue; // 已命中跳过
    const hasOverdueSchedule = schedules.some(s =>
      s.demandId === demand.id &&
      staffIds.includes(s.staffId) &&
      dayjs(s.date).isAfter(dayjs(demand.endDate), 'day')
    );
    if (hasOverdueSchedule) {
      highRiskSet.add(demand.id);
    }
  }

  // 从全部需求中提取高风险项（不仅限于 pendingDemands）
  return demands
    .filter(d => highRiskSet.has(d.id) && d.status !== 'completed')
    .map(d => {
      const allocated = getDemandAllocatedDays(schedules, d.id, staffIds, true);
      const remaining = Math.max(0, Number(d.manpowerDemand || 0) - allocated);
      const daysToEnd = dayjs(d.endDate).diff(dayjs(), 'day');
      const score = calculateRiskScore(d, schedules, staffIds, priorityOptions);

      const factors: string[] = [];
      if (daysToEnd <= 0) factors.push('已过完成期限');
      else if (daysToEnd <= 3) factors.push(`距完成期限仅 ${daysToEnd} 天`);
      else if (daysToEnd <= 7) factors.push(`完成期限临近（${daysToEnd} 天）`);
      if (remaining > 0) factors.push(`剩余人力缺口 ${remaining.toFixed(1)} 人/天`);
      if (d.priority === '高') factors.push('高优先级需求');
      if (d.confidential) factors.push('保密项目');

      // 检测排班是否超出完成期限
      const overdueSchedules = schedules.filter(s =>
        s.demandId === d.id &&
        staffIds.includes(s.staffId) &&
        dayjs(s.date).isAfter(dayjs(d.endDate), 'day')
      );
      if (overdueSchedules.length > 0) {
        const maxOverdueDate = overdueSchedules.reduce((max, s) =>
          dayjs(s.date).isAfter(dayjs(max)) ? s.date : max, overdueSchedules[0].date
        );
        factors.push(`排班超出完成期限（最晚至 ${maxOverdueDate}）`);
      }

      return {
        demandId: d.id,
        product: d.product,
        versionType: d.versionType,
        startDate: d.startDate,
        endDate: d.endDate,
        manpowerDemand: Number(d.manpowerDemand || 0),
        allocatedDays: Math.round(allocated * 10) / 10,
        remainingDays: Math.round(remaining * 10) / 10,
        daysToEnd,
        priority: d.priority || '',
        confidential: d.confidential || false,
        riskScore: score,
        riskFactors: factors,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

// ---- 人员匹配分计算（Phase 1 仅占位，Phase 2 完善） ----

export function calculateStaffMatchScore(
  _staff: StaffItem,
  _selectedDemands: DemandItem[],
  _schedules: ScheduleItem[],
  _dailyStatuses: Map<string, DailyStatusEntry>
): number {
  // Phase 1: 简单的可用性检查，返回基础分
  // Phase 2: 完善匹配分计算（测试类型、熟悉模块、保密权限、可用容量等）
  if (_staff.status !== 'active') return 0;
  return 50; // 基础可用分
}

// ---- 草稿持久化 ----

const DRAFT_STORAGE_KEY = 'workbench_draft';

export function saveDraftToLocalStorage(draft: { selectedDemandIds: number[]; pendingChangeDemandIds: number[] }): void {
  try {
    const data = {
      ...draft,
      selectedDemandIds: Array.from(draft.selectedDemandIds),
      pendingChangeDemandIds: Array.from(draft.pendingChangeDemandIds),
      lastSavedAt: new Date().toISOString(),
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 不可用时静默失败
  }
}

export function loadDraftFromLocalStorage(): { selectedDemandIds: number[]; pendingChangeDemandIds: number[] } | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.lastSavedAt) return null;
    // 超过 24 小时的草稿自动丢弃
    const savedTime = new Date(data.lastSavedAt).getTime();
    if (Date.now() - savedTime > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return null;
    }
    return {
      selectedDemandIds: data.selectedDemandIds || [],
      pendingChangeDemandIds: data.pendingChangeDemandIds || [],
    };
  } catch {
    return null;
  }
}

export function clearDraftFromLocalStorage(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // silent
  }
}

export function hasDraftInLocalStorage(): boolean {
  return loadDraftFromLocalStorage() !== null;
}
