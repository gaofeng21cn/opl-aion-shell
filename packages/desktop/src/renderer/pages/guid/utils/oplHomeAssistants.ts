import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import {
  canonicalizeOplProfessionalAgentId,
  getOplAssistantSkillProfile,
  getOplDefaultExecutorAgentKey,
  getOplDefaultHomeAssistants,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackage,
  getOplProfessionalAgentPackages,
} from '@/common/config/oplProductProfile';
import { getOplVisibleHomeAgentShortcuts } from './oplHomeShortcutPreferences';

const DEFAULT_PRESET_AGENT_TYPE = getOplDefaultExecutorAgentKey();

type OplHomePackageProfile = {
  id: string;
  display_name: string;
  short_name: string;
  avatar: string;
  description_i18n: Record<string, string>;
  prompts_i18n: Record<string, string[]>;
};

export type OplPackageLaunchGate = {
  state: 'ready' | 'degraded' | 'package_unavailable';
  launchAllowed: boolean | null;
  launchBlockedReason: string | null;
  allowedWhenBlocked: string[];
};

const BLOCKED_PACKAGE_ACTIONS = new Set(['status', 'doctor', 'repair']);
const PACKAGE_UNAVAILABLE_REASONS = new Set([
  'package_not_installed',
  'package_disabled',
  'package_identity_mismatch',
  'package_version_mismatch',
  'incompatible_package_version',
  'entrypoint_missing',
  'required_export_missing',
  'unsafe_managed_target',
  'managed_target_unavailable',
  'permission_denied',
  'authorization_denied',
]);
const DEGRADED_PACKAGE_REASONS = new Set([
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
  return Object.entries(appStateRecord(value)).map(([packageId, entry]) => ({
    ...appStateRecord(entry),
    package_id: appStateRecord(entry).package_id ?? packageId,
  }));
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
          (action): action is string => typeof action === 'string' && BLOCKED_PACKAGE_ACTIONS.has(action)
        )
      : [],
  };
}

export function resolveOplHomePurposePresentation(id: string, fallbackName: string, fallbackAvatar: string) {
  const canonicalId = canonicalizeOplProfessionalAgentId(id);
  const shortcut = getOplHomeAgentShortcuts().find((entry) => entry.package_id === canonicalId);
  const agentPackage = getOplProfessionalAgentPackage(canonicalId);
  const englishLabel = agentPackage?.display_name ?? fallbackName;
  const primaryLabel = shortcut?.primary_label ?? fallbackName;
  return {
    name: englishLabel,
    name_i18n: { 'zh-CN': primaryLabel, 'en-US': englishLabel },
    avatar: agentPackage?.short_name ?? fallbackAvatar,
  };
}

export const OPL_HOME_PURPOSE_ASSISTANT_IDS = getOplHomeAgentShortcuts()
  .filter((shortcut) => shortcut.default_visible)
  .map((shortcut) => shortcut.package_id);

export function getOplHomePurposeAssistantIds(): string[] {
  return getOplVisibleHomeAgentShortcuts().map((shortcut) => shortcut.package_id);
}

function getOplHomePackageProfiles(): OplHomePackageProfile[] {
  const legacyAssistants = new Map(getOplDefaultHomeAssistants().map((assistant) => [assistant.id, assistant]));
  return getOplVisibleHomeAgentShortcuts()
    .map((shortcut) => {
      const agentPackage = getOplProfessionalAgentPackage(shortcut.package_id);
      if (!agentPackage) return null;
      const legacyAssistant = legacyAssistants.get(agentPackage.package_id);
      return {
        id: agentPackage.package_id,
        display_name: agentPackage.display_name,
        short_name: agentPackage.short_name,
        avatar: legacyAssistant?.avatar ?? agentPackage.short_name,
        description_i18n: legacyAssistant?.description_i18n ?? {
          'zh-CN': agentPackage.display_name,
          'en-US': agentPackage.display_name,
        },
        prompts_i18n: legacyAssistant?.prompts_i18n ?? {},
      };
    })
    .filter((profile): profile is OplHomePackageProfile => Boolean(profile));
}

