// ============================================================
// IssuePublishPanel — 冲突警告面板
// Phase 1: 集中展示冲突警告
// 注：缺口详情已移至顶部"预计缺口"点击弹窗中展示
// ============================================================

import React from 'react';
import { Alert } from 'antd';
import type { ConflictDetail } from './workbenchTypes';

interface IssuePublishPanelProps {
  conflicts: ConflictDetail[];
  onDismissConflicts: () => void;
}

const IssuePublishPanel: React.FC<IssuePublishPanelProps> = ({
  conflicts,
  onDismissConflicts,
}) => {
  if (conflicts.length === 0) return null;

  return (
    <div style={{ flexShrink: 0 }}>
      {/* 冲突警告 */}
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
    </div>
  );
};

export default IssuePublishPanel;
