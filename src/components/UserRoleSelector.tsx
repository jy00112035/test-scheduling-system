import React, { useState } from 'react';
import { Avatar, Dropdown, Menu, message } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { UserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';

interface UserRoleSelectorProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  currentUser: string;
  onNavigatePersonal?: () => void;
}

const UserRoleSelector: React.FC<UserRoleSelectorProps> = ({
  currentRole,
  onRoleChange,
  currentUser,
  onNavigatePersonal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useAuth();

  const roles: { value: UserRole; label: string; color: string }[] = [
    { value: 'testManager', label: '测试经理', color: 'blue' },
    { value: 'testLead', label: '测试组长', color: 'cyan' },
    { value: 'resourceManager', label: '资源主管', color: 'orange' },
    { value: 'projectManager', label: '项目经理', color: 'green' },
    { value: 'testExecutor', label: '测试执行人员', color: 'purple' },
    { value: 'fieldAdmin', label: '字段管理员', color: 'red' },
  ];

  const handleRoleChange = (role: UserRole) => {
    onRoleChange(role);
    setIsOpen(false);
    message.success(`已切换为${roles.find(r => r.value === role)?.label}`);
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    message.success('已退出登录');
  };

  const userMenu = (
    <Menu>
      <Menu.Item key="profile">
        <div style={{ padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {currentUser}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>
            {roles.find(r => r.value === currentRole)?.label}
          </div>
        </div>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="personal" onClick={() => { onNavigatePersonal?.(); setIsOpen(false); }}>
        <UserOutlined />
        个人中心
      </Menu.Item>
      <Menu.Divider />
      {roles.map(role => (
        <Menu.Item
          key={role.value}
          onClick={() => handleRoleChange(role.value)}
          style={{ color: role.color }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: role.color,
            }} />
            {role.label}
          </div>
        </Menu.Item>
      ))}
      <Menu.Divider />
      <Menu.Item key="logout" onClick={handleLogout} danger>
        <LogoutOutlined />
        退出登录
      </Menu.Item>
    </Menu>
  );

  const currentRoleInfo = roles.find(r => r.value === currentRole);

  return (
    <Dropdown
      overlay={userMenu}
      trigger={['click']}
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div className="user-role-selector" style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 4,
        transition: 'background-color 0.2s',
        maxWidth: 180,
      }}>
        <Avatar
          size="small"
          style={{
            backgroundColor: currentRoleInfo?.color,
            verticalAlign: 'middle',
            flexShrink: 0,
          }}
          icon={<UserOutlined />}
        />
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          fontSize: 12,
          overflow: 'hidden',
        }}>
          <span style={{
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}>{currentUser}</span>
          <span style={{
            fontSize: 10,
            color: '#666',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.3,
          }}>
            {currentRoleInfo?.label}
          </span>
        </div>
      </div>
    </Dropdown>
  );
};

export default UserRoleSelector;