function getOplProfessionalAgentPackageProfiles(): OplHomePackageProfile[] {
  const legacyAssistants = new Map(getOplDefaultHomeAssistants().map((assistant) => [assistant.id, assistant]));
  return getOplProfessionalAgentPackages().map((agentPackage) => {
    const legacyAssistant = legacyAssistants.get(agentPackage.package_id);
    return {
      id: agentPackage.package_id,
      display_name: agentPackage.display_name,
      short_name: agentPackage.short_name,
      avatar: legacyAssistant?.avatar ?? agentPackage.short_name,
      description_i18n:
        agentPackage.description_i18n ?? legacyAssistant?.description_i18n ?? agentPackage.session_routing_summary_i18n,
      prompts_i18n: legacyAssistant?.prompts_i18n ?? {},
    };
  });
}

const normalizeAssistantId = (id: string): string => canonicalizeOplProfessionalAgentId(id);

const buildAssistantFromProfile = (
  profile: OplHomePackageProfile,
  sortOrder: number,
  defaultRuntimeAgentId?: string
): Assistant => {
  const presentation = resolveOplHomePurposePresentation(profile.id, profile.short_name, profile.avatar);
  const skillProfile = getOplAssistantSkillProfile(profile.id);
  return {
    id: profile.id,
    source: 'builtin',
    name: presentation.name,
    name_i18n: presentation.name_i18n,
    description: profile.description_i18n['zh-CN'] || profile.description_i18n['en-US'] || profile.display_name,
    description_i18n: { ...profile.description_i18n },
    avatar: presentation.avatar,
    enabled: true,
    sort_order: sortOrder,
    preset_agent_type: DEFAULT_PRESET_AGENT_TYPE,
    agent_id: defaultRuntimeAgentId,
    agent: { type: 'acp', source: 'builtin', acp_backend: DEFAULT_PRESET_AGENT_TYPE },
    agent_status: 'unchecked',
    enabled_skills: skillProfile?.required_skills ?? [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context: '',
    context_i18n: {},
    prompts: [],
    prompts_i18n: Object.fromEntries(
      Object.entries(profile.prompts_i18n).map(([locale, values]) => [locale, [...values]])
    ),
    models: [],
  };
};

const mergeAssistantWithProfile = (
  existing: Assistant,
  profile: OplHomePackageProfile,
  sortOrder: number,
  defaultRuntimeAgentId?: string
): Assistant => {
  const presentation = resolveOplHomePurposePresentation(profile.id, profile.short_name, profile.avatar);
  const skillProfile = getOplAssistantSkillProfile(profile.id);
  const requiredSkills = skillProfile?.required_skills ?? [];
  const merged = Object.assign({}, existing);
  merged.id = profile.id;
  merged.enabled = existing.enabled !== false;
  merged.sort_order = sortOrder;
  merged.name = presentation.name;
  merged.name_i18n = presentation.name_i18n;
  merged.description = profile.description_i18n['zh-CN'] || profile.description_i18n['en-US'] || profile.display_name;
  merged.description_i18n = { ...profile.description_i18n };
  merged.avatar = presentation.avatar;
  merged.preset_agent_type = DEFAULT_PRESET_AGENT_TYPE;
  merged.agent_id = existing.agent_id || defaultRuntimeAgentId;
  merged.prompts = [];
  merged.prompts_i18n = Object.fromEntries(
    Object.entries(profile.prompts_i18n).map(([locale, values]) => [locale, [...values]])
  );
  merged.enabled_skills = Array.from(new Set([...requiredSkills, ...(existing.enabled_skills || [])]));
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
  const defaultRuntimeAgentIds = Array.from(
    new Set(
      backendAssistants
        .filter(
          (assistant) =>
            assistant.enabled !== false &&
            assistant.source === 'generated' &&
            assistantRuntimeKey(assistant) === DEFAULT_PRESET_AGENT_TYPE &&
            Boolean(assistant.agent_id)
        )
        .map((assistant) => assistant.agent_id as string)
    )
  );
  const defaultRuntimeAgentId = defaultRuntimeAgentIds.length === 1 ? defaultRuntimeAgentIds[0] : undefined;

  return profiles.map((profile, index) => {
    const existing = backendById.get(profile.id);
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1, defaultRuntimeAgentId);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1, defaultRuntimeAgentId);
  });
}

/** Resolve the user-configured shortcut subset rendered on Home. */
export function resolveOplHomeAssistants(backendAssistants: Assistant[]): Assistant[] {
  return resolveOplAssistantsFromProfiles(backendAssistants, getOplHomePackageProfiles());
}

/** Resolve the complete App-owned professional-agent directory for selection surfaces. */
export function resolveOplProfessionalAgentAssistants(backendAssistants: Assistant[]): Assistant[] {
  return resolveOplAssistantsFromProfiles(backendAssistants, getOplProfessionalAgentPackageProfiles());
}
