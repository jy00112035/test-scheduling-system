import React, { useState } from 'react';
import { Avatar, Dropdown, Menu, message, Tag } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { UserRole } from '../context/UserRoleContext';
import { useAuth } from '../context/AuthContext';

interface UserRoleSelectorProps {
  currentRoles: UserRole[];
  currentUser: string;
  onNavigatePersonal?: () => void;
}

const UserRoleSelector: React.FC<UserRoleSelectorProps> = ({
  currentRoles,
  currentUser,
  onNavigatePersonal,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useAuth();

  const roleDefs: { value: UserRole; label: string; color: string }[] = [
    { value: 'testManager', label: '测试经理', color: 'blue' },
    { value: 'testLead', label: '测试组长', color: 'cyan' },
    { value: 'resourceManager', label: '资源主管', color: 'orange' },
    { value: 'projectManager', label: '项目经理', color: 'green' },
    { value: 'testExecutor', label: '测试执行人员', color: 'purple' },
    { value: 'fieldAdmin', label: '字段管理员', color: 'red' },
  ];

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    message.success('已退出登录');
  };

  const primaryRole = currentRoles[0];
  const primaryInfo = roleDefs.find(r => r.value === primaryRole);

  const userMenu = (
    <Menu>
      <Menu.Item key="profile" disabled>
        <div style={{ padding: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {currentUser}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
            {currentRoles.map(r => {
              const def = roleDefs.find(d => d.value === r);
              return <Tag key={r} color={def?.color}>{def?.label || r}</Tag>;
            })}
          </div>
        </div>
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="personal" onClick={() => { onNavigatePersonal?.(); setIsOpen(false); }}>
        <UserOutlined />
        个人中心
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="logout" onClick={handleLogout} danger>
        <LogoutOutlined />
        退出登录
      </Menu.Item>
    </Menu>
  );

  const roleLabel = currentRoles
    .map(r => {
      const def = roleDefs.find(d => d.value === r);
      return def?.label || r;
    })
    .join(' / ');

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
        maxWidth: 200,
      }}>
        <Avatar
          size="small"
          style={{
            backgroundColor: primaryInfo?.color,
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
            {roleLabel}
          </span>
        </div>
      </div>
    </Dropdown>
  );
};

export default UserRoleSelector;