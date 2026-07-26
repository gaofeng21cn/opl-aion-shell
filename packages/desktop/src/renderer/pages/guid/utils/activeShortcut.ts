import { getOplHomeAgentShortcutsFromAppState } from './oplHomeShortcutPreferences';

export type OplActiveShortcut = {
  shortcut_id: string;
  package_id: string;
  package_short_name: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  route_kind: 'agent_package_shortcut';
  executor: 'codex_cli';
  source: 'opl_app_home';
};

export function resolveOplActiveShortcut(
  value: string | undefined | null,
  appState: unknown
): OplActiveShortcut | null {
  if (!value) return null;
  const shortcut = getOplHomeAgentShortcutsFromAppState(appState).find(
    (entry) => entry.package_id === value || entry.shortcut_id === value
  );
  if (!shortcut) return null;
  return {
    shortcut_id: shortcut.shortcut_id,
    package_id: shortcut.package_id,
    package_short_name: shortcut.package_short_name,
    codex_visible_entry: shortcut.codex_visible_entry,
    required_skill_ids: [...shortcut.required_skill_ids],
    route_kind: shortcut.route_kind,
    executor: shortcut.executor,
    source: shortcut.source,
  };
}
