import { describe, expect, it, vi } from 'vitest';
import { readManagedUpdatePlane } from '@/renderer/services/managedUpdateProjection';

vi.mock('@/renderer/hooks/system/useOplAppState', () => ({
  oplRecord: (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  oplRecordList: (value: unknown) =>
    Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)) : [],
  oplString: (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null),
}));

describe('managed update projection canonical ids', () => {
  it('preserves source aliases for display without making fallback components executable', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'runtime_toolchain',
              label: 'Runtime toolchain legacy alias',
              state: 'update_available',
              safe_to_apply: true,
              repair_allowed: true,
            },
          ],
          repair_actions: [
            {
              component_id: 'runtime_toolchain',
              action_ref: 'action://legacy-runtime-toolchain-repair',
              receipt_ref: 'receipt://legacy-runtime-toolchain',
            },
          ],
        },
      },
      {}
    );

    const runtime = plane.components.find((component) => component.id === 'runtime_substrate');

    expect(runtime).toMatchObject({
      id: 'runtime_substrate',
      sourceId: 'runtime_toolchain',
      label: 'Runtime toolchain legacy alias',
      repairAction: 'action://legacy-runtime-toolchain-repair',
      safeToApply: false,
      repairAllowed: false,
      rollbackAllowed: false,
    });
  });

  it('keeps canonical App component ids actionable when the contract marks them safe', () => {
    const plane = readManagedUpdatePlane(
      {
        managed_update: {
          components: [
            {
              component_id: 'capability_packages',
              state: 'update_available',
              safe_to_apply: true,
            },
          ],
        },
      },
      {}
    );

    expect(plane.components.find((component) => component.id === 'capability_packages')).toMatchObject({
      id: 'capability_packages',
      safeToApply: true,
    });
  });
});
