import { describe, expect, it } from 'vitest';
import { readInitializePayload } from '@/renderer/pages/FirstRun/initializeModel';

describe('FirstRun initialize payload validation', () => {
  it('accepts the App-owned initialize shape', () => {
    const initialize = {
      setup_flow: {
        phase: 'core_setup',
        ready_to_launch: false,
        progress: {
          ready_required_count: 0,
          total_required_count: 3,
          ready_full_readiness_count: 0,
          total_full_readiness_count: 2,
          ready_optional_count: 0,
          total_optional_count: 1,
        },
        blocking_items: ['workspace_root'],
        maintenance_items: [],
      },
      checklist: [
        {
          item_id: 'workspace_root',
          label: 'Workspace Root',
          status: 'missing',
          required: true,
          blocking: true,
          readiness_layer: 'core_launch',
          severity: 'blocking',
          next_visible_step: 'Choose a writable workspace root.',
          detail_summary: 'No workspace selected.',
        },
        {
          item_id: 'codex',
          label: 'Codex CLI',
          status: 'ready',
          required: true,
          blocking: false,
          readiness_layer: 'core_launch',
          severity: 'info',
          next_visible_step: 'Continue to model access.',
          detail_summary: 'Codex is ready.',
        },
        {
          item_id: 'codex_config',
          label: 'Codex API Configuration',
          status: 'ready',
          required: true,
          blocking: false,
          readiness_layer: 'core_launch',
          severity: 'info',
          next_visible_step: 'Continue.',
          detail_summary: 'Model access is ready.',
        },
      ],
    };

    expect(readInitializePayload({ system_initialize: initialize })).toEqual(initialize);
  });

  it('rejects partial payloads that could produce premature ready or no-blocker claims', () => {
    expect(readInitializePayload({ system_initialize: {} })).toBeNull();
    expect(readInitializePayload({ system_initialize: { readiness: { launch_ready: true } } })).toBeNull();
  });

  it('rejects a ready claim without the three complete Core checklist items', () => {
    expect(
      readInitializePayload({
        system_initialize: {
          setup_flow: {
            phase: 'ready_to_finalize',
            ready_to_launch: true,
            progress: {
              ready_required_count: 3,
              total_required_count: 3,
              ready_full_readiness_count: 0,
              total_full_readiness_count: 2,
              ready_optional_count: 0,
              total_optional_count: 1,
            },
            blocking_items: [],
            maintenance_items: [],
          },
          checklist: [],
        },
      })
    ).toBeNull();
  });
});
