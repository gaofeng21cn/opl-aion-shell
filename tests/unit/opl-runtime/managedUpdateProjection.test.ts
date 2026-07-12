import { describe, expect, it, vi } from 'vitest';
import { readManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

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
});
