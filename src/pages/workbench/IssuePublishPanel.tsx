// ============================================================
// IssuePublishPanel — 冲突警告面板
// Phase 1: 集中展示冲突警告
// 注：缺口详情已移至顶部"预计缺口"点击弹窗中展示
// ============================================================

import React from 'react';
import { Alert, Tag } from 'antd';
import type { ScheduleRecommendationResponse } from '../../types';
import type { ConflictDetail, DemandItem } from './workbenchTypes';

interface IssuePublishPanelProps {
  conflicts: ConflictDetail[];
  onDismissConflicts: () => void;
  fulfillment: ScheduleRecommendationResponse['fulfillment'];
  demands: DemandItem[];
  publishFailures: Array<{ demandId: number; reasonCode: string; reason: string }>;
}

const IssuePublishPanel: React.FC<IssuePublishPanelProps> = ({
  conflicts,
  onDismissConflicts,
  fulfillment,
  demands,
  publishFailures,
}) => {
  const fulfillmentDemandIds = new Set(fulfillment.map(item => item.demandId));
  const historicalDemands = demands.filter(demand =>
    demand.requiresHistoricalClassification === true
    && !fulfillmentDemandIds.has(demand.id));
  if (conflicts.length === 0 && fulfillment.length === 0
      && publishFailures.length === 0 && historicalDemands.length === 0) {
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
                return (
                  <div key={item.demandId} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 6 }}>
                    <strong>{demand?.product || `需求 ${item.demandId}`}</strong>
                    {item.requiresHistoricalClassification && (
                      <Tag color="warning" style={{ marginLeft: 6 }}>
                        历史排班尚未完成人力归属
                      </Tag>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(demand?.manpowerSummary || []).map(summary => {
                        const details = demand?.manpowerDetails || [];
                        const detail = details.find(candidate => candidate.testType === summary.testType);
                        const specialAllocated = (demand?.specialModuleDemands || [])
                          .filter(module => module.testType === summary.testType)
                          .reduce((sum, module) => sum + Number(module.allocatedManpower || 0), 0);
                        const generalShortage = item.generalGaps
                          .filter(gap => gap.demandManpowerDetailId === detail?.id)
                          .reduce((sum, gap) => sum + Number(gap.shortage || 0), 0);
                        const generalAllocated = Math.max(0, summary.generalManpower - generalShortage);
                        return (
                          <Tag key={summary.testType} style={{ margin: 0 }}>
                            {summary.testType}：总量 {summary.totalManpower} / 特殊 {specialAllocated} / 通用 {generalAllocated}
                          </Tag>
                        );
                      })}
                    </div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                      {item.specialModuleGaps.map(gap => {
                        const module = demand?.specialModuleDemands?.find(
                          candidate => candidate.id === gap.demandSpecialModuleId,
                        );
                        return (
                          <li key={`special-${gap.demandSpecialModuleId}`}>
                            {module?.moduleName || `特殊模块 ${gap.demandSpecialModuleId}`} 缺口 {gap.shortage}：
                            [{gap.reasonCode}] {gap.reason}
                          </li>
                        );
                      })}
                      {item.generalGaps.map(gap => {
                        const detail = demand?.manpowerDetails?.find(
                          candidate => candidate.id === gap.demandManpowerDetailId,
                        );
                        return (
                          <li key={`general-${gap.demandManpowerDetailId}`}>
                            {detail?.testType || '未分类'}通用人力 缺口 {gap.shortage}：
                            [{gap.reasonCode}] {gap.reason}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
        />
      )}
      {historicalDemands.length > 0 && (
        <Alert
          message="历史排班待归类"
          description={(
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {historicalDemands.map(demand => (
                <li key={demand.id}>
                  {demand.product}：历史排班尚未完成人力归属
                </li>
              ))}
            </ul>
          )}
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
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
        />
      )}
    </div>
  );
};

export default IssuePublishPanel;
