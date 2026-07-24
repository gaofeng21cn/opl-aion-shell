import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import RuntimePage from '@/renderer/pages/runtime';
import { loadOplAppStateFromBridge, resetOplAppStateLoadsForTest } from '@/renderer/hooks/system/useOplAppState';
import { createRuntimeV2AppState, createRuntimeV2Projection } from './fixture';

const bridgeMocks = vi.hoisted(() => ({
  getAppStateInvoke: vi.fn(),
  getDrilldownInvoke: vi.fn(),
  executeActionInvoke: vi.fn(),
  modalConfirm: vi.fn(),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  copyText: vi.fn(),
}));
const localeMocks = vi.hoisted(() => ({ language: 'zh-CN' as 'zh-CN' | 'en-US' }));
const routeMocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => routeMocks.navigate };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    oplRuntime: {
      getAppState: { invoke: bridgeMocks.getAppStateInvoke },
      getDrilldown: { invoke: bridgeMocks.getDrilldownInvoke },
      executeAction: { invoke: bridgeMocks.executeActionInvoke },
    },
  },
}));

vi.mock('@/renderer/utils/ui/clipboard', () => ({
  copyText: bridgeMocks.copyText,
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- This mock component belongs to the hoisted factory.
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
    Message: {
      ...actual.Message,
      useMessage: () => [{ success: bridgeMocks.messageSuccess, error: bridgeMocks.messageError }, null],
    },
    Modal: { ...actual.Modal, confirm: bridgeMocks.modalConfirm },
    Select,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => {
    const zhLabels: Record<string, string> = {
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
      'common.tray.runtimeStatus': '运行状态',
      'common.runtime.telemetryMissing': '用量未记录',
      'common.runtime.timeNotRecorded': '时间未记录',
      'common.runtime.taskDetails.stageMap': '阶段图',
      'common.runtime.taskDetails.stageMapUnavailable': '当前投影尚未提供阶段图',
      'common.runtime.taskDetails.stageUnavailable': '当前投影尚未提供阶段名称',
      'common.runtime.taskDetails.noCurrentStage': '暂无当前阶段',
      'common.runtime.taskDetails.stageAndRun': '阶段与运行',
      'common.runtime.taskDetails.currentStage': '阶段',
      'common.runtime.taskDetails.nextStage': '下一阶段',
      'common.runtime.taskDetails.currentAttempt': '当前尝试',
      'common.runtime.taskDetails.heartbeat': '心跳摘要',
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
      'common.runtime.stageUsageLabel': '当前阶段 Token',
      'common.runtime.totalUsageLabel': '累计 Token',
      'common.runtime.systemAttention.title': '系统处理',
      'common.runtime.systemAttention.responsibleComponent': '责任组件',
      'common.runtime.systemAttention.issue': '具体问题',
      'common.runtime.systemAttention.impact': '当前影响',
      'common.runtime.systemAttention.repairAction': '修复动作',
      'common.runtime.systemAttention.expectedOutcome': '预期结果',
      'common.runtime.projection.unavailableTitle': '运行状态暂不可用',
      'common.runtime.projection.legacyDescription': 'V1 状态不再用于推断',
      'common.uiOptimization.runtime.summary.availability': '可用性',
      'common.uiOptimization.runtime.summary.running': '运行中',
      'common.uiOptimization.runtime.summary.needsAttention': '需要处理',
      'common.uiOptimization.runtime.errors.capabilityCatalogUnavailable.title': '能力目录暂时不可用',
      'common.uiOptimization.runtime.errors.capabilityCatalogUnavailable.description':
        '暂时无法读取能力目录。你可以重试，或打开维护页检查本机服务。',
      'common.uiOptimization.runtime.errors.incompatibleConfiguration.title': '配置格式不兼容',
      'common.uiOptimization.runtime.errors.incompatibleConfiguration.description':
        '当前配置无法由此版本读取。请打开维护页检查并修复配置。',
      'common.uiOptimization.runtime.errors.unavailable.title': '运行状态暂时不可用',
      'common.uiOptimization.runtime.errors.unavailable.description':
        '暂时无法读取最新运行状态。现有任务和数据不会因此被修改。',
      'common.uiOptimization.runtime.states.loading': '正在读取运行状态...',
      'common.uiOptimization.runtime.states.empty': '当前没有运行中的工作项。',
      'common.uiOptimization.runtime.actions.retry': '重试',
      'common.uiOptimization.runtime.actions.openMaintenance': '打开维护',
      'common.uiOptimization.runtime.technicalDetails.label': '技术详情',
      'common.uiOptimization.runtime.technicalDetails.copy': '复制诊断信息',
      'common.uiOptimization.runtime.technicalDetails.copied': '诊断信息已复制',
      'common.uiOptimization.runtime.technicalDetails.copyFailed': '无法复制诊断信息',
      'common.runtime.agentAvailability.available': '可用',
      'common.runtime.noActiveRun': '当前没有运行',
      'common.runtime.stageUsageShort': '阶段',
      'common.runtime.totalUsageShort': '累计',
      'common.runtime.actionKinds.agent': '智能体动作',
      'common.runtime.actionKinds.agentSummary': '这项任务的下一步动作由负责智能体处理。',
      'common.runtime.actionKinds.user': '需要你处理',
      'common.runtime.actionKinds.userSummary': '请查看这项任务并选择合适的下一步动作。',
      'common.runtime.actionKinds.system': '系统动作',
      'common.runtime.actionKinds.systemSummary': '这项任务的下一步动作由系统处理。',
      'common.runtime.actionKinds.safe': '可执行动作',
      'common.runtime.actionKinds.safeSummary': '请先查看这项任务提供的动作，再决定是否执行。',
      'common.runtime.actionKinds.blocked': '暂无可执行动作',
      'common.runtime.actionKinds.blockedSummary': '这项任务当前没有可执行动作。',
      'common.runtime.nextOwner': '负责人：{{owner}}',
      'common.runtime.nextStep': '下一步：{{step}}',
      'common.runtime.summary': '摘要',
      'common.runtime.fullDetail': '完整详情',
      'common.runtime.detailFullLoaded': '完整详情已加载',
      'common.runtime.safeActions': '安全动作',
      'common.runtime.dryRun': '试运行',
      'common.runtime.execute': '执行',
      'common.runtime.actionResult': '动作结果',
      'common.runtime.actionPreviewSummary': '预览',
      'common.runtime.actionReceiptSummary': '回执',
      'common.runtime.archivedTasks.entry': '归档库（{{count}}）',
      'common.runtime.archivedTasks.title': '归档库',
      'common.runtime.archivedTasks.back': '返回主任务',
      'common.runtime.archivedTasks.count': '当前范围内共 {{count}} 项已归档任务',
      'common.runtime.archivedTasks.empty': '当前范围内没有已归档任务。',
      'common.runtime.archivedTasks.state': '已归档',
      'common.runtime.archivedTasks.archive': '归档任务',
      'common.runtime.archivedTasks.restore': '恢复任务',
      'common.runtime.archivedTasks.archiveTitle': '归档这项任务？',
      'common.runtime.archivedTasks.archiveDescription':
        '“{{task}}”只会从主总览隐藏；这不会停止正在运行的自动流程，也不会删除证据。',
      'common.runtime.archivedTasks.restoreTitle': '恢复这项任务？',
      'common.runtime.archivedTasks.restoreDescription': '“{{task}}”将回到主总览；自动流程和证据保持不变。',
      'common.runtime.archivedTasks.archiveSuccess': '任务已归档',
      'common.runtime.archivedTasks.restoreSuccess': '任务已恢复',
      'common.runtime.archivedTasks.readbackFailed': '可见性 readback 未确认，请刷新后重试。',
      'common.runtime.archivedTasks.generationConflict': '状态已刷新，请检查后重试。',
      'common.runtime.archivedTasks.generationConflictRefreshFailed': '状态刷新失败，请刷新后重试。',
      'common.runtime.executionRecords.archivedTitle': '已归档执行记录',
      'common.runtime.executionRecords.restore': '恢复执行记录',
      'common.runtime.executionRecords.restoreSuccess': '执行记录已恢复',
      'common.runtime.researchTrajectory.title': '科研路线',
      'common.runtime.researchTrajectory.open': '查看科研路线',
      'common.runtime.domainDetailView.title': '任务详情视图',
      'common.runtime.domainDetailView.unsupportedTitle': '当前应用暂不支持此详情视图',
      'common.runtime.domainDetailView.unsupportedDescription': '其他运行任务不受影响。更新应用后可使用此详情视图。',
      'common.runtime.researchTrajectory.currentHypothesis': '当前主要假设',
      'common.runtime.researchTrajectory.latestFinding': '最新研究发现',
      'common.runtime.researchTrajectory.currentJudgment': '当前判断',
      'common.runtime.researchTrajectory.nextResearchStep': '下一研究步骤',
      'common.runtime.researchTrajectory.updated': '更新时间',
      'common.runtime.owner.you': '你',
      'common.runtime.owner.system': '系统',
      'common.runtime.semanticAction.lifecycle.active.title': '继续推进',
      'common.runtime.semanticAction.lifecycle.active.summary': '{{agent_display_name}} 将按当前计划继续推进。',
      'common.runtime.semanticAction.lifecycle.deliveredPaused.title': '补齐投稿信息或发起修订',
      'common.runtime.semanticAction.lifecycle.deliveredPaused.summary': '里程碑已交付，等待投稿信息或修订。',
      'common.runtime.semanticAction.lifecycle.paused.title': '明确下一步方向',
      'common.runtime.semanticAction.lifecycle.paused.summary': '自动推进已暂停。',
      'common.runtime.semanticAction.lifecycle.stopped.title': '当前不再推进',
      'common.runtime.semanticAction.lifecycle.stopped.summary': '只有显式重启后才会继续。',
      'common.runtime.semanticAction.lifecycle.archived.title': '已归档',
      'common.runtime.semanticAction.lifecycle.archived.summary': '这项任务已归档。',
      'common.runtime.semanticAction.lifecycle.unknown.title': '等待状态同步',
      'common.runtime.semanticAction.lifecycle.unknown.summary': '等待所属智能体同步状态。',
      'common.runtime.semanticAction.inventoryNextAction.title': '继续这项任务',
      'common.runtime.semanticAction.inventoryNextAction.summary': '按 {{agent_display_name}} 提供的任务动作继续。',
      'common.runtime.semanticAction.systemRepair.title': '需要系统修复',
      'common.runtime.semanticAction.systemRepair.summary': '运行系统修复后任务才能继续。',
    };
    const enLabels: Record<string, string> = {
      'common.runtime.primaryStates.automaticallyAdvancing': 'Automatically advancing',
      'common.runtime.primaryStates.awaitingUserDecision': 'Waiting for your decision',
      'common.runtime.primaryStates.systemAttention': 'System handling in progress',
      'common.runtime.primaryStates.deliveredAutoPaused': 'Delivered, auto-paused',
      'common.runtime.primaryStates.paused': 'Paused',
      'common.runtime.primaryStates.stopped': 'Stopped',
      'common.runtime.primaryStates.syncPending': 'Status sync pending',
      'common.runtime.executionStates.running': 'Running',
      'common.runtime.executionStates.queued': 'Queued',
      'common.runtime.executionStates.idle': 'No automation task right now',
      'common.runtime.executionStates.succeeded': 'Run complete',
      'common.runtime.executionStates.failed': 'Run failed',
      'common.runtime.executionStates.unknown': 'Run status unavailable',
      'common.runtime.actionKinds.agent': 'Agent action',
      'common.runtime.actionKinds.agentSummary': 'The assigned agent handles the next action for this task.',
      'common.runtime.actionKinds.user': 'Your action',
      'common.runtime.actionKinds.userSummary': 'Review this task and choose the appropriate next action.',
      'common.runtime.actionKinds.system': 'System action',
      'common.runtime.actionKinds.systemSummary': 'The system handles the next action for this task.',
      'common.runtime.actionKinds.safe': 'Available action',
      'common.runtime.actionKinds.safeSummary': 'Review the available action before running it for this task.',
      'common.runtime.actionKinds.blocked': 'No action available',
      'common.runtime.actionKinds.blockedSummary': 'No action can be run for this task right now.',
      'common.runtime.nextOwner': 'Owner: {{owner}}',
      'common.runtime.nextStep': 'Next: {{step}}',
      'common.runtime.owner.you': 'You',
      'common.runtime.owner.system': 'System',
      'common.runtime.semanticAction.lifecycle.active.title': 'Continue advancing',
      'common.runtime.semanticAction.lifecycle.active.summary':
        '{{agent_display_name}} will continue according to the current plan.',
      'common.runtime.semanticAction.lifecycle.deliveredPaused.title':
        'Provide submission details or request a revision',
      'common.runtime.semanticAction.lifecycle.deliveredPaused.summary':
        'The milestone is delivered. Provide submission details or request a revision.',
      'common.runtime.semanticAction.lifecycle.paused.title': 'Choose what happens next',
      'common.runtime.semanticAction.lifecycle.paused.summary': 'Automatic work is paused.',
      'common.runtime.semanticAction.lifecycle.stopped.title': 'No further work planned',
      'common.runtime.semanticAction.lifecycle.stopped.summary': 'This task requires an explicit restart.',
      'common.runtime.semanticAction.lifecycle.archived.title': 'Archived',
      'common.runtime.semanticAction.lifecycle.archived.summary': 'This task is archived.',
      'common.runtime.semanticAction.lifecycle.unknown.title': 'Waiting for status sync',
      'common.runtime.semanticAction.lifecycle.unknown.summary': 'Waiting for the owning agent to sync status.',
      'common.runtime.semanticAction.inventoryNextAction.title': 'Continue this task',
      'common.runtime.semanticAction.inventoryNextAction.summary':
        'Follow the task-specific next action provided by {{agent_display_name}}.',
      'common.runtime.semanticAction.systemRepair.title': 'System repair required',
      'common.runtime.semanticAction.systemRepair.summary': 'The runtime system must be repaired first.',
    };
    const labels = localeMocks.language === 'en-US' ? { ...zhLabels, ...enLabels } : zhLabels;
    return {
      t: (key: string, values?: Record<string, string | number>) => {
        if (labels[key]) {
          return Object.entries(values ?? {}).reduce(
            (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
            labels[key]
          );
        }
        const rendered = Object.values(values ?? {}).join(' ');
        return rendered ? `${key} ${rendered}` : key;
      },
      i18n: {
        language: localeMocks.language,
        resolvedLanguage: localeMocks.language,
      },
    };
  },
}));

function appStateResultWithVisibility(
  projectId: string,
  workItemId: string,
  state: 'visible' | 'archived',
  generation: number
) {
  const payload = createRuntimeV2AppState();
  const item = payload.app_state.operator.workbench.work_item_projection_v2.items.find(
    (candidate) => candidate.identity.project_id === projectId && candidate.identity.work_item_id === workItemId
  );
  if (!item) throw new Error(`Missing fixture item ${projectId}:${workItemId}`);
  item.visibility = {
    state,
    source: 'work_item_control_ledger',
    updated_at: '2026-07-14T08:00:00Z',
    control_ref: `opl://work-item-control/${projectId}:${encodeURIComponent(workItemId)}`,
    generation,
  };
  return { parsed: payload };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('Runtime V2 page', () => {
  beforeEach(() => {
    bridgeMocks.getAppStateInvoke.mockReset();
    bridgeMocks.getDrilldownInvoke.mockReset();
    bridgeMocks.executeActionInvoke.mockReset();
    bridgeMocks.modalConfirm.mockReset();
    bridgeMocks.messageSuccess.mockReset();
    bridgeMocks.messageError.mockReset();
    bridgeMocks.copyText.mockReset();
    bridgeMocks.copyText.mockResolvedValue(undefined);
    routeMocks.navigate.mockReset();
    localeMocks.language = 'zh-CN';
    resetOplAppStateLoadsForTest();
    localStorage.clear();
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: createRuntimeV2AppState() });
    bridgeMocks.executeActionInvoke.mockResolvedValue({
      ok: true,
      parsed: {
        action_preview_summary: 'No unsafe writes detected',
        receipt_ref: 'receipt://runtime/action',
      },
    });
  });

  it('shows all nine visible items and keeps repeated work item ids distinct by canonical item id', async () => {
    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9));
    expect(screen.getByRole('button', { name: /001 DM CVD Mortality Risk/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NF-PitNET Paper 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NF-PitNET Paper 4/ })).toBeInTheDocument();
    expect(screen.getByTestId('runtime-open-archive')).toHaveTextContent('归档库（0）');
    const agentSelect = screen.getByTestId('runtime-agent-selector');
    const projectSelect = screen.getByTestId('runtime-project-selector');
    expect(within(agentSelect).getByText('Med Auto Science')).toBeInTheDocument();
    expect(within(agentSelect).getByText('Med Auto Grant')).toBeInTheDocument();
    expect(within(agentSelect).getByText('RedCube AI')).toBeInTheDocument();
    expect(within(agentSelect).getByText('OPL Meta Agent')).toBeInTheDocument();
    expect(within(agentSelect).getByText('OPL Book Forge')).toBeInTheDocument();
    expect(within(projectSelect).queryByText('DM-CVD-Mortality-Risk')).not.toBeInTheDocument();

    fireEvent.change(agentSelect, { target: { value: 'mas' } });
    await waitFor(() => expect(within(projectSelect).getByText('DM-CVD-Mortality-Risk')).toBeInTheDocument());
    expect(within(projectSelect).getByText('NF-PitNET')).toBeInTheDocument();
    expect(within(projectSelect).getByText('Obesity')).toBeInTheDocument();
    const statusSelect = screen.getByTestId('runtime-status-view-select');
    expect(within(statusSelect).queryByText('Med Auto Science')).not.toBeInTheDocument();
    expect(within(statusSelect).getAllByRole('option')).toHaveLength(7);

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
    expect(screen.queryByTestId('runtime-agent-availability')).not.toBeInTheDocument();
  });

  it('keeps platform maintenance actions and operator drilldown out of the project Runtime page', async () => {
    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9));
    expect(bridgeMocks.getDrilldownInvoke).not.toHaveBeenCalled();
    expect(screen.queryByTestId('runtime-cockpit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-safe-actions')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('runtime_reconcile_provider');
    expect(document.body).not.toHaveTextContent('codex_install');
    expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(9);
  });

  it('opens a stage popup with the complete stage list and current attempt', async () => {
    render(<RuntimePage />);

    const row = (await screen.findAllByTestId('runtime-task-row')).find((candidate) =>
      candidate.textContent?.includes('001 DM CVD Mortality Risk')
    )!;
    fireEvent.click(within(row).getByTestId('runtime-stage-trigger'));

    const popover = await screen.findByTestId('runtime-stage-popover');
    expect(popover).toHaveTextContent('阶段图');
    expect(popover).toHaveTextContent('运行状态');
    expect(popover).toHaveTextContent('正在运行');
    expect(within(popover).getByTestId('runtime-stage-attempt')).toHaveTextContent('当前尝试attempt:dm001');
    expect(within(popover).getAllByRole('listitem')).toHaveLength(5);
    expect(popover).toHaveTextContent('分析结果复核');
    expect(popover).toHaveTextContent('医学写作');
    expect(screen.queryByTestId('runtime-task-detail')).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(popover).not.toBeVisible());
  });

  it('describes an idle stage popup without internal attempt terminology', async () => {
    render(<RuntimePage />);

    const row = (await screen.findAllByTestId('runtime-task-row')).find((candidate) =>
      candidate.textContent?.includes('003 DPCC Primary Care Phenotype Treatment Gap')
    )!;
    fireEvent.click(within(row).getByTestId('runtime-stage-trigger'));

    const popover = await screen.findByTestId('runtime-stage-popover');
    expect(within(popover).getByTestId('runtime-stage-run-status')).toHaveTextContent('运行状态当前没有自动任务');
    expect(popover).not.toHaveTextContent('当前尝试');
    expect(popover).not.toHaveTextContent('当前没有运行');
  });

  it('keeps archived tasks in an independent library that ignores the active status saved view', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResultWithVisibility('nf-pitnet', 'nf004', 'archived', 7));
    render(<RuntimePage />);

    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(8));
    fireEvent.change(screen.getByTestId('runtime-status-view-select'), {
      target: { value: 'automatically_advancing' },
    });
    await waitFor(() => expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(1));

    fireEvent.click(screen.getByTestId('runtime-open-archive'));
    expect(await screen.findByTestId('runtime-archive-header')).toHaveTextContent('当前范围内共 1 项已归档任务');
    expect(screen.queryByTestId('runtime-status-region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-cockpit')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('runtime-task-row')).toHaveLength(1);
    expect(screen.getByText('NF-PitNET Paper 4')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('runtime-archive-back'));
    expect(await screen.findByTestId('runtime-status-region')).toBeInTheDocument();
    expect(screen.queryByText('NF-PitNET Paper 4')).not.toBeInTheDocument();
  });

  it('limits the archived library to the current agent and project scope with an explicit empty state', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResultWithVisibility('nf-pitnet', 'nf004', 'archived', 7));
    render(<RuntimePage />);

    const agentSelect = await screen.findByTestId('runtime-agent-selector');
    fireEvent.change(agentSelect, { target: { value: 'mas' } });
    const projectSelect = screen.getByTestId('runtime-project-selector');
    await waitFor(() => expect(within(projectSelect).getByText('DM-CVD-Mortality-Risk')).toBeInTheDocument());
    fireEvent.change(projectSelect, { target: { value: 'diabetes' } });

    await waitFor(() => expect(screen.getByTestId('runtime-open-archive')).toHaveTextContent('归档库（0）'));
    fireEvent.click(screen.getByTestId('runtime-open-archive'));
    expect(await screen.findByText('当前范围内没有已归档任务。')).toBeInTheDocument();
    expect(screen.queryAllByTestId('runtime-task-row')).toHaveLength(0);
  });

  it('uses one post-archive fresh fast read instead of a pre-mutation poll snapshot', async () => {
    vi.useFakeTimers();
    let unmount: (() => void) | undefined;
    try {
      const oldPoll = deferred<ReturnType<typeof appStateResultWithVisibility>>();
      const freshReadback = deferred<ReturnType<typeof appStateResultWithVisibility>>();
      bridgeMocks.getAppStateInvoke
        .mockResolvedValueOnce({ parsed: createRuntimeV2AppState() })
        .mockReturnValueOnce(oldPoll.promise)
        .mockReturnValueOnce(freshReadback.promise);

      const view = render(<RuntimePage />);
      unmount = view.unmount;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const pollLoad = loadOplAppStateFromBridge('fast');
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByRole('button', { name: /001 DM CVD Mortality Risk/ }));
      fireEvent.click(screen.getByTestId('runtime-archive-work-item'));
      const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
      let mutation!: Promise<void>;
      await act(async () => {
        mutation = confirmation.onOk();
        await Promise.resolve();
      });
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2);

      oldPoll.resolve(appStateResultWithVisibility('diabetes', '001', 'visible', 3));
      await act(async () => {
        await pollLoad;
        await Promise.resolve();
      });
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(3);
      expect(bridgeMocks.getAppStateInvoke.mock.calls).toEqual([
        [{ profile: 'fast' }],
        [{ profile: 'fast' }],
        [{ profile: 'fast' }],
      ]);
      const coalescedPoll = loadOplAppStateFromBridge('fast');
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(3);

      freshReadback.resolve(appStateResultWithVisibility('diabetes', '001', 'archived', 4));
      await act(async () => {
        await Promise.all([mutation, coalescedPoll]);
      });
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('任务已归档');
      expect(bridgeMocks.messageError).not.toHaveBeenCalledWith('可见性 readback 未确认，请刷新后重试。');
    } finally {
      unmount?.();
      vi.useRealTimers();
    }
  });

  it('uses one post-restore fresh fast read instead of a pre-mutation poll snapshot', async () => {
    vi.useFakeTimers();
    let unmount: (() => void) | undefined;
    try {
      const oldPoll = deferred<ReturnType<typeof appStateResultWithVisibility>>();
      const freshReadback = deferred<ReturnType<typeof appStateResultWithVisibility>>();
      bridgeMocks.getAppStateInvoke
        .mockResolvedValueOnce(appStateResultWithVisibility('nf-pitnet', 'nf004', 'archived', 7))
        .mockReturnValueOnce(oldPoll.promise)
        .mockReturnValueOnce(freshReadback.promise);

      const view = render(<RuntimePage />);
      unmount = view.unmount;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      const pollLoad = loadOplAppStateFromBridge('fast');
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2);

      fireEvent.click(screen.getByTestId('runtime-open-archive'));
      fireEvent.click(screen.getByRole('button', { name: /NF-PitNET Paper 4/ }));
      fireEvent.click(screen.getByTestId('runtime-restore-work-item'));
      const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
      let mutation!: Promise<void>;
      await act(async () => {
        mutation = confirmation.onOk();
        await Promise.resolve();
      });
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(2);

      oldPoll.resolve(appStateResultWithVisibility('nf-pitnet', 'nf004', 'archived', 7));
      await act(async () => {
        await pollLoad;
        await Promise.resolve();
      });
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(3);
      expect(bridgeMocks.getAppStateInvoke.mock.calls).toEqual([
        [{ profile: 'fast' }],
        [{ profile: 'fast' }],
        [{ profile: 'fast' }],
      ]);
      const coalescedPoll = loadOplAppStateFromBridge('fast');
      expect(bridgeMocks.getAppStateInvoke).toHaveBeenCalledTimes(3);

      freshReadback.resolve(appStateResultWithVisibility('nf-pitnet', 'nf004', 'visible', 8));
      await act(async () => {
        await Promise.all([mutation, coalescedPoll]);
      });
      expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('任务已恢复');
      expect(bridgeMocks.messageError).not.toHaveBeenCalledWith('可见性 readback 未确认，请刷新后重试。');
    } finally {
      unmount?.();
      vi.useRealTimers();
    }
  });

  it('archives by canonical selection but sends the repeated domain work item identity and generation', async () => {
    render(<RuntimePage />);

    expect(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NF-PitNET Paper 1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /001 DM CVD Mortality Risk/ }));
    fireEvent.click(await screen.findByTestId('runtime-archive-work-item'));

    const modal = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as {
      content: string;
      onOk: () => Promise<void>;
    };
    expect(modal.content).toContain('不会停止正在运行的自动流程，也不会删除证据');
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResultWithVisibility('diabetes', '001', 'archived', 4));
    await act(async () => {
      await modal.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenLastCalledWith({
      actionId: 'work_item_visibility_set',
      payloadRefsOnlyJson: {
        agent_id: 'mas',
        project_id: 'diabetes',
        work_item_id: '001',
        visibility_state: 'archived',
        reason: 'user_archived_from_runtime_overview',
        expected_generation: 3,
      },
      dryRun: false,
    });
    expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('任务已归档');
    await waitFor(() => expect(screen.getByTestId('runtime-open-archive')).toHaveTextContent('归档库（1）'), {
      timeout: 5_000,
    });
    expect(screen.queryByRole('button', { name: /001 DM CVD Mortality Risk/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /NF-PitNET Paper 1/ })).toBeInTheDocument();
  });

  it('does not select the wrong project when repeated work item ids are opened', async () => {
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /NF-PitNET Paper 1/ }));
    const drawer = await screen.findByTestId('runtime-task-detail');
    expect(drawer).toHaveTextContent('NF-PitNET');
    expect(drawer).toHaveTextContent('NF-PitNET Paper 1');
    fireEvent.click(screen.getByTestId('runtime-archive-work-item'));
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(
      appStateResultWithVisibility('nf-pitnet', '001', 'archived', 1)
    );

    const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actionId: 'work_item_visibility_set',
        payloadRefsOnlyJson: expect.objectContaining({
          project_id: 'nf-pitnet',
          work_item_id: '001',
          expected_generation: 0,
        }),
      })
    );
  });

  it('omits expected generation for a legacy visibility payload', async () => {
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /002 DM China US Mortality Attribution/ }));
    fireEvent.click(await screen.findByTestId('runtime-archive-work-item'));
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(
      appStateResultWithVisibility('diabetes', 'dm002', 'archived', 1)
    );

    const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenLastCalledWith({
      actionId: 'work_item_visibility_set',
      payloadRefsOnlyJson: {
        agent_id: 'mas',
        project_id: 'diabetes',
        work_item_id: 'dm002',
        visibility_state: 'archived',
        reason: 'user_archived_from_runtime_overview',
      },
      dryRun: false,
    });
  });

  it('restores an archived work item with its visibility generation', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue(appStateResultWithVisibility('nf-pitnet', 'nf004', 'archived', 7));
    render(<RuntimePage />);

    fireEvent.click(await screen.findByTestId('runtime-open-archive'));
    fireEvent.click(await screen.findByRole('button', { name: /NF-PitNET Paper 4/ }));
    fireEvent.click(await screen.findByTestId('runtime-restore-work-item'));
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(
      appStateResultWithVisibility('nf-pitnet', 'nf004', 'visible', 8)
    );

    const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.executeActionInvoke).toHaveBeenLastCalledWith({
      actionId: 'work_item_visibility_set',
      payloadRefsOnlyJson: {
        agent_id: 'mas',
        project_id: 'nf-pitnet',
        work_item_id: 'nf004',
        visibility_state: 'visible',
        reason: 'user_restored_from_runtime_archive',
        expected_generation: 7,
      },
      dryRun: false,
    });
    expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('任务已恢复');
  });

  it('keeps the drawer open when a successful mutation is not confirmed by fresh projection readback', async () => {
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));
    fireEvent.click(await screen.findByTestId('runtime-archive-work-item'));
    const readback = createRuntimeV2AppState();
    readback.app_state.operator.workbench.work_item_projection_v2.items =
      readback.app_state.operator.workbench.work_item_projection_v2.items.filter(
        (item) => !(item.identity.project_id === 'diabetes' && item.identity.work_item_id === '001')
      );
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce({ parsed: readback });
    const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.messageError).toHaveBeenCalledWith('可见性 readback 未确认，请刷新后重试。');
    expect(bridgeMocks.messageSuccess).not.toHaveBeenCalledWith('任务已归档');
    expect(screen.getByTestId('runtime-task-detail')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-archive-work-item')).toBeInTheDocument();
  });

  it('refreshes a generation conflict and keeps visible retry guidance', async () => {
    bridgeMocks.executeActionInvoke.mockResolvedValueOnce({
      ok: false,
      parsed: {
        error: {
          details: { reason_code: 'work_item_control_generation_conflict' },
        },
      },
      error: { message: 'Work item control changed after it was read; refresh before retrying.' },
    });
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));
    fireEvent.click(await screen.findByTestId('runtime-archive-work-item'));
    bridgeMocks.getAppStateInvoke.mockResolvedValueOnce(appStateResultWithVisibility('diabetes', '001', 'visible', 4));
    const confirmation = bridgeMocks.modalConfirm.mock.calls.at(-1)?.[0] as { onOk: () => Promise<void> };
    const stateReadCountBeforeConflict = bridgeMocks.getAppStateInvoke.mock.calls.length;
    await act(async () => {
      await confirmation.onOk();
    });

    expect(bridgeMocks.getAppStateInvoke.mock.calls.length).toBeGreaterThan(stateReadCountBeforeConflict);
    expect(bridgeMocks.messageError).toHaveBeenCalledWith('状态已刷新，请检查后重试。');
    expect(screen.getByTestId('runtime-task-detail')).toBeInTheDocument();
    expect(screen.getByTestId('runtime-archive-work-item')).toBeInTheDocument();
  });

  it('rerenders semantic action copy and the user owner for the active locale', async () => {
    const view = render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /002 DM China US Mortality Attribution/ }));
    const action = within(await screen.findByTestId('runtime-task-detail')).getByTestId('runtime-next-action');
    expect(action).toHaveTextContent('补齐投稿信息或发起修订');
    expect(action).toHaveTextContent('负责人：你');

    localeMocks.language = 'en-US';
    view.rerender(<RuntimePage />);

    expect(action).toHaveTextContent('Provide submission details or request a revision');
    expect(action).toHaveTextContent('Owner: You');
    expect(action).not.toHaveTextContent('里程碑投稿包已交付，待补齐作者和机构等客观信息。');
  });

  it('uses localized generic action copy for unknown Framework semantic keys', async () => {
    const payload = createRuntimeV2AppState();
    const item = payload.app_state.operator.workbench.work_item_projection_v2.items.find(
      (candidate) => candidate.identity.work_item_id === 'dm002'
    )!;
    item.action.title_key = 'framework.unmapped.title';
    item.action.summary_key = 'framework.unmapped.summary';
    item.action.title = '框架原始标题';
    item.action.summary = '框架原始摘要';
    localeMocks.language = 'en-US';
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: payload });
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /002 DM China US Mortality Attribution/ }));
    const action = within(await screen.findByTestId('runtime-task-detail')).getByTestId('runtime-next-action');
    expect(action).toHaveTextContent('Your action');
    expect(action).toHaveTextContent('Review this task and choose the appropriate next action.');
    expect(action).not.toHaveTextContent('框架原始标题');
    expect(action).not.toHaveTextContent('框架原始摘要');
  });

  it('opens minimal workflow details without evidence or diagnostic surfaces', async () => {
    const payload = createRuntimeV2AppState();
    const item = payload.app_state.operator.workbench.work_item_projection_v2.items.find(
      (candidate) => candidate.identity.work_item_id === '001' && candidate.identity.project_id === 'diabetes'
    )!;
    item.execution.current_stage_display_name = null;
    item.lifecycle.current_stage_display_name = null;
    item.execution.next_stage_id = null;
    item.execution.next_stage_display_name = null;
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: payload });
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
    expect(drawer).toHaveTextContent('下一阶段');
    expect(within(drawer).getByTestId('runtime-current-stage')).toHaveTextContent('分析结果复核');
    expect(within(drawer).getByTestId('runtime-next-stage')).toHaveTextContent('医学写作');
    expect(within(drawer).getByTestId('runtime-current-stage')).not.toHaveTextContent('Analysis review');
    expect(within(drawer).getByTestId('runtime-next-stage')).not.toHaveTextContent('继续推进');
    expect(drawer).toHaveTextContent('当前尝试');
    expect(drawer).toHaveTextContent('attempt:dm001');
    expect(drawer).toHaveTextContent('心跳摘要');
    expect(drawer).toHaveTextContent('当前阶段 Token');
    expect(drawer).toHaveTextContent('累计 Token');
    expect(drawer).toHaveTextContent('1,200');
    expect(drawer).toHaveTextContent('2,400');
    expect(drawer).toHaveTextContent('下一步动作');
    expect(drawer).toHaveTextContent('继续推进');
    expect(drawer).toHaveTextContent('医学写作');
    expect(drawer).toHaveTextContent('Med Auto Science');
    for (const forbidden of [
      '当前进展',
      '持续时间',
      '产物',
      '时间线',
      '诊断',
      '来源引用',
      'InventoryResolved',
      'domain_inventory_item_resolved',
      'STUDY_STATUS.md',
    ]) {
      expect(drawer).not.toHaveTextContent(forbidden);
    }
    expect(within(drawer).queryByTestId('runtime-detail-disclosure')).not.toBeInTheDocument();
    expect(drawer.querySelectorAll('.arco-collapse-item')).toHaveLength(0);
  });

  it('shows only the refs-only scientific entry and opens the typed detail route', async () => {
    render(<RuntimePage />);

    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));
    const drawer = await screen.findByTestId('runtime-task-detail');
    const summary = within(drawer).getByTestId('runtime-research-summary');
    expect(summary).toHaveTextContent('科研路线');
    expect(summary).toHaveTextContent('查看科研路线');
    expect(summary).not.toHaveTextContent('较高的基线炎症负荷与远期心血管死亡风险相关。');
    expect(summary).not.toHaveTextContent('分层分析显示关联方向一致，但效应量存在人群差异。');
    expect(summary).not.toHaveTextContent('当前证据支持继续验证，尚不足以形成因果结论。');
    expect(summary).not.toHaveTextContent('sha256:');
    expect(summary).not.toHaveTextContent('revision');

    fireEvent.click(within(summary).getByTestId('runtime-open-research-map'));
    expect(routeMocks.navigate).toHaveBeenCalledWith('/runtime/item/diabetes%3A001/insights/scientific-reasoning');
  });

  it('keeps core Runtime details and hides research details when the optional capability is absent', async () => {
    const payload = createRuntimeV2AppState();
    const item = payload.app_state.operator.workbench.work_item_projection_v2.items.find(
      (candidate) => candidate.identity.work_item_id === '001' && candidate.identity.project_id === 'diabetes'
    )!;
    delete (item as unknown as Record<string, unknown>).domain_detail_views;
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: payload });

    render(<RuntimePage />);
    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));

    const drawer = await screen.findByTestId('runtime-task-detail');
    expect(drawer).toHaveTextContent('阶段与运行');
    expect(drawer).toHaveTextContent('分析结果复核');
    expect(drawer).toHaveTextContent('下一步动作');
    expect(within(drawer).queryByTestId('runtime-research-summary')).not.toBeInTheDocument();
    expect(routeMocks.navigate).not.toHaveBeenCalled();
  });

  it('keeps core Runtime available when an unknown typed view has no renderer extension', async () => {
    const payload = createRuntimeV2AppState();
    const item = payload.app_state.operator.workbench.work_item_projection_v2.items.find(
      (candidate) => candidate.identity.work_item_id === '001' && candidate.identity.project_id === 'diabetes'
    )!;
    item.domain_detail_views = [
      {
        item_id: 'diabetes:001',
        view_id: 'future-insight',
        view_kind: 'future_domain_map',
        title: '未来洞察',
        schema_ref: 'contracts/future-domain-map.schema.json',
        availability: 'unread',
      },
    ];
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: payload });

    render(<RuntimePage />);
    fireEvent.click(await screen.findByRole('button', { name: /001 DM CVD Mortality Risk/ }));

    const drawer = await screen.findByTestId('runtime-task-detail');
    expect(drawer).toHaveTextContent('阶段与运行');
    expect(drawer).toHaveTextContent('下一步动作');
    const unavailable = within(drawer).getByTestId('runtime-domain-detail-view-unavailable');
    expect(unavailable).toHaveTextContent('未来洞察');
    expect(unavailable).toHaveTextContent('当前应用暂不支持此详情视图');
    expect(unavailable).toHaveTextContent('其他运行任务不受影响');
    expect(within(drawer).queryByTestId('runtime-research-summary')).not.toBeInTheDocument();
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

    expect(await screen.findByTestId('runtime-projection-unavailable')).toHaveTextContent('运行状态暂时不可用');
    expect(document.body).toHaveTextContent('V1 状态不再用于推断');
    expect(document.body).not.toHaveTextContent('Legacy running task');
    expect(screen.queryByTestId('runtime-error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-ready-state')).not.toBeInTheDocument();
  });

  it('keeps loading, ready, and empty page states mutually exclusive', async () => {
    let resolveState: ((value: { parsed: ReturnType<typeof createRuntimeV2AppState> }) => void) | undefined;
    bridgeMocks.getAppStateInvoke.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveState = resolve;
      })
    );
    const view = render(<RuntimePage />);

    expect(screen.getByTestId('runtime-loading-state')).toHaveTextContent('正在读取运行状态...');
    expect(screen.queryByTestId('runtime-ready-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-error-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-projection-unavailable')).not.toBeInTheDocument();

    await act(async () => {
      resolveState?.({ parsed: createRuntimeV2AppState() });
    });
    expect(await screen.findByTestId('runtime-ready-state')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-loading-state')).not.toBeInTheDocument();

    resetOplAppStateLoadsForTest();
    const emptyPayload = createRuntimeV2AppState();
    emptyPayload.app_state.operator.workbench.work_item_projection_v2.items = [];
    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: emptyPayload });
    view.unmount();
    render(<RuntimePage />);

    const emptyState = await screen.findByTestId('runtime-empty-state');
    expect(emptyState).toHaveTextContent('当前没有运行中的工作项。');
    expect(screen.getByTestId('runtime-summary')).toHaveTextContent('可用性');
    expect(screen.getByTestId('runtime-summary')).toHaveTextContent('运行中0');
    expect(screen.getByTestId('runtime-summary')).toHaveTextContent('需要处理0');
    expect(screen.queryByTestId('runtime-ready-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('runtime-loading-state')).not.toBeInTheDocument();
  });

  it('prioritizes the availability, running, and attention summary before the work list', async () => {
    render(<RuntimePage />);

    const summary = await screen.findByTestId('runtime-summary');
    const readyState = screen.getByTestId('runtime-ready-state');
    const workList = screen.getByTestId('runtime-work-item-list');
    expect(summary).toHaveTextContent('可用性可用');
    expect(summary).toHaveTextContent('运行中1');
    expect(summary).toHaveTextContent('需要处理1');
    expect(readyState.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy();
    expect(summary.compareDocumentPosition(workList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each([
    {
      raw: 'capability_catalog read failed at /Users/alice/.opl/catalog.json',
      kind: 'capability-catalog',
      title: '能力目录暂时不可用',
    },
    {
      raw: '(node:412) Warning: contract_shape_invalid {"unknown":["domain_detail_views"]} at /private/tmp/opl/config.json',
      kind: 'incompatible-configuration',
      title: '配置格式不兼容',
    },
    {
      raw: 'connect ECONNREFUSED 127.0.0.1:4111',
      kind: 'unavailable',
      title: '运行状态暂时不可用',
    },
  ])(
    'projects a localized $kind error without exposing raw diagnostics on the first screen',
    async ({ raw, kind, title }) => {
      bridgeMocks.getAppStateInvoke.mockResolvedValue({ ok: false, error: { message: raw } });
      render(<RuntimePage />);

      const errorState = await screen.findByTestId('runtime-error-state');
      const summary = within(errorState).getByTestId('runtime-error-summary');
      const details = within(errorState).getByTestId('runtime-technical-details');
      expect(errorState).toHaveAttribute('data-error-kind', kind);
      expect(summary).toHaveTextContent(title);
      expect(summary).not.toHaveTextContent(raw);
      expect(summary).not.toHaveTextContent('/Users/alice');
      expect(summary).not.toHaveTextContent('/private/tmp');
      expect(summary).not.toHaveTextContent('Node');
      expect(details).not.toHaveAttribute('open');
      expect(screen.queryByTestId('runtime-projection-unavailable')).not.toBeInTheDocument();
      expect(screen.queryByTestId('runtime-ready-state')).not.toBeInTheDocument();
    }
  );

  it('retries from the exclusive error state and routes maintenance to diagnostics', async () => {
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ok: false,
      error: { message: 'connect ECONNREFUSED 127.0.0.1:4111' },
    });
    render(<RuntimePage />);

    const errorState = await screen.findByTestId('runtime-error-state');
    fireEvent.click(within(errorState).getByRole('button', { name: '打开维护' }));
    expect(routeMocks.navigate).toHaveBeenCalledWith('/settings/environment?section=diagnostics');

    bridgeMocks.getAppStateInvoke.mockResolvedValue({ parsed: createRuntimeV2AppState() });
    fireEvent.click(within(errorState).getByRole('button', { name: '重试' }));
    expect(await screen.findByTestId('runtime-ready-state')).toBeInTheDocument();
    expect(screen.queryByTestId('runtime-error-state')).not.toBeInTheDocument();
  });

  it('copies bounded redacted diagnostics and reports clipboard feedback', async () => {
    const longToken = `token_${'x'.repeat(7000)}`;
    bridgeMocks.getAppStateInvoke.mockResolvedValue({
      ok: false,
      error: {
        message: `${String.fromCodePoint(27)}[31m(node:412) Warning: failed at /Users/alice/.opl/runtime/config.json api_key=secret-value ${longToken}`,
      },
    });
    render(<RuntimePage />);

    const details = await screen.findByTestId('runtime-technical-details');
    fireEvent.click(within(details).getByRole('button', { name: '复制诊断信息' }));

    await waitFor(() => expect(bridgeMocks.copyText).toHaveBeenCalledOnce());
    const copied = bridgeMocks.copyText.mock.calls[0]?.[0] as string;
    expect(copied.length).toBeLessThanOrEqual(4096);
    expect(copied).toContain('[path]');
    expect(copied).toContain('api_key=[redacted]');
    expect(copied).not.toContain('/Users/alice');
    expect(copied).not.toContain('secret-value');
    expect(copied).not.toContain('[31m');
    expect(bridgeMocks.messageSuccess).toHaveBeenCalledWith('诊断信息已复制');

    bridgeMocks.copyText.mockRejectedValueOnce(new Error('clipboard unavailable'));
    fireEvent.click(within(details).getByRole('button', { name: '复制诊断信息' }));
    await waitFor(() => expect(bridgeMocks.messageError).toHaveBeenCalledWith('无法复制诊断信息'));
  });
});
