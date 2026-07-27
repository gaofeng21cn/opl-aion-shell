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
  const identity = value
    ?.trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!identity) return null;
  const matches = getOplHomeAgentShortcutsFromAppState(appState).filter((entry) =>
    [entry.package_id, entry.shortcut_id, entry.codex_visible_entry].some(
      (candidate) =>
        candidate
          .trim()
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]/g, '') === identity
    )
  );
  const shortcut = matches.length === 1 ? matches[0] : null;
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
