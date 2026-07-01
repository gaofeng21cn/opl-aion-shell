import { describe, expect, it, vi } from 'vitest';
import { buildCapabilitiesViewModel } from '@/renderer/pages/settings/capabilitiesProjection';

vi.mock('@/common/config/oplProductProfile', () => ({
  getOplDefaultHomeAssistants: () => [
    {
      id: 'mas',
      display_name: 'Med Auto Science',
      short_name: 'MAS',
      home_purpose_label: 'Research',
      description_i18n: { 'en-US': 'Research workflows.' },
    },
  ],
  getOplAssistantSkillProfile: () => ({ required_skills: ['mas'] }),
}));

describe('buildCapabilitiesViewModel', () => {
  it('projects workflow, connector, and export action refs without skill bodies or domain action execution', () => {
    const [research] = buildCapabilitiesViewModel(
      {
        modules: {
          items: [{ module_id: 'medautoscience', status: 'ready', codex_visible: true }],
        },
        operator: {
          workbench: {
            task_drilldowns: {
              medautoscience: {
                status: 'blocked',
                next_owner: 'opl_framework',
                next_visible_step: 'repair connector',
                workflow_refs: [
                  {
                    id: 'module-runtime-repair',
                    title: 'Module runtime repair',
                    status: 'available',
                    ref: 'opl://workflow/medautoscience/module-runtime-repair',
                    owner: 'opl_framework',
                    next_action: 'run dry-run first',
                    body: 'must not render',
                  },
                ],
                connector_readiness_refs: ['opl://connector/pubmed/readiness'],
                export_bundle_action_ref: 'opl://app-action/export_reproducibility_bundle',
                action_receipt: {
                  dry_run_action_ref: 'opl://app-action/task_action_receipt_preview',
                  latest_receipt_ref: 'receipt://export/latest',
                },
              },
            },
          },
        },
      },
      'en-US'
    );

    expect(research.workflowRefs).toEqual([
      {
        id: 'module-runtime-repair',
        title: 'Module runtime repair',
        status: 'available',
        ref: 'opl://workflow/medautoscience/module-runtime-repair',
        owner: 'opl_framework',
        nextAction: 'run dry-run first',
      },
    ]);
    expect(research.connectorReadinessRefs).toEqual([
      {
        id: 'readiness',
        title: 'readiness',
        status: 'blocked',
        ref: 'opl://connector/pubmed/readiness',
        owner: 'opl_framework',
        nextAction: 'repair connector',
      },
    ]);
    expect(research.exportBundleAction).toEqual({
      actionId: 'export_reproducibility_bundle',
      ref: 'opl://app-action/export_reproducibility_bundle',
      status: 'blocked',
      dryRunSummary: 'opl://app-action/task_action_receipt_preview',
      receiptSummary: 'receipt://export/latest',
    });
  });
});
