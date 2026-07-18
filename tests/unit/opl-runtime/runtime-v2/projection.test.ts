import { describe, expect, it } from 'vitest';
import {
  currentStageLabel,
  formatTokenObservation,
  nextStageLabel,
  resolveRuntimeAction,
  type RuntimeTranslate,
} from '@/renderer/pages/runtime/formatters';
import { readRuntimeWorkItemProjectionV2 } from '@/renderer/pages/runtime/projection';
import enUSCommon from '@/renderer/services/i18n/locales/en-US/common.json';
import zhCNCommon from '@/renderer/services/i18n/locales/zh-CN/common.json';
import { createRuntimeV2AppState, createRuntimeV2Projection, createScientificReasoningDescriptor } from './fixture';

const COMMON_MESSAGES = { 'en-US': enUSCommon, 'zh-CN': zhCNCommon };

function semanticTranslator(locale: 'en-US' | 'zh-CN'): RuntimeTranslate {
  const messages: Record<string, unknown> = COMMON_MESSAGES[locale];
  return (key, values) => {
    const template = messages[key.replace(/^common\./, '')];
    if (typeof template !== 'string') return key;
    return Object.entries(values ?? {}).reduce(
      (message, [name, value]) => message.replaceAll(`{{${name}}}`, String(value)),
      template
    );
  };
}

const noCurrentStageTranslator: RuntimeTranslate = (key) =>
  key === 'common.runtime.taskDetails.noCurrentStage' ? '暂无当前阶段' : key;

