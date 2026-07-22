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
  specialModuleDemands?: DemandSpecialModule[];
  manpowerSummary?: ManpowerSummary[];
  manpowerFullySatisfied?: boolean;
}

export interface DemandManpowerDetail {
  id?: number;
  demandId?: number;
  testType: string;
  manpowerDemand: number;
  remark?: string;
}

export interface TestModule {
  id: number;
  moduleName: string;
  testType: string;
  enabled: boolean;
  sortOrder: number;
  lockVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  referenced?: boolean;
}

export interface TestModuleWriteRequest {
  moduleName: string;
  testType: string;
  sortOrder: number;
}

export interface DemandSpecialModule {
  id: number;
  demandId: number;
  moduleId: number;
  manpowerDemand: number;
  createdAt: string;
  updatedAt: string;
  moduleName: string | null;
  testType: string | null;
  enabled: boolean | null;
  allocatedManpower: number | null;
  remainingManpower: number | null;
}

export interface DemandSpecialModuleWriteRequest {
  moduleId: number;
  manpowerDemand: number;
}

export interface ManpowerSummary {
  testType: string;
  totalManpower: number;
  specialManpower: number;
  generalManpower: number;
}

export interface FamiliarModule extends TestModule {}

export interface ScheduleWriteRequest {
  demandId: number;
  staffId: number;
  date: string;
  percentage: number;
  demandManpowerDetailId: number;
  demandSpecialModuleId?: number | null;
}

export interface ScheduleRecommendationRequest {
  mode: 'FIXED_RANGE' | 'FULL_DEMAND';
  demandIds: number[];
  dateRange?: { startDate: string; endDate: string };
  fixedStaffIds?: number[];
  excludedStaffIds?: number[];
  includeSaturdays?: boolean;
  includeSundays?: boolean;
  replaceExistingDrafts?: boolean;
}

export interface ScheduleRecommendationResponse {
  generatedSchedules: BackendSchedule[];
  fulfillment: Array<{
    demandId: number | null;
    fullySatisfied: boolean;
    requiresHistoricalClassification: boolean;
    specialModuleGaps: Array<{
      demandManpowerDetailId: number | null;
      demandSpecialModuleId: number | null;
      shortage: number | null;
      reasonCode: string | null;
      reason: string | null;
    }>;
    generalGaps: Array<{
      demandManpowerDetailId: number | null;
      demandSpecialModuleId: number | null;
      shortage: number | null;
      reasonCode: string | null;
      reason: string | null;
    }>;
  }>;
}

export interface BackendSchedule {
  id: number;
  demandId: number | null;
  staffId: number | null;
  demandManpowerDetailId: number | null;
  demandSpecialModuleId: number | null;
  date: string | null;
  percentage: number | null;
  product: string | null;
  testManager: string | null;
  versionType: string | null;
  version: string | null;
  lockVersion: number | null;
  published: boolean | null;
  createdAt: string | null;
}

export interface DemandFulfillment {
  demandId: number | null;
  fullySatisfied: boolean;
  requiresHistoricalClassification: boolean;
  specialModuleGaps: Array<{
    demandManpowerDetailId: number | null;
    demandSpecialModuleId: number | null;
    moduleId: number | null;
    moduleName: string | null;
    testType: string | null;
    required: number | null;
    allocated: number | null;
    shortage: number | null;
  }>;
  generalGaps: Array<{
    demandManpowerDetailId: number | null;
    demandSpecialModuleId: number | null;
    moduleId: number | null;
    moduleName: string | null;
    testType: string | null;
    required: number | null;
    allocated: number | null;
    shortage: number | null;
  }>;
  summary: Array<{
    demandManpowerDetailId: number | null;
    testType: string | null;
    required: number | null;
    specialRequired: number | null;
    generalRequired: number | null;
    specialAllocated: number | null;
    generalAllocated: number | null;
    shortage: number | null;
  }>;
  totalRequired: number | null;
  totalAllocated: number | null;
  totalShortage: number | null;
}

export interface BatchPublishResponse {
  success: Array<{ demandId: number; scheduleCount: number }>;
  failed: Array<{ demandId: number; reasonCode: string; reason: string }>;
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
