/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  getOplAssistantSkillProfile,
  getOplDefaultExecutorAgentKey,
  getOplDefaultHomeAssistants,
} from '@/common/config/oplProductProfile';
import { OPL_HOME_PURPOSE_ASSISTANT_IDS, resolveOplHomePurposePresentation } from './utils/oplHomeAssistants';
import type { AvailableAgent } from './types';

const OPL_FOUNDRY_ASSISTANT_PROFILES = [
  {
    id: 'mas',
    moduleId: 'medautoscience',
    name: 'MAS',
    name_i18n: {
      'en-US': 'Research',
      'zh-CN': '医学研究',
    },
    description:
      'Advance research tasks, manuscript writing, reviewer responses, submission packages, and study progress.',
    description_i18n: {
      'en-US': 'Plan research tasks, organize evidence, and prepare manuscripts.',
      'zh-CN': '规划医学研究任务，整理证据，推进分析和论文准备。',
    },
    avatar: '🧪',
  },
  {
    id: 'mag',
    moduleId: 'medautogrant',
    name: 'MAG',
    name_i18n: {
      'en-US': 'Grants',
      'zh-CN': '基金申请',
    },
    description:
      'Advance grant topics, proposal structure, application writing, budget narratives, and reviewer responses.',
    description_i18n: {
      'en-US': 'Develop grant directions, proposals, critiques, and revision packages.',
      'zh-CN': '辅助基金方向设计、申请书撰写、评审意见回应和修改材料准备。',
    },
    avatar: '📝',
  },
  {
    id: 'rca',
    moduleId: 'redcube',
    name: 'RCA',
    name_i18n: {
      'en-US': 'Slides',
      'zh-CN': '汇报材料',
    },
    description: 'Advance slide decks, reports, figures, visual deliverables, and presentation materials.',
    description_i18n: {
      'en-US': 'Create and polish slide decks, scripts, posters, and visual deliverables.',
      'zh-CN': '制作和打磨幻灯片、讲稿、海报和其他视觉交付物。',
    },
    avatar: '📊',
  },
  {
    id: 'oma',
    moduleId: 'oplmetaagent',
    name: 'OMA',
    name_i18n: {
      'en-US': 'Agent Lab',
      'zh-CN': '智能体开发',
    },
    description: 'Design, test, and improve OPL-compatible Foundry Agents.',
    description_i18n: {
      'en-US': 'Design, test, and improve OPL-compatible Foundry Agents.',
      'zh-CN': '设计、测试和改进 OPL 兼容的 Foundry Agent。',
    },
    avatar: '🛠️',
  },
] as const;

function getAgentBackend(agent: Pick<AvailableAgent, 'backend' | 'agent_type'>): string {
  return agent.backend || agent.agent_type;
}

function normalizeAssistantId(id: string): string {
  return id.replace(/^builtin-/, '').toLowerCase();
}

export function filterOplHomeAgents(agents: AvailableAgent[] | undefined): AvailableAgent[] {
  const visibleBackends = new Set([getOplDefaultExecutorAgentKey()]);
  return (agents ?? []).filter((agent) => !agent.is_preset && visibleBackends.has(getAgentBackend(agent)));
}

export function shouldShowOplHomeAgentTabs(agents: AvailableAgent[] | undefined): boolean {
  return filterOplHomeAgents(agents).length > 1;
}

export function resolveOplDefaultAgentKey(agents: AvailableAgent[] | undefined): string {
  const defaultBackend = getOplDefaultExecutorAgentKey();
  const matched = (agents ?? []).find((agent) => !agent.is_preset && getAgentBackend(agent) === defaultBackend);
  return matched ? getAgentBackend(matched) : defaultBackend;
}

