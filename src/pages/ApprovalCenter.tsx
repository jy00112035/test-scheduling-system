import React from 'react';
import { Tabs, Badge } from 'antd';
import { AuditOutlined, FileTextOutlined } from '@ant-design/icons';
import { useUserRole } from '../context/UserRoleContext';
import RegistrationApproval from './RegistrationApproval';
import DemandApproval from './DemandApproval';

interface Props {
  pendingRegCount?: number;
  pendingDemandCount?: number;
}

const ApprovalCenter: React.FC<Props> = ({ pendingRegCount = 0, pendingDemandCount = 0 }) => {
  const { hasPermission } = useUserRole();

  const showRegistration = hasPermission('approveRegistration');
  const showDemand = hasPermission('approveTestDemand');

  const tabItems: { key: string; label: React.ReactNode; children: React.ReactNode }[] = [];

  if (showRegistration) {
    tabItems.push({
      key: 'registration',
      label: (
        <Badge count={pendingRegCount} size="small" offset={[6, 0]}>
          <span><AuditOutlined /> 注册审批</span>
        </Badge>
      ),
      children: <RegistrationApproval />,
    });
  }

  if (showDemand) {
    tabItems.push({
      key: 'demand',
      label: (
        <Badge count={pendingDemandCount} size="small" offset={[6, 0]}>
          <span><FileTextOutlined /> 需求审批</span>
        </Badge>
      ),
      children: <DemandApproval />,
    });
  }

  if (tabItems.length === 0) {
    return <div>无审批权限</div>;
  }

  if (tabItems.length === 1) {
    return tabItems[0].children;
  }

  return <Tabs items={tabItems} />;
};

export default ApprovalCenter;
