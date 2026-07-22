import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemandApproval from './DemandApproval';
import api from '../services/api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const demand = (id: number, product: string) => ({
  id, product, version: 'v1', versionType: '功能', startDate: '2026-08-01T00:00:00',
  endDate: '2026-08-02T00:00:00', manpowerDemand: 2, priority: '高', specialModuleDemands: [],
  manpowerDetails: [{ testType: '功能测试', manpowerDemand: 2, remark: `${product}备注` }],
});

describe('DemandApproval edit loading', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = (query: string) => ({
      matches: false, media: query, onchange: null, addListener: () => undefined, removeListener: () => undefined,
      addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => false,
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) =>
      nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement));
  });

  it('keeps the newest demand detail session when an older request resolves last', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    vi.spyOn(api, 'getPendingDemandApprovals').mockResolvedValue([demand(1, '需求A'), demand(2, '需求B')]);
    vi.spyOn(api, 'getFieldConfigs').mockResolvedValue([
      { fieldName: 'testType', options: '功能测试' }, { fieldName: 'priority', options: '高,中' },
    ]);
    vi.spyOn(api, 'getTestModules').mockResolvedValue([]);
    vi.spyOn(api, 'getDemand').mockImplementation((id: number) => id === 1 ? first.promise : second.promise);

    render(<DemandApproval />);
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole('button', { name: /修改后批准/ });
    await user.click(buttons[0]);
    await user.click(buttons[1]);
    second.resolve(demand(2, '需求B'));

    const modal = await screen.findByRole('dialog');
    expect(modal).toHaveTextContent('需求B');
    first.resolve(demand(1, '需求A'));
    expect(modal).not.toHaveTextContent('需求A');
  });
});
