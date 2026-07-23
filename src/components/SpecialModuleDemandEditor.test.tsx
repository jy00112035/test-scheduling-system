import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import SpecialModuleDemandEditor, { resetSpecialModuleRowForTestType } from './SpecialModuleDemandEditor';
import type { SpecialModuleDemandInput, TestModule } from '../types';

const moduleFixture = (overrides: Partial<TestModule> = {}): TestModule => ({
  id: 11,
  moduleName: '支付模块',
  testType: '功能测试',
  enabled: true,
  sortOrder: 10,
  lockVersion: 0,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  referenced: false,
  ...overrides,
});

describe('SpecialModuleDemandEditor', () => {
  it('filters module choices to the selected test group', async () => {
    const Editor = () => {
      const [rows, setRows] = useState<SpecialModuleDemandInput[]>([{ testType: '功能测试' }]);
      return (
        <SpecialModuleDemandEditor
          rows={rows}
          modules={[
            moduleFixture(),
            moduleFixture({ id: 12, moduleName: '性能模块', testType: '性能测试' }),
          ]}
          manpowerByTestType={{ 功能测试: 8, 性能测试: 4 }}
          onChange={setRows}
        />
      );
    };

    render(
      <Editor />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: '特殊模块 1' }));

    expect(screen.getByRole('option', { name: '支付模块' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '性能模块' })).not.toBeInTheDocument();
  });

  it('disables a module already selected by another row', async () => {
    render(
      <SpecialModuleDemandEditor
        rows={[
          { testType: '功能测试', moduleId: 11, manpowerDemand: 2 },
          { testType: '功能测试', moduleId: 12, manpowerDemand: 1 },
        ]}
        modules={[
          moduleFixture(),
          moduleFixture({ id: 12, moduleName: '搜索模块' }),
        ]}
        manpowerByTestType={{ 功能测试: 8 }}
        onChange={() => undefined}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: '特殊模块 2' }));

    expect(document.querySelector('.ant-select-item-option-disabled')).toHaveTextContent('支付模块');
    expect(document.querySelector('.ant-select-item-option-disabled')).not.toHaveTextContent('搜索模块');
  });

  it('keeps a restored disabled module visible and marked as disabled', () => {
    render(
      <SpecialModuleDemandEditor
        rows={[{ testType: '功能测试', moduleId: 11, manpowerDemand: 2 }]}
        modules={[moduleFixture({ enabled: false })]}
        manpowerByTestType={{ 功能测试: 8 }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByText('支付模块')).toBeInTheDocument();
    expect(screen.getByText('已停用')).toBeInTheDocument();
  });

  it('locks the amount for a restored disabled module', () => {
    render(
      <SpecialModuleDemandEditor
        rows={[{ testType: '功能测试', moduleId: 11, manpowerDemand: 2, historicalManpowerDemand: 2 }]}
        modules={[moduleFixture({ enabled: false })]}
        manpowerByTestType={{ 功能测试: 8 }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole('spinbutton', { name: '人力需求 1' })).toBeDisabled();
  });

  it('shows group-level overflow feedback', () => {
    render(
      <SpecialModuleDemandEditor
        rows={[{ testType: '功能测试', moduleId: 11, manpowerDemand: 3.5 }]}
        modules={[moduleFixture()]}
        manpowerByTestType={{ 功能测试: 3 }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('功能测试的小组特殊模块人力不能超过总人力');
  });

  it('adds and removes a special module row', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SpecialModuleDemandEditor
        rows={[]}
        modules={[]}
        manpowerByTestType={{ 功能测试: 8 }}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /新增特殊模块需求/ }));
    expect(onChange).toHaveBeenLastCalledWith([{ testType: '' }]);

    rerender(
      <SpecialModuleDemandEditor
        rows={[{ testType: '功能测试', moduleId: 11, manpowerDemand: 1 }]}
        modules={[moduleFixture()]}
        manpowerByTestType={{ 功能测试: 8 }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '删除特殊模块需求 1' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('clears module and manpower when its group changes', () => {
    expect(resetSpecialModuleRowForTestType('性能测试')).toEqual({ testType: '性能测试' });
  });

  it('marks every overflow row invalid', () => {
    render(<SpecialModuleDemandEditor rows={[{ testType: '功能测试', moduleId: 11, manpowerDemand: 2 }, { testType: '功能测试', moduleId: 12, manpowerDemand: 2 }]} modules={[moduleFixture(), moduleFixture({ id: 12, moduleName: '搜索模块' })]} manpowerByTestType={{ 功能测试: 3 }} onChange={() => undefined} />);
    expect(screen.getByRole('spinbutton', { name: '人力需求 1' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('spinbutton', { name: '人力需求 2' })).toHaveAttribute('aria-invalid', 'true');
  });
});
