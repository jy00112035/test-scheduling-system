import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';

export type UserRole = 'testManager' | 'resourceManager' | 'projectManager' | 'testExecutor' | 'fieldAdmin' | 'testLead';

interface UserRoleContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  userName: string;
  setUserName: (name: string) => void;
  hasPermission: (permission: string) => boolean;
}

const UserRoleContext = createContext<UserRoleContextType | undefined>(undefined);

interface UserRoleProviderProps {
  children: ReactNode;
}

export const UserRoleProvider: React.FC<UserRoleProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>('testManager');
  const [userName, setUserName] = useState('');

  // 当用户登录时，从后端获取的角色同步到本地状态
  useEffect(() => {
    if (user) {
      setRole(user.role as UserRole);
      setUserName(user.username);
    }
  }, [user]);

  // 权限矩阵
  const permissions = {
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
      'approveRegistration',
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
      'scheduleManpower',
      'aiRecommendSchedule',
      'submitSupplementRequest',
      'approveTestDemand',
      'viewReports',
      'manageStaff',
      'adjustTestCycle',
      'manageBaseFields',
      'viewBaseConfig',
      'personalCenter',
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
      'personalCenter',
    ],
  };

  const hasPermission = (permission: string): boolean => {
    return permissions[role]?.includes(permission) || false;
  };

  const handleSetRole = (newRole: UserRole) => {
    setRole(newRole);
  };

  return (
    <UserRoleContext.Provider value={{
      role,
      setRole: handleSetRole,
      userName,
      setUserName,
      hasPermission,
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
