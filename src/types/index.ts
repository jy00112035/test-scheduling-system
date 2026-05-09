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
  role: 'testManager' | 'resourceManager' | 'projectManager' | 'testExecutor' | 'fieldAdmin';
  name: string;
}
