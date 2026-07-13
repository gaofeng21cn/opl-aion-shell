import { describe, expect, it } from 'vitest';
import { formatTokenObservation } from '@/renderer/pages/runtime/formatters';
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
    projection.items.push({ ...projection.items[0]! });

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

  it('does not claim system handling when the responsibility envelope is incomplete', () => {
    const projection = createRuntimeV2Projection();
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
      primaryStatus: 'unavailable',
      statusUnavailableReason: 'incomplete_system_attention',
      systemAttention: null,
    });
  });

  it('preserves all five actionable system handling fields', () => {
    const projection = createRuntimeV2Projection();
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

    expect(result.projection?.items[0]?.primaryStatus).toBe('system_attention_required');
    expect(result.projection?.items[0]?.systemAttention).toMatchObject({
      responsibleComponent: 'OPL Framework',
      expectedOutcome: 'Automatic execution resumes',
    });
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
