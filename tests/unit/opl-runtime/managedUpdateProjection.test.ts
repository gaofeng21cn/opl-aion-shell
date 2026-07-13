import { describe, expect, it, vi } from 'vitest';
import {
  readManagedUpdatePlane,
  readOplFlowManagedCapabilityCatalog,
} from '@/renderer/services/managedUpdateProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

describe('managed update projection public lifecycle ids', () => {
  it('ignores legacy component ids instead of mapping them into public update targets', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'runtime_substrate',
              state: 'update_available',
              safe_to_apply: true,
            },
          ],
        },
      },
      {}
    );

    expect(plane.components.map((component) => component.id)).toEqual(['opl_base', 'opl_app', 'opl_packages']);
    expect(plane.components.every((component) => component.state === 'unknown')).toBe(true);
    expect(plane.components.some((component) => component.safeToApply)).toBe(false);
  });

  it('keeps internal integration and migration state diagnostic-only', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'opl_base',
              state: 'update_available',
              safe_to_apply: true,
              dependency_status: 'ready',
              integration_status: { status: 'degraded', summary: 'Codex executor requires reload.' },
            },
            {
              component_id: 'opl_packages',
              package_id: 'oma',
              state: 'failed_with_repair',
              repair_allowed: true,
              projection_status: { state: 'needs_reload', summary: 'Refresh Codex plugin cache.' },
              profile_migration_status: 'manual_required',
            },
          ],
        },
      },
      {}
    );

    expect(plane.components.find((component) => component.id === 'opl_base')).toMatchObject({
      id: 'opl_base',
      safeToApply: true,
      substatuses: [
        { id: 'dependency_status', state: 'ready' },
        { id: 'integration_status', state: 'degraded', summary: 'Codex executor requires reload.' },
      ],
    });
    expect(plane.components.find((component) => component.id === 'opl_packages')).toMatchObject({
      id: 'opl_packages',
      packageId: 'oma',
      repairAllowed: true,
      substatuses: [
        { id: 'projection_status', state: 'needs_reload' },
        { id: 'profile_migration_status', state: 'manual_required' },
      ],
    });
  });

  it('projects verified external owner updates under OPL Base without inventing a Flow catalog', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'opl_base',
              state: 'current',
              current: {
                dependency_catalog: {
                  lifecycle_owner: 'opl_base',
                  dependencies: [
                    {
                      dependency_id: 'codex-cli',
                      dependency_kind: 'runtime_executor',
                      installed: true,
                      version: '1.2.3',
                      currentness: 'current',
                      ownership: 'opl_managed',
                      update_mode: 'silent_managed',
                      external_installations: [
                        {
                          dependency_id: 'codex-cli-homebrew',
                          installed: true,
                          version: '1.2.2',
                          latest_version: '1.2.3',
                          currentness: 'update_available',
                          ownership: 'homebrew',
                          update_mode: 'explicit_owner_delegated',
                          update_action: {
                            action_id: 'update_external_codex_homebrew',
                            label: 'Update with Homebrew',
                            surface: 'opl app action execute',
                            payload_fields: [],
                            confirmation_required: true,
                            owner_kind: 'homebrew_formula',
                            auto_apply_allowed: false,
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          ],
        },
      },
      {}
    );

    const catalog = plane.components.find((component) => component.id === 'opl_base')?.dependencyCatalog;
    expect(catalog?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'codex-cli', external: false, updateMode: 'silent_managed' }),
        expect.objectContaining({
          id: 'codex-cli-homebrew',
          external: true,
          updateMode: 'explicit_owner_delegated',
          updateAction: expect.objectContaining({
            actionId: 'update_external_codex_homebrew',
            surface: 'opl app action execute',
            confirmationRequired: true,
            autoApplyAllowed: false,
          }),
        }),
      ])
    );
  });

  it('reads OPL Flow managed skills and tools from the typed dependency catalog', () => {
    const catalog = readOplFlowManagedCapabilityCatalog({
      lifecycleOwner: 'opl_base',
      flowDependencies: [
        {
          id: 'opl-flow',
          kind: 'codex_skill',
          installed: true,
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          external: false,
        },
        {
          id: 'officecli-pptx',
          kind: 'codex_skill',
          installed: true,
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          external: false,
        },
        {
          id: 'officecli-docx',
          kind: 'codex_skill',
          installed: true,
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          external: false,
        },
        {
          id: 'ui-ux-pro-max',
          kind: 'codex_skill',
          installed: true,
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          external: false,
        },
        {
          id: 'officecli',
          kind: 'cli',
          installed: true,
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          external: false,
        },
      ],
      dependencies: [
        {
          id: 'officecli',
          kind: 'cli',
          installed: true,
          version: '1.0.0',
          currentness: 'current',
          ownership: 'opl_flow_managed',
          updateMode: 'silent_managed',
          binaryPath: '/usr/local/bin/officecli',
          external: false,
        },
      ],
    });

    expect(catalog.skillIds).toEqual(['opl-flow', 'officecli-pptx', 'officecli-docx', 'ui-ux-pro-max']);
    expect(catalog.skillDependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'officecli-pptx', installed: true, currentness: 'current' }),
        expect.objectContaining({ id: 'ui-ux-pro-max', installed: true, currentness: 'current' }),
      ])
    );
    expect(catalog.cliDependencies).toEqual([
      expect.objectContaining({ id: 'officecli', currentness: 'current', updateMode: 'silent_managed' }),
    ]);
  });

  it('returns no Flow capabilities when the typed dependency catalog is empty', () => {
    const catalog = readOplFlowManagedCapabilityCatalog({
      lifecycleOwner: 'opl_base',
      flowDependencies: [],
      dependencies: [],
    });

    expect(catalog).toEqual({ skillIds: [], skillDependencies: [], cliDependencies: [] });
  });

  it('requires an explicit package id before package mutations become executable', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [{ component_id: 'opl_packages', state: 'update_available', safe_to_apply: true }],
        },
      },
      {}
    );

    expect(plane.components.find((component) => component.id === 'opl_packages')).toMatchObject({
      safeToApply: false,
      repairAllowed: false,
      rollbackAllowed: false,
    });
  });
  it('reads the package manual target count without reviving a legacy public component id', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'capability_packages',
              state: 'skipped_manual_required',
              status_detail: { manual_required_targets_count: 3 },
            },
          ],
        },
      },
      {}
    );

    expect(plane.packageManualRequiredTargetCount).toBe(3);
    expect(plane.components.map((component) => component.id)).toEqual(['opl_base', 'opl_app', 'opl_packages']);
  });
});
