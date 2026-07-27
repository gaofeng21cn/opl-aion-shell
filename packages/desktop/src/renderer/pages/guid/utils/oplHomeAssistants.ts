import type { Assistant } from '@/common/types/agent/assistantTypes';
import type {
  OplAppContributionBadge,
  OplAppContributionCommand,
  OplAppContributionView,
} from '@/common/types/opl/appState';
import { parseOplStandardAgentDirectoryEntries } from '@/common/types/opl/appState';
import { getOplPackageAppContributionsFromAppState } from './oplAppContributions';
import {
  getOplHomeAgentShortcutsFromAppState,
  getOplHomeAppNavigationFromAppState,
  type OplHomeAppNavigationDescriptor,
} from './oplHomeShortcutPreferences';

type OplHomePackageProfile = {
  id: string;
  assistantIds: string[];
  display_name: string;
  display_name_i18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  description: string;
  description_i18n: Partial<Record<'zh-CN' | 'en-US', string>>;
};

type OplAgentPackageDirectoryEntry = {
  packageId: string;
  assistantIds: string[];
  displayName: string;
  displayNameI18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  description: string;
  descriptionI18n: Partial<Record<'zh-CN' | 'en-US', string>>;
  installed: boolean;
};

export type OplHomeAssistant = Assistant & {
  opl_package_id: string;
  opl_shortcut_id: string;
};

export type OplHomeAppContribution = OplHomeAppNavigationDescriptor & {
  view: OplAppContributionView;
  commands: OplAppContributionCommand[];
  badges: OplAppContributionBadge[];
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
    const record = Object.assign({}, appStateRecord(entry));
    record.package_id ??= packageId;
    return record;
  });
}

function packageDirectoryEntry(appState: unknown, packageId: string): Record<string, unknown> | null {
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const directory = appStateRecord(packages.directory);
  return (
    (Array.isArray(directory.entries) ? directory.entries : [])
      .map(appStateRecord)
      .find((entry) => typeof entry.package_id === 'string' && entry.package_id === packageId) ?? null
  );
}

function packageStatusEntry(appState: unknown, packageId: string): Record<string, unknown> | null {
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const statusIndex = appStateRecord(packages.status_index);
  return (
    packageStatusRecords(statusIndex.packages).find(
      (entry) => typeof entry.package_id === 'string' && entry.package_id === packageId
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
    const displayName = parsed.displayNameI18n['zh-CN'] ?? parsed.displayNameI18n['en-US'] ?? parsed.displayName;
    const description =
      parsed.descriptionI18n['zh-CN'] ?? parsed.descriptionI18n['en-US'] ?? parsed.description ?? displayName;
    if (!displayName || !description) return [];
    return [
      {
        packageId,
        assistantIds: [...new Set(parsed.homeShortcuts.map((shortcut) => shortcut.route.codexVisibleEntry))],
        displayName,
        displayNameI18n: parsed.displayNameI18n,
        description,
        descriptionI18n: parsed.descriptionI18n,
        installed: parsed.installed,
      },
    ];
  });
}

function agentPackageProfiles(appState: unknown): OplHomePackageProfile[] {
  return agentPackageDirectoryEntries(appState).map((entry) => {
    return {
      id: entry.packageId,
      assistantIds: entry.assistantIds,
      display_name: entry.displayName,
      display_name_i18n: entry.displayNameI18n,
      description: entry.description,
      description_i18n: entry.descriptionI18n,
    };
  });
}

