import {
  TestStaff,
  TestDemand,
  Schedule,
  VersionType,
  ProductInfo,
  GroupInfo,
  DashboardStats,
  ReportData,
} from '../types';
import dayjs from 'dayjs';

export const mockVersionTypes: VersionType[] = [
  { id: '1', name: '维护', color: '#1890ff', enabled: true },
  { id: '2', name: '在研', color: '#52c41a', enabled: true },
  { id: '3', name: '升级', color: '#faad14', enabled: true },
];

export const mockProducts: ProductInfo[] = [
  { id: '1', name: '电商平台', owner: '张经理', businessLine: '电商' },
  { id: '2', name: '支付系统', owner: '李经理', businessLine: '金融' },
  { id: '3', name: '用户中心', owner: '王经理', businessLine: '用户' },
  { id: '4', name: '订单系统', owner: '赵经理', businessLine: '电商' },
  { id: '5', name: '优惠券系统', owner: '钱经理', businessLine: '营销' },
];

export const mockGroups: GroupInfo[] = [
  { id: '1', name: '功能测试组', leader: '刘主管' },
  { id: '2', name: '自动化测试组', leader: '陈主管' },
  { id: '3', name: '性能测试组', leader: '周主管' },
];

export const mockStaffs: TestStaff[] = [
  {
    id: '1',
    name: '张三',
    empNo: 'TS001',
    joinDate: dayjs().subtract(8, 'month').format('YYYY-MM-DD'),
    groupName: '功能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 1.0,
    status: 'active',
  },
  {
    id: '2',
    name: '李四',
    empNo: 'TS002',
    joinDate: dayjs().subtract(6, 'month').format('YYYY-MM-DD'),
    groupName: '功能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 1.0,
    status: 'active',
  },
  {
    id: '3',
    name: '王五',
    empNo: 'TS003',
    joinDate: dayjs().subtract(3, 'month').format('YYYY-MM-DD'),
    groupName: '自动化测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 0.7,
    status: 'active',
  },
  {
    id: '4',
    name: '赵六',
    empNo: 'TS004',
    joinDate: dayjs().subtract(1, 'week').format('YYYY-MM-DD'),
    groupName: '功能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 0.3,
    status: 'active',
  },
  {
    id: '5',
    name: '钱七',
    empNo: 'TS005',
    joinDate: dayjs().subtract(2, 'week').format('YYYY-MM-DD'),
    groupName: '性能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 0.5,
    status: 'active',
  },
  {
    id: '6',
    name: '孙八',
    empNo: 'TS006',
    joinDate: dayjs().subtract(12, 'month').format('YYYY-MM-DD'),
    groupName: '自动化测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 1.0,
    status: 'active',
  },
  {
    id: '7',
    name: '周九',
    empNo: 'TS007',
    joinDate: dayjs().subtract(10, 'month').format('YYYY-MM-DD'),
    groupName: '性能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 1.0,
    status: 'active',
  },
  {
    id: '8',
    name: '吴十',
    empNo: 'TS008',
    joinDate: dayjs().subtract(4, 'month').format('YYYY-MM-DD'),
    groupName: '功能测试组',
    initialCoefficient: 0.3,
    currentCoefficient: 1.0,
    status: 'active',
  },
];

export const mockDemands: TestDemand[] = [
  {
    id: '1',
    product: '电商平台',
    version: 'v2.0.0',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(3, 'day').format('YYYY-MM-DD'),
    manpowerDemand: 12,
    versionType: '升级',
    versionPhase: '合格版本',
    description: '电商平台重大版本更新测试',
    status: 'scheduled',
    submittedBy: '张经理',
    createdAt: dayjs().subtract(2, 'day').format('YYYY-MM-DD'),
  },
  {
    id: '2',
    product: '支付系统',
    version: 'v1.5.0',
    startDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().add(4, 'day').format('YYYY-MM-DD'),
    manpowerDemand: 8,
    versionType: '维护',
    versionPhase: '月度维护',
    description: '支付系统优化回归测试',
    status: 'pending',
    submittedBy: '李经理',
    createdAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD'),
  },
  {
    id: '3',
    product: '用户中心',
    version: 'v1.2.0',
    startDate: dayjs().format('YYYY-MM-DD'),
    endDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
    manpowerDemand: 5,
    versionType: '维护',
    versionPhase: '紧急版本',
    description: '用户登录问题紧急修复验证',
    status: 'scheduled',
    submittedBy: '王经理',
    createdAt: dayjs().format('YYYY-MM-DD'),
  },
  {
    id: '4',
    product: '订单系统',
    version: 'v3.0.0',
    startDate: dayjs().add(2, 'day').format('YYYY-MM-DD'),
    endDate: dayjs().add(6, 'day').format('YYYY-MM-DD'),
    manpowerDemand: 10,
    versionType: '在研',
    versionPhase: '第三版',
    description: '订单系统重构版本测试',
    status: 'pending',
    submittedBy: '赵经理',
    createdAt: dayjs().subtract(3, 'day').format('YYYY-MM-DD'),
  },
];

