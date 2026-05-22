import React, { useState, useEffect, useMemo } from 'react';
import { Card, Button, Tag, Space, Alert, Modal, message, InputNumber, Descriptions, Divider, Popconfirm, DatePicker, Popover, Select, Checkbox, Tooltip, Tabs, Collapse } from 'antd';
import {
  RobotOutlined,
  CalendarOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../services/api';
import { useUserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';
import { DailyAvailabilityStatus, DailyStatusLabels, DailyStatusColors } from '../types';

const { confirm } = Modal;

interface ScheduleItem {
  id: number;
  staffId: number;
  date: string;
  percentage: number;
  product: string;
  versionType: string;
  version?: string;
  demandId?: number;
  testManager?: string;
  published?: boolean;
}

const ScheduleWorkbench: React.FC = () => {
  const [demands, setDemands] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [staffs, setStaffs] = useState<any[]>([]);
  const [selectedDemand, setSelectedDemand] = useState<any>(null);
  const [hasConflicts, setHasConflicts] = useState(false);
  const [conflictDetails, setConflictDetails] = useState<string[]>([]);
  const [weekViewDate, setWeekViewDate] = useState<dayjs.Dayjs>(dayjs());

  // 分配弹窗相关状态
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ staff: any; date: string } | null>(null);
  const [assignPercentage, setAssignPercentage] = useState(100);
  const [assignDays, setAssignDays] = useState(1);
  const [assignLoading, setAssignLoading] = useState(false);

  // 编辑弹窗相关状态
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [editPercentage, setEditPercentage] = useState(100);
  const [editLoading, setEditLoading] = useState(false);

  // 调度卡片拖拽转移状态
  const [draggedSchedule, setDraggedSchedule] = useState<ScheduleItem | null>(null);

  // 拖拽悬停目标（用于显示动画）
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [dragOverTrash, setDragOverTrash] = useState(false);

  // 已发布排班的本地待提交变更（拖拽转移、删除、清除），点击发布时统一提交
  const [pendingChangeDemandIds, setPendingChangeDemandIds] = useState<Set<number>>(new Set());

  // 每日可用状态
  const [dailyStatuses, setDailyStatuses] = useState<Map<string, { status: string; percentage: number }>>(new Map());
  const [statusPopoverOpen, setStatusPopoverOpen] = useState<string | null>(null);
  const [statusPctDraft, setStatusPctDraft] = useState(100);
  const [statusDraft, setStatusDraft] = useState<DailyAvailabilityStatus>('AVAILABLE');
  const [filterTestTypes, setFilterTestTypes] = useState<string[]>([]);
  const [filterDemandTestTypes, setFilterDemandTestTypes] = useState<string[]>([]);
  const [filterCoeffMin, setFilterCoeffMin] = useState<number | null>(null);
  const [filterCoeffMax, setFilterCoeffMax] = useState<number | null>(null);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailDemand, setDetailDemand] = useState<any>(null);

  // 推荐排班状态
  const [dateRecModalOpen, setDateRecModalOpen] = useState(false);       // "按指定日期排班"弹框
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set()); // 勾选的日期 (YYYY-MM-DD)
  const [fullAllocModalOpen, setFullAllocModalOpen] = useState(false);   // "按全部需求排班"弹框
  const [includeSaturdays, setIncludeSaturdays] = useState(false);       // 周六排班
  const [includeSundays, setIncludeSundays] = useState(false);           // 周日排班
  const [selectedDemandIds, setSelectedDemandIds] = useState<Set<number>>(new Set());
  const [unfulfilledDemands, setUnfulfilledDemands] = useState<Set<number>>(new Set());
  const [unfulfilledDetails, setUnfulfilledDetails] = useState<Array<{ product: string; shortage: number; details: Array<{ testType: string; shortage: number }>; reasons: string[] }>>([]);
  const [editingPriorityId, setEditingPriorityId] = useState<number | null>(null);
  const [priorityOptions, setPriorityOptions] = useState<string[]>([]);

  const { hasPermission, hasRole } = useUserRole();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
    fetchPriorityOptions();
    // 锁定 body 和父级 Content 滚动，Content 设为 flex 列布局
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

  const fetchPriorityOptions = async () => {
    try {
      const configs = await api.getFieldConfigs();
      const priorityConfig = configs.find((c: any) => c.fieldName === 'priority');
      if (priorityConfig && priorityConfig.options) {
        setPriorityOptions(priorityConfig.options.split(',').filter((o: string) => o.trim()));
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchData = async () => {
    try {
      const [demandsData, schedulesData, staffData] = await Promise.all([
        api.getPendingDemands(),
        api.getSchedules(),
        api.getStaff()
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
      })));
      setStaffs(staffData);

      // 加载每日可用状态
      try {
        const startStr = weekDates[0].format('YYYY-MM-DD');
        const endStr = weekDates[weekDates.length - 1].format('YYYY-MM-DD');
        const statuses = await api.getDailyStatuses(startStr, endStr);
        const map = new Map<string, { status: string; percentage: number }>();
        statuses.forEach((s: any) => map.set(`${s.staffId}-${s.date}`, { status: s.status, percentage: s.percentage ?? 100 }));
        setDailyStatuses(map);
      } catch {
        // 非关键，网格仍可正常工作
      }
    } catch (error: any) {
      message.error(error.message || '获取数据失败');
    }
  };

  const dayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekDates = Array.from({ length: 7 }, (_, i) =>
    weekViewDate.add(i, 'day')
  );
  const weekDays = weekDates.map(d => dayLabels[d.day()]);

  const getVersionTypeColor = (type: string) => {
    const colorMap: Record<string, string> = {
      '维护': '#1890ff',
      '在研': '#52c41a',
      '升级': '#faad14',
    };
    return colorMap[type] || '#1890ff';
  };

  const getSchedulesForStaffAndDate = (staffId: number, date: string) => {
    return schedules.filter(s => s.staffId === staffId && s.date === date);
  };

  const getTotalPercentage = (staffId: number, date: string) => {
    return getSchedulesForStaffAndDate(staffId, date).reduce((sum: number, s: any) => sum + s.percentage, 0);
  };

  // 计算每个需求按测试类型的分配情况
  const getDailyStatus = (staffId: number, date: string): DailyAvailabilityStatus | null => {
    return dailyStatuses.get(`${staffId}-${date}`)?.status as DailyAvailabilityStatus || null;
  };

  const getDailyStatusPercentage = (staffId: number, date: string): number => {
    return dailyStatuses.get(`${staffId}-${date}`)?.percentage ?? 100;
  };

  const isAvailableForAssignment = (staffId: number, date: string): boolean => {
    const status = getDailyStatus(staffId, date);
    if (status === null || status === 'AVAILABLE') return true;
    return getDailyStatusPercentage(staffId, date) < 100;
  };

  const handleStatusChange = async (staff: any, date: string, newStatus: string, percentage?: number) => {
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

  // 按指定日期排班 - 打开弹框
  const handleDateRecommend = () => {
    const eligibleIds = demands
      .filter(d => {
        const demandSchedules = schedules.filter(s => s.demandId === d.id);
        const published = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
        return !published && (d.status === 'pending' || d.status === 'scheduled');
      })
      .map(d => d.id);
    setSelectedDemandIds(new Set(eligibleIds));
    setSelectedDates(new Set());
    setDateRecModalOpen(true);
  };

  // 按全部需求排班 - 打开弹框
  const handleFullAllocateRecommend = () => {
    const eligibleIds = demands
      .filter(d => {
        const demandSchedules = schedules.filter(s => s.demandId === d.id);
        const published = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
        return !published && (d.status === 'pending' || d.status === 'scheduled');
      })
      .map(d => d.id);
    setSelectedDemandIds(new Set(eligibleIds));
    setIncludeSaturdays(false);
    setIncludeSundays(false);
    setFullAllocModalOpen(true);
  };

  // 优先级排序：endDate距今日越近越优先（已过期最高），同日期按priorityOptions索引排序
  const getSortedDemands = (demandList: any[]) => {
    const today = dayjs();
    return [...demandList].sort((a, b) => {
      const aDiff = dayjs(a.endDate).diff(today, 'day');
      const bDiff = dayjs(b.endDate).diff(today, 'day');

      // 已过期（diff < 0）排在最前面
      if (aDiff < 0 && bDiff >= 0) return -1;
      if (bDiff < 0 && aDiff >= 0) return 1;

      // 同为已过期：最近过期优先（diff 大的更接近今天）
      if (aDiff < 0 && bDiff < 0) {
        if (aDiff !== bDiff) return bDiff - aDiff;
      }
      // 同为未过期：最近截止优先（diff 小的更紧急）
      if (aDiff >= 0 && bDiff >= 0) {
        if (aDiff !== bDiff) return aDiff - bDiff;
      }

      // 次排序：按 priorityOptions 索引（越小优先级越高）
      const idxA = priorityOptions.indexOf(a.priority);
      const idxB = priorityOptions.indexOf(b.priority);
      const pa = idxA >= 0 ? idxA : 999;
      const pb = idxB >= 0 ? idxB : 999;
      return pa - pb;
    });
  };

  // 获取需求完整周期的所有日期（推荐排班使用，不受视图限制）
  const getDemandDates = (demandStart: dayjs.Dayjs, demandEnd: dayjs.Dayjs): dayjs.Dayjs[] => {
    const dates: dayjs.Dayjs[] = [];
    let current = demandStart;
    while (current.isBefore(demandEnd) || current.isSame(demandEnd, 'day')) {
      dates.push(current);
      current = current.add(1, 'day');
    }
    return dates;
  };

  // 获取当天可用人员，按剩余容量降序排列；保密项目优先推荐有保密权限的员工
  const getAvailableStaffForDate = (dateStr: string, loadMap: Map<string, number>, activeStaffs: any[], isConfidential = false) => {
    return activeStaffs
      .filter(s => isAvailableForAssignment(s.id, dateStr))
      .map(s => {
        const key = `${s.id}-${dateStr}`;
        const used = loadMap.get(key) || 0;
        const maxCap = Math.floor((s.currentCoefficient || 1) * 100);
        // 非空闲状态按百分比扣减可用人力
        const status = getDailyStatus(s.id, dateStr);
        const statusPct = getDailyStatusPercentage(s.id, dateStr);
        const availableCap = status && status !== 'AVAILABLE' ? maxCap * (1 - statusPct / 100) : maxCap;
        const capacity = Math.floor(availableCap) - used;
        return { ...s, capacity };
      })
      .filter(s => s.capacity >= 10)
      .sort((a, b) => {
        // 保密项目：有保密权限的员工优先
        if (isConfidential) {
          if (a.confidentialClearance && !b.confidentialClearance) return -1;
          if (!a.confidentialClearance && b.confidentialClearance) return 1;
        }
        return b.capacity - a.capacity;
      });
  };

  // 共享贪婪分配核心：按日期、需求、人员三层循环分配
  const runAllocationCore = (
    sortedDemands: any[],
    dateStrings: string[],
    activeStaffs: any[],
    existingSchedules: any[]
  ) => {
    const newSchedules: any[] = [];
    const loadMap = new Map<string, number>();
    const unfulfilledSet = new Set<number>();

    // ---- 原因追踪数据结构 ----
    const hasDateOverlap = new Map<number, boolean>();       // 需求周期与排班日期有交集
    const hasMatchingStaff = new Map<number, Set<string>>(); // 有匹配员工的测试类型
    const dateCoverageMap = new Map<number, Set<string>>();  // 实际被排班覆盖的日期
    const deviceBlockedCount = new Map<number, number>();    // 样机限制跳过次数
    const capacityBlockedCount = new Map<number, number>();  // 容量不足跳过次数

    // 预填充已有排班负载
    existingSchedules.forEach(s => {
      const key = `${s.staffId}-${s.date}`;
      loadMap.set(key, (loadMap.get(key) || 0) + s.percentage);
    });

    // 构建按测试类型的剩余需求映射
    const remainingByType = new Map<string, number>();
    for (const demand of sortedDemands) {
      if (demand.manpowerDetails && demand.manpowerDetails.length > 0) {
        demand.manpowerDetails.forEach((d: any) => {
          remainingByType.set(`${demand.id}-${d.testType}`, Number(d.manpowerDemand));
        });
      } else {
        remainingByType.set(`${demand.id}-__ALL__`, Number(demand.manpowerDemand));
      }
      hasDateOverlap.set(demand.id, false);
      hasMatchingStaff.set(demand.id, new Set());
      dateCoverageMap.set(demand.id, new Set());
      deviceBlockedCount.set(demand.id, 0);
      capacityBlockedCount.set(demand.id, 0);
    }

    // 收集每个需求需要的测试类型
    const demandNeededTypes = new Map<number, string[]>();
    for (const demand of sortedDemands) {
      demandNeededTypes.set(demand.id, (demand.manpowerDetails || []).length > 0
        ? demand.manpowerDetails.map((d: any) => d.testType)
        : ['__ALL__']);
    }

    // 跟踪每个需求每天已分配的人员（样机数量约束）
    const deviceStaffMap = new Map<string, Set<number>>();

    const completedDemands = new Set<number>();
    for (const dateStr of dateStrings) {
      const date = dayjs(dateStr);

      for (const demand of sortedDemands) {
        if (completedDemands.has(demand.id)) continue;

        const demandStart = dayjs(demand.startDate);
        const demandEnd = dayjs(demand.endDate);
        if (date.isBefore(demandStart) || date.isAfter(demandEnd)) continue;

        // 记录日期与需求周期有交集
        hasDateOverlap.set(demand.id, true);

        const neededTypes = demandNeededTypes.get(demand.id) || [];
        const allAvailable = getAvailableStaffForDate(dateStr, loadMap, activeStaffs, demand.confidential);
        const deviceCount = demand.testDeviceCount;

        for (const staff of allAvailable) {
          if (staff.capacity < 5) {
            capacityBlockedCount.set(demand.id, (capacityBlockedCount.get(demand.id) || 0) + 1);
            continue;
          }

          if (deviceCount && deviceCount > 0) {
            const dcKey = `${demand.id}-${dateStr}`;
            const assignedSet = deviceStaffMap.get(dcKey);
            const alreadyAssigned = assignedSet ? assignedSet.size : 0;
            if (!assignedSet?.has(staff.id) && alreadyAssigned >= deviceCount) {
              deviceBlockedCount.set(demand.id, (deviceBlockedCount.get(demand.id) || 0) + 1);
              continue;
            }
          }

          const staffTestType = staff.testType;
          const matched = neededTypes.find((tt: string) => {
            if (tt === '__ALL__') return true;
            return tt === staffTestType;
          });
          if (!matched) continue;

          // 记录该测试类型有匹配员工
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

          // 记录该日期被排班覆盖
          dateCoverageMap.get(demand.id)!.add(dateStr);

          const dcKey = `${demand.id}-${dateStr}`;
          if (!deviceStaffMap.has(dcKey)) {
            deviceStaffMap.set(dcKey, new Set());
          }
          deviceStaffMap.get(dcKey)!.add(staff.id);
        }

        const allDone = neededTypes.every((tt: string) => (remainingByType.get(`${demand.id}-${tt}`) || 0) <= 0.001);
        if (allDone) {
          completedDemands.add(demand.id);
        }
      }

      if (completedDemands.size === sortedDemands.length) break;
    }

    // ---- 生成未满足详情（含原因） ----
    const unfulfilledDetailsList: Array<{
      product: string;
      shortage: number;
      details: Array<{ testType: string; shortage: number }>;
      reasons: string[];
    }> = [];

    for (const demand of sortedDemands) {
      const neededTypes = demandNeededTypes.get(demand.id) || [];
      const totalRemaining = neededTypes.reduce((sum: number, tt: string) =>
        sum + Math.max(0, remainingByType.get(`${demand.id}-${tt}`) || 0), 0
      );
      if (totalRemaining <= 0.001) continue;

      unfulfilledSet.add(demand.id);
      const reasons: string[] = [];
      const perTypeDetails: Array<{ testType: string; shortage: number }> = [];

      // 1. 日期交集检查
      if (!hasDateOverlap.get(demand.id)) {
        reasons.push(`需求周期（${dayjs(demand.startDate).format('MM/DD')}~${dayjs(demand.endDate).format('MM/DD')}）与排班日期无交集`);
      } else {
        // 2. 按测试类型分析
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

        // 3. 容量不足
        const capBlocked = capacityBlockedCount.get(demand.id) || 0;
        if (capBlocked > 0) {
          reasons.push(`员工日容量不足（${capBlocked} 次因容量<5%被跳过）`);
        }

        // 4. 样机限制
        const devBlocked = deviceBlockedCount.get(demand.id) || 0;
        if (devBlocked > 0) {
          reasons.push(`样机数量限制（${devBlocked} 次因达到设备上限被跳过）`);
        }

        // 5. 日期覆盖不全
        const demandTotalDays = dayjs(demand.endDate).diff(dayjs(demand.startDate), 'day') + 1;
        const coveredDays = dateCoverageMap.get(demand.id)?.size || 0;
        const allocDatesInWindow = dateStrings.filter(ds => {
          const d = dayjs(ds);
          return !d.isBefore(dayjs(demand.startDate)) && !d.isAfter(dayjs(demand.endDate));
        }).length;
        if (coveredDays < demandTotalDays) {
          reasons.push(`排班日期仅覆盖 ${coveredDays}/${demandTotalDays} 天（窗口内 ${allocDatesInWindow} 天可供排班）`);
        }

        // 无明确原因时的兜底
        if (reasons.length === 0) {
          reasons.push('人力需求超出可用资源总量');
        }
      }

      unfulfilledDetailsList.push({
        product: demand.product,
        shortage: Math.round(totalRemaining * 10) / 10,
        details: perTypeDetails,
        reasons,
      });
    }

    return { newSchedules, unfulfilledSet, unfulfilledDetailsList };
  };

  // 共享持久化逻辑：仅删除未发布旧排班，保留已发布排班，新排班为草稿
  const persistRecommendation = async (
    newSchedules: any[],
    activeStaffs: any[]
  ) => {
    // 已发布排班保留不变（选中需求中的已发布 + 非选中需求的全部）
    const publishedForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && s.published
    );
    const otherDemandSchedules = schedules.filter(s =>
      !selectedDemandIds.has(s.demandId || 0)
    );
    const preservedSchedules = [...publishedForSelected, ...otherDemandSchedules];

    // 仅删除选中需求中未发布的旧排班
    const unpublishdForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && !s.published
    );
    for (const s of unpublishdForSelected) {
      await api.deleteSchedule(s.id);
    }

    // 批量创建新排班（草稿状态）
    const savedSchedules = newSchedules.length > 0
      ? await api.createSchedulesBatch(newSchedules)
      : [];
    setSchedules([...preservedSchedules, ...savedSchedules.map((s: any) => ({
      id: s.id,
      staffId: s.staffId,
      demandId: s.demandId,
      date: s.date,
      percentage: s.percentage,
      product: s.product,
      testManager: s.testManager,
      versionType: s.versionType,
      version: s.version,
      published: s.published,
    }))]);

    // 冲突检测
    const conflicts: string[] = [];
    const staffDateMap = new Map<string, { staffId: number; date: string; total: number; name: string }>();
    newSchedules.forEach((schedule: any) => {
      const key = `${schedule.staffId}-${schedule.date}`;
      const existing = staffDateMap.get(key);
      if (existing) {
        existing.total += schedule.percentage;
      } else {
        const staff = activeStaffs.find(st => st.id === schedule.staffId);
        staffDateMap.set(key, {
          staffId: schedule.staffId,
          date: schedule.date,
          total: schedule.percentage,
          name: staff?.name || '未知',
        });
      }
    });
    staffDateMap.forEach(item => {
      const maxCapacity = (activeStaffs.find(st => st.id === item.staffId)?.currentCoefficient || 1) * 100;
      if (item.total > maxCapacity) {
        conflicts.push(`${item.name} ${item.date} 分配 ${item.total}%（超过系数 ${maxCapacity}%）`);
      }
    });
    setConflictDetails(conflicts);
    setHasConflicts(conflicts.length > 0);
  };

  // 按指定日期排班
  const runDateRecommendation = async () => {
    setDateRecModalOpen(false);
    const loadingMsg = message.loading({ content: '正在生成推荐方案...', key: 'date-rec', duration: 0 });

    const pendingDemands = demands.filter(d => selectedDemandIds.has(d.id));
    if (pendingDemands.length === 0) {
      loadingMsg();
      message.warning('没有待排期的需求');
      return;
    }

    const activeStaffs = staffs.filter(s => s.status === 'active');
    if (activeStaffs.length === 0) {
      loadingMsg();
      message.warning('没有可用的测试人员');
      return;
    }

    const sortedDemands = getSortedDemands(pendingDemands);
    const dateStrings = Array.from(selectedDates).sort();

    // existingSchedules for load map: 保留已发布排班（含选中需求的已发布） + 非选中需求的全部排班
    const publishedForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && s.published
    );
    const otherDemandSchedules = schedules.filter(s =>
      !selectedDemandIds.has(s.demandId || 0)
    );
    const existingForLoad = [...publishedForSelected, ...otherDemandSchedules];

    const { newSchedules, unfulfilledSet, unfulfilledDetailsList } = runAllocationCore(
      sortedDemands, dateStrings, activeStaffs, existingForLoad
    );

    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

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

  // 按全部需求排班
  const runFullAllocateRecommendation = async () => {
    setFullAllocModalOpen(false);
    const loadingMsg = message.loading({ content: '正在生成推荐方案...', key: 'full-alloc', duration: 0 });

    const pendingDemands = demands.filter(d => selectedDemandIds.has(d.id));
    if (pendingDemands.length === 0) {
      loadingMsg();
      message.warning('没有待排期的需求');
      return;
    }

    const activeStaffs = staffs.filter(s => s.status === 'active');
    if (activeStaffs.length === 0) {
      loadingMsg();
      message.warning('没有可用的测试人员');
      return;
    }

    const sortedDemands = getSortedDemands(pendingDemands);

    // 日期范围：从最早需求起始日到 today+90，覆盖所有选中需求的周期
    const today = dayjs();
    let globalStart = today;
    for (const d of sortedDemands) {
      const dStart = dayjs(d.startDate);
      if (dStart.isBefore(globalStart)) globalStart = dStart;
    }
    const globalEnd = today.add(90, 'day');
    const allDates = getDemandDates(globalStart, globalEnd);
    const filteredDates = allDates.filter(d => {
      const dow = d.day(); // 0=周日, 6=周六
      if (dow === 6 && !includeSaturdays) return false;
      if (dow === 0 && !includeSundays) return false;
      return true;
    });
    const dateStrings = filteredDates.map(d => d.format('YYYY-MM-DD')).sort();

    const publishedForSelected = schedules.filter(s =>
      selectedDemandIds.has(s.demandId || 0) && s.published
    );
    const otherDemandSchedules = schedules.filter(s =>
      !selectedDemandIds.has(s.demandId || 0)
    );
    const existingForLoad = [...publishedForSelected, ...otherDemandSchedules];

    const { newSchedules, unfulfilledSet, unfulfilledDetailsList } = runAllocationCore(
      sortedDemands, dateStrings, activeStaffs, existingForLoad
    );

    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledDetailsList);

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

  const handleConflictCheck = () => {
    const conflicts: string[] = [];

    // 按人员和日期分组，计算每天的总投入百分比
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

    // 检测超过人员系数的冲突
    staffDateMap.forEach(item => {
      const maxCapacity = (staffs.find(st => st.id === item.staffId)?.currentCoefficient || 1) * 100;
      if (item.total > maxCapacity) {
        conflicts.push(`${item.name} ${item.date} 分配 ${item.total}%（超过系数 ${maxCapacity}%）`);
      }
    });

    if (conflicts.length === 0) {
      message.success('排班无冲突！');
    } else {
      setHasConflicts(true);
      setConflictDetails(conflicts);
      message.warning(`检测到 ${conflicts.length} 个排班冲突！`);
    }
  };

  const handleClearAllUnpublished = () => {
    const unpublishdSchedules = schedules.filter(s => !s.published);
    if (unpublishdSchedules.length === 0) {
      message.info('没有未发布的排班');
      return;
    }
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
          setHasConflicts(false);
          setConflictDetails([]);
          message.success(`已清除 ${unpublishdSchedules.length} 条未发布排班`);
        } catch (err: any) {
          message.error(err.message || '清除失败');
        }
      },
    });
  };

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
          const batchData = currentSchedules.map(s => ({
            staffId: s.staffId,
            demandId: s.demandId,
            date: s.date,
            percentage: s.percentage,
            product: s.product,
            testManager: s.testManager || '测试经理',
            versionType: s.versionType,
          }));
          await api.createSchedulesBatch(batchData);
        }
      }
      await api.publishSchedules(demandId);
      setPendingChangeDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
      message.success('排期已发布');
      fetchData();
    } catch (err: any) {
      message.error(err.message || '发布失败');
    }
  };

  const handleClearDemand = (demandId: number) => {
    const demandSchedules = schedules.filter(s => s.demandId === demandId);
    const hasPendingChanges = pendingChangeDemandIds.has(demandId);
    if (demandSchedules.length === 0 && !hasPendingChanges) {
      message.info('该需求暂无排班数据');
      return;
    }
    confirm({
      title: '确认清除',
      content: `确定要清除该需求的所有排班数据吗？（${demandSchedules.length} 条记录）`,
      okText: '确定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.deleteSchedulesByDemand(demandId);
          setPendingChangeDemandIds(prev => { const next = new Set(prev); next.delete(demandId); return next; });
          message.success('排班已清除');
          fetchData();
        } catch (err: any) {
          message.error(err.message || '清除失败');
        }
      },
    });
  };

  const handleDragStart = (e: React.DragEvent, demand: any) => {
    setSelectedDemand(demand);
    e.dataTransfer.effectAllowed = 'copy';

    // 创建紧凑拖拽预览：只显示产品名、待分配总量、保密标识
    const demandSchedules = schedules.filter(s => s.demandId === demand.id);
    const allocatedDays = demandSchedules.reduce((sum: number, s) => sum + s.percentage / 100, 0);
    const remaining = Math.max(0, demand.manpowerDemand - allocatedDays);

    const dragPreview = document.createElement('div');
    dragPreview.style.cssText = `
      padding: 8px 14px;
      background: #fff;
      border: 2px solid ${demand.confidential ? '#ff4d4f' : '#1890ff'};
      border-radius: 8px;
      font-size: 13px;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      position: absolute;
      top: -1000px;
      left: -1000px;
    `;
    dragPreview.innerHTML = `
      <strong>${demand.product}</strong>
      <span style="color:#1890ff;font-weight:500">${remaining.toFixed(1)}人/天</span>
      ${demand.confidential ? '<span style="color:#ff4d4f;font-size:11px;border:1px solid #ff4d4f;border-radius:3px;padding:0 4px">保密</span>' : ''}
    `;
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(dragPreview, 0, 0);
    setTimeout(() => document.body.removeChild(dragPreview), 0);
  };

  // 调度卡片拖拽：开始
  const handleScheduleDragStart = (e: React.DragEvent, schedule: ScheduleItem) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSchedule(schedule);
    setSelectedDemand(null);
  };

  // 调度卡片拖拽：结束
  const handleScheduleDragEnd = () => {
    setDraggedSchedule(null);
    setDragOverCell(null);
    setDragOverTrash(false);
  };

  // 调度卡片拖拽：转移到其他测试员
  const handleScheduleTransfer = async (schedule: ScheduleItem, targetStaff: any, targetDate: string) => {
    if (schedule.staffId === targetStaff.id && schedule.date === targetDate) {
      setDraggedSchedule(null);
      return;
    }

    // 检查目标日可用状态
    if (!isAvailableForAssignment(targetStaff.id, targetDate)) {
      const statusLabel = DailyStatusLabels[getDailyStatus(targetStaff.id, targetDate) as DailyAvailabilityStatus];
      message.warning(`${targetStaff.name}今日「${statusLabel}」，不参与测试`);
      setDraggedSchedule(null);
      return;
    }

    // 按目标员工系数及当日状态限制投入比例
    const coeff = targetStaff.currentCoefficient || 1;
    const statusPct = getDailyStatusPercentage(targetStaff.id, targetDate);
    const status = getDailyStatus(targetStaff.id, targetDate);
    const statusFactor = status && status !== 'AVAILABLE' ? (1 - statusPct / 100) : 1;
    const maxPercentage = Math.round(coeff * 100 * statusFactor);
    const transferPercentage = Math.min(schedule.percentage, maxPercentage);

    if (schedule.published) {
      // 已发布排班：仅更新本地状态，点击发布时统一提交到后端
      const tempId = -(Date.now() + Math.random());
      const newSchedule: ScheduleItem = {
        id: tempId,
        staffId: targetStaff.id,
        demandId: schedule.demandId,
        date: targetDate,
        percentage: transferPercentage,
        product: schedule.product,
        testManager: schedule.testManager || '测试经理',
        versionType: schedule.versionType,
        version: schedule.version,
        published: false,
      };
      setSchedules(prev => [
        ...prev.filter(s => s.id !== schedule.id),
        newSchedule,
      ]);
      setPendingChangeDemandIds(prev => new Set(prev).add(schedule.demandId!));
      if (transferPercentage < schedule.percentage) {
        message.success(`已转移至 ${targetStaff.name}（草稿），比例调整为 ${transferPercentage}%，请点击发布生效`);
      } else {
        message.success(`已转移至 ${targetStaff.name}（草稿），请点击发布生效`);
      }
      setDraggedSchedule(null);
      return;
    }

    try {
      // 未发布排班：直接调API
      await api.deleteSchedule(schedule.id);
      const newScheduleData = {
        staffId: targetStaff.id,
        demandId: schedule.demandId,
        date: targetDate,
        percentage: transferPercentage,
        product: schedule.product,
        testManager: schedule.testManager || '测试经理',
        versionType: schedule.versionType,
        version: schedule.version,
      };
      const created = await api.createSchedule(newScheduleData);

      setSchedules(prev => [
        ...prev.filter(s => s.id !== schedule.id),
        {
          id: created.id,
          staffId: created.staffId,
          demandId: created.demandId,
          date: created.date,
          percentage: created.percentage,
          product: created.product,
          testManager: created.testManager,
          versionType: created.versionType,
          published: created.published,
        },
      ]);

      if (transferPercentage < schedule.percentage) {
        message.success(`已转移至 ${targetStaff.name}，投入比例由 ${schedule.percentage}% 调整为 ${transferPercentage}%（受系数 ${coeff.toFixed(1)} 限制）`);
      } else {
        message.success(`已转移至 ${targetStaff.name}`);
      }
    } catch (err: any) {
      message.error(err.message || '转移失败');
    } finally {
      setDraggedSchedule(null);
    }
  };

  const handleDrop = (staff: any, date: string) => {
    if (selectedDemand) {
      // 检查当日可用状态
      if (!isAvailableForAssignment(staff.id, date)) {
        const statusLabel = DailyStatusLabels[getDailyStatus(staff.id, date) as DailyAvailabilityStatus];
        message.warning(`${staff.name}今日「${statusLabel}」，不参与测试`);
        return;
      }

      // 检查该需求人力是否已满足
      const demandSchedules = schedules.filter(s => s.demandId === selectedDemand.id);
      const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
      if (allocatedDays >= selectedDemand.manpowerDemand) {
        message.warning('测试人力需求已满足，无需继续分配');
        return;
      }

      const coeff = staff.currentCoefficient || 1;
      const sPct = getDailyStatusPercentage(staff.id, date);
      const s = getDailyStatus(staff.id, date);
      const sFactor = s && s !== 'AVAILABLE' ? (1 - sPct / 100) : 1;
      setAssignTarget({ staff, date });
      setAssignDays(1);
      setAssignPercentage(Math.round(coeff * 100 * sFactor));
      setAssignModalVisible(true);
    }
  };

  const handleAssignConfirm = async () => {
    if (!assignTarget || !selectedDemand) return;

    // 检查本次分配是否超出剩余需求
    const demandSchedules = schedules.filter(s => s.demandId === selectedDemand.id);
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const remaining = selectedDemand.manpowerDemand - allocatedDays;
    const thisAllocation = (assignDays * assignPercentage) / 100;
    if (thisAllocation > remaining) {
      message.warning(`测试人力需求已满足，剩余可分配 ${remaining.toFixed(1)} 人/天，本次分配 ${thisAllocation.toFixed(1)} 人/天超出需求`);
      return;
    }

    setAssignLoading(true);
    try {
      const startDate = dayjs(assignTarget.date);
      const newSchedules: any[] = [];

      for (let i = 0; i < assignDays; i++) {
        const currentDate = startDate.add(i, 'day').format('YYYY-MM-DD');
        newSchedules.push({
          staffId: assignTarget.staff.id,
          demandId: selectedDemand.id,
          date: currentDate,
          percentage: assignPercentage,
          product: selectedDemand.product,
          testManager: selectedDemand.submittedBy || '测试经理',
          versionType: selectedDemand.versionType,
          version: selectedDemand.version,
        });
      }

      const savedSchedules = await api.createSchedulesBatch(newSchedules);

      setSchedules(prev => [
        ...prev,
        ...savedSchedules.map((s: any) => ({
          id: s.id,
          staffId: s.staffId,
          demandId: s.demandId,
          date: s.date,
          percentage: s.percentage,
          product: s.product,
          testManager: s.testManager,
          versionType: s.versionType,
          version: s.version,
          published: s.published,
        }))
      ]);

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

  // 删除排班
  const handleDeleteSchedule = async (schedule: ScheduleItem) => {
    if (schedule.published) {
      // 已发布排班：仅本地删除，点击发布时统一提交
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

  // 打开编辑弹窗
  const handleEditSchedule = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setEditPercentage(schedule.percentage);
    setEditModalVisible(true);
  };

  // 确认编辑
  const handleEditConfirm = async () => {
    if (!editingSchedule) return;

    setEditLoading(true);

    if (editingSchedule.published) {
      // 已发布排班：仅更新本地状态，点击发布时统一提交
      const tempId = -(Date.now() + Math.random());
      setSchedules(prev => [
        ...prev.filter(s => s.id !== editingSchedule.id),
        {
          id: tempId,
          staffId: editingSchedule.staffId,
          demandId: editingSchedule.demandId,
          date: editingSchedule.date,
          percentage: editPercentage,
          product: editingSchedule.product,
          testManager: editingSchedule.testManager || '测试经理',
          versionType: editingSchedule.versionType,
          version: editingSchedule.version,
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

      const newScheduleData = {
        staffId: editingSchedule.staffId,
        demandId: editingSchedule.demandId,
        date: editingSchedule.date,
        percentage: editPercentage,
        product: editingSchedule.product,
        testManager: editingSchedule.testManager || '测试经理',
        versionType: editingSchedule.versionType,
        version: editingSchedule.version,
      };

      const created = await api.createSchedule(newScheduleData);

      setSchedules(prev => [
        ...prev.filter(s => s.id !== editingSchedule.id),
        {
          id: created.id,
          staffId: created.staffId,
          demandId: created.demandId,
          date: created.date,
          percentage: created.percentage,
          product: created.product,
          testManager: created.testManager,
          versionType: created.versionType,
          published: created.published,
        },
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

  // 渲染百分比显示
  const renderPercentage = (percentage: number) => {
    if (percentage >= 100) {
      return `${percentage}%`;
    }
    return `${percentage}%`;
  };

  // 筛选并排序：待排期需求（按结束日期距今日最近优先）
  const pendingDemands = useMemo(() => demands.filter(d => {
    const demandSchedules = schedules.filter(s => s.demandId === d.id && staffs.some(st => st.id === s.staffId));
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const hasRemaining = allocatedDays < Number(d.manpowerDemand || 0);
    let matchesTestType = true;
    if (filterDemandTestTypes.length > 0) {
      matchesTestType = (d.manpowerDetails || []).some((md: any) =>
        filterDemandTestTypes.includes(md.testType)
      );
    }
    return hasRemaining && matchesTestType;
  }).sort((a, b) => dayjs(a.endDate).diff(dayjs()) - dayjs(b.endDate).diff(dayjs())), [demands, schedules, staffs, filterDemandTestTypes]);

  // 筛选：已分配项目
  const assignedDemands = useMemo(() => demands.filter(d => {
    const demandSchedules = schedules.filter(s => s.demandId === d.id && staffs.some(st => st.id === s.staffId));
    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
    const isPublished = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
    const notExpired = dayjs().isBefore(dayjs(d.endDate).add(1, 'day'));
    let matchesTestType = true;
    if (filterDemandTestTypes.length > 0) {
      matchesTestType = (d.manpowerDetails || []).some((md: any) =>
        filterDemandTestTypes.includes(md.testType)
      );
    }
    return allocatedDays >= Number(d.manpowerDemand || 0) && isPublished && notExpired && matchesTestType;
  }), [demands, schedules, staffs, filterDemandTestTypes]);

  // 推荐排班弹框中共用的需求选择列表
  const renderDemandSelectionList = (priorityOpts: string[]) => {
    const eligibleDemands = demands.filter(d => {
      const demandSchedules = schedules.filter(s => s.demandId === d.id);
      const published = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
      return !published && (d.status === 'pending' || d.status === 'scheduled');
    });
    const allEligibleIds = eligibleDemands.map(d => d.id);
    const allSelected = allEligibleIds.length > 0 && allEligibleIds.every(id => selectedDemandIds.has(id));
    const priorityColors = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'magenta', 'geekblue'];

    return (
      <>
        <Checkbox
          checked={allSelected}
          indeterminate={selectedDemandIds.size > 0 && !allSelected}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedDemandIds(new Set(allEligibleIds));
            } else {
              setSelectedDemandIds(new Set());
            }
          }}
          style={{ marginBottom: 8 }}
        >
          <span style={{ fontSize: 13, color: '#888' }}>全选 / 取消全选</span>
        </Checkbox>

        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 4 }}>
          {eligibleDemands.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 16, fontSize: 13 }}>
              没有可排期的需求
            </div>
          ) : (
            eligibleDemands.map(d => {
              const demandSchedules = schedules.filter(s => s.demandId === d.id);
              const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
              const remaining = Number(d.manpowerDemand) - allocatedDays;
              const idx = priorityOpts.indexOf(d.priority);
              const tagColor = idx >= 0 ? priorityColors[idx % priorityColors.length] : 'default';
              return (
                <div
                  key={d.id}
                  style={{ padding: '6px 8px', borderBottom: '1px solid #fafafa', display: 'flex', alignItems: 'center' }}
                >
                  <Checkbox
                    checked={selectedDemandIds.has(d.id)}
                    onChange={(e) => {
                      const next = new Set(selectedDemandIds);
                      if (e.target.checked) {
                        next.add(d.id);
                      } else {
                        next.delete(d.id);
                      }
                      setSelectedDemandIds(next);
                    }}
                  />
                  <div style={{ marginLeft: 8, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {d.product}
                      {d.priority && (
                        <Tag color={tagColor} style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }}>
                          {d.priority}
                        </Tag>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#888' }}>
                      {d.versionType}
                      {' | '}{dayjs(d.startDate).format('MM/DD')}~{dayjs(d.endDate).format('MM/DD')}
                    </div>
                    {d.manpowerDetails && d.manpowerDetails.length > 0 && (
                      <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                        {d.manpowerDetails.map((md: any) =>
                          `${md.testType}:${md.manpowerDemand}`
                        ).join(' | ')} 人/天
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

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', overscrollBehavior: 'none', minHeight: 0 }}>
      <div style={{ flexShrink: 0, background: '#f0f2f5', paddingBottom: 8 }}>
        {/* 顶部操作栏 */}
        <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              type="primary"
              icon={<CalendarOutlined />}
              onClick={handleDateRecommend}
            >
              按指定日期排班
            </Button>
            <Button
              icon={<RobotOutlined />}
              onClick={handleFullAllocateRecommend}
            >
              按全部需求排班
            </Button>
            <Button
              icon={<ExclamationCircleOutlined />}
              onClick={handleConflictCheck}
            >
              冲突检测
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleClearAllUnpublished}
            >
              清除未发布排班
            </Button>
          </Space>
        </div>
      </Card>

      {hasConflicts && (
        <Alert
          message="排班冲突警告"
          description={
            <div>
              <div style={{ marginBottom: 4 }}>检测到 {conflictDetails.length} 个排班冲突：</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {conflictDetails.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setHasConflicts(false)}
        />
      )}

      {unfulfilledDetails.length > 0 && (
        <Alert
          message={`推荐排班 — ${unfulfilledDetails.length} 个需求未完全满足`}
          description={
            <Collapse
              size="small"
              ghost
              items={unfulfilledDetails.map((u, i) => ({
                key: String(i),
                label: (
                  <span>
                    {u.product} — 缺口 <strong style={{ color: '#ff4d4f' }}>{u.shortage} 人/天</strong>
                  </span>
                ),
                children: (
                  <div style={{ fontSize: 13 }}>
                    {u.reasons.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 500, marginBottom: 4, color: '#ff4d4f' }}>原因：</div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {u.reasons.map((r, ri) => (
                            <li key={ri}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {u.details.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>测试类型缺口：</div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {u.details.map((d, di) => (
                            <li key={di}>
                              {d.testType}：剩余 {d.shortage} 人/天
                              {!u.reasons.some(r => r.includes(d.testType)) && u.reasons.length > 0 ? '' : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          }
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setUnfulfilledDetails([])}
        />
      )}
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* 左侧：需求列表 */}
        <Card
          className="left-demand-card"
          style={{ width: 230, flexShrink: 0, overflow: 'hidden' }}
          bodyStyle={{ padding: 0, overflow: 'hidden', height: '100%' }}
        >
          <div style={{ padding: '4px 8px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <Select
              mode="multiple"
              placeholder="测试类型筛选"
              style={{ width: '100%' }}
              size="small"
              value={filterDemandTestTypes}
              onChange={setFilterDemandTestTypes}
              allowClear
              maxTagCount={1}
              options={(() => {
                const allTypes = new Set<string>();
                demands.forEach(d => {
                  if (d.manpowerDetails) {
                    d.manpowerDetails.forEach((md: any) => {
                      if (md.testType) allTypes.add(md.testType);
                    });
                  }
                });
                return Array.from(allTypes).map(t => ({ label: t, value: t }));
              })()}
            />
          </div>
          <style>{`
            .left-demand-card.ant-card { display: flex; flex-direction: column; }
            .left-demand-card > .ant-card-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
            .demand-tabs.ant-tabs { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; padding: 0 8px; }
            .demand-tabs > .ant-tabs-nav { flex-shrink: 0; }
            .demand-tabs > .ant-tabs-content-holder { flex: 1; min-height: 0; overflow: hidden; }
            .demand-tabs .ant-tabs-content { height: 100%; }
            .demand-tabs .ant-tabs-tabpane { height: 100%; }
          `}</style>
          <Tabs
            size="small"
            className="demand-tabs"
            items={[
              {
                key: 'pending',
                label: '待排期',
                children: (
                  <div style={{ height: '100%', overflowY: 'auto', padding: '0 4px', overscrollBehavior: 'contain' }}>
                    {pendingDemands.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                        暂无待排期需求
                      </div>
                    ) : (
                      pendingDemands.map(demand => {
                        const activeStaffIds = staffs.map(s => s.id);
                        const demandSchedules = schedules.filter(s => s.demandId === demand.id && activeStaffIds.includes(s.staffId));
                        const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
                        const remainingDays = demand.manpowerDemand - allocatedDays;
                        const daysToEnd = dayjs(demand.endDate).diff(dayjs(), 'day');
                        const isUrgent = daysToEnd <= 3 && remainingDays > 0;
                        const isUnfulfilled = unfulfilledDemands.has(demand.id);

              let borderColor = '#b7eb8f';
              let bgColor = '#f6ffed';
              if (isUnfulfilled) {
                borderColor = '#ff4d4f';
                bgColor = '#fff1f0';
              } else if (remainingDays > 0) {
                borderColor = isUrgent ? '#ff4d4f' : '#ff9c6e';
                bgColor = isUrgent ? '#fff1f0' : '#fff7e6';
              }

              return (
                <div
                  key={demand.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, demand)}
                  onDragEnd={() => setDragOverCell(null)}
                  onClick={() => { setDetailDemand(demand); setDetailModalVisible(true); }}
                  style={{
                    padding: '4px 6px',
                    border: `1px solid ${borderColor}`,
                    borderRadius: 3,
                    marginBottom: 2,
                    cursor: 'pointer',
                    background: bgColor,
                    fontSize: 11,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 1,
                  }}>
                    <strong style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>{demand.product}</strong>
                    {demand.priority && (
                      editingPriorityId === demand.id && (hasRole('resourceManager') || hasRole('projectManager')) ? (
                        <Select
                          size="small"
                          value={demand.priority}
                          onChange={async (val) => {
                            try {
                              await api.updateDemandPriority(demand.id, val);
                              setDemands(prev => prev.map(d => d.id === demand.id ? { ...d, priority: val } : d));
                              message.success('优先级已更新');
                            } catch (e: any) {
                              message.error(e.message || '更新失败');
                            }
                            setEditingPriorityId(null);
                          }}
                          onBlur={() => setEditingPriorityId(null)}
                          style={{ width: 56, fontSize: 10 }}
                          autoFocus
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          {priorityOptions.map(opt => (
                            <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                          ))}
                        </Select>
                      ) : (
                        <Tag
                          color={(() => {
                            const idx = priorityOptions.indexOf(demand.priority);
                            const colors = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'magenta', 'geekblue'];
                            return idx >= 0 ? colors[idx % colors.length] : 'blue';
                          })()}
                          style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 4px', flexShrink: 0, cursor: (hasRole('resourceManager') || hasRole('projectManager')) ? 'pointer' : 'default' }}
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            if (hasRole('resourceManager') || hasRole('projectManager')) {
                              setEditingPriorityId(editingPriorityId === demand.id ? null : demand.id);
                            }
                          }}
                        >
                          {demand.priority}
                        </Tag>
                      )
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: '#888' }}>
                    {dayjs(demand.startDate).format('MM/DD')} ~ {dayjs(demand.endDate).format('MM/DD')}
                  </div>
                  <div style={{ fontSize: 10, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      {Number(demand.manpowerDemand || 0).toFixed(1)} 人/天
                      {demand.testDeviceCount != null && (
                        <span style={{ marginLeft: 4 }}>{demand.testDeviceCount} 台样机</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      {demand.confidential && (
                        <Tag color="red" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>保密</Tag>
                      )}
                      {(pendingChangeDemandIds.has(demand.id) || demandSchedules.some((s: any) => !s.published)) && (
                        <Tag color="processing" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>待提交</Tag>
                      )}
                      <Button
                        size="small"
                        type="link"
                        danger
                        style={{ fontSize: 10, padding: 0, height: 16 }}
                        onClick={(e) => { e.stopPropagation(); handleClearDemand(demand.id); }}
                      >
                        清除
                      </Button>
                      <Button
                        size="small"
                        type="link"
                        style={{ fontSize: 10, padding: 0, height: 16 }}
                        onClick={(e) => { e.stopPropagation(); handlePublishDemand(demand.id); }}
                      >
                        发布
                      </Button>
                    </span>
                  </div>
                </div>
              );
            })
          )}
                  </div>
                ),
              },
              {
                key: 'assigned',
                label: '已分配项目',
                children: (
                  <div style={{ height: '100%', overflowY: 'auto', padding: '0 4px', overscrollBehavior: 'contain' }}>
                    {assignedDemands.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                        暂无已分配项目
                      </div>
                    ) : (
                      assignedDemands.map(demand => {
                        let borderColor = '#b7eb8f';
                        let bgColor = '#f6ffed';

                        return (
                          <div
                            key={demand.id}
                            onClick={() => { setDetailDemand(demand); setDetailModalVisible(true); }}
                            style={{
                              padding: '4px 6px',
                              border: `1px solid ${borderColor}`,
                              borderRadius: 3,
                              marginBottom: 2,
                              background: bgColor,
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              marginBottom: 1,
                            }}>
                              <strong style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>{demand.product}</strong>
                              <span style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                                {demand.priority && (
                                  <Tag
                                    color={(() => {
                                      const idx = priorityOptions.indexOf(demand.priority);
                                      const colors = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'magenta', 'geekblue'];
                                      return idx >= 0 ? colors[idx % colors.length] : 'blue';
                                    })()}
                                    style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}
                                  >
                                    {demand.priority}
                                  </Tag>
                                )}
                                {demand.confidential && (
                                  <Tag color="red" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>保密</Tag>
                                )}
                              </span>
                            </div>
                            <div style={{ fontSize: 10, color: '#888' }}>
                              {dayjs(demand.startDate).format('MM/DD')} ~ {dayjs(demand.endDate).format('MM/DD')}
                            </div>
                            <div style={{ fontSize: 10, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{Number(demand.manpowerDemand || 0).toFixed(1)} 人/天</span>
                              <span style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <Tag
                                  color={getVersionTypeColor(demand.versionType)}
                                  style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 4px' }}
                                >
                                  {demand.versionPhase || demand.versionType}
                                </Tag>
                                <Button
                                  size="small"
                                  type="link"
                                  danger
                                  style={{ fontSize: 10, padding: 0, height: 16 }}
                                  onClick={(e) => { e.stopPropagation(); handleClearDemand(demand.id); }}
                                >
                                  清除
                                </Button>
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                ),
              },
            ]}
          />
        </Card>

        {/* 右侧：排班视图 */}
        <Card
          title={
            <Space size={8}>
              <span>人力排布视图</span>
              {draggedSchedule && (
                <div
                  onDrop={() => {
                    handleDeleteSchedule(draggedSchedule);
                    setDraggedSchedule(null);
                    setDragOverTrash(false);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverTrash(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverTrash(false);
                  }}
                  style={{
                    width: dragOverTrash ? 40 : 32,
                    height: dragOverTrash ? 40 : 32,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: dragOverTrash ? '#ff4d4f' : '#fff1f0',
                    border: dragOverTrash ? '2px solid #ff4d4f' : '2px dashed #ff4d4f',
                    cursor: 'pointer',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: dragOverTrash ? 'scale(1.2)' : 'scale(1)',
                    boxShadow: dragOverTrash ? '0 0 14px rgba(255, 77, 79, 0.55)' : 'none',
                  }}
                >
                  <DeleteOutlined style={{
                    color: dragOverTrash ? '#fff' : '#ff4d4f',
                    fontSize: dragOverTrash ? 20 : 16,
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  }} />
                </div>
              )}
            </Space>
          }
          extra={
            <DatePicker
              picker="week"
              value={weekViewDate}
              onChange={(date) => date && setWeekViewDate(date)}
              allowClear={false}
              style={{ width: 130 }}
            />
          }
          style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}
          bodyStyle={{ padding: 0, overflow: 'auto', height: '100%', overscrollBehavior: 'contain' }}
        >
          {/* 筛选控件 */}
          <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 10, background: '#fff' }}>
            <span style={{ fontSize: 13, color: '#666' }}>筛选:</span>
            <Select
              mode="multiple"
              placeholder="测试类型"
              style={{ minWidth: 180 }}
              value={filterTestTypes}
              onChange={setFilterTestTypes}
              allowClear
              maxTagCount={2}
              options={[...new Set(staffs.filter(s => s.status === 'active').map(s => s.testType).filter(Boolean))].map(t => ({ label: t, value: t }))}
            />
            <span style={{ fontSize: 13, color: '#666' }}>系数:</span>
            <InputNumber
              min={0}
              max={2}
              step={0.1}
              placeholder="最小"
              value={filterCoeffMin}
              onChange={v => setFilterCoeffMin(v)}
              style={{ width: 80 }}
              size="small"
            />
            <span style={{ fontSize: 13, color: '#666' }}>~</span>
            <InputNumber
              min={0}
              max={2}
              step={0.1}
              placeholder="最大"
              value={filterCoeffMax}
              onChange={v => setFilterCoeffMax(v)}
              style={{ width: 80 }}
              size="small"
            />
            <span style={{ fontSize: 13, color: '#666', marginLeft: 12 }}>产品:</span>
            <Select
              mode="multiple"
              placeholder="全部产品"
              style={{ minWidth: 200 }}
              value={filterProducts}
              onChange={setFilterProducts}
              allowClear
              maxTagCount={2}
              options={[...new Set(schedules.map(s => s.product).filter(Boolean))].map(p => ({ label: p, value: p }))}
            />
          </div>

          <style>{`
            .drop-active {
              transform: scale(0.88);
              transition: transform 0.2s ease;
              box-shadow: inset 0 0 12px rgba(24, 144, 255, 0.35);
              border: 2px dashed #1890ff !important;
              border-radius: 6px;
              background: rgba(24, 144, 255, 0.06);
            }
          `}</style>
          <div onDragLeave={() => setDragOverCell(null)}>
          <table className="kanban-table" style={{ minWidth: 1200 }}>
            <thead>
              <tr style={{ position: 'sticky', top: 40, zIndex: 5 }}>
                <th style={{ minWidth: 45, position: 'sticky', left: 0, background: '#fafafa', zIndex: 6 }}>姓名</th>
                <th style={{ minWidth: 10, position: 'sticky', left: 45, background: '#fafafa', zIndex: 6 }}>系数</th>
                <th style={{ minWidth: 50, position: 'sticky', left: 55, background: '#fafafa', zIndex: 6 }}>保密权限</th>
                <th style={{ minWidth: 45, position: 'sticky', left: 105, background: '#fafafa', zIndex: 6 }}>测试类型</th>
                <th style={{ minWidth: 140, position: 'sticky', left: 150, background: '#fafafa', zIndex: 6 }}>熟悉模块</th>
                {weekDates.map((date, index) => {
                  const isWeekend = [0, 6].includes(date.day());
                  return (
                  <th key={date.format('YYYY-MM-DD')} style={{
                    minWidth: 100,
                    background: isWeekend ? '#fff7e6' : '#fafafa',
                  }}>
                    <div style={{ color: isWeekend ? '#fa8c16' : undefined }}>{weekDays[index]}</div>
                    <div style={{ fontSize: 10, color: isWeekend ? '#fa8c16' : '#666' }}>
                      {date.format('MM-DD')}
                    </div>
                  </th>
                )})}
              </tr>
            </thead>
            <tbody>
              {staffs.filter(s => {
                if (s.status !== 'active') return false;
                // 测试组长只看本组
                if (user?.roles?.includes('testLead') && user?.testType && s.testType !== user.testType) return false;
                // 筛选控件
                if (filterTestTypes.length > 0 && s.testType && !filterTestTypes.includes(s.testType)) return false;
                if (filterCoeffMin !== null && s.currentCoefficient < filterCoeffMin) return false;
                if (filterCoeffMax !== null && s.currentCoefficient > filterCoeffMax) return false;
                // 产品筛选：只展示在选定产品上有排班的人员
                if (filterProducts.length > 0) {
                  const weekDateStrs = weekDates.map(d => d.format('YYYY-MM-DD'));
                  const hasMatchingSchedule = schedules.some(
                    sch => sch.staffId === s.id && weekDateStrs.includes(sch.date) && filterProducts.includes(sch.product)
                  );
                  if (!hasMatchingSchedule) return false;
                }
                return true;
              }).map(staff => (
                <tr key={staff.id}>
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '12px',
                  }}>
                    <strong>{staff.name}</strong>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 45,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                  }}>
                    <Tag color={staff.currentCoefficient === 1.0 ? 'green' : 'orange'} style={{ fontSize: '10px', padding: '0 2px' }}>
                      {staff.currentCoefficient?.toFixed(1) || '1.0'}
                    </Tag>
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 55,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '11px',
                    textAlign: 'center',
                  }}>
                    {staff.confidentialClearance ? (
                      <Tag color="red" style={{ fontSize: '10px', padding: '0 4px' }}>保密</Tag>
                    ) : (
                      <span style={{ color: '#ccc' }}>-</span>
                    )}
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 105,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '11px',
                    color: '#666',
                  }}>
                    {staff.testType || '-'}
                  </td>
                  <td style={{
                    position: 'sticky',
                    left: 150,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '11px',
                    color: '#666',
                  }}>
                    {staff.familiarModules ? (
                      <Tooltip title={staff.familiarModules}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
                          {staff.familiarModules}
                        </div>
                      </Tooltip>
                    ) : '-'}
                  </td>
                  {weekDates.map((date, dayIndex) => {
                    const dateStr = date.format('YYYY-MM-DD');
                    const daySchedules = getSchedulesForStaffAndDate(staff.id, dateStr);
                    const totalPercent = getTotalPercentage(staff.id, dateStr);
                    const dailyStatus = getDailyStatus(staff.id, dateStr);
                    const statusPercentage = getDailyStatusPercentage(staff.id, dateStr);
                    const rawMaxCapacity = (staff.currentCoefficient || 1) * 100;
                    const statusFactor = dailyStatus && dailyStatus !== 'AVAILABLE' ? (1 - statusPercentage / 100) : 1;
                    const maxCapacity = rawMaxCapacity * statusFactor;
                    const hasConflict = totalPercent > maxCapacity;
                    const isWeekend = [5, 6].includes(dayIndex);
                    const canAssign = isAvailableForAssignment(staff.id, dateStr);
                    const isTestLead = hasPermission('manageDailyAvailability');
                    const statusBgColor = dailyStatus && dailyStatus !== 'AVAILABLE'
                      ? `${DailyStatusColors[dailyStatus]}18`
                      : undefined;

                    const cellBackground = hasConflict ? '#fff1f0'
                      : statusBgColor || (isWeekend ? '#fff7e6' : '#fff');

                    let cellCursor = 'default';
                    if (selectedDemand) {
                      cellCursor = canAssign ? 'copy' : 'not-allowed';
                    } else if (isTestLead) {
                      cellCursor = 'pointer';
                    }

                    const popoverKey = `${staff.id}-${dateStr}`;
                    const isStatusPopoverOpen = statusPopoverOpen === popoverKey;

                    const statusPopoverProps = {
                      content: (
                        <div style={{ minWidth: 200 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>状态</span>
                              <Select
                                value={statusDraft}
                                onChange={(val) => setStatusDraft(val)}
                                style={{ flex: 1 }}
                                size="small"
                                options={(['AVAILABLE', 'OTHER_TASKS', 'SECONDED', 'ON_LEAVE', 'COMPENSATORY_LEAVE'] as DailyAvailabilityStatus[]).map(s => ({
                                  value: s,
                                  label: <span style={{ color: DailyStatusColors[s] }}>{DailyStatusLabels[s]}</span>,
                                }))}
                              />
                            </div>
                            <div>
                              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>投入百分比</div>
                              <InputNumber
                                min={0}
                                max={100}
                                step={5}
                                value={statusDraft === 'AVAILABLE' ? 100 : statusPctDraft}
                                onChange={(val) => setStatusPctDraft(val ?? 100)}
                                disabled={statusDraft === 'AVAILABLE'}
                                style={{ width: '100%' }}
                                addonAfter="%"
                                size="small"
                              />
                            </div>
                            <Divider style={{ margin: '4px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                              <Button size="small" onClick={() => setStatusPopoverOpen(null)}>取消</Button>
                              <Button type="primary" size="small" onClick={() => {
                                if (statusDraft === 'AVAILABLE') {
                                  handleStatusChange(staff, dateStr, 'AVAILABLE');
                                } else {
                                  handleStatusChange(staff, dateStr, statusDraft, statusPctDraft);
                                }
                              }}>确定</Button>
                            </div>
                          </div>
                        </div>
                      ),
                      title: `${staff.name} - ${dateStr}`,
                      trigger: 'click' as const,
                      open: isStatusPopoverOpen,
                      onOpenChange: (open: boolean) => {
                        if (open) {
                          setStatusDraft(dailyStatus || 'AVAILABLE');
                          setStatusPctDraft(statusPercentage);
                          setStatusPopoverOpen(popoverKey);
                        } else {
                          setStatusPopoverOpen(null);
                        }
                      },
                      placement: 'bottom' as const,
                    };

                    const statusCardNode = dailyStatus && dailyStatus !== 'AVAILABLE' ? (
                      <div
                        className="status-card"
                        style={{
                          background: `${DailyStatusColors[dailyStatus]}18`,
                          borderLeft: `3px solid ${DailyStatusColors[dailyStatus]}`,
                        }}
                      >
                        <div style={{ color: DailyStatusColors[dailyStatus], fontWeight: 500 }}>
                          {DailyStatusLabels[dailyStatus]}
                        </div>
                        <div style={{ fontSize: 10, color: '#666' }}>
                          {statusPercentage < 100 ? `${statusPercentage}%` : ''}
                        </div>
                      </div>
                    ) : null;

                    const idleNode = (!dailyStatus || dailyStatus === 'AVAILABLE') && daySchedules.length === 0 ? (
                      <div style={{ color: '#ccc', fontSize: 10, padding: '8px 0', cursor: isTestLead ? 'pointer' : undefined }}>
                        空闲
                      </div>
                    ) : null;

                    const cellContent = (
                      <div>
                        {isTestLead ? (
                          <>
                            {statusCardNode ? (
                              <Popover {...statusPopoverProps}>{statusCardNode}</Popover>
                            ) : idleNode ? (
                              <Popover {...statusPopoverProps}>{idleNode}</Popover>
                            ) : null}
                          </>
                        ) : (
                          <>
                            {statusCardNode}
                            {idleNode}
                          </>
                        )}
                        {daySchedules.map(schedule => (
                          <div
                            key={schedule.id}
                            className="schedule-item"
                            draggable
                            style={{
                              background: `${getVersionTypeColor(schedule.versionType)}20`,
                              borderLeft: `3px solid ${getVersionTypeColor(schedule.versionType)}`,
                              marginBottom: 1,
                              padding: '1px 18px 1px 4px',
                              position: 'relative',
                              cursor: 'grab',
                              fontSize: 11,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={() => handleEditSchedule(schedule)}
                            onDragStart={(e) => handleScheduleDragStart(e, schedule)}
                            onDragEnd={handleScheduleDragEnd}
                          >
                            <span
                              className="product-name"
                              style={{ color: getVersionTypeColor(schedule.versionType), fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 4 }}
                            >
                              {schedule.product}
                            </span>
                            <span style={{ fontSize: 10, color: '#666', flexShrink: 0 }}>
                              {renderPercentage(schedule.percentage)}
                            </span>
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              right: 0,
                            }}>
                              <Popconfirm
                                title="确定删除？"
                                onConfirm={(e) => {
                                  e?.stopPropagation();
                                  handleDeleteSchedule(schedule);
                                }}
                                okText="确定"
                                cancelText="取消"
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  style={{ fontSize: 9, padding: '0 1px', height: 14, width: 14 }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </Popconfirm>
                            </div>
                          </div>
                        ))}
                      </div>
                    );

                    const cellKey = `${staff.id}-${dateStr}`;
                    return (
                      <td
                        key={dateStr}
                        style={{
                          background: cellBackground,
                          cursor: cellCursor,
                          padding: 0,
                        }}
                        onDrop={() => {
                          setDragOverCell(null);
                          if (draggedSchedule) {
                            handleScheduleTransfer(draggedSchedule, staff, dateStr);
                          } else {
                            handleDrop(staff, dateStr);
                          }
                        }}
                        onDragOver={(e) => {
                          if (selectedDemand || draggedSchedule) {
                            e.preventDefault();
                            setDragOverCell(cellKey);
                          }
                        }}
                      >
                        <div
                          className={dragOverCell === cellKey ? 'drop-active' : ''}
                          style={{ width: '100%', minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                        {cellContent}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      </div>

      {/* 分配弹窗 */}
      <Modal
        title="分配测试任务"
        open={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false);
          setSelectedDemand(null);
          setAssignTarget(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setAssignModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={assignLoading}
            onClick={handleAssignConfirm}
          >
            确认分配
          </Button>
        ]}
      >
        {assignTarget && selectedDemand && (() => {
          const currentDemandSchedules = schedules.filter(s => s.demandId === selectedDemand.id);
          const alreadyAllocated = currentDemandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
          const remaining = selectedDemand.manpowerDemand - alreadyAllocated;
          const thisAllocation = (assignDays * assignPercentage) / 100;
          const exceeds = thisAllocation > remaining;

          return (
          <div>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="测试人员">
                <strong>{assignTarget.staff.name}</strong>
              </Descriptions.Item>
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
              <Descriptions.Item label="需求人力">
                {selectedDemand.manpowerDemand} 人/天
              </Descriptions.Item>
              <Descriptions.Item label="已分配">
                <span style={{ color: alreadyAllocated >= selectedDemand.manpowerDemand ? '#52c41a' : '#1890ff' }}>
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
                <strong style={{ fontSize: 16, color: '#1890ff' }}>
                  {dayjs(assignTarget.date).format('YYYY-MM-DD')}
                </strong>
                <span style={{ fontSize: 14, color: '#666' }}> 开始，分配 </span>
                <InputNumber
                  min={1}
                  max={Math.floor(assignTarget.staff.currentCoefficient * 100)}
                  value={assignPercentage}
                  onChange={(value) => setAssignPercentage(value || 100)}
                  style={{ width: 100, margin: '0 8px' }}
                />
                <span style={{ fontSize: 14, color: '#666' }}>%（系数 {assignTarget.staff.currentCoefficient}）</span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>连续分配 </span>
                <InputNumber
                  min={1}
                  max={Math.min(
                    dayjs(selectedDemand.endDate).diff(dayjs(assignTarget.date), 'day') + 1,
                    30
                  )}
                  value={assignDays}
                  onChange={(value) => setAssignDays(value || 1)}
                  style={{ width: 80, margin: '0 8px' }}
                />
                <span style={{ fontSize: 14, color: '#666' }}> 天</span>
              </div>

              <div style={{
                marginTop: 16,
                padding: 12,
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
          );
          })()
        }
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        title="编辑排班"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingSchedule(null);
        }}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="confirm"
            type="primary"
            loading={editLoading}
            onClick={handleEditConfirm}
          >
            确认修改
          </Button>
        ]}
      >
        {editingSchedule && (
          <div>
            <Descriptions column={1} bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="测试人员">
                <strong>{staffs.find(s => s.id === editingSchedule.staffId)?.name || '-'}</strong>
              </Descriptions.Item>
              <Descriptions.Item label="任务">
                <strong style={{ color: getVersionTypeColor(editingSchedule.versionType) }}>
                  {editingSchedule.product}
                </strong>
              </Descriptions.Item>
              <Descriptions.Item label="日期">
                {editingSchedule.date}
              </Descriptions.Item>
            </Descriptions>

            <Divider>修改投入比例</Divider>

            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 14, color: '#666' }}>投入比例：</span>
                <InputNumber
                  min={1}
                  max={100}
                  value={editPercentage}
                  onChange={(value) => setEditPercentage(value || 100)}
                  style={{ width: 100, marginLeft: 8 }}
                />
                <span style={{ fontSize: 14, color: '#666', marginLeft: 8 }}>%</span>
              </div>

              <div style={{
                marginTop: 16,
                padding: 12,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
                borderRadius: 8,
              }}>
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

      {/* 按指定日期排班 Modal */}
      <Modal
        title="按指定日期排班"
        open={dateRecModalOpen}
        onOk={runDateRecommendation}
        onCancel={() => {
          setDateRecModalOpen(false);
          setSelectedDates(new Set());
          setSelectedDemandIds(new Set());
        }}
        okText="开始排班"
        cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 || selectedDates.size === 0 }}
        width={520}
      >
        {/* 日期选择 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>
            选择排班日期（{selectedDates.size} 天已选）
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <DatePicker
              key={`datepick-${selectedDates.size}`}
              placeholder="选择任意日期（含过去）"
              format="YYYY-MM-DD"
              style={{ flex: 1 }}
              onChange={(date: dayjs.Dayjs | null) => {
                if (date) {
                  const dateStr = date.format('YYYY-MM-DD');
                  setSelectedDates(prev => {
                    const next = new Set(prev);
                    next.add(dateStr);
                    return next;
                  });
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
                for (let i = 0; i <= 7; i++) {
                  all.add(dayjs().add(i, 'day').format('YYYY-MM-DD'));
                }
                setSelectedDates(all);
              } else {
                setSelectedDates(new Set());
              }
            }}
            style={{ marginBottom: 6 }}
          >
            <span style={{ fontSize: 13, color: '#888' }}>近 8 天全选 / 取消全选</span>
          </Checkbox>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Array.from({ length: 8 }, (_, i) => {
              const d = dayjs().add(i, 'day');
              const dateStr = d.format('YYYY-MM-DD');
              const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
              return (
                <Checkbox
                  key={dateStr}
                  checked={selectedDates.has(dateStr)}
                  onChange={(e) => {
                    const next = new Set(selectedDates);
                    if (e.target.checked) next.add(dateStr);
                    else next.delete(dateStr);
                    setSelectedDates(next);
                  }}
                >
                  {d.format('MM/DD')}({dayNames[d.day()]}){i === 0 ? ' 今天' : ''}
                </Checkbox>
              );
            })}
          </div>
          {(() => {
            const savedDates = Array.from(selectedDates).sort();
            return savedDates.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {savedDates.map(ds => (
                  <Tag
                    key={ds}
                    closable
                    color="blue"
                    onClose={() => {
                      setSelectedDates(prev => {
                        const next = new Set(prev);
                        next.delete(ds);
                        return next;
                      });
                    }}
                  >
                    {ds}
                  </Tag>
                ))}
              </div>
            );
          })()}
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 需求选择 */}
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          选择待排期需求（{selectedDemandIds.size} 个已选）
        </div>
        {renderDemandSelectionList(priorityOptions)}

        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          仅对所选日期生成排班方案。已发布排班不受影响，新排班为草稿需手动发布。
        </div>
      </Modal>

      {/* 按全部需求排班 Modal */}
      <Modal
        title="按全部需求排班"
        open={fullAllocModalOpen}
        onOk={runFullAllocateRecommendation}
        onCancel={() => {
          setFullAllocModalOpen(false);
          setIncludeSaturdays(false);
          setIncludeSundays(false);
          setSelectedDemandIds(new Set());
        }}
        okText="开始排班"
        cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 }}
        width={520}
      >
        {/* 周末设置 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 8 }}>周末排班设置</div>
          <Space direction="vertical">
            <Checkbox
              checked={includeSaturdays}
              onChange={(e) => setIncludeSaturdays(e.target.checked)}
            >
              周六排班
            </Checkbox>
            <Checkbox
              checked={includeSundays}
              onChange={(e) => setIncludeSundays(e.target.checked)}
            >
              周日排班
            </Checkbox>
          </Space>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 需求选择 */}
        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          选择待排期需求（{selectedDemandIds.size} 个已选）
        </div>
        {renderDemandSelectionList(priorityOptions)}

        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          将持续分配（最长90天）直到满足全部需求人力。已发布排班不受影响，新排班为草稿需手动发布。
        </div>
      </Modal>

      {/* 需求详情弹框 */}
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
                <Tag color={(() => {
                  const idx = priorityOptions.indexOf(detailDemand.priority);
                  const colors = ['red', 'orange', 'green', 'blue', 'purple', 'cyan', 'magenta', 'geekblue'];
                  return idx >= 0 ? colors[idx % colors.length] : 'blue';
                })()}>{detailDemand.priority}</Tag>
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
              })()}>{(() => {
                const sl: Record<string, string> = { submitted: '待审批', pending: '待排期', scheduled: '已排期', completed: '已完成', rejected: '已退回' };
                return sl[detailDemand.status] || detailDemand.status;
              })()}</Tag>
            </Descriptions.Item>
            {detailDemand.manpowerDetails && detailDemand.manpowerDetails.length > 0 && (
              <Descriptions.Item label="测试类型明细" span={2}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '74%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>测试类型</th>
                      <th style={{ padding: '2px 6px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>人力需求</th>
                      <th style={{ padding: '2px 6px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>所需模块</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailDemand.manpowerDetails.map((md: any, idx: number) => (
                      <tr key={idx}>
                        <td style={{ padding: '2px 6px', color: '#1890ff' }}>{md.testType}</td>
                        <td style={{ padding: '2px 6px', textAlign: 'right' }}>{Number(md.manpowerDemand || 0).toFixed(1)} 人/天</td>
                        <td style={{ padding: '2px 6px', color: '#888', wordBreak: 'break-word' }}>{md.remark || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="备注说明" span={2}>{detailDemand.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="提交人">
              {(() => {
                const staff = staffs.find((s: any) => s.empNo === detailDemand.submittedBy || s.name === detailDemand.submittedBy);
                return staff ? `${staff.empNo} ${staff.name}` : (detailDemand.submittedBy || '-');
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="提交时间">{detailDemand.createdAt ? dayjs(detailDemand.createdAt).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default ScheduleWorkbench;
