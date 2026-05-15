import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { Layout, Menu, Badge } from 'antd';
import {
  DashboardOutlined,
  TableOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  UserOutlined,
  BarChartOutlined,
  SettingOutlined,
  AuditOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import TaskKanban from './pages/TaskKanban';
import StaffManagement from './pages/StaffManagement';
import ScheduleWorkbench from './pages/ScheduleWorkbench';
import Reports from './pages/Reports';
import TestDemandList from './pages/TestDemandList';
import BaseConfig from './pages/BaseConfig';
import PersonalCenter from './pages/PersonalCenter';
import RegisterPage from './pages/RegisterPage';
import ApprovalCenter from './pages/ApprovalCenter';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UserRoleProvider, useUserRole } from './context/UserRoleContext';
import UserRoleSelector from './components/UserRoleSelector';
import { api } from './services/api';

const { Header, Sider, Content } = Layout;

// 主体应用组件
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [isRegistering, setIsRegistering] = useState(false);
  const { roles, userName, hasPermission } = useUserRole();
  const [pendingRegCount, setPendingRegCount] = useState(0);
  const [pendingDemandCount, setPendingDemandCount] = useState(0);

  const fetchPendingCounts = async () => {
    try {
      if (hasPermission('approveRegistration')) {
        const regs = await api.getPendingApprovals();
        setPendingRegCount(regs.length);
      }
      if (hasPermission('approveTestDemand')) {
        const demands = await api.getPendingDemandApprovals();
        setPendingDemandCount(demands.length);
      }
    } catch {
      // ignore fetch errors
    }
  };

  useEffect(() => {
    fetchPendingCounts();
    const timer = setInterval(fetchPendingCounts, 30000);
    const handleRefresh = () => fetchPendingCounts();
    window.addEventListener('refresh-pending-counts', handleRefresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('refresh-pending-counts', handleRefresh);
    };
  }, [hasPermission]);

  // 进入审批中心时刷新计数
  useEffect(() => {
    if (selectedKey === 'approvals') {
      fetchPendingCounts();
    }
  }, [selectedKey]);

  // 根据用户角色确定默认页面
  useEffect(() => {
    if (hasPermission('viewDashboard')) {
      setSelectedKey('dashboard');
    } else if (hasPermission('viewTaskKanban')) {
      setSelectedKey('kanban');
    } else {
      setSelectedKey('demands');
    }
  }, [roles, hasPermission]);

  // 根据用户角色过滤菜单
  const menuItems = [
    {
      key: 'dashboard',
      icon: <DashboardOutlined />,
      label: '仪表盘',
      permissions: ['viewDashboard'],
    },
    {
      key: 'demands',
      icon: <FileTextOutlined />,
      label: '测试需求管理',
      permissions: ['submitTestDemand', 'viewTestDemands'],
    },
    {
      key: 'kanban',
      icon: <TableOutlined />,
      label: '任务看板',
      permissions: ['viewTaskKanban'],
    },
    {
      key: 'schedule',
      icon: <ScheduleOutlined />,
      label: '人力排布工作台',
      permissions: ['scheduleManpower', 'aiRecommendSchedule', 'manageDailyAvailability'],
    },
    {
      key: 'staff',
      icon: <UserOutlined />,
      label: '人员管理',
      permissions: ['manageStaff'],
    },
    {
      key: 'reports',
      icon: <BarChartOutlined />,
      label: '统计报表',
      permissions: ['viewReports'],
    },
    {
      key: 'config',
      icon: <SettingOutlined />,
      label: '字段配置',
      permissions: ['viewBaseConfig'],
    },
    {
      key: 'personal',
      icon: <UserOutlined />,
      label: '个人中心',
      permissions: ['personalCenter'],
    },
    {
      key: 'approvals',
      icon: <AuditOutlined />,
      label: (pendingRegCount + pendingDemandCount) > 0
        ? <Badge count={pendingRegCount + pendingDemandCount} size="small" offset={[6, 0]}><span style={{ color: '#fff' }}>审批中心</span></Badge>
        : '审批中心',
      permissions: ['approveRegistration', 'approveTestDemand'],
    },
  ].filter(item => {
    // 任务看板和个人中心对所有用户可见
    if (item.key === 'kanban' || item.key === 'personal') {
      return true;
    }
    // 其他功能需要权限验证
    return item.permissions && item.permissions.length > 0 && item.permissions.some(permission => {
      return hasPermission(permission);
    });
  });

  // 渲染页面内容
  const renderContent = () => {
    switch (selectedKey) {
      case 'dashboard':
        return <Dashboard />;
      case 'demands':
        return <TestDemandList />;
      case 'kanban':
        return <TaskKanban />;
      case 'schedule':
        return <ScheduleWorkbench />;
      case 'staff':
        return <StaffManagement />;
      case 'reports':
        return <Reports />;
      case 'config':
        return <BaseConfig />;
      case 'personal':
        return <PersonalCenter />;
      case 'approvals':
        return <ApprovalCenter pendingRegCount={pendingRegCount} pendingDemandCount={pendingDemandCount} />;
      default:
        return <Dashboard />;
    }
  };

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        加载中...
      </div>
    );
  }

  if (!isAuthenticated) {
    if (isRegistering) {
      return <RegisterPage onNavigateLogin={() => setIsRegistering(false)} />;
    }
    return <LoginPage onNavigateRegister={() => setIsRegistering(true)} />;
  }

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      <Sider
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        collapsible
        style={{ position: 'relative' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div>
            <div className="logo" style={{ padding: '16px', color: 'white', fontSize: '18px', fontWeight: '600' }}>
              {collapsed ? '排班' : '测试排班系统'}
            </div>
            <Menu
              theme="dark"
              selectedKeys={[selectedKey]}
              mode="inline"
              items={menuItems}
              onClick={({ key }) => setSelectedKey(key)}
            />
          </div>
          <div style={{ marginTop: 'auto', padding: '12px 8px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, textDecoration: 'none' }}
            >
              {collapsed ? '备案' : '陕ICP备2026011261号-1'}
            </a>
          </div>
        </div>
        <div
          onClick={() => setCollapsed(!collapsed)}
          style={{
            position: 'absolute',
            right: -12,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 24,
            height: 48,
            background: '#001529',
            borderRadius: '0 6px 6px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.65)',
            fontSize: 14,
            zIndex: 101,
            border: '1px solid rgba(255,255,255,0.1)',
            borderLeft: 'none',
          }}
        >
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </div>
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '18px', fontWeight: '500' }}>
            {menuItems.find(item => item.key === selectedKey)?.label}
          </span>
          <UserRoleSelector
            currentRoles={roles}
            currentUser={userName}
            onNavigatePersonal={() => setSelectedKey('personal')}
          />
        </Header>
        <Content style={{ margin: '16px', overflow: 'auto' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

// 主应用组件
const App: React.FC = () => {
  return (
    <AuthProvider>
      <UserRoleProvider>
        <Router>
          <AppContent />
        </Router>
      </UserRoleProvider>
    </AuthProvider>
  );
};

export default App;
