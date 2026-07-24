import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';

export type UserRole = 'admin' | 'testManager' | 'resourceManager' | 'projectManager' | 'testExecutor' | 'fieldAdmin' | 'testLead';

const ALL_ROLES: UserRole[] = ['admin', 'testManager', 'resourceManager', 'projectManager', 'testExecutor', 'fieldAdmin', 'testLead'];

// 中文角色名 → 英文 code 映射（兼容数据库中旧数据）
const ROLE_ALIASES: Record<string, UserRole> = {
  '测试经理': 'testManager',
  '资源主管': 'resourceManager',
  '资源经理': 'resourceManager',
  '项目经理': 'projectManager',
  '测试执行人员': 'testExecutor',
  '字段管理员': 'fieldAdmin',
  '测试组长': 'testLead',
};

function normalizeRole(r: string): UserRole | null {
  if ((ALL_ROLES as string[]).includes(r)) return r as UserRole;
  return ROLE_ALIASES[r] || null;
}

interface UserRoleContextType {
  role: UserRole;
  roles: UserRole[];
  setRole: (role: UserRole) => void;
  userName: string;
  setUserName: (name: string) => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (roleName: string) => boolean;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

interface UserRoleProviderProps {
  children: ReactNode;
}

export const UserRoleProvider: React.FC<UserRoleProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [roles, setRoles] = useState<UserRole[]>(['testManager']);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    if (user) {
      const rawRoles = user.roles?.length > 0 ? user.roles : [user.role];
      const userRoles: UserRole[] = rawRoles
        .map(normalizeRole)
        .filter((r): r is UserRole => r !== null);
      // 去重
      const deduplicated = [...new Set(userRoles)];
      setRoles(deduplicated.length > 0 ? deduplicated : ['testExecutor']);
      setUserName(user.username);
    }
  }, [user]);

  // 权限矩阵
  const permissions: Record<UserRole, string[]> = {
    admin: [
      'viewDashboard',
      'viewTaskKanban',
      'approveRegistration',
      'approveTestDemand',
      'manageBaseFields',
      'viewBaseConfig',
      'manageStaff',
      'viewReports',
      'scheduleManpower',
      'aiRecommendSchedule',
      'manageDailyAvailability',
      'personalCenter',
    ],
    testManager: [
      'viewDashboard',
      'viewTaskKanban',
      'submitTestDemand',
      'editTestDemand',
      'deleteTestDemand',
      'closeTestDemand',
      'viewTestDemands',
      'submitSupplementRequest',
      'viewReports',
      'adjustTestCycle',
      'personalCenter',
    ],
    resourceManager: [
      'viewDashboard',
      'viewTaskKanban',
      'submitTestDemand',
      'editTestDemand',
      'deleteTestDemand',
      'closeTestDemand',
      'viewTestDemands',
      'scheduleManpower',
      'aiRecommendSchedule',
      'submitSupplementRequest',
      'viewReports',
      'manageStaff',
      'approveRegistration',  // 资源经理可审批所有测试执行人员
      'personalCenter',
    ],
    projectManager: [
      'viewDashboard',
      'viewTaskKanban',
      'submitTestDemand',
      'editTestDemand',
      'deleteTestDemand',
      'closeTestDemand',
      'viewTestDemands',
      'scheduleManpower',
      'aiRecommendSchedule',
      'approveTestDemand',
      'viewReports',
      'manageStaff',
      'approveRegistration',
      'adjustTestCycle',
      'personalCenter',
    ],
    testExecutor: [
      'viewTaskKanban',
      'personalCenter',
    ],
    fieldAdmin: [
      'viewDashboard',
      'viewTaskKanban',
      'submitTestDemand',
      'editTestDemand',
      'deleteTestDemand',
      'closeTestDemand',
      'viewTestDemands',
      'submitSupplementRequest',
      'viewReports',
      'adjustTestCycle',
      'personalCenter',
      'scheduleManpower',
      'aiRecommendSchedule',
      'manageStaff',
      'approveTestDemand',
      'manageBaseFields',
      'viewBaseConfig',
      'manageDailyAvailability',
    ],
    testLead: [
      'viewDashboard',
      'viewTaskKanban',
      'submitTestDemand',
      'editTestDemand',
      'deleteTestDemand',
      'closeTestDemand',
      'viewTestDemands',
      'viewReports',
      'manageDailyAvailability',
      'manageStaff',
      'approveRegistration',  // 新增：测试组长可以审批测试执行人员
      'personalCenter',
    ],
  };

  const hasPermission = (permission: string): boolean => {
    return roles.some(role => permissions[role]?.includes(permission));
  };

  const hasRole = (roleName: string): boolean => {
    return (roles as string[]).includes(roleName);
  };

  const role = roles.length > 0 ? roles[0] : 'testExecutor';

  const handleSetRole = (newRole: UserRole) => {
    setRoles([newRole]);
  };

  return (
    <UserRoleContext.Provider value={{
      role,
      roles,
      setRole: handleSetRole,
      userName,
      setUserName,
      hasPermission,
      hasRole,
    }}>
      {children}
    </UserRoleContext.Provider>
  );
};

export const useUserRole = (): UserRoleContextType => {
  const context = useContext(UserRoleContext);
  if (!context) {
    throw new Error('useUserRole must be used within a UserRoleProvider');
  }
  return context;
};
