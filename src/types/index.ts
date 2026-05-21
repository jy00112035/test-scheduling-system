export interface TestStaff {
  id: string;
  name: string;
  empNo: string;
  joinDate: string;
  groupName: string;
  initialCoefficient: number;
  currentCoefficient: number;
  status: 'active' | 'leave' | 'resigned';
}

export interface TestDemand {
  id: string;
  product: string;
  version: string;
  startDate: string;
  endDate: string;
  manpowerDemand: number;
  versionType: string;
  versionPhase: string;
  description: string;
  status: 'submitted' | 'pending' | 'scheduled' | 'completed' | 'rejected';
  submittedBy: string;
  createdAt: string;
  confidential?: boolean;
  priority?: string;
  testDeviceCount?: number;
  manpowerDetails?: DemandManpowerDetail[];
}

export interface DemandManpowerDetail {
  id?: number;
  demandId?: number;
  testType: string;
  manpowerDemand: number;
  remark?: string;
}

export interface Schedule {
  id: string;
  demandId: string;
  staffId: string;
  date: string;
  percentage: number;
  product: string;
  testManager: string;
  versionType: string;
  version?: string;
}

export interface VersionType {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
}

export interface ProductInfo {
  id: string;
  name: string;
  owner: string;
  businessLine: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  leader: string;
}

export interface DashboardStats {
  parallelProducts: number;
  totalStaff: number;
  workingStaff: number;
  idleStaff: number;
  utilizationRate: number;
  versionTypeStats: Array<{
    name: string;
    avgManpower: number;
    count: number;
  }>;
}

export interface ReportData {
  product: string;
  demandCount: number;
  plannedManpower: number;
  actualManpower: number;
  differenceRate: number;
  avgCycle: number;
}

export interface UserRole {
  role: 'testManager' | 'resourceManager' | 'projectManager' | 'testExecutor' | 'fieldAdmin' | 'testLead';
  name: string;
}

export type DailyAvailabilityStatus = 'AVAILABLE' | 'OTHER_TASKS' | 'SECONDED' | 'ON_LEAVE' | 'COMPENSATORY_LEAVE';

export interface StaffDailyStatus {
  id?: number;
  staffId: number;
  date: string;
  status: DailyAvailabilityStatus;
  percentage?: number;
}

export const DailyStatusLabels: Record<DailyAvailabilityStatus, string> = {
  AVAILABLE: '空闲',
  OTHER_TASKS: '完成其他任务',
  SECONDED: '借调其他项目组',
  ON_LEAVE: '请假',
  COMPENSATORY_LEAVE: '调休',
};

export const DailyStatusColors: Record<DailyAvailabilityStatus, string> = {
  AVAILABLE: '#ccc',
  OTHER_TASKS: '#1890ff',
  SECONDED: '#fa8c16',
  ON_LEAVE: '#ff4d4f',
  COMPENSATORY_LEAVE: '#722ed1',
};
