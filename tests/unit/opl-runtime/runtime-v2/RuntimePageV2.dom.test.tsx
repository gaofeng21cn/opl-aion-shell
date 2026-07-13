import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import { resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';
import { createRuntimeDrilldownResult, createRuntimeV2AppState, createRuntimeV2Projection } from './fixture';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  modalConfirm: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
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
  return {
    ...actual,
    Modal: { ...actual.Modal, confirm: bridgeMocks.modalConfirm },
    Select,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'common.refresh': '刷新',
        'common.cancel': '取消',
        'common.runtime.title': '项目运行总览',
        'common.runtime.scope.agent': '智能体',
        'common.runtime.scope.project': '项目',
        'common.runtime.scope.viewing': '查看范围',
        'common.runtime.scope.allAgents': '全部智能体',
        'common.runtime.scope.allProjects': '全部项目',
        'common.runtime.primaryStates.automaticallyAdvancing': '自动推进中',
        'common.runtime.primaryStates.awaitingUserDecision': '等待你决定',
        'common.runtime.primaryStates.systemAttention': '系统处理中',
        'common.runtime.primaryStates.deliveredAutoPaused': '已交付，自动暂停',
        'common.runtime.primaryStates.paused': '已暂停',
        'common.runtime.primaryStates.ownerDecisionRequired': '需要你决定',
        'common.runtime.primaryStates.systemAttentionRequired': '需要系统处理',
        'common.runtime.primaryStates.stopped': '已停止',
        'common.runtime.primaryStates.syncPending': '状态待同步',
        'common.runtime.metrics.total': '工作项',
        'common.runtime.savedView.all': '全部',
        'common.runtime.savedView.automaticallyAdvancing': '自动推进中',
        'common.runtime.savedView.awaitingUserDecision': '等待你决定',
        'common.runtime.savedView.systemAttention': '系统处理中',
        'common.runtime.savedView.deliveredOrPaused': '已交付或暂停',
        'common.runtime.savedView.stopped': '已停止',
        'common.runtime.savedView.syncPending': '状态待同步',
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
        'common.runtime.taskDetails.noCurrentStage': '暂无当前阶段',
        'common.runtime.taskDetails.stageAndRun': '阶段与运行',
        'common.runtime.taskDetails.stage.completed': '已完成',
        'common.runtime.taskDetails.stage.current': '当前',
        'common.runtime.taskDetails.stage.next': '下一步',
        'common.runtime.taskDetails.stage.pending': '待开始',
        'common.runtime.taskDetails.currentRun': '当前运行',
        'common.runtime.taskDetails.nextAction': '下一步动作',
        'common.runtime.taskDetails.artifacts': '产物',
        'common.runtime.taskDetails.timeline': '时间线',
        'common.runtime.taskDetails.evidence': '证据',
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
        'common.runtime.noActiveRun': '当前没有运行',
        'common.runtime.stageUsageShort': '阶段',
        'common.runtime.totalUsageShort': '累计',
        'common.runtime.actionKinds.agent': '智能体动作',
        'common.runtime.summary': '摘要',
        'common.runtime.fullDetail': '完整详情',
        'common.runtime.detailFullLoaded': '完整详情已加载',
        'common.runtime.safeActions': '安全动作',
        'common.runtime.dryRun': '试运行',
        'common.runtime.execute': '执行',
        'common.runtime.actionResult': '动作结果',
        'common.runtime.actionPreviewSummary': '预览',
        'common.runtime.actionReceiptSummary': '回执',
        'common.runtime.archiveTask.confirm': '归档记录',
        'common.runtime.archiveTask.archivedTitle': '已归档运行记录',
        'common.runtime.archiveTask.restore': '恢复',
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
    bridgeMocks.getDrilldownInvoke.mockReset();
    bridgeMocks.executeActionInvoke.mockReset();
    bridgeMocks.modalConfirm.mockReset();
    resetOplAppStateLoadsForTest();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: createRuntimeV2AppState() });
    bridgeMocks.getDrilldownInvoke.mockImplementation(({ detail }: { detail: 'summary' | 'full' }) =>
      Promise.resolve(createRuntimeDrilldownResult(detail))
    );
    bridgeMocks.executeActionInvoke.mockResolvedValue({
      ok: true,
      parsed: {
        action_preview_summary: 'No unsafe writes detected',
        receipt_ref: 'receipt://runtime/action',
      },
    });
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
    expect(screen.getByTestId('runtime-status-views')).toHaveTextContent(
      '全部自动推进中等待你决定系统处理中已交付或暂停已停止状态待同步'
    );

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
    expect(document.body).toHaveTextContent('1,500');
    expect(document.body).toHaveTextContent('用量未记录');
    expect(document.body).not.toHaveTextContent('0 tokens');
    expect(document.body).not.toHaveTextContent('runtime_token_telemetry_verification');
    const deliveredRow = rows.find((row) => row.textContent?.includes('002 DM China US Mortality Attribution'));
    expect(deliveredRow).toHaveTextContent('暂无当前阶段');
    expect(deliveredRow).toHaveTextContent('1,500');
    const availability = screen.getByTestId('runtime-agent-availability');
    expect(availability).toHaveTextContent('5');
    expect(availability).not.toHaveTextContent('9');
    expect(availability.querySelectorAll('.arco-collapse-item-active')).toHaveLength(0);
  });

  it('keeps the V2 list while exposing keyboard-reachable summary and full drilldown requests', async () => {
    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9));
    await waitFor(() => expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'summary' }));

    const summaryButton = await screen.findByTestId('runtime-load-summary');
    const fullButton = screen.getByTestId('runtime-load-full');
    expect(summaryButton.tagName).toBe('BUTTON');
    expect(fullButton.tagName).toBe('BUTTON');

    fireEvent.click(summaryButton);
    await waitFor(() =>
      expect(
        bridgeMocks.getDrilldownInvoke.mock.calls.filter(([request]) => request.detail === 'summary')
      ).toHaveLength(2)
    );

    fireEvent.click(fullButton);
    await waitFor(() => expect(bridgeMocks.getDrilldownInvoke).toHaveBeenCalledWith({ detail: 'full' }));
    expect(await screen.findByTestId('runtime-full-loaded')).toHaveTextContent('完整详情已加载');
    expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9);
  });

  it('requires a successful dry run before confirming and executing a safe action', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Dry run rejected' },
    });
    render(<RuntimePage />);

    const action = await screen.findByTestId('runtime-safe-action-runtime_reconcile_provider');
    const dryRunButton = within(action).getByRole('button', { name: '试运行' });
    const executeButton = within(action).getByRole('button', { name: '执行' });
    expect(executeButton).toBeDisabled();

    fireEvent.click(dryRunButton);
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'runtime_reconcile_provider',
        dryRun: true,
      })
    );
    expect(executeButton).toBeDisabled();

    fireEvent.click(dryRunButton);
    await waitFor(() => expect(executeButton).toBeEnabled());
    fireEvent.click(executeButton);
    expect(bridgeMocks.modalConfirm).toHaveBeenCalledTimes(1);

    const confirmation = bridgeMocks.modalConfirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'runtime_reconcile_provider',
      dryRun: false,
    });
  });

  it('archives and restores attempts only through the existing App action bridge', async () => {
    render(<RuntimePage />);

    await screen.findByTestId('runtime-archived-attempts');
    fireEvent.click(await screen.findByRole('button', { name: /002 DM China US Mortality Attribution/ }));
    fireEvent.click(await screen.findByTestId('runtime-archive-attempt'));

    const confirmation = bridgeMocks.modalConfirm.mock.calls[0]?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
      actionId: 'runtime_archive_attempt',
      payloadRefsOnlyJson: {
        stage_attempt_id: 'attempt:dm002',
        reason: 'user_archived_from_runtime_overview',
      },
      dryRun: false,
    });

    const archivedAttempts = await screen.findByTestId('runtime-archived-attempts');
    fireEvent.click(within(archivedAttempts).getByRole('button', { name: '恢复' }));
    await waitFor(() =>
      expect(bridgeMocks.executeActionInvoke).toHaveBeenCalledWith({
        actionId: 'runtime_restore_attempt',
        payloadRefsOnlyJson: {
          stage_attempt_id: 'attempt:archived-dm003',
          reason: 'user_restored_from_runtime_overview',
        },
        dryRun: false,
      })
    );
  });

  it('opens workflow-first details and keeps secondary evidence collapsed', async () => {
    render(<RuntimePage />);

    const openButton = await screen.findByRole('button', {
      name: /001 DM CVD Mortality Risk/,
    });
    fireEvent.click(openButton);

    const drawer = await screen.findByTestId('runtime-task-detail');
    expect(drawer).toHaveTextContent('阶段图');
    expect(drawer).toHaveTextContent('研究立项');
    expect(drawer).toHaveTextContent('分析结果复核');
    expect(drawer).toHaveTextContent('医学写作');
    expect(drawer).not.toHaveTextContent('当前投影尚未提供阶段图');
    expect(drawer).toHaveTextContent('阶段与运行');
    expect(drawer).toHaveTextContent('正在运行');
    expect(drawer).toHaveTextContent('1,200');
    expect(drawer).toHaveTextContent('2,400');
    expect(drawer).toHaveTextContent('下一步动作');
    expect(drawer).toHaveTextContent('完成结果复核并进入写作');
    expect(drawer).toHaveTextContent('Med Auto Science');
    expect(drawer).toHaveTextContent('产物');
    expect(drawer).toHaveTextContent('时间线');
    expect(drawer).toHaveTextContent('证据');
    expect(drawer).toHaveTextContent('诊断');
    expect(drawer.querySelectorAll('.arco-collapse-item')).toHaveLength(4);
    expect(drawer.querySelectorAll('.arco-collapse-item-active')).toHaveLength(0);
  });

  it('shows every system responsibility field only for a complete envelope', async () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.lifecycle.primary_state = 'system_attention';
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
