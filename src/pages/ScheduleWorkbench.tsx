import React, { useState, useEffect } from 'react';
import { Card, Button, Tag, Space, Alert, Modal, message, InputNumber, Descriptions, Divider, Popconfirm, DatePicker, Popover, Select, Checkbox, Tooltip, Badge } from 'antd';
import {
  RobotOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SendOutlined,
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
  const [filterCoeffMin, setFilterCoeffMin] = useState<number | null>(null);
  const [filterCoeffMax, setFilterCoeffMax] = useState<number | null>(null);
  const [filterProducts, setFilterProducts] = useState<string[]>([]);

  // AI 推荐排班状态
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [selectedDemandIds, setSelectedDemandIds] = useState<Set<number>>(new Set());
  const [unfulfilledDemands, setUnfulfilledDemands] = useState<Set<number>>(new Set());
  const [unfulfilledDetails, setUnfulfilledDetails] = useState<Array<{ product: string; shortage: number }>>([]);

  const { hasPermission } = useUserRole();
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
  }, []);

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
  const weekDates = Array.from({ length: 10 }, (_, i) =>
    dayjs().add(i, 'day')
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
  const computeAllocationByTestType = (demand: any) => {
    const result: Record<string, { demand: number; allocated: number }> = {};
    // 从 manpowerDetails 初始化需求人天
    if (demand.manpowerDetails && demand.manpowerDetails.length > 0) {
      demand.manpowerDetails.forEach((d: any) => {
        result[d.testType] = { demand: Number(d.manpowerDemand), allocated: 0 };
      });
    }
    // 按 schedules 统计已分配人天（通过 staff.testType 归类）
    const demandSchedules = schedules.filter(s => s.demandId === demand.id);
    demandSchedules.forEach(s => {
      const staff = staffs.find(st => st.id === s.staffId);
      const tt = staff?.testType;
      if (tt && result[tt]) {
        result[tt].allocated += s.percentage / 100;
      } else if (tt) {
        result[tt] = { demand: 0, allocated: s.percentage / 100 };
      }
    });
    return result;
  };

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

  const handleAIRecommend = () => {
    // 自动勾选所有未发布的需求
    const eligibleIds = demands
      .filter(d => {
        const demandSchedules = schedules.filter(s => s.demandId === d.id);
        const published = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
        return !published && (d.status === 'pending' || d.status === 'scheduled');
      })
      .map(d => d.id);
    setSelectedDemandIds(new Set(eligibleIds));
    setAiModalOpen(true);
  };

  // 获取需求完整周期的所有日期（AI推荐排班使用，不受视图限制）
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

  const runRecommendation = async () => {
    setAiModalOpen(false);
    const loadingMsg = message.loading({ content: 'AI 正在生成推荐方案...', key: 'ai-recommend', duration: 0 });

    // 只处理用户在弹窗中勾选的需求
    const pendingDemands = demands.filter(d =>
      selectedDemandIds.has(d.id)
    );

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

    // 按需求人天降序排列（大需求优先）
    const sortedDemands = [...pendingDemands].sort(
      (a, b) => Number(b.manpowerDemand) - Number(a.manpowerDemand)
    );

    const newSchedules: any[] = [];
    const loadMap = new Map<string, number>(); // key: "staffId-date", value: total%
    const unfulfilledSet = new Set<number>();
    const unfulfilledList: Array<{ product: string; shortage: number }> = [];

    // 预填充已有排班负载（排除本次要重新排班的需求），避免新排班与已发布排班冲突
    const existingSchedules = schedules.filter(s => !selectedDemandIds.has(s.demandId || 0));
    existingSchedules.forEach(s => {
      const key = `${s.staffId}-${s.date}`;
      loadMap.set(key, (loadMap.get(key) || 0) + s.percentage);
    });

    // 构建按测试类型的剩余需求映射：key = "demandId-testType"
    const remainingByType = new Map<string, number>();
    for (const demand of sortedDemands) {
      if (demand.manpowerDetails && demand.manpowerDetails.length > 0) {
        demand.manpowerDetails.forEach((d: any) => {
          remainingByType.set(`${demand.id}-${d.testType}`, Number(d.manpowerDemand));
        });
      } else {
        // 旧数据兼容：无 manpowerDetails，使用总人天
        remainingByType.set(`${demand.id}-__ALL__`, Number(demand.manpowerDemand));
      }
    }

    for (const demand of sortedDemands) {
      const demandStart = dayjs(demand.startDate);
      const demandEnd = dayjs(demand.endDate);

      // 获取需求完整周期的可用日期
      let dates = getDemandDates(demandStart, demandEnd);

      // 过滤周末（若不勾选节假日）
      if (!includeWeekends) {
        dates = dates.filter(d => ![0, 6].includes(d.day()));
      }

      // 按日期先后排序
      dates.sort((a, b) => a.unix() - b.unix());

      // 获取该需求需要的测试类型（仍有剩余人天的）
      const neededTypes = (demand.manpowerDetails || []).length > 0
        ? demand.manpowerDetails.map((d: any) => d.testType)
        : ['__ALL__'];

      for (const date of dates) {
        const dateStr = date.format('YYYY-MM-DD');

        const allAvailable = getAvailableStaffForDate(dateStr, loadMap, activeStaffs, demand.confidential);

        for (const staff of allAvailable) {
          if (staff.capacity < 10) continue;

          // 按 testType 匹配：只分配同类型员工
          const staffTestType = staff.testType;
          const matched = neededTypes.find((tt: string) => {
            if (tt === '__ALL__') return true;
            return tt === staffTestType;
          });
          if (!matched) continue;

          const typeKey = `${demand.id}-${matched}`;
          const typeRemaining = remainingByType.get(typeKey) || 0;
          if (typeRemaining <= 0.01) continue;

          // 分配 min(typeRemaining*100, 剩余容量)，不超过100
          const maxAlloc = Math.min(staff.capacity, 100);
          const alloc = Math.min(Math.round(typeRemaining * 100), maxAlloc);
          if (alloc < 10) continue;

          newSchedules.push({
            staffId: staff.id,
            demandId: demand.id,
            date: dateStr,
            percentage: alloc,
            product: demand.product,
            testManager: demand.submittedBy || 'AI推荐',
            versionType: demand.versionType,
          });

          const key = `${staff.id}-${dateStr}`;
          loadMap.set(key, (loadMap.get(key) || 0) + alloc);
          remainingByType.set(typeKey, typeRemaining - alloc / 100);
        }

        // 检查是否所有类型都已满足
        const allDone = neededTypes.every((tt: string) => (remainingByType.get(`${demand.id}-${tt}`) || 0) <= 0.01);
        if (allDone) break;
      }

      // 检查未满足情况
      const totalRemaining = neededTypes.reduce((sum: number, tt: string) =>
        sum + Math.max(0, remainingByType.get(`${demand.id}-${tt}`) || 0), 0
      );
      if (totalRemaining > 0.01) {
        unfulfilledSet.add(demand.id);
        unfulfilledList.push({
          product: demand.product,
          shortage: Math.round(totalRemaining * 10) / 10,
        });
      }
    }

    // 先清除旧排班，再批量保存新排班
    try {
      for (const demand of sortedDemands) {
        await api.deleteSchedulesByDemand(demand.id);
      }
      const savedSchedules = newSchedules.length > 0
        ? await api.createSchedulesBatch(newSchedules)
        : [];
      // 合并：其他需求已有排班 + 本次新生成的排班
      setSchedules([...existingSchedules, ...savedSchedules]);
    } catch (err: any) {
      loadingMsg();
      message.error(err.message || '保存排班失败');
      return;
    }

    setUnfulfilledDemands(unfulfilledSet);
    setUnfulfilledDetails(unfulfilledList);

    loadingMsg();

    // 自动冲突检测
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

    // 结果提示
    if (unfulfilledList.length > 0) {
      const products = unfulfilledList.map(u => `${u.product}(缺口${u.shortage}人/天)`).join('、');
      message.warning({
        content: `AI推荐完成：${newSchedules.length} 条排班，${unfulfilledList.length} 个需求未满足 — ${products}`,
        duration: 6,
      });
    } else {
      message.success(`AI推荐完成：共生成 ${newSchedules.length} 条排班记录，全部需求已满足`);
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

  const handlePublish = () => {
    const pendingCount = pendingChangeDemandIds.size;
    confirm({
      title: '确认发布排期',
      icon: <CheckCircleOutlined />,
      content: pendingCount > 0
        ? `有 ${pendingCount} 个需求存在未提交的修改，发布时将一并提交。确定要发布吗？`
        : '排期发布后将通知所有相关人员，确定要发布吗？',
      onOk: async () => {
        try {
          // 提交所有本地待处理变更
          for (const demandId of pendingChangeDemandIds) {
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
            await api.publishSchedules(demandId);
          }
          setPendingChangeDemandIds(new Set());
          message.success('排期已成功发布！相关人员已收到通知。');
          fetchData();
        } catch (err: any) {
          message.error(err.message || '发布失败');
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
        });
      }

      await api.createSchedulesBatch(newSchedules);

      setSchedules([...schedules, ...newSchedules.map((s, idx) => ({
        ...s,
        id: Date.now() + idx
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

  return (
    <div>
      {/* 顶部操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Button
              type="primary"
              icon={<RobotOutlined />}
              onClick={handleAIRecommend}
            >
              AI 推荐排班
            </Button>
            <Button
              icon={<ExclamationCircleOutlined />}
              onClick={handleConflictCheck}
            >
              冲突检测
            </Button>
          </Space>
          <Badge count={pendingChangeDemandIds.size} size="small" offset={[-4, 4]}>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handlePublish}
            >
              发布排期
            </Button>
          </Badge>
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
          message="AI推荐 — 需求未满足"
          description={
            <div>
              <div style={{ marginBottom: 4 }}>以下 {unfulfilledDetails.length} 个需求的人力无法完全满足：</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {unfulfilledDetails.map((u, i) => (
                  <li key={i}>{u.product} — 人力缺口 <strong style={{ color: '#ff4d4f' }}>{u.shortage} 人/天</strong></li>
                ))}
              </ul>
            </div>
          }
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setUnfulfilledDetails([])}
        />
      )}

      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：待排期需求列表 */}
        <Card
          title="待排期需求"
          style={{ width: 380, flexShrink: 0 }}
          bodyStyle={{ padding: 12, maxHeight: 600, overflowY: 'auto' }}
        >
          {demands.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>
              暂无待排期需求
            </div>
          ) : (
            demands.map(demand => {
              const activeStaffIds = staffs.map(s => s.id);
              const demandSchedules = schedules.filter(s => s.demandId === demand.id && activeStaffIds.includes(s.staffId));
              const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
              const remainingDays = demand.manpowerDemand - allocatedDays;
              const isPublished = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
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
                  style={{
                    padding: 12,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    marginBottom: 12,
                    cursor: 'move',
                    background: bgColor,
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}>
                    <strong style={{ fontSize: 14 }}>{demand.product}</strong>
                    <Space size={4}>
                      {demand.confidential && (
                        <Tag color="red" style={{ margin: 0 }}>保密</Tag>
                      )}
                      {pendingChangeDemandIds.has(demand.id) && (
                        <Tag color="processing" style={{ margin: 0 }}>待提交</Tag>
                      )}
                      <Tag
                        color={demand.status === 'pending' ? 'orange' : 'green'}
                        style={{ margin: 0 }}
                      >
                        {demand.status === 'pending' ? '待排期' : '已排期'}
                      </Tag>
                    </Space>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    版本号：{demand.version || '无版本号'}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#666',
                  }}>
                    <span>测试周期：{dayjs(demand.startDate).format('MM-DD')} ~ {dayjs(demand.endDate).format('MM-DD')}</span>
                    <span style={{ fontWeight: 500, color: '#1890ff' }}>
                      {demand.manpowerDemand} 人/天
                    </span>
                  </div>
                  {(() => {
                    const allocations = computeAllocationByTestType(demand);
                    const typeEntries = Object.entries(allocations);
                    if (typeEntries.length > 0) {
                      return (
                        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginTop: 6 }}>
                          <thead>
                            <tr style={{ background: '#fafafa' }}>
                              <th style={{ padding: '2px 4px', textAlign: 'left', borderBottom: '1px solid #f0f0f0' }}>类型</th>
                              <th style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>需求</th>
                              <th style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>已分配</th>
                              <th style={{ padding: '2px 4px', textAlign: 'right', borderBottom: '1px solid #f0f0f0' }}>待分配</th>
                            </tr>
                          </thead>
                          <tbody>
                            {typeEntries.map(([tt, info]: [string, any]) => {
                              const rem = Math.max(0, info.demand - info.allocated);
                              const isShort = rem > 0;
                              return (
                                <tr key={tt} style={{ borderBottom: '1px solid #fafafa' }}>
                                  <td style={{ padding: '2px 4px', color: '#1890ff', fontSize: 10 }}>{tt}</td>
                                  <td style={{ padding: '2px 4px', textAlign: 'right' }}>{info.demand.toFixed(1)}</td>
                                  <td style={{ padding: '2px 4px', textAlign: 'right', color: '#52c41a' }}>
                                    {info.allocated.toFixed(1)}
                                  </td>
                                  <td style={{ padding: '2px 4px', textAlign: 'right', color: isShort ? '#faad14' : '#999', fontWeight: isShort ? 500 : 400 }}>
                                    {rem.toFixed(1)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 500, fontSize: 11 }}>
                              <td style={{ padding: '3px 4px', borderTop: '1px solid #f0f0f0' }}>合计</td>
                              <td style={{ padding: '3px 4px', textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
                                {Number(demand.manpowerDemand || 0).toFixed(1)}
                              </td>
                              <td style={{ padding: '3px 4px', textAlign: 'right', borderTop: '1px solid #f0f0f0', color: '#52c41a' }}>
                                {allocatedDays.toFixed(1)}
                              </td>
                              <td style={{ padding: '3px 4px', textAlign: 'right', borderTop: '1px solid #f0f0f0', color: remainingDays > 0 ? '#faad14' : '#999' }}>
                                {Math.max(0, remainingDays).toFixed(1)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      );
                    }
                    // 旧数据兼容：无 manpowerDetails
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                          <span style={{ color: '#52c41a' }}>已分配：{allocatedDays.toFixed(1)} 人/天</span>
                          <span style={{ color: remainingDays > 0 ? '#faad14' : '#999' }}>
                            待分配：{remainingDays.toFixed(1)} 人/天
                          </span>
                        </div>
                        {isUnfulfilled && (
                          <div style={{ marginTop: 4, textAlign: 'right' }}>
                            <Tag color="red">人力缺口：{remainingDays.toFixed(1)} 人/天</Tag>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Tag
                        color={getVersionTypeColor(demand.versionType)}
                        style={{ margin: 0 }}
                      >
                        {demand.versionPhase || demand.versionType}
                      </Tag>
                      {isUrgent && (
                        <Tag color="red" style={{ marginLeft: 4 }}>
                          紧急
                        </Tag>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {demandSchedules.length > 0 && (
                        <Popconfirm
                          title={isPublished
                            ? '该需求存在已发布排班，清除后需点击发布按钮生效，确定清除？'
                            : '确定清除该需求的所有排班安排？'}
                          onConfirm={async (e) => {
                            e?.stopPropagation();
                            if (isPublished) {
                              // 已发布排班：仅本地清除，点击发布时统一提交
                              setSchedules(prev => prev.filter(s => s.demandId !== demand.id));
                              setPendingChangeDemandIds(prev => new Set(prev).add(demand.id));
                              message.success('已清除排班（草稿），请点击发布生效');
                            } else {
                              try {
                                await api.deleteSchedulesByDemand(demand.id);
                                message.success('已清除排班');
                                fetchData();
                              } catch (err: any) {
                                message.error(err.message || '清除失败');
                              }
                            }
                          }}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button
                            size="small"
                            danger
                            type="link"
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                          >
                            清除
                          </Button>
                        </Popconfirm>
                      )}
                      {isPublished && !pendingChangeDemandIds.has(demand.id) ? (
                        <Button size="small" type="text" disabled>已发布</Button>
                      ) : (
                        <Button
                          size="small"
                          type="link"
                          icon={<SendOutlined />}
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              if (pendingChangeDemandIds.has(demand.id)) {
                                // 有本地待提交变更：先同步到后端再发布
                                await api.deleteSchedulesByDemand(demand.id);
                                const currentSchedules = schedules.filter(s => s.demandId === demand.id);
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
                                await api.publishSchedules(demand.id);
                                setPendingChangeDemandIds(prev => {
                                  const next = new Set(prev);
                                  next.delete(demand.id);
                                  return next;
                                });
                              } else {
                                await api.publishSchedules(demand.id);
                              }
                              message.success('发布成功');
                              fetchData();
                            } catch (err: any) {
                              message.error(err.message || '发布失败');
                            }
                          }}
                        >
                          {pendingChangeDemandIds.has(demand.id) ? '提交并发布' : '发布'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
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
          style={{ flex: 1 }}
          bodyStyle={{ padding: 0, overflow: 'auto' }}
        >
          {/* 筛选控件 */}
          <div style={{ padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #f0f0f0' }}>
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
              <tr>
                <th style={{ minWidth: 60, position: 'sticky', left: 0, background: '#fafafa', zIndex: 1 }}>姓名</th>
                <th style={{ minWidth: 40, position: 'sticky', left: 60, background: '#fafafa', zIndex: 1 }}>系数</th>
                <th style={{ minWidth: 60, position: 'sticky', left: 100, background: '#fafafa', zIndex: 1 }}>测试类型</th>
                <th style={{ minWidth: 80, position: 'sticky', left: 160, background: '#fafafa', zIndex: 1 }}>熟悉模块</th>
                {weekDates.map((date, index) => {
                  const isWeekend = [0, 6].includes(date.day());
                  return (
                  <th key={date.format('YYYY-MM-DD')} style={{
                    minWidth: 70,
                    background: isWeekend ? '#fff7e6' : undefined,
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
                    left: 60,
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
                    left: 100,
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
                    left: 160,
                    background: '#fff',
                    zIndex: 1,
                    padding: '4px 2px',
                    fontSize: '11px',
                    color: '#666',
                  }}>
                    {staff.familiarModules ? (
                      <Tooltip title={staff.familiarModules}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>
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
                                options={(['AVAILABLE', 'OTHER_TASKS', 'SECONDED', 'ON_LEAVE'] as DailyAvailabilityStatus[]).map(s => ({
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
                              marginBottom: 2,
                              padding: '2px 4px',
                              position: 'relative',
                              cursor: 'grab',
                              fontSize: 11,
                            }}
                            onClick={() => handleEditSchedule(schedule)}
                            onDragStart={(e) => handleScheduleDragStart(e, schedule)}
                            onDragEnd={handleScheduleDragEnd}
                          >
                            <div
                              className="product-name"
                              style={{ color: getVersionTypeColor(schedule.versionType), fontWeight: 500, paddingRight: 18 }}
                            >
                              {schedule.product}
                            </div>
                            <div style={{ fontSize: 10, color: '#666' }}>
                              {renderPercentage(schedule.percentage)}
                            </div>
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
                        {daySchedules.length > 0 && (
                          <div style={{
                            marginTop: 4,
                            fontSize: 10,
                            color: hasConflict ? '#ff4d4f' : '#666',
                            fontWeight: hasConflict ? 600 : 400,
                          }}>
                            {totalPercent}%
                          </div>
                        )}
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
                          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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

      {/* AI 推荐排班设置 Modal */}
      <Modal
        title="AI 推荐排班设置"
        open={aiModalOpen}
        onOk={runRecommendation}
        onCancel={() => {
          setAiModalOpen(false);
          setIncludeWeekends(false);
          setSelectedDemandIds(new Set());
        }}
        okText="开始推荐"
        cancelText="取消"
        okButtonProps={{ disabled: selectedDemandIds.size === 0 }}
        width={420}
      >
        <Checkbox
          checked={includeWeekends}
          onChange={(e) => setIncludeWeekends(e.target.checked)}
        >
          节假日排班（周六、周日正常排班）
        </Checkbox>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ fontWeight: 500, marginBottom: 8 }}>
          选择待排期需求（{selectedDemandIds.size} 个已选）
        </div>
        {(() => {
          const eligibleDemands = demands.filter(d => {
            const demandSchedules = schedules.filter(s => s.demandId === d.id);
            const published = demandSchedules.length > 0 && demandSchedules.every(s => s.published);
            return !published && (d.status === 'pending' || d.status === 'scheduled');
          });
          const allEligibleIds = eligibleDemands.map(d => d.id);
          const allSelected = allEligibleIds.length > 0 && allEligibleIds.every(id => selectedDemandIds.has(id));

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

              <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 4 }}>
                {eligibleDemands.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#999', padding: 16, fontSize: 13 }}>
                    没有可排期的需求
                  </div>
                ) : (
                  eligibleDemands.map(d => {
                    const demandSchedules = schedules.filter(s => s.demandId === d.id);
                    const allocatedDays = demandSchedules.reduce((sum, s) => sum + s.percentage / 100, 0);
                    const remaining = Number(d.manpowerDemand) - allocatedDays;
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
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{d.product}</div>
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
        })()}

        <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
          将清空所选需求的已有排班并生成推荐方案。算法按需求人力降序分配，优先安排工作日和容量大的测试人员。
        </div>
      </Modal>
    </div>
  );
};

export default ScheduleWorkbench;
