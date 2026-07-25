import type { Assistant } from '@/common/types/agent/assistantTypes';
import { canonicalizeOplProfessionalAgentId } from '@/common/config/oplProductProfile';
import { parseOplStandardAgentDirectoryEntries } from '@/common/types/opl/appState';
import {
  getOplHomeAgentShortcutsFromAppState,
  getOplHomeShortcutPreferencesFromAppState,
  isOplHomeShortcutVisible,
} from './oplHomeShortcutPreferences';

type OplHomePackageProfile = {
  id: string;
  display_name: string;
  description: string;
};

type OplAgentPackageDirectoryEntry = {
  packageId: string;
  displayName: string;
  description: string;
  installed: boolean;
};

export type OplHomeAssistant = Assistant & {
  opl_package_id: string;
  opl_shortcut_id: string;
};

export type OplPackageLaunchGate = {
  state: 'ready' | 'degraded' | 'package_unavailable';
  launchAllowed: boolean | null;
  launchBlockedReason: string | null;
  allowedWhenBlocked: string[];
};

const PACKAGE_UNAVAILABLE_REASONS = new Set([
  'package_not_installed',
  'package_disabled',
  'package_identity_mismatch',
  'entrypoint_missing',
  'required_export_missing',
  'unsafe_managed_target',
  'managed_target_unavailable',
  'permission_denied',
  'authorization_denied',
]);
const DEGRADED_PACKAGE_REASONS = new Set([
  'package_version_mismatch',
  'incompatible_package_version',
  'package_status_read_failed',
  'package_dependency_missing',
  'physical_surface_not_ready',
  'runtime_source_missing',
  'runtime_source_incompatible',
  'carrier_authority_invalid',
  'live_verification_deferred',
  'verification_deferred',
  'stale_status',
  'status_stale',
  'update_available',
  'optional_dependency_missing',
  'package_activation_required',
  'operational_not_ready',
]);

function appStateRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function packageStatusRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(appStateRecord).filter((entry) => Object.keys(entry).length > 0);
  return Object.entries(appStateRecord(value)).map(([packageId, entry]) => {
    const record = { ...appStateRecord(entry) };
    record.package_id ??= packageId;
    return record;
  });
}

function packageDirectoryEntry(appState: unknown, packageId: string): Record<string, unknown> | null {
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const directory = appStateRecord(packages.directory);
  const canonicalPackageId = canonicalizeOplProfessionalAgentId(packageId);
  return (
    (Array.isArray(directory.entries) ? directory.entries : [])
      .map(appStateRecord)
      .find(
        (entry) =>
          typeof entry.package_id === 'string' &&
          canonicalizeOplProfessionalAgentId(entry.package_id) === canonicalPackageId
      ) ?? null
  );
}

function packageStatusEntry(appState: unknown, packageId: string): Record<string, unknown> | null {
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const statusIndex = appStateRecord(packages.status_index);
  const canonicalPackageId = canonicalizeOplProfessionalAgentId(packageId);
  return (
    packageStatusRecords(statusIndex.packages).find(
      (entry) =>
        typeof entry.package_id === 'string' &&
        canonicalizeOplProfessionalAgentId(entry.package_id) === canonicalPackageId
    ) ?? null
  );
}

export function resolveOplPackageLaunchGate(appState: unknown, packageId: string): OplPackageLaunchGate {
  const status = packageStatusEntry(appState, packageId);
  const directoryEntry = packageDirectoryEntry(appState, packageId);
  const directoryReadiness = appStateRecord(directoryEntry?.readiness);
  const operationalReady =
    typeof directoryReadiness.operational_ready === 'boolean'
      ? directoryReadiness.operational_ready
      : typeof status?.operational_ready === 'boolean'
        ? status.operational_ready
        : null;
  const projectedLaunchAllowed =
    typeof directoryReadiness.launch_allowed === 'boolean'
      ? directoryReadiness.launch_allowed
      : typeof status?.launch_allowed === 'boolean'
        ? status.launch_allowed
        : null;
  const directoryReason =
    typeof directoryReadiness.reason === 'string' && directoryReadiness.reason.trim()
      ? directoryReadiness.reason.trim()
      : null;
  const statusReason =
    typeof status?.launch_blocked_reason === 'string' && status.launch_blocked_reason.trim()
      ? status.launch_blocked_reason.trim()
      : null;
  const launchBlockedReason =
    typeof directoryReadiness.launch_allowed === 'boolean'
      ? directoryReadiness.launch_allowed
        ? null
        : directoryReason
      : (statusReason ?? directoryReason);
  const degradedReason = Boolean(
    launchBlockedReason &&
    (DEGRADED_PACKAGE_REASONS.has(launchBlockedReason) ||
      launchBlockedReason.startsWith('scope_materialization_') ||
      launchBlockedReason.startsWith('optional_'))
  );
  const unavailable = Boolean(
    (launchBlockedReason && PACKAGE_UNAVAILABLE_REASONS.has(launchBlockedReason)) ||
    (projectedLaunchAllowed === false && launchBlockedReason && !degradedReason) ||
    (projectedLaunchAllowed === false && operationalReady === true && !launchBlockedReason)
  );
  const launchState = unavailable ? 'package_unavailable' : operationalReady === true ? 'ready' : 'degraded';
  return {
    state: launchState,
    launchAllowed: unavailable ? false : projectedLaunchAllowed,
    launchBlockedReason,
    allowedWhenBlocked: Array.isArray(status?.allowed_when_blocked)
      ? status.allowed_when_blocked.filter(
          (action): action is string => typeof action === 'string' && action.trim().length > 0
        )
      : [],
  };
}

