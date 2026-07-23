import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestDemandList from './TestDemandList';
import api from '../services/api';
import type { TestDemand } from '../types';

function demand(status: TestDemand['status']): TestDemand {
  return {
    id: '7',
    product: `产品-${status}`,
    version: 'v1',
    startDate: '2026-08-01T00:00:00',
    endDate: '2026-08-02T00:00:00',
    manpowerDemand: 1,
    versionType: '功能版本',
    versionPhase: '测试中',
    description: '',
    status,
    submittedBy: '测试经理',
    createdAt: '2026-07-01T00:00:00',
  };
}

describe('TestDemandList lifecycle actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    });
    const nativeGetComputedStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      (element, pseudoElement) => nativeGetComputedStyle(element, pseudoElement ? null : pseudoElement),
    );
  });

  it.each(['pending', 'rejected', 'completed'] as const)(
    'does not render close for %s demands',
    async (status) => {
      vi.spyOn(api, 'getDemands').mockResolvedValue([demand(status)]);

      render(<BrowserRouter><TestDemandList /></BrowserRouter>);

      expect(await screen.findByText(`产品-${status}`)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /关闭/ })).not.toBeInTheDocument();
    },
  );

  it('renders close only for scheduled demands', async () => {
    vi.spyOn(api, 'getDemands').mockResolvedValue([demand('scheduled')]);

    render(<BrowserRouter><TestDemandList /></BrowserRouter>);

    expect(await screen.findByText('产品-scheduled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /关闭/ })).toBeInTheDocument();
  });
});