describe('Runtime V2 projection boundary', () => {
  it('reads the canonical agent, project, and work item inventory without runtime inference', () => {
    const result = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState());

    expect(result.state).toBe('ready');
    expect(result.projection?.agents).toHaveLength(5);
    expect(result.projection?.projects.map((project) => project.displayName)).toEqual([
      'DM-CVD-Mortality-Risk',
      'NF-PitNET',
      'Obesity',
    ]);
    expect(result.projection?.items).toHaveLength(9);
    expect(result.projection?.items[0]).toMatchObject({
      id: 'diabetes:001',
      workItemId: '001',
    });
    expect(result.projection?.items.filter((item) => item.workItemId === '001').map((item) => item.id)).toEqual([
      'diabetes:001',
      'nf-pitnet:001',
    ]);
    expect(result.projection?.items[0]?.visibility).toEqual({
      state: 'visible',
      source: 'default_visible',
      updatedAt: null,
      controlRef: null,
      generation: 3,
    });
    expect(result.projection).toMatchObject({
      diagnosticCount: 3,
      diagnosticDetailPolicy: 'summary_only',
      diagnostics: [],
    });
  });

  it('requires full diagnostics to include every counted detail', () => {
    const projection = createRuntimeV2Projection();
    projection.profile = 'full';
    projection.diagnostics = {
      count: 2,
      items: [{ reason: 'first_diagnostic' }],
      detail_policy: 'included',
    };

    expect(
      readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: projection } } })
    ).toEqual({ state: 'invalid', projection: null });

    projection.diagnostics.items.push({ reason: 'second_diagnostic' });
    expect(
      readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: projection } } }).state
    ).toBe('ready');
  });

  it('recognizes V1 without consuming its task state', () => {
    const result = readRuntimeWorkItemProjectionV2({
      operator: {
        workbench: {
          work_item_projection_v1: {
            schema_version: 'work-item-projection.v1',
            items: [{ item_id: 'legacy-running-task', state: 'running' }],
          },
        },
      },
    });

    expect(result).toEqual({ state: 'legacy', projection: null });
  });

  it('rejects an item envelope that does not match its canonical identity', () => {
    const projection = createRuntimeV2Projection();
    projection.items.push({ ...projection.items[0]!, item_id: 'distinct-envelope-for-the-same-work-item' });

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result).toEqual({ state: 'invalid', projection: null });
  });

  it('parses visibility generation without guessing from lifecycle generation', () => {
    const projection = createRuntimeV2Projection();
    const legacyGenerationItem = projection.items.find((item) => item.identity.work_item_id === 'dm002')!;
    const controlledVisibilityItem = projection.items.find((item) => item.identity.work_item_id === 'nf004')!;
    legacyGenerationItem.lifecycle.observed_generation = 'generation:should-not-be-used';
    controlledVisibilityItem.visibility = {
      ...controlledVisibilityItem.visibility,
      source: 'work_item_visibility_control',
      control_ref: 'visibility-control://mas/nf-pitnet/nf004',
      generation: 7,
    };

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.items.find((item) => item.workItemId === 'dm002')?.visibility.generation).toBeNull();
    expect(result.projection?.items.find((item) => item.workItemId === 'nf004')?.visibility).toMatchObject({
      state: 'visible',
      generation: 7,
    });
  });

  it('rejects malformed visibility state or generation', () => {
    const invalidState = createRuntimeV2Projection();
    invalidState.items[0]!.visibility.state = 'hidden';
    expect(
      readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: invalidState } } })
    ).toEqual({ state: 'invalid', projection: null });

    const invalidGeneration = createRuntimeV2Projection();
    invalidGeneration.items[0]!.visibility.generation = -1;
    expect(
      readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: invalidGeneration } } })
    ).toEqual({ state: 'invalid', projection: null });
  });

  it('does not turn module runtime readback into a work item', () => {
    const result = readRuntimeWorkItemProjectionV2({
      operator: {
        workbench: {
          work_item_projection_v2: createRuntimeV2Projection(),
          module_runtime: [{ module_id: 'mas', status: 'ready' }],
        },
      },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.items).toHaveLength(9);
    expect(result.projection?.items.some((item) => item.displayName === 'mas')).toBe(false);
  });

  it('keeps project scope independent from module availability diagnostics', () => {
    const projection = createRuntimeV2Projection();
    projection.agent_availability = [];
    projection.summary.work_item_count = 0;

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.agents.map((agent) => agent.displayName)).toContain('Med Auto Science');
    expect(result.projection?.items).toHaveLength(9);
  });

  it('does not claim system handling when the responsibility envelope is incomplete', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.lifecycle.primary_state = 'system_attention';
    Object.assign(projection.items[0]!.attention, {
      kind: 'system',
      owner: 'opl_framework',
      responsible_component: 'OPL Framework',
      issue: 'Worker is unavailable',
    });

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.projection?.items[0]).toMatchObject({
      primaryStatus: 'sync_pending',
      statusSyncReason: 'incomplete_system_attention',
      systemAttention: null,
    });
  });

  it('preserves all five actionable system handling fields', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.lifecycle.primary_state = 'system_attention';
    Object.assign(projection.items[0]!.attention, {
      kind: 'system',
      owner: 'opl_framework',
      responsible_component: 'OPL Framework',
      issue: 'Worker is unavailable',
      impact: 'The next stage cannot start',
      repair_action: 'Restart the managed worker',
      expected_outcome: 'Automatic execution resumes',
    });

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.projection?.items[0]?.primaryStatus).toBe('system_attention');
    expect(result.projection?.items[0]?.systemAttention).toMatchObject({
      responsibleComponent: 'OPL Framework',
      expectedOutcome: 'Automatic execution resumes',
    });
  });

  it('shows sync pending instead of deriving a user state when primary state is absent', () => {
    const projection = createRuntimeV2Projection();
    delete projection.items[0]!.lifecycle.primary_state;

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.projection?.items[0]).toMatchObject({
      primaryStatus: 'sync_pending',
      statusSyncReason: 'missing_primary_state',
    });
  });

  it('preserves projected stages and actions for the detail view', () => {
    const result = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState());
    const item = result.projection?.items[0];

    expect(item?.execution).toMatchObject({
      attemptId: 'attempt:dm001',
      currentStageDisplayName: '分析结果复核',
      nextStageDisplayName: '医学写作',
    });
    expect(item?.stageMap.map((stage) => stage.state)).toEqual([
      'completed',
      'completed',
      'current',
      'next',
      'pending',
    ]);
    expect(item?.action).toMatchObject({
      kind: 'agent_action',
      titleKey: 'lifecycle.active.title',
      summaryKey: 'lifecycle.active.summary',
      messageArgs: {
        agent_id: 'mas',
        agent_display_name: 'Med Auto Science',
      },
      owner: 'mas',
      ownerKind: 'agent',
      ownerDisplayName: 'Med Auto Science',
    });
  });

  it('rejects an explicitly invalid owner kind while accepting a legacy missing owner kind', () => {
    const invalid = createRuntimeV2Projection();
    invalid.items[0]!.action.owner_kind = '';
    expect(readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: invalid } } })).toEqual({
      state: 'invalid',
      projection: null,
    });

    const legacy = createRuntimeV2Projection();
    delete legacy.items[0]!.action.owner_kind;
    expect(
      readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: legacy } } }).projection
        ?.items[0]?.action?.ownerKind
    ).toBe('unknown');
  });

  it('never promotes a telemetry verification attempt to the business stage of a delivered item', () => {
    const result = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState());
    const item = result.projection?.items.find((candidate) => candidate.displayName.startsWith('002 '));

    expect(item?.primaryStatus).toBe('delivered_auto_paused');
    expect(item?.execution.currentStageId).toBeNull();
    expect(item?.execution.currentStageDisplayName).toBeNull();
    expect(item && currentStageLabel(item, 'zh-CN', noCurrentStageTranslator)).toBe('暂无当前阶段');
    expect(item?.taskUsage).toEqual({
      state: 'observed',
      inputTokens: 1480,
      outputTokens: 20,
      totalTokens: 1500,
      observedAt: '2026-07-13T08:00:00Z',
    });
    expect(JSON.stringify(item)).not.toContain('runtime_token_telemetry_verification');
  });

  it('parses the registered scientific descriptor as a refs-only locator', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.domain_detail_views = [createScientificReasoningDescriptor()];

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.items[0]?.domainDetailViews[0]).toMatchObject({
      viewId: 'scientific-reasoning',
      viewKind: 'scientific_reasoning_map',
      schemaVersion: 'scientific-reasoning-map.v2',
      availability: 'unread',
      revision: 7,
      digest: `sha256:${'b'.repeat(64)}`,
    });
    expect(result.projection?.items[0]?.domainDetailViews[0]).not.toHaveProperty('currentFocus');
    expect(result.projection?.items[0]?.domainDetailViews[0]).not.toHaveProperty('latestOutcome');
    expect(result.projection?.items[0]?.domainDetailViews[0]).not.toHaveProperty('activeBranch');
  });

  it('rejects descriptor medical prose and other fields outside the refs-only locator contract', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.domain_detail_views = [
      {
        ...createScientificReasoningDescriptor(),
        current_focus: { node_id: 'finding-1', primary_hypothesis: '不得进入 fast descriptor' },
      },
    ];

    expect(
      readRuntimeWorkItemProjectionV2({
        operator: { workbench: { work_item_projection_v2: projection } },
      })
    ).toEqual({ state: 'invalid', projection: null });
  });

  it('retains v1 scientific descriptor compatibility', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.domain_detail_views = [
      createScientificReasoningDescriptor({ schemaVersion: 'scientific-reasoning-map.v1' }),
    ];

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.items[0]?.domainDetailViews[0]).toMatchObject({
      viewKind: 'scientific_reasoning_map',
      schemaVersion: 'scientific-reasoning-map.v1',
      availability: 'unread',
    });
  });

  it('keeps unknown view kinds bounded without invalidating the runtime projection', () => {
    const projection = createRuntimeV2Projection();
    projection.items[0]!.domain_detail_views = [
      {
        item_id: 'diabetes:001',
        view_id: 'future-insight',
        view_kind: 'future_domain_map',
        schema_version: 'future-domain-map.v1',
        availability: 'unread',
      },
      {
        item_id: 'diabetes:001',
        view_id: 'scientific-reasoning',
        view_kind: 'scientific_reasoning_map',
        schema_version: 'scientific-reasoning-map.v3',
        availability: 'invalid',
        revision: 1,
      },
    ];

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.items[0]?.domainDetailViews).toEqual([
      expect.objectContaining({
        viewId: 'future-insight',
        viewKind: 'future_domain_map',
        schemaVersion: 'future-domain-map.v1',
      }),
      expect.objectContaining({
        viewId: 'scientific-reasoning',
        viewKind: 'scientific_reasoning_map',
        schemaVersion: 'scientific-reasoning-map.v3',
        availability: 'invalid',
      }),
    ]);
    expect(result.projection?.items[0]?.domainDetailViews[0]).not.toHaveProperty('currentFocus');
    expect(result.projection?.items[0]?.domainDetailViews[1]).not.toHaveProperty('latestOutcome');
  });

  it('fails closed for duplicate view ids, unsafe ids, and malformed digests', () => {
    for (const domainDetailViews of [
      [createScientificReasoningDescriptor(), createScientificReasoningDescriptor()],
      [{ ...createScientificReasoningDescriptor(), view_id: '../scientific-reasoning' }],
      [{ ...createScientificReasoningDescriptor(), digest: `sha256:${'A'.repeat(64)}` }],
      [{ ...createScientificReasoningDescriptor(), revision: Number.MAX_SAFE_INTEGER + 1 }],
      [{ ...createScientificReasoningDescriptor(), item_id: 'other:001' }],
    ]) {
      const projection = createRuntimeV2Projection();
      projection.items[0]!.domain_detail_views = domainDetailViews;

      expect(
        readRuntimeWorkItemProjectionV2({
          operator: { workbench: { work_item_projection_v2: projection } },
        })
      ).toEqual({ state: 'invalid', projection: null });
    }
  });
});

