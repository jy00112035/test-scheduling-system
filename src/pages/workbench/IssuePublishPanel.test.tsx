import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IssuePublishPanel from './IssuePublishPanel';

describe('IssuePublishPanel backend fulfillment', () => {
  it('shows exact bucket gaps, reasons, group totals, and historical warning', () => {
    render(<IssuePublishPanel
      conflicts={[]}
      onDismissConflicts={vi.fn()}
      demands={[{
        id: 1001,
        product: '示例产品',
        startDate: '2026-07-22',
        endDate: '2026-07-31',
        manpowerDemand: 5,
        versionType: '维护',
        status: 'pending',
        manpowerFullySatisfied: false,
        requiresHistoricalClassification: false,
      }]}
      fulfillment={[{
        demandId: 1001,
        fullySatisfied: false,
        requiresHistoricalClassification: true,
        specialModuleGaps: [{
          demandManpowerDetailId: 301,
          demandSpecialModuleId: 501,
          shortage: 1,
          reasonCode: 'NO_QUALIFIED_STAFF',
          reason: '没有熟悉支付模块且在周期内有容量的人员',
        }],
        generalGaps: [{
          demandManpowerDetailId: 301,
          demandSpecialModuleId: null,
          shortage: 2,
          reasonCode: 'INSUFFICIENT_CAPACITY',
          reason: '通用人力可用容量不足',
        }],
        specialModules: [{
          demandManpowerDetailId: 301, demandSpecialModuleId: 501,
          moduleId: 11, moduleName: '支付模块', testType: '功能测试',
          required: 2, allocated: 1, remaining: 1,
        }],
        summary: [{
          demandManpowerDetailId: 301, testType: '功能测试', required: 5,
          specialRequired: 2, generalRequired: 3,
          specialAllocated: 1, generalAllocated: 1,
          specialRemaining: 1, generalRemaining: 2, shortage: 3,
        }],
        totalRequired: 5,
        totalAllocated: 2,
        totalShortage: 3,
        processOrder: 1,
        totalDemands: 1,
        priority: '高',
        contestedResources: [],
      }]}
      publishFailures={[{
        demandId: 1001,
        reasonCode: 'SPECIAL_MODULE_UNFULFILLED',
        reason: '支付模块仍缺少 1 人天',
      }]}
    />);

    expect(screen.getByText(/NO_QUALIFIED_STAFF/))
      .toHaveTextContent('支付模块 缺口 1： [NO_QUALIFIED_STAFF] 没有熟悉支付模块且在周期内有容量的人员');
    expect(screen.getByText(/INSUFFICIENT_CAPACITY/)).toHaveTextContent('通用人力可用容量不足');
    expect(screen.getByText(/SPECIAL_MODULE_UNFULFILLED/)).toHaveTextContent('支付模块仍缺少 1 人天');
    expect(screen.getByText('总计：需求 5 / 已分配 2 / 缺口 3')).toBeInTheDocument();
    expect(screen.getByText('功能测试：需求 5 / 特殊 1/2 / 通用 1/3 / 缺口 3')).toBeInTheDocument();
    expect(screen.getByText('支付模块：需求 2 / 已分配 1 / 缺口 1')).toBeInTheDocument();
    expect(screen.getByText(/功能测试通用人力.*缺口 2/)).toBeInTheDocument();
    expect(screen.getByText('历史排班尚未完成人力归属')).toBeInTheDocument();
  });

  it('does not reconstruct recommendation diagnostics from demand fields', () => {
    const { container } = render(<IssuePublishPanel
      conflicts={[]}
      onDismissConflicts={vi.fn()}
      fulfillment={[]}
      publishFailures={[]}
      demands={[{
        id: 1002,
        product: '历史项目',
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        manpowerDemand: 1,
        versionType: '维护',
        status: 'pending',
        manpowerFullySatisfied: false,
        requiresHistoricalClassification: true,
      }]}
    />);

    expect(container).toBeEmptyDOMElement();
  });
});
