import React from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Button,
  Tag,
  Space,
  Divider,
} from 'antd';
import {
  DashboardOutlined,
  TableOutlined,
  FileTextOutlined,
  ScheduleOutlined,
  UserOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserRole } from '../context/UserRoleContext';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { role } = useUserRole();

  const features = [
    {
      key: 'dashboard',
      title: '仪表盘',
      icon: <DashboardOutlined style={{ fontSize: 48, color: '#1890ff' }} />,
      description: '查看实时数据概览和关键指标',
      permissions: ['viewDashboard'],
      action: () => navigate('/dashboard'),
    },
    {
      key: 'demands',
      title: '测试需求管理',
      icon: <FileTextOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
      description: '提交、查看和管理测试需求',
      permissions: ['submitTestDemand', 'viewTestDemands'],
      action: () => navigate('/demands'),
    },
    {
      key: 'kanban',
      title: '任务看板',
      icon: <TableOutlined style={{ fontSize: 48, color: '#faad14' }} />,
      description: '查看个人任务排期',
      permissions: ['viewTaskKanban'],
      action: () => navigate('/kanban'),
    },
    {
      key: 'schedule',
      title: '人力排布工作台',
      icon: <ScheduleOutlined style={{ fontSize: 48, color: '#ff4d4f' }} />,
      description: '编排和管理测试人力',
      permissions: ['scheduleManpower'],
      action: () => navigate('/schedule'),
    },
    {
      key: 'staff',
      title: '人员管理',
      icon: <UserOutlined style={{ fontSize: 48, color: '#722ed1' }} />,
      description: '管理测试执行人员信息',
      permissions: ['manageStaff'],
      action: () => navigate('/staff'),
    },
    {
      key: 'reports',
      title: '统计报表',
      icon: <BarChartOutlined style={{ fontSize: 48, color: '#fa8c16' }} />,
      description: '查看详细的人力投入报表',
      permissions: ['viewReports'],
      action: () => navigate('/reports'),
    },
  ];

  const getRoleFeatures = () => {
    switch (role) {
      case 'testManager':
        return features.filter(f => [
          'dashboard', 'demands', 'kanban', 'reports',
        ].includes(f.key));
      case 'resourceManager':
        return features.filter(f => [
          'dashboard', 'demands', 'kanban', 'schedule', 'staff', 'reports',
        ].includes(f.key));
      case 'projectManager':
        return features.filter(f => [
          'dashboard', 'demands', 'kanban', 'schedule', 'staff', 'reports',
        ].includes(f.key));
      case 'testExecutor':
        return features.filter(f => [
          'kanban',
        ].includes(f.key));
      case 'fieldAdmin':
        return features;
      default:
        return features.filter(f => ['kanban'].includes(f.key));
    }
  };

  return (
    <div>
      {/* 欢迎横幅 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h1 style={{ fontSize: '36px', marginBottom: '16px', color: '#1890ff' }}>
            测试排班系统
          </h1>
          <p style={{ fontSize: '18px', color: '#666', marginBottom: '32px' }}>
            您的智能测试资源调度平台
          </p>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            flexWrap: 'wrap',
          }}>
            <div>
              <Statistic
                title="当前用户"
                value={role === 'testManager' ? '测试经理' :
                  role === 'resourceManager' ? '资源主管' :
                    role === 'projectManager' ? '项目经理' :
                      role === 'testExecutor' ? '测试执行人员' : '字段管理员'}
              />
            </div>
            <div>
              <Statistic
                title="可用功能"
                value={getRoleFeatures().length}
                suffix="个"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 功能导航 */}
      <Card title="功能导航">
        <Row gutter={[16, 16]}>
          {getRoleFeatures().map(feature => (
            <Col xs={24} sm={12} lg={8} xl={6} key={feature.key}>
              <Card
                hoverable
                style={{ height: '100%' }}
                bodyStyle={{ padding: '24px' }}
                onClick={feature.action}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ marginBottom: '16px' }}>
                    {feature.icon}
                  </div>
                  <h3 style={{ marginBottom: '8px', fontSize: '18px' }}>
                    {feature.title}
                  </h3>
                  <p style={{
                    fontSize: '14px',
                    color: '#666',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                  }}>
                    {feature.description}
                  </p>
                  <Button type="primary" block onClick={(e) => {
                    e.stopPropagation();
                    feature.action();
                  }}>
                    立即进入
                  </Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      {/* 角色功能说明 */}
      <Card title="角色功能说明">
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '24px' }}>
          {role === 'testManager' && (
            <div style={{ textAlign: 'center' }}>
              <h3>测试经理</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>负责提交和管理测试需求</p>
              <Divider />
              <Space wrap>
                <Tag color="blue">提交测试需求</Tag>
                <Tag color="blue">管理需求</Tag>
                <Tag color="blue">查看报表</Tag>
                <Tag color="blue">调整排期</Tag>
              </Space>
            </div>
          )}
          {role === 'resourceManager' && (
            <div style={{ textAlign: 'center' }}>
              <h3>资源主管</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>负责整体测试人力排布</p>
              <Divider />
              <Space wrap>
                <Tag color="orange">人力排布</Tag>
                <Tag color="orange">AI推荐</Tag>
                <Tag color="orange">冲突检测</Tag>
                <Tag color="orange">人员管理</Tag>
              </Space>
            </div>
          )}
          {role === 'projectManager' && (
            <div style={{ textAlign: 'center' }}>
              <h3>项目经理</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>负责项目排期决策</p>
              <Divider />
              <Space wrap>
                <Tag color="green">审批申请</Tag>
                <Tag color="green">调整周期</Tag>
                <Tag color="green">查看报表</Tag>
                <Tag color="green">人员管理</Tag>
              </Space>
            </div>
          )}
          {role === 'testExecutor' && (
            <div style={{ textAlign: 'center' }}>
              <h3>测试执行人员</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>实际执行测试任务</p>
              <Divider />
              <Space wrap>
                <Tag color="purple">查看任务看板</Tag>
                <Tag color="purple">任务执行</Tag>
              </Space>
            </div>
          )}
          {role === 'fieldAdmin' && (
            <div style={{ textAlign: 'center' }}>
              <h3>字段管理员</h3>
              <p style={{ fontSize: '14px', color: '#666' }}>系统配置和管理</p>
              <Divider />
              <Space wrap>
                <Tag color="red">系统配置</Tag>
                <Tag color="red">用户管理</Tag>
                <Tag color="red">字段配置</Tag>
                <Tag color="red">权限管理</Tag>
              </Space>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Home;
