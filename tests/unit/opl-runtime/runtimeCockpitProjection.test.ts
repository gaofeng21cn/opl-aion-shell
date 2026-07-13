import { describe, expect, it } from 'vitest';
import { readRuntimeTaskCockpitProjectionIndex } from '@/renderer/pages/runtime/runtimeCockpitProjection';

describe('runtime cockpit projection', () => {
  it('merges canonical task surfaces without inventing missing attention fields', () => {
    const projections = readRuntimeTaskCockpitProjectionIndex({
      app_state: {
        operator: {
          workbench: {
            task_drilldowns: [
              {
                task_id: 'task-1',
                system_attention: {
                  responsible_component: { display_name: 'Temporal worker' },
                  issue: { summary: 'Heartbeat is stale' },
                },
              },
            ],
            task_run_projection_v2: {
              tasks: [
                {
                  task_id: 'task-1',
                  stage_run_cockpit: {
                    stage_usage: {
                      telemetry_status: 'missing',
                      missing_reason: 'Stage usage was not reported',
                    },
                    task_total_usage: { observed_total_tokens: 0 },
                  },
                },
              ],
            },
            work_item_projection_v1: {
              items: [
                {
                  item_id: 'task-1',
                  system_attention: {
                    expected_outcome: { label: 'Heartbeat resumes' },
                  },
                },
              ],
            },
          },
        },
      },
    });

    expect(projections.get('task-1')).toEqual({
      systemAttention: {
        responsibleComponent: 'Temporal worker',
        issue: 'Heartbeat is stale',
        repairAction: null,
        impact: null,
        expectedOutcome: 'Heartbeat resumes',
        complete: false,
      },
      stageUsage: { state: 'missing', missingReason: 'Stage usage was not reported' },
      taskTotalUsage: { state: 'observed', totalTokens: 0 },
    });
  });

  it('does not present an unobserved zero token count as recorded usage', () => {
    const projections = readRuntimeTaskCockpitProjectionIndex({
      operator: {
        workbench: {
          task_run_projection_v2: {
            tasks: [
              {
                task_id: 'task-2',
                stage_usage: { total_tokens: 0 },
                task_total_usage: { total_tokens: 42 },
              },
            ],
          },
        },
      },
    });

    expect(projections.get('task-2')).toMatchObject({
      stageUsage: { state: 'missing', missingReason: null },
      taskTotalUsage: { state: 'observed', totalTokens: 42 },
    });
  });
});
