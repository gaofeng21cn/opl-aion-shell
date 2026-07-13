import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import { resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';
import { createRuntimeV2AppState, createRuntimeV2Projection } from './fixture';

const bridgeMocks = vi.hoisted(() => ({ getAppStateInvoke: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: { getAppState: { invoke: bridgeMocks.getAppStateInvoke } },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const Select = ({
    value,
    options,
    onChange,
    ...props
  }: {
    value?: string;
    options?: Array<{ label: React.ReactNode; value: string }>;
    onChange?: (value: string) => void;
  } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} value={value} onChange={(event) => onChange?.(event.target.value)}>
      {options?.map((option) => (
        <option value={option.value} key={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return { ...actual, Select };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'common.refresh': '刷新',
        'common.runtime.title': '项目运行总览',
        'common.runtime.scope.agent': '智能体',
        'common.runtime.scope.project': '项目',
        'common.runtime.scope.allAgents': '全部智能体',
        'common.runtime.scope.allProjects': '全部项目',
        'common.runtime.primaryStates.inProgress': '进行中',
        'common.runtime.primaryStates.deliveredAutoPaused': '已交付，自动暂停',
        'common.runtime.primaryStates.pausedWaitingForDirection': '已暂停，等待后续决定',
        'common.runtime.primaryStates.ownerDecisionRequired': '需要你决定',
        'common.runtime.primaryStates.systemAttentionRequired': '需要系统处理',
        'common.runtime.primaryStates.stopped': '已停止',
        'common.runtime.primaryStates.unavailable': '状态暂不可用',
        'common.runtime.automationStates.running': '自动运行中',
        'common.runtime.executionStates.running': '正在运行',
        'common.runtime.executionStates.queued': '等待运行',
        'common.runtime.executionStates.idle': '当前没有自动任务',
        'common.runtime.executionStates.succeeded': '本次运行已完成',
        'common.runtime.executionStates.failed': '本次运行未完成',
        'common.runtime.executionStates.unknown': '运行状态暂不可用',
        'common.runtime.telemetryMissing': '用量未记录',
        'common.runtime.timeNotRecorded': '时间未记录',
        'common.runtime.taskDetails.stageMap': '阶段图',
        'common.runtime.taskDetails.stageMapUnavailable': '当前投影尚未提供阶段图',
        'common.runtime.taskDetails.stageUnavailable': '当前投影尚未提供阶段名称',
        'common.runtime.taskDetails.currentRun': '当前运行',
        'common.runtime.taskDetails.nextAction': '下一步动作',
        'common.runtime.taskDetails.artifacts': '产物',
        'common.runtime.taskDetails.timeline': '时间线',
        'common.runtime.taskDetails.diagnostics': '诊断',
        'common.runtime.systemAttention.title': '系统处理',
        'common.runtime.systemAttention.responsibleComponent': '责任组件',
        'common.runtime.systemAttention.issue': '具体问题',
        'common.runtime.systemAttention.impact': '当前影响',
        'common.runtime.systemAttention.repairAction': '修复动作',
        'common.runtime.systemAttention.expectedOutcome': '预期结果',
        'common.runtime.projection.unavailableTitle': '运行状态暂不可用',
        'common.runtime.projection.legacyDescription': 'V1 状态不再用于推断',
        'common.runtime.agentAvailability.available': '可用',
      };
      if (labels[key]) return labels[key];
      const rendered = Object.values(values ?? {}).join(' ');
      return rendered ? `${key} ${rendered}` : key;
    },
    i18n: { language: 'zh-CN', resolvedLanguage: 'zh-CN' },
  }),
}));

describe('Runtime V2 page', () => {
  beforeEach(() => {
    bridgeMocks.getAppStateInvoke.mockReset();
    resetOplAppStateLoadsForTest();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: createRuntimeV2AppState() });
  });

  it('shows the MAS three-project nine-item hierarchy without duplicate or module rows', async () => {
    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9));
    const agentSelect = screen.getByTestId('runtime-agent-selector');
    const projectSelect = screen.getByTestId('runtime-project-selector');
    expect(within(agentSelect).getByText('Med Auto Science')).toBeInTheDocument();
    expect(within(agentSelect).getByText('Med Auto Grant')).toBeInTheDocument();
    expect(within(agentSelect).getByText('RedCube AI')).toBeInTheDocument();
    expect(within(agentSelect).getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(within(agentSelect).getByText('OPL Book Forge')).toBeInTheDocument();
    expect(within(projectSelect).queryByText('糖尿病')).not.toBeInTheDocument();

    fireEvent.change(agentSelect, { target: { value: 'mas' } });
    await waitFor(() => expect(within(projectSelect).getByText('糖尿病')).toBeInTheDocument());
    expect(within(projectSelect).getByText('无功能垂体瘤')).toBeInTheDocument();
    expect(within(projectSelect).getByText('肥胖')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-status-views')).not.toHaveTextContent('Med Auto Science');

    fireEvent.change(projectSelect, { target: { value: 'diabetes' } });
    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(4));
    expect(screen.getAllByText('002 DM China US Mortality Attribution')).toHaveLength(1);
    expect(screen.getAllByText('003 DPCC Primary Care Phenotype Treatment Gap')).toHaveLength(1);
    expect(
      screen.getAllByTestId('runtime-task-row').filter((row) => row.textContent?.includes('已交付，自动暂停'))
    ).toHaveLength(2);
    expect(document.body).not.toHaveTextContent('module_runtime');
    expect(document.body).not.toHaveTextContent('0/2');
    expect(document.body).not.toHaveTextContent('attempt:dm001');
    expect(document.body).not.toHaveTextContent('workflow:dm001');
  });

  it('renders four semantic columns without turning missing usage into zero', async () => {
    render(<RuntimePage />);

    const rows = await screen.findAllByTestId('runtime-task-row');
    expect(screen.getByTestId('runtime-work-item-grid-header')).toHaveAttribute('data-responsive-columns', '4');
    expect(rows[0]?.children).toHaveLength(4);
    expect(document.body).toHaveTextContent('1,200');
    expect(document.body).toHaveTextContent('2,400');
    expect(document.body).toHaveTextContent('用量未记录');
    expect(document.body).not.toHaveTextContent('0 tokens');
    expect(screen.getByTestId('runtime-agent-availability')).toHaveTextContent('5');
  });

  it('opens the stage, run, action, artifact, timeline, and diagnostics detail layers', async () => {
    render(<RuntimePage />);

    const openButton = await screen.findByRole('button', {
      name: /001 DM CVD Mortality Risk/,
    });
    fireEvent.click(openButton);

    const drawer = await screen.findByTestId('runtime-task-detail');
    expect(drawer).toHaveTextContent('阶段图');
    expect(drawer).toHaveTextContent('当前投影尚未提供阶段图');
    expect(drawer).toHaveTextContent('当前投影尚未提供阶段名称');
    expect(drawer).toHaveTextContent('当前运行');
    expect(drawer).toHaveTextContent('正在运行');
    expect(drawer).toHaveTextContent('1,200');
    expect(drawer).toHaveTextContent('2,400');
    expect(drawer).toHaveTextContent('下一步动作');
    expect(drawer).toHaveTextContent('产物');
    expect(drawer).toHaveTextContent('时间线');
    expect(drawer).toHaveTextContent('诊断');
  });

  it('shows every system responsibility field only for a complete envelope', async () => {
    const projection = createRuntimeV2Projection();
    Object.assign(projection.items[0]!.attention, {
      kind: 'system',
      owner: 'opl_framework',
      responsible_component: 'OPL Framework',
      issue: 'Worker unavailable',
      impact: 'Next stage cannot start',
      repair_action: 'Restart managed worker',
      expected_outcome: 'Automatic execution resumes',
    });
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      parsed: { app_state: { operator: { workbench: { work_item_projection_v2: projection } } } },
    });
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));
    const attention = await screen.findByTestId('runtime-system-attention');
    expect(attention).toHaveTextContent('OPL Framework');
    expect(attention).toHaveTextContent('Worker unavailable');
    expect(attention).toHaveTextContent('Next stage cannot start');
    expect(attention).toHaveTextContent('Restart managed worker');
    expect(attention).toHaveTextContent('Automatic execution resumes');
  });

  it('shows V1 as unavailable without rendering legacy task state', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      parsed: {
        app_state: {
          operator: {
            workbench: {
              work_item_projection_v1: {
                schema_version: 'work-item-projection.v1',
                items: [{ item_id: 'legacy', title: 'Legacy running task', state: 'running' }],
              },
            },
          },
        },
      },
    });
    render(<RuntimePage />);

    expect(await screen.findByTestId('runtime-projection-unavailable')).toHaveTextContent('运行状态暂不可用');
    expect(document.body).toHaveTextContent('V1 状态不再用于推断');
    expect(document.body).not.toHaveTextContent('Legacy running task');
  });
});
