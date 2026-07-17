/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  canonicalizeOplProfessionalAgentId,
  getOplAssistantSkillProfile,
  getOplDefaultExecutorAgentKey,
  getOplDefaultHomeAssistants,
  getOplProfessionalAgentPackages,
} from '@/common/config/oplProductProfile';
import { getOplHomePurposeAssistantIds, resolveOplHomePurposePresentation } from './utils/oplHomeAssistants';
import type { AvailableAgent } from './types';

const OPL_PACKAGE_MODULE_IDS: Record<string, string[]> = {
  'med-autoscience': ['mas', 'medautoscience', 'med-auto-science'],
  'med-autogrant': ['mag', 'medautogrant', 'med-auto-grant'],
  'redcube-ai': ['rca', 'redcube', 'redcubeai', 'redcube-ai'],
  'opl-bookforge': ['obf', 'oplbookforge', 'opl-bookforge'],
  'opl-meta-agent': ['oma', 'oplmetaagent', 'opl-meta-agent'],
};

function getAgentBackend(agent: Pick<AvailableAgent, 'backend' | 'agent_type'>): string {
  return agent.backend || agent.agent_type;
}

function normalizeAssistantId(id: string): string {
  return canonicalizeOplProfessionalAgentId(id);
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
  const homePurposeAssistantIds = getOplHomePurposeAssistantIds();
  const professionalAgentPackages = new Map(
    getOplProfessionalAgentPackages().map((agentPackage) => [agentPackage.package_id, agentPackage])
  );
  const appAssistants = new Map(
    getOplDefaultHomeAssistants()
      .filter((assistant) => homePurposeAssistantIds.includes(assistant.id))
      .map((assistant) => [assistant.id, assistant])
  );
  return homePurposeAssistantIds
    .map((packageId) => professionalAgentPackages.get(packageId))
    .filter((agentPackage) => agentPackage !== undefined)
    .map((agentPackage) => {
      const appAssistant = appAssistants.get(agentPackage.package_id);
      const presentation = resolveOplHomePurposePresentation(
        agentPackage.package_id,
        appAssistant?.short_name ?? agentPackage.short_name,
        appAssistant?.avatar ?? agentPackage.short_name
      );
      const skillProfile = getOplAssistantSkillProfile(agentPackage.package_id);
      return {
        id: agentPackage.package_id,
        name: presentation.name,
        name_i18n: presentation.name_i18n,
        description: appAssistant?.description_i18n['en-US'] ?? agentPackage.display_name,
        description_i18n: appAssistant?.description_i18n ?? {
          'en-US': agentPackage.display_name,
          'zh-CN': agentPackage.display_name,
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
  const allowed = new Set(getOplHomePurposeAssistantIds());
  const profileModules = getOplProfessionalAgentPackages()
    .filter((agentPackage) => allowed.has(agentPackage.package_id))
    .flatMap((agentPackage) => OPL_PACKAGE_MODULE_IDS[agentPackage.package_id] ?? [agentPackage.package_id]);
  return Array.from(new Set(profileModules));
}

export function withOplFoundryAssistantDefaults(assistants: Assistant[] | undefined): Assistant[] {
  const allowed = new Set(getOplHomePurposeAssistantIds());
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
  return [...existing, ...defaults.filter((assistant) => !existingIds.has(assistant.id))].sort(
    (a, b) => a.sort_order - b.sort_order
  );
}

export function filterOplFoundryAssistants(assistants: Assistant[] | undefined): Assistant[] {
  const allowed = new Set(getOplHomePurposeAssistantIds());
  return (assistants ?? []).filter(
    (assistant) => assistant.enabled !== false && allowed.has(normalizeAssistantId(assistant.id))
  );
}

export function shouldShowOplAgentManagementEntry(): boolean {
  return false;
}
