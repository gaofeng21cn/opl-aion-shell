import type { Assistant } from '@/common/types/agent/assistantTypes';
import { assistantRuntimeKey } from '@/common/types/agent/assistantTypes';
import {
  canonicalizeOplProfessionalAgentId,
  getOplAssistantSkillProfile,
  getOplDefaultExecutorAgentKey,
  getOplDefaultHomeAssistants,
  getOplHomeAgentShortcuts,
  getOplProfessionalAgentPackage,
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
  launchAllowed: boolean | null;
  launchBlockedReason: string | null;
  allowedWhenBlocked: string[];
};

const BLOCKED_PACKAGE_ACTIONS = new Set(['status', 'doctor', 'repair']);

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

export function resolveOplPackageLaunchGate(appState: unknown, packageId: string): OplPackageLaunchGate {
  const payload = appStateRecord(appState);
  const state = appStateRecord(payload.app_state ?? payload);
  const packages = appStateRecord(state.agent_packages);
  const statusIndex = appStateRecord(packages.status_index);
  const canonicalPackageId = canonicalizeOplProfessionalAgentId(packageId);
  const status = packageStatusRecords(statusIndex.packages).find(
    (entry) =>
      typeof entry.package_id === 'string' &&
      canonicalizeOplProfessionalAgentId(entry.package_id) === canonicalPackageId
  );
  if (!status) {
    return getOplProfessionalAgentPackage(canonicalPackageId)
      ? {
          launchAllowed: false,
          launchBlockedReason: 'package_not_installed',
          allowedWhenBlocked: [...BLOCKED_PACKAGE_ACTIONS],
        }
      : { launchAllowed: null, launchBlockedReason: null, allowedWhenBlocked: [] };
  }
  const operationalReady = typeof status.operational_ready === 'boolean' ? status.operational_ready : null;
  const projectedLaunchAllowed = typeof status.launch_allowed === 'boolean' ? status.launch_allowed : null;
  const launchBlockedReason =
    typeof status.launch_blocked_reason === 'string' && status.launch_blocked_reason.trim()
      ? status.launch_blocked_reason.trim()
      : operationalReady === false
        ? 'operational_not_ready'
        : null;
  return {
    launchAllowed:
      operationalReady === false || launchBlockedReason === 'package_not_installed' ? false : projectedLaunchAllowed,
    launchBlockedReason,
    allowedWhenBlocked: Array.isArray(status.allowed_when_blocked)
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

export function resolveOplHomeAssistants(backendAssistants: Assistant[]): Assistant[] {
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

  return getOplHomePackageProfiles().map((profile, index) => {
    const existing = backendById.get(profile.id);
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1, defaultRuntimeAgentId);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1, defaultRuntimeAgentId);
  });
}
