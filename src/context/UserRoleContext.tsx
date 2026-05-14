import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { useAuth } from './AuthContext';

export type UserRole = 'testManager' | 'resourceManager' | 'projectManager' | 'testExecutor' | 'fieldAdmin' | 'testLead';

const ALL_ROLES: UserRole[] = ['testManager', 'resourceManager', 'projectManager', 'testExecutor', 'fieldAdmin', 'testLead'];

function isValidRole(r: string): r is UserRole {
  return (ALL_ROLES as string[]).includes(r);
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
      const userRoles: UserRole[] = (user.roles?.length > 0
        ? user.roles.filter(isValidRole)
        : [user.role].filter(isValidRole)) as UserRole[];
      setRoles(userRoles.length > 0 ? userRoles : ['testExecutor']);
      setUserName(user.username);
    }
  }, [user]);

  // 权限矩阵
  const permissions: Record<UserRole, string[]> = {
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
      'submitSupplementRequest',
      'viewReports',
      'adjustTestCycle',
      'personalCenter',
      'scheduleManpower',
      'aiRecommendSchedule',
      'manageStaff',
      'approveRegistration',
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
