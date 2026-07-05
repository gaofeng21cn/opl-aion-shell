import type { Assistant } from '@/common/types/agent/assistantTypes';
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

const buildAssistantFromProfile = (profile: OplHomePackageProfile, sortOrder: number): Assistant => {
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
  sortOrder: number
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

  return getOplHomePackageProfiles().map((profile, index) => {
    const existing = backendById.get(profile.id);
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1);
  });
}
