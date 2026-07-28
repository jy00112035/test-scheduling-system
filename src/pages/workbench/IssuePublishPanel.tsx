// ============================================================
// IssuePublishPanel — 冲突警告面板
// Phase 1: 集中展示冲突警告
// 注：缺口详情已移至顶部"预计缺口"点击弹窗中展示
// ============================================================

import React from 'react';
import { Alert, Tag, Collapse } from 'antd';
import type { ScheduleRecommendationResponse } from '../../types';
import type { ConflictDetail, DemandItem } from './workbenchTypes';
import { getPriorityColor } from './workbenchCalculations';

interface IssuePublishPanelProps {
  conflicts: ConflictDetail[];
  onDismissConflicts: () => void;
  fulfillment: ScheduleRecommendationResponse['fulfillment'];
  demands: DemandItem[];
  publishFailures: Array<{ demandId: number; reasonCode: string; reason: string }>;
  onDismissFulfillment?: () => void;
  onDismissPublishFailures?: () => void;
}

const IssuePublishPanel: React.FC<IssuePublishPanelProps> = ({
  conflicts,
  onDismissConflicts,
  fulfillment,
  demands,
  publishFailures,
  onDismissFulfillment,
  onDismissPublishFailures,
}) => {
  if (conflicts.length === 0 && fulfillment.length === 0
      && publishFailures.length === 0) {
    return null;
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* 冲突警告 */}
      {conflicts.length > 0 && <Alert
        message={`排班冲突 — ${conflicts.length} 项`}
        description={
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {conflicts.map((c, idx) => (
                <li key={idx} style={{ fontSize: 12 }}>
                  <strong>{c.staffName}</strong> {c.date}：
                  分配 {c.totalPercent}%，超过上限 {c.maxCapacityPercent}%
                </li>
              ))}
            </ul>
          </div>
        }
        type="warning"
        showIcon
        style={{ marginBottom: 8 }}
        closable
        onClose={onDismissConflicts}
      />}
      {fulfillment.length > 0 && (
        <Alert
          message={`人力满足情况 — ${fulfillment.length} 项`}
          description={(
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'grid', gap: 8 }}>
              {fulfillment.map(item => {
                const demand = demands.find(candidate => candidate.id === item.demandId);
                const priorityColor = getPriorityColor(item.priority || '', []);
                return (
                  <div key={item.demandId} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <Tag color="default" style={{ fontFamily: 'monospace', margin: 0 }}>
                        #{item.processOrder}/{item.totalDemands}
                      </Tag>
                      {item.priority && (
                        <Tag color={priorityColor} style={{ margin: 0 }}>{item.priority}</Tag>
                      )}
                      <strong>{demand?.product || `需求 ${item.demandId}`}</strong>
                      {item.requiresHistoricalClassification && (
                        <Tag color="warning" style={{ marginLeft: 0 }}>
                          历史排班尚未完成人力归属
                        </Tag>
                      )}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      总计：需求 {item.totalRequired} / 已分配 {item.totalAllocated} / 缺口 {item.totalShortage}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {item.summary.map(summary => (
                        <Tag key={summary.demandManpowerDetailId} style={{ margin: 0 }}>
                          {summary.testType}：需求 {summary.required} / 特殊 {summary.specialAllocated}/{summary.specialRequired}
                          {' / '}通用 {summary.generalAllocated}/{summary.generalRequired} / 缺口 {summary.shortage}
                        </Tag>
                      ))}
                      {item.specialModules.map(module => (
                        <Tag key={module.demandSpecialModuleId} color="blue" style={{ margin: 0 }}>
                          {module.moduleName}：需求 {module.required} / 已分配 {module.allocated} / 缺口 {module.remaining}
                        </Tag>
                      ))}
                    </div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {item.specialModuleGaps.map(gap => {
                        const module = item.specialModules.find(
                          candidate => candidate.demandSpecialModuleId === gap.demandSpecialModuleId,
                        );
                        return (
                          <li key={`special-${gap.demandSpecialModuleId}`}>
                            {module?.moduleName || `特殊模块 ${gap.demandSpecialModuleId}`} 缺口 {gap.shortage}：
                            [{gap.reasonCode}] {gap.reason}
                          </li>
                        );
                      })}
                      {item.generalGaps.map(gap => {
                        const detail = item.summary.find(
                          candidate => candidate.demandManpowerDetailId === gap.demandManpowerDetailId,
                        );
                        return (
                          <li key={`general-${gap.demandManpowerDetailId}`}>
                            {detail?.testType || '未分类'}通用人力 缺口 {gap.shortage}：
                            [{gap.reasonCode}] {gap.reason}
                          </li>
                        );
                      })}
                    </ul>
                    {item.contestedResources && item.contestedResources.length > 0 && (
                      <Collapse
                        ghost
                        size="small"
                        items={[{
                          key: 'contested',
                          label: <span style={{ fontSize: 12, color: '#faad14' }}>
                            ⚠️ 资源竞争追溯（{item.contestedResources.length} 项）
                          </span>,
                          children: (
                            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12 }}>
                              {item.contestedResources.map((cr, idx) => (
                                <li key={idx}>
                                  需求「{cr.contestedByProduct}」
                                  <Tag color={getPriorityColor(cr.contestedByPriority, [])} style={{ margin: '0 4px', fontSize: 11 }}>
                                    {cr.contestedByPriority}
                                  </Tag>
                                  (#{cr.contestedByOrder}) 优先处理，占用了 {cr.testType} 人员 {cr.contestedManpower} 人天
                                </li>
                              ))}
                            </ul>
                          ),
                        }]}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          closable
          onClose={onDismissFulfillment}
        />
      )}
      {publishFailures.length > 0 && (
        <Alert
          message="发布失败"
          description={(
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {publishFailures.map(failure => (
                <li key={failure.demandId}>
                  [{failure.reasonCode}] {failure.reason}
                </li>
              ))}
            </ul>
          )}
          type="error"
          showIcon
          closable
          onClose={onDismissPublishFailures}
        />
      )}
    </div>
  );
};

export default IssuePublishPanel;
