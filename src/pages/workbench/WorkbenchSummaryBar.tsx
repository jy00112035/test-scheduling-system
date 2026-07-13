// ============================================================
// WorkbenchSummaryBar — 顶部调度总览条
// Phase 1: 展示指标 + 保留现有操作按钮
// ============================================================

import React from 'react';
import { Card, Button, Space, Statistic, Row, Col, Tooltip } from 'antd';
import {
  CalendarOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  WarningOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type { BatchMetrics } from './workbenchTypes';

interface WorkbenchSummaryBarProps {
  metrics: BatchMetrics;
  hasDrafts: boolean;
  onDateRecommend: () => void;
  onFullAllocateRecommend: () => void;
  onConflictCheck: () => void;
  onClearAllDrafts: () => void;
}

const WorkbenchSummaryBar: React.FC<WorkbenchSummaryBarProps> = ({
  metrics,
  hasDrafts,
  onDateRecommend,
  onFullAllocateRecommend,
  onConflictCheck,
  onClearAllDrafts,
}) => {
  return (
    <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
      {/* 指标行 */}
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col>
          <Tooltip title="当前待排期的需求总数">
            <Statistic
              title="待排需求"
              value={metrics.totalPendingDemands}
              prefix={<UnorderedListOutlined />}
              valueStyle={{ fontSize: 20, color: '#1890ff' }}
            />
          </Tooltip>
        </Col>
        <Col>
          <Tooltip title="截止日期临近或已过期的需求">
            <Statistic
              title="高风险"
              value={metrics.highRiskDemands}
              prefix={<WarningOutlined />}
              valueStyle={{ fontSize: 20, color: metrics.highRiskDemands > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Tooltip>
        </Col>
        <Col>
          <Tooltip title="当前批次已勾选的需求数量（在推荐排班弹窗中选择）">
            <Statistic
              title="本批已选"
              value={metrics.selectedDemands}
              valueStyle={{ fontSize: 20, color: metrics.selectedDemands > 0 ? '#1890ff' : '#999' }}
            />
          </Tooltip>
        </Col>
        <Col>
          <Tooltip title="当前批次预计无法满足的人天总数">
            <Statistic
              title="预计缺口"
              value={metrics.estimatedGapDays}
              suffix="人天"
              valueStyle={{ fontSize: 20, color: metrics.estimatedGapDays > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Tooltip>
        </Col>
        <Col>
          <Tooltip title="当前草稿排班总条数">
            <Statistic
              title="草稿排班"
              value={metrics.draftScheduleCount}
              prefix={<FileTextOutlined />}
              valueStyle={{ fontSize: 20, color: metrics.draftScheduleCount > 0 ? '#faad14' : '#999' }}
            />
          </Tooltip>
        </Col>
        <Col>
        </Col>
      </Row>

      {/* 操作按钮行 */}
      <Space wrap>
        <Tooltip title="选择指定日期，为所有可排期需求生成推荐排班；已发布排班不受影响">
          <Button
            type="primary"
            icon={<CalendarOutlined />}
            onClick={onDateRecommend}
          >
            按指定日期排班
          </Button>
        </Tooltip>
        <Tooltip title="覆盖全部需求周期（最长90天），为所有可排期需求生成推荐排班；已发布排班不受影响">
          <Button
            icon={<RobotOutlined />}
            onClick={onFullAllocateRecommend}
          >
            按全部需求排班
          </Button>
        </Tooltip>
        <Button
          icon={<ExclamationCircleOutlined />}
          onClick={onConflictCheck}
        >
          冲突检测
        </Button>
        <Button
          danger
          icon={<DeleteOutlined />}
          onClick={onClearAllDrafts}
          disabled={!hasDrafts}
        >
          清除未发布排班
        </Button>
      </Space>
    </Card>
  );
};

export default WorkbenchSummaryBar;