export function getOplFoundryAssistantProfiles(): Assistant[] {
  const appAssistants = new Map(
    getOplDefaultHomeAssistants()
      .filter((assistant) => OPL_HOME_PURPOSE_ASSISTANT_IDS.includes(assistant.id))
      .map((assistant) => [assistant.id, assistant])
  );
  return OPL_FOUNDRY_ASSISTANT_PROFILES.filter((profile) => appAssistants.has(profile.id))
    .map((profile) => {
      const appAssistant = appAssistants.get(profile.id);
      const presentation = resolveOplHomePurposePresentation(
        profile.id,
        appAssistant?.short_name ?? profile.name,
        appAssistant?.avatar ?? profile.avatar
      );
      const skillProfile = getOplAssistantSkillProfile(profile.id);
      return {
        ...profile,
        name: presentation.name,
        name_i18n: {
          ...profile.name_i18n,
          ...presentation.name_i18n,
        },
        description: appAssistant?.description_i18n['en-US'] ?? profile.description,
        description_i18n: {
          ...profile.description_i18n,
          ...appAssistant?.description_i18n,
        },
        avatar: presentation.avatar,
        enabled_skills: skillProfile?.required_skills ?? [],
      };
    })
    .map((profile, index) => ({
      id: profile.id,
      source: 'builtin',
      name: profile.name,
      name_i18n: profile.name_i18n,
      description: profile.description,
      description_i18n: profile.description_i18n,
      avatar: profile.avatar,
      enabled: true,
      sort_order: index,
      preset_agent_type: getOplDefaultExecutorAgentKey(),
      enabled_skills: profile.enabled_skills,
      custom_skill_names: [] as string[],
      disabled_builtin_skills: [] as string[],
      context_i18n: {},
      prompts: [] as string[],
      prompts_i18n: {},
      models: [] as string[],
    }));
}

export function getOplFoundryModuleIds(): string[] {
  const allowed = new Set(OPL_HOME_PURPOSE_ASSISTANT_IDS);
  const profileModules = OPL_FOUNDRY_ASSISTANT_PROFILES.filter((profile) => allowed.has(profile.id)).map(
    (profile) => profile.moduleId
  );
  return Array.from(new Set(profileModules));
}

export function withOplFoundryAssistantDefaults(assistants: Assistant[] | undefined): Assistant[] {
  const allowed = new Set(OPL_HOME_PURPOSE_ASSISTANT_IDS);
  const defaults = getOplFoundryAssistantProfiles().filter((assistant) => allowed.has(assistant.id));
  const defaultsById = new Map(defaults.map((assistant) => [assistant.id, assistant]));
  const existing = filterOplFoundryAssistants(assistants).map((assistant) => {
    const assistantId = normalizeAssistantId(assistant.id);
    const profile = defaultsById.get(assistantId);
    if (!profile) {
      return assistant;
    }

    return {
      ...assistant,
      id: profile.id,
      name: profile.name,
      name_i18n: profile.name_i18n,
      description: profile.description,
      description_i18n: profile.description_i18n,
      avatar: profile.avatar,
      sort_order: profile.sort_order,
      preset_agent_type: getOplDefaultExecutorAgentKey(),
      enabled_skills: Array.from(
        new Set([
          ...(getOplAssistantSkillProfile(assistantId)?.required_skills ?? []),
          ...(assistant.enabled_skills || []),
        ])
      ),
      prompts: profile.prompts,
      prompts_i18n: profile.prompts_i18n,
    };
  });
  const existingIds = new Set(existing.map((assistant) => normalizeAssistantId(assistant.id)));
  return [...existing, ...defaults.filter((assistant) => !existingIds.has(assistant.id))];
}

export function filterOplFoundryAssistants(assistants: Assistant[] | undefined): Assistant[] {
  const allowed = new Set(OPL_HOME_PURPOSE_ASSISTANT_IDS);
  return (assistants ?? []).filter(
    (assistant) => assistant.enabled !== false && allowed.has(normalizeAssistantId(assistant.id))
  );
}

export function shouldShowOplAgentManagementEntry(): boolean {
  return false;
}
