import { describe, expect, it } from 'vitest';
import { readRuntimeSafeActions } from '@/renderer/pages/runtime/cockpit';
import { currentStageLabel, formatTokenObservation } from '@/renderer/pages/runtime/formatters';
import { readRuntimeWorkItemProjectionV2 } from '@/renderer/pages/runtime/projection';
import { createRuntimeV2AppState, createRuntimeV2Projection } from './fixture';

describe('Runtime V2 projection boundary', () => {
  it('reads the canonical agent, project, and work item inventory without runtime inference', () => {
    const result = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState());

    expect(result.state).toBe('ready');
    expect(result.projection?.agents).toHaveLength(5);
    expect(result.projection?.projects.map((project) => project.displayName)).toEqual([
      '糖尿病',
      '无功能垂体瘤',
      '肥胖',
    ]);
    expect(result.projection?.items).toHaveLength(9);
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

  it('rejects duplicate work item identities instead of guessing which row wins', () => {
    const projection = createRuntimeV2Projection();
    projection.items.push({ ...projection.items[0]!, item_id: 'distinct-envelope-for-the-same-work-item' });

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result).toEqual({ state: 'invalid', projection: null });
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

  it('accepts only canonical availability and does not derive it from inventory or task counts', () => {
    const projection = createRuntimeV2Projection();
    projection.agent_availability[0]!.availability = 'attention_required';
    projection.summary.work_item_count = 0;
    projection.items = [];

    const result = readRuntimeWorkItemProjectionV2({
      operator: { workbench: { work_item_projection_v2: projection } },
    });

    expect(result.state).toBe('ready');
    expect(result.projection?.agents[0]?.availability.state).toBe('attention_required');
    expect(result.projection?.agents.slice(1).every((agent) => agent.availability.state === 'available')).toBe(true);

    for (const retiredState of ['attention', 'unknown']) {
      const invalid = createRuntimeV2Projection();
      invalid.agent_availability[0]!.availability = retiredState;
      expect(
        readRuntimeWorkItemProjectionV2({ operator: { workbench: { work_item_projection_v2: invalid } } })
      ).toEqual({ state: 'invalid', projection: null });
    }
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

  it('exposes only explicit payload-free App safe actions', () => {
    const actions = readRuntimeSafeActions({
      app_operator_drilldown: {
        app_execution_bridge: {
          safe_action_routes: [
            {
              action_id: 'safe_app_action',
              submit_via: 'opl app action execute',
              route_requires_domain_or_app_payload: false,
              payload_fields: [],
            },
            {
              action_id: 'runtime_only_action',
              submit_via: 'opl runtime action execute',
              payload_fields: [],
            },
            {
              action_id: 'payload_action',
              submit_via: 'opl app action execute',
              route_requires_domain_or_app_payload: true,
              payload_fields: ['target_ref'],
            },
            { action_id: 'unmarked_action', payload_fields: [] },
          ],
        },
      },
    });

    expect(actions.map((action) => action.id)).toEqual(['safe_app_action']);
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
      ownerDisplayName: 'Med Auto Science',
    });
  });

  it('never promotes a telemetry verification attempt to the business stage of a delivered item', () => {
    const result = readRuntimeWorkItemProjectionV2(createRuntimeV2AppState());
    const item = result.projection?.items.find((candidate) => candidate.displayName.startsWith('002 '));
    const t = (key: string) => (key === 'common.runtime.taskDetails.noCurrentStage' ? '暂无当前阶段' : key);

    expect(item?.primaryStatus).toBe('delivered_auto_paused');
    expect(item?.execution.currentStageId).toBeNull();
    expect(item?.execution.currentStageDisplayName).toBeNull();
    expect(item && currentStageLabel(item, t)).toBe('暂无当前阶段');
    expect(item?.taskUsage).toEqual({
      state: 'observed',
      inputTokens: 1480,
      outputTokens: 20,
      totalTokens: 1500,
      observedAt: '2026-07-13T08:00:00Z',
    });
    expect(JSON.stringify(item)).not.toContain('runtime_token_telemetry_verification');
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
});
