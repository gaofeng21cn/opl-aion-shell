import { describe, expect, it } from 'vitest';
import { resolveOplActiveShortcut } from '@/renderer/pages/guid/utils/activeShortcut';
import {
  getMissingOplHomeComposerControls,
  resolveOplHomeComposerSurface,
} from '@/renderer/pages/guid/utils/composerSurface';

describe('OPL Home composer surface', () => {
  it.each([null, 'mas', 'mag', 'rca', 'obf', 'oma'] as const)(
    'keeps Codex-owned controls independent from shortcut %s',
    (packageId) => {
      const shortcut = packageId ? resolveOplActiveShortcut(packageId) : null;
      const surface = resolveOplHomeComposerSurface(shortcut);

      expect(surface).toMatchObject({
        executor: 'codex',
        active_package_id: packageId,
        model_reasoning_visible: true,
        permission_access_visible: true,
        executor_selector_visible: false,
      });
      expect(getMissingOplHomeComposerControls(surface)).toEqual([]);
    }
  );

  it('reports each missing or forbidden control by semantic name', () => {
    expect(
      getMissingOplHomeComposerControls({
        executor: 'codex',
        active_shortcut_id: 'research',
        active_package_id: 'mas',
        model_reasoning_visible: false,
        permission_access_visible: false,
        executor_selector_visible: true,
      })
    ).toEqual(['model_reasoning', 'permission_access', 'forbidden_executor_selector']);
  });
});
