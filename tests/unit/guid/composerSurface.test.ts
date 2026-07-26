import { describe, expect, it } from 'vitest';
import { resolveOplActiveShortcut } from '@/renderer/pages/guid/utils/activeShortcut';
import {
  getMissingOplHomeComposerControls,
  resolveOplHomeComposerSurface,
} from '@/renderer/pages/guid/utils/composerSurface';

describe('OPL Home composer surface', () => {
  const projectedShortcuts = [
    ['mas', 'research', 'med-autoscience'],
    ['mag', 'grant', 'med-autogrant'],
    ['rca', 'ppt', 'redcube-ai'],
    ['obf', 'book', 'opl-bookforge'],
    ['oma', 'oma', 'opl-meta-agent'],
  ] as const;
  const appState = {
    agent_packages: {
      directory: {
        entries: projectedShortcuts.map(([packageId, shortcutId, codexVisibleEntry]) => ({
          package_id: packageId,
          display_name: packageId.toUpperCase(),
          package_role: 'standard_agent',
          installed: true,
          home_shortcuts: [
            {
              shortcut_id: shortcutId,
              label_i18n: { 'zh-CN': packageId.toUpperCase(), 'en-US': packageId.toUpperCase() },
              default_visible: true,
              user_configurable: true,
              route: {
                route_kind: 'agent_package_shortcut',
                executor: 'codex_cli',
                codex_visible_entry: codexVisibleEntry,
              },
            },
          ],
        })),
      },
      status_index: {
        home_shortcut_preferences: projectedShortcuts.map(([packageId, shortcutId], sortOrder) => ({
          package_id: packageId,
          shortcut_id: shortcutId,
          visible: true,
          sort_order: sortOrder,
          source: 'default',
          installed: true,
        })),
      },
    },
  };

  it.each([null, 'mas', 'mag', 'rca', 'obf', 'oma'] as const)(
    'keeps Codex-owned controls independent from shortcut %s',
    (packageId) => {
      const shortcut = packageId ? resolveOplActiveShortcut(packageId, appState) : null;
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
