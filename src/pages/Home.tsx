import React, { ReactNode } from 'react';
import { Button, Col, Row, Space, Tag } from 'antd';
import {
  AuditOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  HomeOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SettingOutlined,
  TableOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserRole, UserRole } from '../context/UserRoleContext';

type HomePageKey =
  | 'dashboard'
  | 'demands'
  | 'kanban'
  | 'schedule'
  | 'staff'
  | 'reports'
  | 'config'
  | 'approvals'
  | 'personal';

interface HomeProps {
  onNavigate?: (key: HomePageKey) => void;
}

interface HomeFeature {
  key: HomePageKey;
  title: string;
  description: string;
  meta: string;
  icon: ReactNode;
  tone: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'cyan' | 'gray';
  permissions: string[];
  priority: number;
}

const roleNames: Record<UserRole, string> = {
  testManager: '测试经理',
  resourceManager: '资源主管',
  projectManager: '项目经理',
  testExecutor: '测试执行人员',
  fieldAdmin: '字段管理员',
  testLead: '测试组长',
};

const roleProfiles: Record<UserRole, { summary: string; tags: string[]; tone: string }> = {
  testManager: {
    summary: '负责需求提交、进度管理与测试闭环',
    tags: ['提交需求', '关闭需求', '查看报表', '调整周期'],
    tone: 'blue',
  },
  resourceManager: {
    summary: '统筹测试资源，处理排班冲突与人员配置',
    tags: ['人力排布', 'AI 推荐', '冲突检测', '人员管理'],
    tone: 'orange',
  },
  projectManager: {
    summary: '负责排期决策、审批与周期协调',
    tags: ['审批申请', '调整周期', '查看报表', '人员管理'],
    tone: 'green',
  },
  testExecutor: {
    summary: '查看个人任务安排并按计划执行测试',
    tags: ['任务看板', '任务执行'],
    tone: 'purple',
  },
  fieldAdmin: {
    summary: '维护产品、版本类型、小组与系数规则',
    tags: ['字段配置', '权限管理', '基础数据', '系统配置'],
    tone: 'red',
  },
  testLead: {
    summary: '跟进小组执行情况，维护人员状态',
    tags: ['组内看板', '人员状态', '需求管理', '报表查看'],
    tone: 'cyan',
  },
};

const allFeatures: HomeFeature[] = [
  {
    key: 'schedule',
    title: '人力排布工作台',
    description: '拖拽分配人员、调整百分比并检测资源冲突。',
    meta: '资源调度',
    icon: <ScheduleOutlined />,
    tone: 'red',
    permissions: ['scheduleManpower', 'aiRecommendSchedule', 'manageDailyAvailability'],
    priority: 1,
  },
  {
    key: 'dashboard',
    title: '仪表盘',
    description: '查看并行产品、今日人力和利用率趋势。',
    meta: '实时概览',
    icon: <DashboardOutlined />,
    tone: 'blue',
    permissions: ['viewDashboard'],
    priority: 2,
  },
  {
    key: 'demands',
    title: '测试需求管理',
    description: '提交、查看、审批前流转并关闭测试需求。',
    meta: '需求流转',
    icon: <FileTextOutlined />,
    tone: 'green',
    permissions: ['submitTestDemand', 'viewTestDemands'],
    priority: 3,
  },
  {
    key: 'kanban',
    title: '任务看板',
    description: '按周查看人员任务、产品版本和投入比例。',
    meta: '执行视图',
    icon: <TableOutlined />,
    tone: 'amber',
    permissions: ['viewTaskKanban'],
    priority: 4,
  },
  {
    key: 'staff',
    title: '人员管理',
    description: '维护执行人员、入职日期和生效人力系数。',
    meta: '人员资产',
    icon: <UserOutlined />,
    tone: 'purple',
    permissions: ['manageStaff'],
    priority: 5,
  },
  {
    key: 'reports',
    title: '统计报表',
    description: '按产品、周期和版本类型分析计划与实际投入。',
    meta: '数据分析',
    icon: <BarChartOutlined />,
    tone: 'cyan',
    permissions: ['viewReports'],
    priority: 6,
  },
  {
    key: 'approvals',
    title: '审批中心',
    description: '处理注册审批、测试需求审批与补充申请。',
    meta: '流程审批',
    icon: <AuditOutlined />,
    tone: 'blue',
    permissions: ['approveRegistration', 'approveTestDemand'],
    priority: 7,
  },
  {
    key: 'config',
    title: '字段配置',
    description: '配置产品、版本类型、小组和系数规则。',
    meta: '基础配置',
    icon: <SettingOutlined />,
    tone: 'gray',
    permissions: ['viewBaseConfig', 'manageBaseFields'],
    priority: 8,
  },
];