export const generateSchedules = (startDate: string): Schedule[] => {
  const schedules: Schedule[] = [];
  const baseDate = dayjs(startDate);

  // 为今天和明天生成排班数据
  for (let d = 0; d < 7; d++) {
    const date = baseDate.add(d, 'day').format('YYYY-MM-DD');

    // 张三 - 电商平台
    if (d < 3) {
      schedules.push({
        id: `s1-${d}`,
        demandId: '1',
        staffId: '1',
        date,
        percentage: 100,
        product: '电商平台',
        testManager: '张经理',
        versionType: '功能测试',
      });
    }

    // 李四 - 电商平台 + 用户中心
    if (d < 2) {
      schedules.push({
        id: `s2-${d}`,
        demandId: '1',
        staffId: '2',
        date,
        percentage: 60,
        product: '电商平台',
        testManager: '张经理',
        versionType: '功能测试',
      });
      schedules.push({
        id: `s2-2-${d}`,
        demandId: '3',
        staffId: '2',
        date,
        percentage: 40,
        product: '用户中心',
        testManager: '王经理',
        versionType: '紧急修复',
      });
    }

    // 王五 - 电商平台
    if (d < 3 && d >= 1) {
      schedules.push({
        id: `s3-${d}`,
        demandId: '1',
        staffId: '3',
        date,
        percentage: 80,
        product: '电商平台',
        testManager: '张经理',
        versionType: '功能测试',
      });
    }

    // 赵六 - 用户中心
    if (d < 2) {
      schedules.push({
        id: `s4-${d}`,
        demandId: '3',
        staffId: '4',
        date,
        percentage: 50,
        product: '用户中心',
        testManager: '王经理',
        versionType: '紧急修复',
      });
    }

    // 钱七 - 电商平台
    if (d < 3 && d >= 1) {
      schedules.push({
        id: `s5-${d}`,
        demandId: '1',
        staffId: '5',
        date,
        percentage: 60,
        product: '电商平台',
        testManager: '张经理',
        versionType: '功能测试',
      });
    }

    // 孙八 - 准备支付系统测试
    if (d >= 1 && d < 4) {
      schedules.push({
        id: `s6-${d}`,
        demandId: '2',
        staffId: '6',
        date,
        percentage: 100,
        product: '支付系统',
        testManager: '李经理',
        versionType: '回归测试',
      });
    }

    // 周九 - 准备支付系统测试
    if (d >= 1 && d < 4) {
      schedules.push({
        id: `s7-${d}`,
        demandId: '2',
        staffId: '7',
        date,
        percentage: 80,
        product: '支付系统',
        testManager: '李经理',
        versionType: '回归测试',
      });
    }

    // 吴十 - 用户中心
    if (d < 2) {
      schedules.push({
        id: `s8-${d}`,
        demandId: '3',
        staffId: '8',
        date,
        percentage: 100,
        product: '用户中心',
        testManager: '王经理',
        versionType: '紧急修复',
      });
    }
  }

  return schedules;
};

export const mockSchedules = generateSchedules(dayjs().format('YYYY-MM-DD'));

export const mockDashboardStats: DashboardStats = {
  parallelProducts: 3,
  totalStaff: 8,
  workingStaff: 6,
  idleStaff: 2,
  utilizationRate: 0.75,
  versionTypeStats: [
    { name: '功能测试', avgManpower: 8.5, count: 5 },
    { name: '回归测试', avgManpower: 6.2, count: 3 },
    { name: '紧急修复', avgManpower: 4.0, count: 2 },
    { name: '性能测试', avgManpower: 5.5, count: 1 },
  ],
};

export const mockReports: ReportData[] = [
  {
    product: '电商平台',
    demandCount: 12,
    plannedManpower: 95,
    actualManpower: 88,
    differenceRate: -0.07,
    avgCycle: 3.5,
  },
  {
    product: '支付系统',
    demandCount: 8,
    plannedManpower: 52,
    actualManpower: 56,
    differenceRate: 0.08,
    avgCycle: 2.8,
  },
  {
    product: '用户中心',
    demandCount: 15,
    plannedManpower: 68,
    actualManpower: 65,
    differenceRate: -0.04,
    avgCycle: 2.2,
  },
  {
    product: '订单系统',
    demandCount: 6,
    plannedManpower: 45,
    actualManpower: 48,
    differenceRate: 0.07,
    avgCycle: 4.0,
  },
  {
    product: '优惠券系统',
    demandCount: 4,
    plannedManpower: 22,
    actualManpower: 20,
    differenceRate: -0.09,
    avgCycle: 1.8,
  },
];
