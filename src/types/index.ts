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
  status: 'submitted' | 'pending' | 'scheduled' | 'completed' | 'rejected' | 'revision_pending';
  submittedBy: string;
  submittedByName?: string;
  createdAt: string;
  confidential?: boolean;
  priority?: string;
  testDeviceCount?: number;
  manpowerDetails?: DemandManpowerDetail[];
  specialModuleDemands?: DemandSpecialModule[];
  manpowerSummary?: ManpowerSummary[];
  manpowerFullySatisfied?: boolean | null;
  requiresHistoricalClassification?: boolean | null;
}

export interface RevisionRequest {
  startDate?: string;
  endDate?: string;
  product?: string;
  version?: string;
  versionType?: string;
  versionPhase?: string;
  priority?: string;
  confidential?: boolean;
  description?: string;
  testDeviceCount?: number;
  manpowerDetails?: DemandManpowerDetail[];
  specialModuleDemands?: DemandSpecialModule[];
}

export interface RevisionDiffResponse {
  demandId: number;
  status: string;
  original?: {
    startDate: string;
    endDate: string;
    manpowerDemand: number;
    manpowerDetails: DemandManpowerDetail[];
    specialModuleDemands: DemandSpecialModule[];
  };
  modified: {
    startDate: string;
    endDate: string;
    manpowerDemand: number;
    manpowerDetails: DemandManpowerDetail[];
    specialModuleDemands: DemandSpecialModule[];
  };
  changes?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  deletedSchedules?: Array<{
    id: number;
    staffName: string;
    date: string;
    percentage: number;
    reason: string;
  }>;
  submittedBy: string;
  submittedAt: string;
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
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  referenced: boolean | null;
}

export interface TestModuleWriteRequest {
  moduleName: string;
  testType: string;
  sortOrder: number;
}

export interface BatchModuleError {
  index: number;
  moduleName: string;
  error: string;
}

export interface BatchModuleResponse {
  created: TestModule[];
  errors: BatchModuleError[];
}

export interface DemandSpecialModule {
  id: number;
  demandId: number;
  moduleId: number;
  manpowerDemand: number;
  createdAt: string;
  updatedAt: string;
  moduleName: string;
  testType: string;
  enabled: boolean;
  allocatedManpower: number;
  remainingManpower: number;
}

export interface DemandSpecialModuleWriteRequest {
  moduleId: number;
  manpowerDemand: number;
}

export interface SpecialModuleDemandInput {
  moduleId?: number;
  testType: string;
  manpowerDemand?: number;
  // UI-only replacement allowance for a persisted disabled module. Never send to the API.
  historicalManpowerDemand?: number;
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

export interface ScheduleClassificationRequest {
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
  demandOfficePreferences?: Record<number, string>;
  demandOrder?: number[];
  allocationStrategy?: 'CONCENTRATE' | 'DISTRIBUTE';
}

export interface ScheduleRecommendationResponse {
  generatedSchedules: RecommendationSchedule[];
  fulfillment: Array<{
    demandId: number;
    fullySatisfied: boolean;
    requiresHistoricalClassification: boolean;
    specialModuleGaps: Array<{
      demandManpowerDetailId: number;
      demandSpecialModuleId: number;
      shortage: number;
      reasonCode: string;
      reason: string;
    }>;
    generalGaps: Array<{
      demandManpowerDetailId: number;
      demandSpecialModuleId: number | null;
      shortage: number;
      reasonCode: string;
      reason: string;
    }>;
    specialModules: SpecialModuleFulfillment[];
    summary: ManpowerFulfillmentSummary[];
    totalRequired: number;
    totalAllocated: number;
    totalShortage: number;
    processOrder: number;
    totalDemands: number;
    priority: string | null;
    contestedResources: ContestedResource[];
  }>;
}

export interface ContestedResource {
  contestedByDemandId: number;
  contestedByProduct: string;
  contestedByPriority: string;
  contestedByOrder: number;
  testType: string;
  contestedManpower: number;
}

export interface SchedulePreviewRequest {
  mode: 'FIXED_RANGE' | 'FULL_DEMAND';
  demandIds: number[];
  dateRange?: { startDate: string; endDate: string };
  fixedStaffIds?: number[];
  excludedStaffIds?: number[];
  includeSaturdays?: boolean;
  includeSundays?: boolean;
  demandOfficePreferences?: Record<number, string>;
  demandOrder?: number[];
}

export interface SchedulePreviewResponse {
  demandPreviews: DemandPreview[];
  globalWarnings: GlobalWarning[];
  sortOrder: number[];
  totalStaffCapacity: number;
  totalDemandManpower: number;
}

export interface DemandPreview {
  demandId: number;
  product: string;
  version: string;
  priority: string;
  endDate: string;
  totalManpower: number;
  estimatedAllocation: number;
  estimatedShortage: number;
  estimatedFulfilled: boolean;
  competingDemands: CompetingDemandPreview[];
}

export interface CompetingDemandPreview {
  demandId: number;
  product: string;
  priority: string;
  testType: string;
  contestedManpower: number;
  reason: string;
}

export interface GlobalWarning {
  testType: string;
  totalRequired: number;
  totalAvailable: number;
  shortage: number;
  affectedDemandIds: number[];
}

export interface SpecialModuleFulfillment {
  demandManpowerDetailId: number;
  demandSpecialModuleId: number;
  moduleId: number;
  moduleName: string;
  testType: string;
  required: number;
  allocated: number;
  remaining: number;
}

export interface ManpowerFulfillmentSummary {
  demandManpowerDetailId: number;
  testType: string;
  required: number;
  specialRequired: number;
  generalRequired: number;
  specialAllocated: number;
  generalAllocated: number;
  specialRemaining: number;
  generalRemaining: number;
  shortage: number;
}

export interface BackendSchedule {
  id: number;
  demandId: number;
  staffId: number;
  demandManpowerDetailId: number | null;
  demandSpecialModuleId: number | null;
  date: string;
  percentage: number;
  product: string | null;
  testManager: string | null;
  versionType: string | null;
  version: string | null;
  lockVersion: number;
  published: boolean | null;
  createdAt: string;
}

export interface RecommendationSchedule extends BackendSchedule {
  product: string;
  versionType: string;
  published: boolean;
}

export interface DemandFulfillment {
  demandId: number;
  fullySatisfied: boolean;
  requiresHistoricalClassification: boolean;
  specialModuleGaps: Array<{
    demandManpowerDetailId: number;
    demandSpecialModuleId: number;
    moduleId: number;
    moduleName: string;
    testType: string;
    required: number;
    allocated: number;
    shortage: number;
  }>;
  generalGaps: Array<{
    demandManpowerDetailId: number;
    demandSpecialModuleId: number | null;
    moduleId: number | null;
    moduleName: string | null;
    testType: string;
    required: number;
    allocated: number;
    shortage: number;
  }>;
  specialModules: SpecialModuleFulfillment[];
  summary: ManpowerFulfillmentSummary[];
  totalRequired: number;
  totalAllocated: number;
  totalShortage: number;
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

// ===== Feedback System =====

export type FeedbackType = 'BUG' | 'FEATURE';
export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface Feedback {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  submitterId: string;
  submitterName: string;
  status: FeedbackStatus;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackCreateRequest {
  type: FeedbackType;
  title: string;
  description: string;
}

export interface FeedbackUpdateRequest {
  status: FeedbackStatus;
  adminNote?: string;
}

export interface FeedbackQueryParams {
  type?: FeedbackType;
  status?: FeedbackStatus;
  submitterId?: string;
  page?: number;
  size?: number;
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