function agentPackageDirectoryEntries(appState: unknown): OplAgentPackageDirectoryEntry[] {
  const parsedByPackageId = new Map(
    parseOplStandardAgentDirectoryEntries(appState).map((entry) => [entry.packageId, entry])
  );
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const directory = appStateRecord(packages.directory);
  return (Array.isArray(directory.entries) ? directory.entries : []).map(appStateRecord).flatMap((entry) => {
    const packageId = typeof entry.package_id === 'string' ? entry.package_id.trim() : '';
    const parsed = parsedByPackageId.get(packageId);
    if (!parsed) return [];
    const displayName = parsed.displayName ?? packageId;
    const description = parsed.description ?? displayName;
    return [{ packageId, displayName, description, installed: parsed.installed }];
  });
}

function agentPackageProfiles(appState: unknown): OplHomePackageProfile[] {
  return agentPackageDirectoryEntries(appState).map((entry) => {
    return {
      id: entry.packageId,
      display_name: entry.displayName,
      description: entry.description,
    };
  });
}

const normalizeAssistantId = (id: string): string => canonicalizeOplProfessionalAgentId(id);

const buildAssistantFromProfile = (profile: OplHomePackageProfile, sortOrder: number): Assistant => {
  return {
    id: profile.id,
    source: 'builtin',
    name: profile.display_name,
    name_i18n: { 'zh-CN': profile.display_name, 'en-US': profile.display_name },
    description: profile.description,
    description_i18n: { 'zh-CN': profile.description, 'en-US': profile.description },
    enabled: true,
    sort_order: sortOrder,
    agent_status: 'missing',
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context: '',
    context_i18n: {},
    prompts: [],
    prompts_i18n: {},
    models: [],
  };
};

const mergeAssistantWithProfile = (
  existing: Assistant,
  profile: OplHomePackageProfile,
  sortOrder: number
): Assistant => {
  const merged = Object.assign({}, existing);
  merged.id = profile.id;
  merged.enabled = existing.enabled !== false;
  merged.sort_order = sortOrder;
  merged.name = profile.display_name;
  merged.name_i18n = { 'zh-CN': profile.display_name, 'en-US': profile.display_name };
  merged.description = profile.description;
  merged.description_i18n = { 'zh-CN': profile.description, 'en-US': profile.description };
  merged.prompts = [...(existing.prompts || [])];
  merged.prompts_i18n = Object.fromEntries(
    Object.entries(existing.prompts_i18n || {}).map(([locale, values]) => [locale, [...values]])
  );
  merged.enabled_skills = [...(existing.enabled_skills || [])];
  merged.custom_skill_names = existing.custom_skill_names || [];
  merged.disabled_builtin_skills = [];
  merged.context_i18n = existing.context_i18n || {};
  merged.models = existing.models || [];
  return merged;
};

function resolveOplAssistantsFromProfiles(
  backendAssistants: Assistant[],
  profiles: OplHomePackageProfile[]
): Assistant[] {
  const backendById = new Map<string, Assistant>();
  for (const assistant of backendAssistants) {
    backendById.set(normalizeAssistantId(assistant.id), assistant);
  }

  return profiles.map((profile, index) => {
    const existing = backendById.get(normalizeAssistantId(profile.id));
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1);
  });
}

/** Resolve the user-configured shortcut subset rendered on Home. */
export function resolveOplHomeAssistants(backendAssistants: Assistant[], appState: unknown): OplHomeAssistant[] {
  const shortcuts = getOplHomeAgentShortcutsFromAppState(appState);
  const preferences = getOplHomeShortcutPreferencesFromAppState(appState) ?? {
    hiddenShortcutIds: [],
    visibleShortcutIds: [],
    orderedShortcutIds: [],
  };
  const assistantsByPackage = new Map(
    resolveOplProfessionalAgentAssistants(backendAssistants, appState).map(
      (assistant) => [normalizeAssistantId(assistant.id), assistant] as const
    )
  );
  return shortcuts
    .filter((shortcut) => isOplHomeShortcutVisible(shortcut, preferences))
    .flatMap((shortcut, index) => {
      const assistant = assistantsByPackage.get(normalizeAssistantId(shortcut.package_id));
      if (!assistant) return [];
      return [
        {
          ...assistant,
          id: shortcut.shortcut_id,
          name: shortcut.primary_label,
          name_i18n: { 'zh-CN': shortcut.primary_label, 'en-US': shortcut.primary_label },
          sort_order: index + 1,
          opl_package_id: shortcut.package_id,
          opl_shortcut_id: shortcut.shortcut_id,
        },
      ];
    });
}

/** Resolve installed Agent Packages from the Framework directory for selection surfaces. */
export function resolveOplProfessionalAgentAssistants(backendAssistants: Assistant[], appState: unknown): Assistant[] {
  return resolveOplAssistantsFromProfiles(backendAssistants, agentPackageProfiles(appState));
}
