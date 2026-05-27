import type { Assistant } from '@/common/types/agent/assistantTypes';
import { getOplDefaultHomeAssistants } from '@/common/config/oplProductProfile';

const DEFAULT_PRESET_AGENT_TYPE = 'codex';

const normalizeAssistantId = (id: string): string =>
  id
    .replace(/^builtin-/, '')
    .trim()
    .toLowerCase();

const buildAssistantFromProfile = (
  profile: ReturnType<typeof getOplDefaultHomeAssistants>[number],
  sortOrder: number
): Assistant => {
  const prompts = profile.prompts_i18n['zh-CN'] || profile.prompts_i18n['en-US'] || [];
  return {
    id: profile.id,
    source: 'builtin',
    name: profile.display_name,
    name_i18n: {
      'zh-CN': profile.display_name,
      'en-US': profile.display_name,
    },
    description: profile.description_i18n['zh-CN'] || profile.description_i18n['en-US'] || '',
    description_i18n: { ...profile.description_i18n },
    avatar: profile.avatar,
    enabled: true,
    sort_order: sortOrder,
    preset_agent_type: DEFAULT_PRESET_AGENT_TYPE,
    enabled_skills: [],
    custom_skill_names: [],
    disabled_builtin_skills: [],
    context: '',
    context_i18n: {},
    prompts: [...prompts],
    prompts_i18n: Object.fromEntries(
      Object.entries(profile.prompts_i18n).map(([locale, values]) => [locale, [...values]])
    ),
    models: [],
  };
};

const mergeAssistantWithProfile = (
  existing: Assistant,
  profile: ReturnType<typeof getOplDefaultHomeAssistants>[number],
  sortOrder: number
): Assistant => {
  const prompts = profile.prompts_i18n['zh-CN'] || profile.prompts_i18n['en-US'] || [];
  const merged = Object.assign({}, existing);
  merged.id = profile.id;
  merged.enabled = existing.enabled !== false;
  merged.sort_order = sortOrder;
  merged.name = profile.display_name;
  merged.name_i18n = { 'zh-CN': profile.display_name, 'en-US': profile.display_name };
  merged.description = profile.description_i18n['zh-CN'] || profile.description_i18n['en-US'] || '';
  merged.description_i18n = { ...profile.description_i18n };
  merged.avatar = profile.avatar;
  merged.preset_agent_type = existing.preset_agent_type || DEFAULT_PRESET_AGENT_TYPE;
  merged.prompts = [...prompts];
  merged.prompts_i18n = Object.fromEntries(
    Object.entries(profile.prompts_i18n).map(([locale, values]) => [locale, [...values]])
  );
  merged.enabled_skills = existing.enabled_skills || [];
  merged.custom_skill_names = existing.custom_skill_names || [];
  merged.disabled_builtin_skills = existing.disabled_builtin_skills || [];
  merged.context_i18n = existing.context_i18n || {};
  merged.models = existing.models || [];
  return merged;
};

export function resolveOplHomeAssistants(backendAssistants: Assistant[]): Assistant[] {
  const backendById = new Map<string, Assistant>();
  for (const assistant of backendAssistants) {
    backendById.set(normalizeAssistantId(assistant.id), assistant);
  }

  return getOplDefaultHomeAssistants().map((profile, index) => {
    const existing = backendById.get(profile.id);
    if (!existing) {
      return buildAssistantFromProfile(profile, index + 1);
    }

    return mergeAssistantWithProfile(existing, profile, index + 1);
  });
}
