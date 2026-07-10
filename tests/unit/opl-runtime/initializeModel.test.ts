import { describe, expect, it } from 'vitest';
import { readCoreLaunchPrerequisiteState, readInitializePayload } from '@/renderer/pages/FirstRun/initializeModel';

const blockedInitialize = {
  setup_flow: {
    phase: 'core_setup',
    ready_to_launch: false,
    progress: {
      ready_required_count: 2,
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

describe('FirstRun initialize payload validation', () => {
  it('accepts the App-owned initialize shape', () => {
    expect(readInitializePayload({ system_initialize: blockedInitialize })).toEqual(blockedInitialize);
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

  it('rejects a false ready gate when all Core items and counts are already complete', () => {
    const initialize = structuredClone(blockedInitialize);
    initialize.setup_flow.progress.ready_required_count = 3;
    initialize.setup_flow.blocking_items = [];
    initialize.checklist[0] = {
      ...initialize.checklist[0],
      status: 'ready',
      blocking: false,
      severity: 'info',
    };

    expect(readInitializePayload({ system_initialize: initialize })).toBeNull();
  });

  it('rejects disabled required Core items even when the payload claims ready', () => {
    const initialize = structuredClone(blockedInitialize);
    initialize.setup_flow.ready_to_launch = true;
    initialize.setup_flow.progress.ready_required_count = 3;
    initialize.setup_flow.blocking_items = [];
    initialize.checklist = initialize.checklist.map((item) => ({
      ...item,
      status: 'disabled',
      blocking: false,
      severity: 'info',
    }));

    expect(readInitializePayload({ system_initialize: initialize })).toBeNull();
  });

  it('rejects checklist items that omit the required contract field', () => {
    const initialize = structuredClone(blockedInitialize);
    delete (initialize.checklist[0] as { required?: boolean }).required;

    expect(readInitializePayload({ system_initialize: initialize })).toBeNull();
  });
});

describe('Core launch prerequisite projection', () => {
  const appState = {
    schema_version: 'opl_app_state.v1',
    core: {
      codex: {
        installed: true,
        model_access_ready: true,
        version_status: 'compatible',
        health_status: 'ready',
      },
    },
    paths: {
      workspace_root: {
        selected_path: '/Users/example/OPL Workspace',
        exists: true,
        health_status: 'ready',
      },
    },
  };

  it('projects workspace, local assistant, and model access independently', () => {
    const withoutWorkspace = structuredClone(appState);
    withoutWorkspace.paths.workspace_root.health_status = 'missing';

    expect(readCoreLaunchPrerequisiteState(withoutWorkspace)).toEqual({
      known: true,
      workspaceRootReady: false,
      codexCliReady: true,
      modelAccessReady: true,
      readyToLaunch: false,
    });
  });

  it('keeps unknown App state distinct from a confirmed missing prerequisite', () => {
    expect(readCoreLaunchPrerequisiteState({})).toEqual({
      known: false,
      workspaceRootReady: false,
      codexCliReady: false,
      modelAccessReady: false,
      readyToLaunch: false,
    });
  });
});
