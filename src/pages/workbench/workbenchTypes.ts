// ============================================================
// 人力排布工作台 — 共享类型定义
// ============================================================

import type { DemandSpecialModule, FamiliarModule, ManpowerSummary } from '../../types';

// ---- 基础数据 ----

export interface ScheduleItem {
  id: number;
  staffId: number;
  date: string;
  percentage: number;
  product: string;
  versionType: string;
  version?: string;
  demandId?: number;
  demandManpowerDetailId?: number | null;
  demandSpecialModuleId?: number | null;
  testManager?: string;
  published?: boolean;
}

export interface ManpowerDetail {
  testType: string;
  manpowerDemand: number;
  remark?: string;
}

export interface DemandItem {
  id: number;
  product: string;
  version?: string;
  startDate: string;
  endDate: string;
  manpowerDemand: number;
  versionType: string;
  versionPhase?: string;
  description?: string;
  status: string;
  submittedBy?: string;
  confidential?: boolean;
  priority?: string;
  testDeviceCount?: number;
  manpowerDetails?: ManpowerDetail[];
  specialModuleDemands?: DemandSpecialModule[];
  manpowerSummary?: ManpowerSummary[];
  manpowerFullySatisfied?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface StaffItem {
  id: number;
  name: string;
  empNo: string;
  joinDate?: string;
  groupName?: string;
  testType?: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: string;
  role?: string;
  roles?: string[];
  familiarModules?: FamiliarModule[] | string;
  confidentialClearance?: boolean;
}

export function formatFamiliarModules(familiarModules?: FamiliarModule[] | string): string {
  if (Array.isArray(familiarModules)) {
    return familiarModules.map(module => module.moduleName).join(', ') || '-';
  }
  return familiarModules || '-';
}

export interface DailyStatusEntry {
  status: string;
  percentage: number;
}

// ---- 缺口与冲突 ----

export interface UnfulfilledDetail {
  product: string;
  shortage: number;
  details: Array<{ testType: string; shortage: number }>;
  reasons: string[];
  overdueDays?: number;       // 超出 endDate 的天数
  overdueDates?: string[];    // 超出 endDate 的具体日期列表
}

export interface ConflictDetail {
  staffId: number;
  staffName: string;
  date: string;
  totalPercent: number;
  maxCapacityPercent: number;
}

// ---- 批次指标（顶部总览条） ----

export interface HighRiskDemandDetail {
  demandId: number;
  product: string;
  versionType: string;
  startDate: string;
  endDate: string;
  manpowerDemand: number;
  allocatedDays: number;
  remainingDays: number;
  daysToEnd: number;
  priority: string;
  confidential: boolean;
  riskScore: number;
  riskFactors: string[];
}

export interface BatchMetrics {
  totalPendingDemands: number;
  highRiskDemands: number;
  selectedDemands: number;
  estimatedGapDays: number;
  draftScheduleCount: number;
  publishableDemandCount: number;
  conflictCount: number;
  unfulfilledCount: number;
}

// ---- 草稿持久化 ----

export interface WorkbenchDraft {
  selectedDemandIds: number[];
  pendingChangeDemandIds: number[];
  lastSavedAt: string;
}

// ---- UI 状态枚举 ----

/** 需求在排布工作台中的 UI 状态 */
export type DemandUIStatus =
  | 'unselected'      // 在队列中，未参与当前批次
  | 'batch_selected'  // 已勾选，参与当前批次
  | 'gap_estimated'   // 预估有缺口（第一步）
  | 'draft_generated' // 已生成草稿（第二步）
  | 'draft_conflict'  // 草稿有冲突
  | 'publishable'     // 可发布
  | 'published';      // 已发布

/** 排班卡片在时间轴中的显示状态 */
export type ScheduleCardStatus =
  | 'published'       // 已发布，默认锁定
  | 'draft'           // 草稿，可拖拽/编辑/删除
  | 'pending_change'  // 已发布排班被本地修改后的待提交状态
  | 'conflict';       // 冲突状态

/** 人员在匹配池中的状态 */
export type StaffMatchStatus =
  | 'recommended'      // 推荐（匹配分 ≥ 60）
  | 'available'        // 可用（40 ≤ 匹配分 < 60）
  | 'low_availability' // 低可用（匹配分 < 40，默认隐藏）
  | 'conflict'         // 当前周期超容量
  | 'unavailable';     // 权限/测试类型/状态不满足

// ---- 匹配分 ----

export interface StaffMatchResult {
  staff: StaffItem;
  matchScore: number;
  testTypeScore: number;
  moduleScore: number;
  capacityScore: number;
  clearanceScore: number;
  conflictPenalty: number;
  newStaffPenalty: number;
  status: StaffMatchStatus;
  dailyAvailability: Map<string, number>; // date → available percent
}
