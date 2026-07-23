import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage';
import { api } from '../services/api';

describe('RegisterPage', () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads registration-safe test types and renders real selector options', async () => {
    const getRegistrationTestTypes = vi.fn().mockResolvedValue(['功能测试', '性能测试']);
    (api as unknown as { getRegistrationTestTypes: typeof getRegistrationTestTypes })
      .getRegistrationTestTypes = getRegistrationTestTypes;
    const getFieldConfigs = vi.spyOn(api, 'getFieldConfigs').mockRejectedValue(
      new Error('generic field config must not be used by registration'),
    );
    const user = userEvent.setup();

    render(<RegisterPage onNavigateLogin={vi.fn()} />);

    await waitFor(() => expect(getRegistrationTestTypes).toHaveBeenCalledTimes(1));
    expect(getFieldConfigs).not.toHaveBeenCalled();

    await user.click(screen.getByRole('combobox', { name: '角色' }));
    await user.click(await screen.findByText(/测试执行人员（测试组长\/资源经理审批）/));
    await user.click(screen.getByRole('combobox', { name: '测试类型' }));

    expect(await screen.findByRole('option', { name: '功能测试' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '性能测试' })).toBeInTheDocument();
  });
});
