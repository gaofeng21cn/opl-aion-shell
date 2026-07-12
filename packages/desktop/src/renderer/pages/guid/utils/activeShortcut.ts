import {
  canonicalizeOplProfessionalAgentId,
  getOplAgentPackageInvocationReceiptPolicy,
  getOplBuiltinAssistantRouteReceiptPolicy,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackage,
} from '@/common/config/oplProductProfile';

export type OplActiveShortcut = {
  shortcut_id: string;
  package_id: string;
  package_short_name: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
};

export type OplAssistantRouteReceipt = {
  route_kind: string;
  executor: string;
  assistant_id: string;
  assistant_short_name: string;
  source: string;
};

export type OplAgentPackageInvocationReceipt = {
  route_kind: string;
  executor: string;
  package_id: string;
  shortcut_id: string;
  codex_visible_entry: string;
  required_skill_ids: string[];
  source: string;
};

export function resolveOplActiveShortcut(value: string | undefined | null): OplActiveShortcut | null {
  if (!value) return null;
  const canonicalId = canonicalizeOplProfessionalAgentId(value);
  const shortcut = getOplHomeAgentShortcuts().find(
    (entry) => entry.package_id === canonicalId || entry.shortcut_id === value
  );
  if (!shortcut) return null;
  const agentPackage = getOplProfessionalAgentPackage(shortcut.package_id);
  if (!agentPackage) return null;
  return {
    shortcut_id: shortcut.shortcut_id,
    package_id: agentPackage.package_id,
    package_short_name: agentPackage.short_name,
    codex_visible_entry: agentPackage.codex_visible_entry,
    required_skill_ids: [...agentPackage.required_skill_ids],
  };
}

export function buildOplShortcutRouteReceipt(shortcut: OplActiveShortcut | null): OplAssistantRouteReceipt | undefined {
  if (!shortcut) return undefined;
  const policy = getOplBuiltinAssistantRouteReceiptPolicy();
  if (!policy.required_for_assistants.includes(shortcut.package_id)) return undefined;
  return {
    route_kind: policy.route_kind,
    executor: policy.executor,
    assistant_id: shortcut.package_id,
    assistant_short_name: shortcut.package_short_name,
    source: policy.source,
  };
}

export function buildOplShortcutInvocationReceipt(
  shortcut: OplActiveShortcut | null
): OplAgentPackageInvocationReceipt | undefined {
  if (!shortcut) return undefined;
  const policy = getOplAgentPackageInvocationReceiptPolicy();
  if (!policy.required_for_package_shortcuts.includes(shortcut.shortcut_id)) return undefined;
  return {
    route_kind: policy.route_kind,
    executor: policy.executor,
    package_id: shortcut.package_id,
    shortcut_id: shortcut.shortcut_id,
    codex_visible_entry: shortcut.codex_visible_entry,
    required_skill_ids: [...shortcut.required_skill_ids],
    source: policy.source,
  };
}