const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { roles, userName, hasPermission } = useUserRole();

  const availableFeatures = allFeatures
    .filter(feature => feature.permissions.some(permission => hasPermission(permission)))
    .sort((a, b) => a.priority - b.priority);

  const currentRoleText = roles.length > 1
    ? `${roles.length} 个角色`
    : roleNames[roles[0]] || '测试执行人员';

  const primaryFeature = availableFeatures.find(feature => feature.key === 'schedule')
    || availableFeatures.find(feature => feature.key === 'dashboard')
    || availableFeatures.find(feature => feature.key === 'kanban')
    || availableFeatures[0];

  const handleNavigate = (key: HomePageKey) => {
    if (onNavigate) {
      onNavigate(key);
      return;
    }
    navigate(`/${key}`);
  };

  const visibleRoleProfiles = roles
    .map(role => ({ role, ...roleProfiles[role] }))
    .filter(Boolean);

  return (
    <div className="home-page">
      <section className="home-hero">
        <div className="home-hero-content">
          <div className="home-hero-copy">
            <div className="home-eyebrow">
              <HomeOutlined />
              <span>SMART QA SCHEDULING</span>
            </div>
            <h1>测试排班系统</h1>
            <p>
              面向测试团队的智能资源调度门户，将需求、人力、排期和统计沉淀在一个可视化工作台里。
            </p>
            <Space size={12} wrap className="home-hero-actions">
              {primaryFeature && (
                <Button
                  type="primary"
                  size="large"
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleNavigate(primaryFeature.key)}
                >
                  进入{primaryFeature.title}
                </Button>
              )}
              {hasPermission('viewTaskKanban') && (
                <Button
                  size="large"
                  ghost
                  icon={<TableOutlined />}
                  onClick={() => handleNavigate('kanban')}
                >
                  查看任务看板
                </Button>
              )}
            </Space>
          </div>

          <div className="home-command-panel" aria-label="资源调度概览">
            <div className="home-command-header">
              <div>
                <span>今日调度概览</span>
                <strong>{userName || '当前用户'}</strong>
              </div>
              <Tag color="processing">{currentRoleText}</Tag>
            </div>

            <div className="home-metrics-grid">
              <div className="home-glass-metric">
                <span>可用功能</span>
                <strong>{availableFeatures.length}</strong>
                <small>按当前权限开放</small>
              </div>
              <div className="home-glass-metric">
                <span>当前身份</span>
                <strong>{roles.length}</strong>
                <small>{currentRoleText}</small>
              </div>
              <div className="home-glass-metric wide">
                <span>优先入口</span>
                <strong>{primaryFeature?.title || '任务看板'}</strong>
                <small>系统会按权限推荐下一步</small>
              </div>
            </div>

            <div className="home-schedule-preview">
              <div className="home-preview-title">
                <SafetyCertificateOutlined />
                <span>排期健康度</span>
                <b>稳定</b>
              </div>
              <div className="home-preview-bars">
                <i className="bar green" />
                <i className="bar blue" />
                <i className="bar amber" />
                <i className="bar coral" />
                <i className="bar cyan" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <div>
            <span>FUNCTIONS</span>
            <h2>工作入口</h2>
          </div>
          <p>按你的角色权限展示可进入的模块。</p>
        </div>

        <Row gutter={[16, 16]}>
          {availableFeatures.map(feature => (
            <Col xs={24} sm={12} xl={8} key={feature.key}>
              <button
                type="button"
                className={`home-feature-card tone-${feature.tone}`}
                onClick={() => handleNavigate(feature.key)}
              >
                <span className="home-feature-icon">{feature.icon}</span>
                <span className="home-feature-main">
                  <span className="home-feature-meta">{feature.meta}</span>
                  <strong>{feature.title}</strong>
                  <span>{feature.description}</span>
                </span>
                <RightOutlined className="home-feature-arrow" />
              </button>
            </Col>
          ))}
        </Row>
      </section>

      <section className="home-section">
        <div className="home-section-heading">
          <div>
            <span>ROLE ACCESS</span>
            <h2>角色能力</h2>
          </div>
          <p>当前账号的职责和关键操作。</p>
        </div>

        <div className="home-role-grid">
          {visibleRoleProfiles.map(profile => (
            <article className="home-role-panel" key={profile.role}>
              <div>
                <Tag color={profile.tone}>{roleNames[profile.role]}</Tag>
                <p>{profile.summary}</p>
              </div>
              <Space wrap size={[8, 8]}>
                {profile.tags.map(tag => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </Space>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Home;