function normalizeDescriptorIdentity(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function descriptorIdentityValues(profile: OplHomePackageProfile): string[] {
  return [...new Set([profile.id, ...profile.assistantIds].map(normalizeDescriptorIdentity).filter(Boolean))];
}

const localizedOrFallback = (
  localized: Partial<Record<'zh-CN' | 'en-US', string>>,
  fallback: string
): Partial<Record<'zh-CN' | 'en-US', string>> =>
  Object.keys(localized).length > 0 ? { ...localized } : { 'zh-CN': fallback, 'en-US': fallback };

const buildAssistantFromProfile = (profile: OplHomePackageProfile, sortOrder: number): Assistant => {
  return {
    id: profile.id,
    source: 'builtin',
    name: profile.display_name,
    name_i18n: localizedOrFallback(profile.display_name_i18n, profile.display_name),
    description: profile.description,
    description_i18n: localizedOrFallback(profile.description_i18n, profile.description),
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
  merged.name_i18n = localizedOrFallback(profile.display_name_i18n, profile.display_name);
  merged.description = profile.description;
  merged.description_i18n = localizedOrFallback(profile.description_i18n, profile.description);
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
  const profilesByIdentity = new Map<string, OplHomePackageProfile[]>();
  for (const profile of profiles) {
    for (const identity of descriptorIdentityValues(profile)) {
      profilesByIdentity.set(identity, [...(profilesByIdentity.get(identity) ?? []), profile]);
    }
  }
  const backendByIdentity = new Map<string, Assistant[]>();
  for (const assistant of backendAssistants) {
    const identity = normalizeDescriptorIdentity(assistant.id);
    backendByIdentity.set(identity, [...(backendByIdentity.get(identity) ?? []), assistant]);
  }

  return profiles.map((profile, index) => {
    const matches = descriptorIdentityValues(profile).flatMap((identity) => {
      const owners = profilesByIdentity.get(identity) ?? [];
      return owners.length === 1 && owners[0] === profile ? (backendByIdentity.get(identity) ?? []) : [];
    });
    const existing = matches.length === 1 ? matches[0] : undefined;
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1);
  });
}

/** Resolve the user-configured shortcut subset rendered on Home. */
export function resolveOplHomeAssistants(backendAssistants: Assistant[], appState: unknown): OplHomeAssistant[] {
  const shortcuts = getOplHomeAgentShortcutsFromAppState(appState);
  const assistantsByPackage = new Map(
    resolveOplProfessionalAgentAssistants(backendAssistants, appState).map(
      (assistant) => [assistant.id, assistant] as const
    )
  );
  return shortcuts
    .filter((shortcut) => shortcut.visible)
    .flatMap((shortcut, index) => {
      const assistant = assistantsByPackage.get(shortcut.package_id);
      if (!assistant) return [];
      return [
        {
          ...assistant,
          id: shortcut.shortcut_id,
          name: shortcut.primary_label,
          name_i18n: { ...shortcut.primary_label_i18n },
          sort_order: index + 1,
          opl_package_id: shortcut.package_id,
          opl_shortcut_id: shortcut.shortcut_id,
        },
      ];
    });
}

/** Resolve visible, schema-driven Home contributions alongside legacy Agent shortcuts. */
export function resolveOplHomeAppContributions(appState: unknown): OplHomeAppContribution[] {
  const contributionsByPackage = new Map(
    getOplPackageAppContributionsFromAppState(appState).map((entry) => [entry.packageId, entry.contributions] as const)
  );
  return getOplHomeAppNavigationFromAppState(appState).flatMap((navigation) => {
    const contributions = contributionsByPackage.get(navigation.package_id);
    const view = contributions?.views.find((entry) => entry.viewId === navigation.view_id);
    if (!contributions || !view) return [];
    const commandIds = new Set(view.commandIds ?? []);
    return [
      {
        ...navigation,
        view,
        commands: contributions.commands.filter((command) => commandIds.has(command.commandId)),
        badges: contributions.badges.filter((badge) => (view.badgeIds ?? []).includes(badge.badgeId)),
      },
    ];
  });
}

/** Resolve installed Agent Packages from the Framework directory for selection surfaces. */
export function resolveOplProfessionalAgentAssistants(backendAssistants: Assistant[], appState: unknown): Assistant[] {
  return resolveOplAssistantsFromProfiles(backendAssistants, agentPackageProfiles(appState));
}
