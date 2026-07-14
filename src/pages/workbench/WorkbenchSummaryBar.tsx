// ============================================================
// WorkbenchSummaryBar — 顶部调度总览条
// Phase 1: 展示指标 + 保留现有操作按钮
// ============================================================

import React, { useState } from 'react';
import { Card, Button, Space, Statistic, Row, Col, Tooltip } from 'antd';
import {
  CalendarOutlined,
  RobotOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined,
  UnorderedListOutlined,
  WarningOutlined,
  FileTextOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { BatchMetrics } from './workbenchTypes';

interface WorkbenchSummaryBarProps {
  metrics: BatchMetrics;
  hasDrafts: boolean;
  onDateRecommend: () => void;
  onFullAllocateRecommend: () => void;
  onConflictCheck: () => void;
  onClearAllDrafts: () => void;
  onHighRiskClick?: () => void;
  onGapClick?: () => void;
  onPublishAll?: () => void;
  publishLoading?: boolean;
}

const WorkbenchSummaryBar: React.FC<WorkbenchSummaryBarProps> = ({
  metrics,
  hasDrafts,
  onDateRecommend,
  onFullAllocateRecommend,
  onConflictCheck,
  onClearAllDrafts,
  onHighRiskClick,
  onGapClick,
  onPublishAll,
  publishLoading,
}) => {
  const [highRiskHovered, setHighRiskHovered] = useState(false);
  const [gapHovered, setGapHovered] = useState(false);

  return (
    <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: '12px 16px' }}>
      <style>{`
        @keyframes highRiskPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        .high-risk-icon-pulse {
          animation: highRiskPulse 0.8s ease-in-out infinite;
        }
      `}</style>
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
          <Tooltip title="点击查看高风险需求详情">
            <div
              onClick={onHighRiskClick}
              onMouseEnter={() => setHighRiskHovered(true)}
              onMouseLeave={() => setHighRiskHovered(false)}
              style={{
                cursor: onHighRiskClick ? 'pointer' : 'default',
                borderRadius: 8,
                padding: '4px 8px',
                margin: '-4px -8px',
                transition: 'background 0.25s ease, box-shadow 0.25s ease',
                background: highRiskHovered ? 'rgba(255, 77, 79, 0.06)' : 'transparent',
                boxShadow: highRiskHovered ? 'inset 0 0 0 1px rgba(255, 77, 79, 0.15)' : 'none',
              }}
            >
              <Statistic
                title="高风险"
                value={metrics.highRiskDemands}
                prefix={
                  <WarningOutlined
                    className={highRiskHovered ? 'high-risk-icon-pulse' : ''}
                  />
                }
                valueStyle={{ fontSize: 20, color: metrics.highRiskDemands > 0 ? '#ff4d4f' : '#52c41a' }}
              />
            </div>
          </Tooltip>
        </Col>
        <Col>
          <Tooltip title="点击查看缺口详情">
            <div
              onClick={onGapClick}
              onMouseEnter={() => setGapHovered(true)}
              onMouseLeave={() => setGapHovered(false)}
              style={{
                cursor: onGapClick ? 'pointer' : 'default',
                borderRadius: 8,
                padding: '4px 8px',
                margin: '-4px -8px',
                transition: 'background 0.25s ease, box-shadow 0.25s ease',
                background: gapHovered ? 'rgba(255, 77, 79, 0.06)' : 'transparent',
                boxShadow: gapHovered ? 'inset 0 0 0 1px rgba(255, 77, 79, 0.15)' : 'none',
              }}
            >
              <Statistic
                title="预计缺口"
                value={metrics.estimatedGapDays}
                suffix="人天"
                valueStyle={{ fontSize: 20, color: metrics.estimatedGapDays > 0 ? '#ff4d4f' : '#52c41a' }}
              />
            </div>
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
        <Tooltip title="将所有已满足且无冲突的草稿排班一键发布">
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={onPublishAll}
            loading={publishLoading}
            disabled={!hasDrafts}
          >
            发布全部待发布排班
          </Button>
        </Tooltip>
      </Space>
    </Card>
  );
};

export default WorkbenchSummaryBar;
