// ============================================================
// IssuePublishPanel — 缺口与发布面板
// Phase 1: 集中展示冲突警告和未满足需求分析
// ============================================================

import React from 'react';
import { Alert, Collapse } from 'antd';
import type { ConflictDetail, UnfulfilledDetail } from './workbenchTypes';

interface IssuePublishPanelProps {
  conflicts: ConflictDetail[];
  unfulfilledDetails: UnfulfilledDetail[];
  onDismissConflicts: () => void;
  onDismissUnfulfilled: () => void;
}

const IssuePublishPanel: React.FC<IssuePublishPanelProps> = ({
  conflicts,
  unfulfilledDetails,
  onDismissConflicts,
  onDismissUnfulfilled,
}) => {
  if (conflicts.length === 0 && unfulfilledDetails.length === 0) return null;

  return (
    <div style={{ flexShrink: 0 }}>
      {/* 冲突警告 */}
      {conflicts.length > 0 && (
        <Alert
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
        />
      )}

      {/* 未满足需求分析 */}
      {unfulfilledDetails.length > 0 && (
        <Alert
          message={`人力缺口 — ${unfulfilledDetails.length} 个需求未完全满足`}
          description={
            <Collapse
              size="small"
              ghost
              items={unfulfilledDetails.map((u, i) => ({
                key: String(i),
                label: (
                  <span>
                    {u.product} — 缺口{' '}
                    <strong style={{ color: '#ff4d4f' }}>{u.shortage} 人/天</strong>
                  </span>
                ),
                children: (
                  <div style={{ fontSize: 13 }}>
                    {u.reasons.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontWeight: 500, marginBottom: 4, color: '#ff4d4f' }}>
                          原因：
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {u.reasons.map((r, ri) => (
                            <li key={ri}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {u.details.length > 0 && (
                      <div>
                        <div style={{ fontWeight: 500, marginBottom: 4 }}>
                          按测试类型缺口：
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {u.details.map((d, di) => (
                            <li key={di}>
                              {d.testType}：剩余 {d.shortage} 人/天
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              }))}
            />
          }
          type="error"
          showIcon
          style={{ marginBottom: 8 }}
          closable
          onClose={onDismissUnfulfilled}
        />
      )}
    </div>
  );
};

export default IssuePublishPanel;