describe('Runtime V2 semantic action formatting', () => {
  it('uses exact stage-map display names ahead of execution labels for matching stage ids', () => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;
    const withDifferentExecutionLabels = {
      ...item,
      execution: {
        ...item.execution,
        currentStageDisplayName: 'Analysis review',
        nextStageDisplayName: 'Medical writing',
      },
    };

    expect(currentStageLabel(withDifferentExecutionLabels, 'en-US', semanticTranslator('en-US'))).toBe(
      'Analysis review'
    );
    expect(nextStageLabel(withDifferentExecutionLabels, 'en-US', semanticTranslator('en-US'))).toBe('Medical writing');
    expect(currentStageLabel(withDifferentExecutionLabels, 'zh-CN', semanticTranslator('zh-CN'))).toBe('分析结果复核');
    expect(nextStageLabel(withDifferentExecutionLabels, 'zh-CN', semanticTranslator('zh-CN'))).toBe('医学写作');
  });

  it('uses an explicitly projected next stage before falling back to the action', () => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;

    expect(nextStageLabel(item, 'en-US', semanticTranslator('en-US'))).toBe('Medical writing');

    const withoutNextStage = {
      ...item,
      execution: {
        ...item.execution,
        nextStageId: null,
        nextStageDisplayName: null,
      },
    };
    expect(nextStageLabel(withoutNextStage, 'en-US', semanticTranslator('en-US'))).toBe('Medical writing');

    const withoutProjectedNextStage = {
      ...withoutNextStage,
      stageMap: withoutNextStage.stageMap.map((stage) =>
        stage.state === 'next' ? { ...stage, state: 'pending' as const } : stage
      ),
    };
    expect(nextStageLabel(withoutProjectedNextStage, 'en-US', semanticTranslator('en-US'))).toBe('Continue advancing');
  });

  it('localizes known semantic keys and the user owner for the active locale', () => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items.find(
      (candidate) => candidate.workItemId === 'dm002'
    )!;

    expect(resolveRuntimeAction(item.action!, semanticTranslator('en-US'))).toEqual({
      title: 'Provide submission details or request a revision',
      summary: 'The milestone is delivered. Provide submission details, or restart the task when a revision is needed.',
      owner: 'You',
    });
    expect(resolveRuntimeAction(item.action!, semanticTranslator('zh-CN'))).toEqual({
      title: '补齐投稿信息或发起修订',
      summary: '里程碑已交付；请补齐投稿信息，或在需要修订时重新启动任务。',
      owner: '你',
    });
  });

  it.each([
    ['user', 'Framework User', 'You', '你'],
    ['system', 'Framework System', 'System', '系统'],
    ['agent', 'Med Auto Science', 'Med Auto Science', 'Med Auto Science'],
    ['other', 'Review Board', 'Review Board', 'Review Board'],
  ] as const)(
    'renders the %s owner according to the App owner-kind contract',
    (ownerKind, ownerDisplayName, en, zh) => {
      const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;
      const action = { ...item.action!, ownerKind, ownerDisplayName };

      expect(resolveRuntimeAction(action, semanticTranslator('en-US')).owner).toBe(en);
      expect(resolveRuntimeAction(action, semanticTranslator('zh-CN')).owner).toBe(zh);
    }
  );

  it.each([
    ['lifecycle.active', 'common.runtime.semanticAction.lifecycle.active'],
    ['lifecycle.deliveredPaused', 'common.runtime.semanticAction.lifecycle.deliveredPaused'],
    ['lifecycle.paused', 'common.runtime.semanticAction.lifecycle.paused'],
    ['lifecycle.stopped', 'common.runtime.semanticAction.lifecycle.stopped'],
    ['lifecycle.archived', 'common.runtime.semanticAction.lifecycle.archived'],
    ['lifecycle.unknown', 'common.runtime.semanticAction.lifecycle.unknown'],
    ['inventory.nextAction', 'common.runtime.semanticAction.inventoryNextAction'],
    ['systemRepair.action', 'common.runtime.semanticAction.systemRepair'],
  ])('maps the Framework %s key family through the allowlist', (frameworkPrefix, i18nPrefix) => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;
    const action = {
      ...item.action!,
      titleKey: `${frameworkPrefix}.title`,
      summaryKey: `${frameworkPrefix}.summary`,
      title: 'Framework title fallback',
      summary: 'Framework summary fallback',
    };

    expect(resolveRuntimeAction(action, (key) => `localized:${key}`)).toMatchObject({
      title: `localized:${i18nPrefix}.title`,
      summary: `localized:${i18nPrefix}.summary`,
    });
  });

  it.each([
    ['en-US', 'user_action', 'Your action', 'Review this task and choose the appropriate next action.'],
    ['en-US', 'system_action', 'System action', 'The system handles the next action for this task.'],
    ['en-US', 'agent_action', 'Agent action', 'The assigned agent handles the next action for this task.'],
    ['en-US', 'safe_action', 'Available action', 'Review the available action before running it for this task.'],
    ['en-US', 'blocked_no_action', 'No action available', 'No action can be run for this task right now.'],
    ['zh-CN', 'user_action', '需要你处理', '请查看这项任务并选择合适的下一步动作。'],
    ['zh-CN', 'system_action', '系统动作', '这项任务的下一步动作由系统处理。'],
    ['zh-CN', 'agent_action', '智能体动作', '这项任务的下一步动作由负责智能体处理。'],
    ['zh-CN', 'safe_action', '可执行动作', '请先查看这项任务提供的动作，再决定是否执行。'],
    ['zh-CN', 'blocked_no_action', '暂无可执行动作', '这项任务当前没有可执行动作。'],
  ] as const)('uses %s generic copy for an unknown %s semantic key', (locale, kind, title, summary) => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;
    const action = {
      ...item.action!,
      kind,
      titleKey: 'framework.unmapped.title',
      summaryKey: 'framework.unmapped.summary',
      title: '框架原始标题',
      summary: '框架原始摘要',
    };

    const resolved = resolveRuntimeAction(action, semanticTranslator(locale));
    expect(resolved).toMatchObject({ title, summary });
    expect(`${resolved.title} ${resolved.summary}`).not.toContain('框架原始');
  });

  it.each([
    ['en-US', 'System action', 'The system handles the next action for this task.'],
    ['zh-CN', '系统动作', '这项任务的下一步动作由系统处理。'],
  ] as const)('uses %s generic copy when semantic keys are missing', (locale, title, summary) => {
    const item = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState()).projection!.items[0]!;
    const action = {
      ...item.action!,
      kind: 'system_action' as const,
      titleKey: null,
      summaryKey: null,
      title: '框架原始标题',
      summary: '框架原始摘要',
    };

    expect(resolveRuntimeAction(action, semanticTranslator(locale))).toMatchObject({ title, summary });
  });
});

describe('Runtime V2 token display', () => {
  it('does not turn missing telemetry into zero tokens', () => {
    const value = formatTokenObservation(
      { state: 'missing', reason: 'no_usage_observed' },
      'en-US',
      (key, values) => `${key}${values?.count ?? ''}`
    );

    expect(value).toBe('common.runtime.telemetryMissing');
    expect(value).not.toContain('0');
  });

  it('shows not applicable when there is no current stage', () => {
    const value = formatTokenObservation(
      { state: 'missing', reason: 'current_stage_not_applicable' },
      'en-US',
      (key) => key
    );

    expect(value).toBe('common.runtime.telemetryNotApplicable');
  });
});
