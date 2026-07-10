/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { canonicalizeOplProfessionalAgentId, getOplDefaultExecutorAgentKey } from '@/common/config/oplProductProfile';
import { buildCodexDefaultModelInfo } from '@/common/types/codex/codexModels';
import { CODEX_MODE_NATIVE_FULL_ACCESS, normalizeCodexMode } from '@/common/types/codex/codexModes';
import type { IProvider } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import type { OplCodexReasoningEffort } from '@/common/config/oplProductProfile';
import type { AcpModelInfo, AvailableAgent, EffectiveAgentInfo } from '../types';
import type { AgentSource, ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { useManagedAgentRuntimeCatalog } from '@/renderer/hooks/agent/useManagedAgents';
import { buildAgentRuntimeModeState, buildAgentRuntimeModelInfo } from '@/renderer/utils/model/agentRuntimeCatalog';
import { getAgentModes } from '@/renderer/utils/model/agentModes';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { savePreferredMode, savePreferredModelId, getAgentKey as getAgentKeyUtil } from './agentSelectionUtils';
import { usePresetAssistantResolver } from './usePresetAssistantResolver';
import { useAgentAvailability } from './useAgentAvailability';
import { useCustomAgentsLoader } from './useCustomAgentsLoader';
import { resolveOplDefaultAgentKey, withOplFoundryAssistantDefaults } from '../oplGuidProfile';

export type GuidAgentSelectionResult = {
  selectedAgentKey: string;
  setSelectedAgentKey: (key: string) => void;
  defaultAgentKey: string;
  selectedAgent: string;
  selectedAgentInfo: AvailableAgent | undefined;
  is_presetAgent: boolean;
  availableAgents: AvailableAgent[] | undefined;
  /** Backend-merged preset catalog: builtin + user + extension. */
  assistants: Assistant[];
  selectedMode: string;
  setSelectedMode: React.Dispatch<React.SetStateAction<string>>;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
  selectedReasoningEffort: OplCodexReasoningEffort | null;
  setSelectedReasoningEffort: React.Dispatch<React.SetStateAction<OplCodexReasoningEffort | null>>;
  currentAcpCachedModelInfo: AcpModelInfo | null;
  currentEffectiveAgentInfo: EffectiveAgentInfo;
  getAgentKey: (agent: {
    agent_type: string;
    agent_source?: AgentSource;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
  }) => string;
  findAgentByKey: (key: string) => AvailableAgent | undefined;
  resolvePresetRulesAndSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  isMainAgentAvailable: (agent_type: string) => boolean;
  getEffectiveAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => EffectiveAgentInfo;
  customAgentAvatarMap: Map<string, string | undefined>;
};

/**
 * Resolve the default session_mode for a given backend.
 *
 * Priority:
 *   1. Managed runtime `available_modes.current_mode_id`
 *   2. First entry of managed runtime `available_modes`
 *   3. First entry of the static `AGENT_MODES` table
 *   4. Literal `'default'` (legacy fallback — only correct for claude/qwen/gemini/aionrs)
 *
 * This mirrors the runtime fallback inside `AgentModeSelector` so the
 * parent-held `selectedMode` stays in sync with what the UI shows.
 */
function resolveDefaultMode(backend: string | undefined, agent: ManagedAgent | undefined): string {
  if (!backend) return 'default';
  if (backend === 'codex') return CODEX_MODE_NATIVE_FULL_ACCESS;

  const runtimeModes = buildAgentRuntimeModeState(agent);
  if (runtimeModes.state === 'ready') {
    if (runtimeModes.currentMode) return runtimeModes.currentMode;
    if (runtimeModes.options[0]?.value) return runtimeModes.options[0].value;
  }
  if (runtimeModes.state === 'empty') return '';

  const staticModes = getAgentModes(backend);
  if (staticModes.length > 0) return staticModes[0].value;

  return 'default';
}

function findManagedRuntimeAgent(
  agents: ManagedAgent[],
  input: { agentId?: string; backend?: string }
): ManagedAgent | undefined {
  if (input.agentId) {
    const exact = agents.find((agent) => agent.id === input.agentId);
    if (exact) return exact;
  }
  if (!input.backend) return undefined;
  const matches = agents.filter((agent) => (agent.backend ?? agent.agent_type) === input.backend);
  return matches.length === 1 ? matches[0] : undefined;
}

function assistantToAvailableAgent(
  assistant: Assistant,
  isPreset: boolean,
  backendAssistantId?: string
): AvailableAgent | null {
  const runtimeKey = assistantRuntimeKey(assistant);
  if (!runtimeKey) return null;
  const agentType = assistant.agent?.type || (runtimeKey === 'aionrs' ? 'aionrs' : 'acp');
  return {
    id: isPreset ? assistant.id : assistant.agent_id || assistant.id,
    agent_type: agentType,
    agent_source: assistant.agent?.source,
    backend: agentType === 'acp' ? runtimeKey : undefined,
    name: assistant.name,
    custom_agent_id: isPreset ? assistant.id : undefined,
    assistant_id: assistant.id,
    backend_assistant_id: backendAssistantId,
    managed_agent_id: assistant.agent_id,
    is_preset: isPreset,
    avatar: assistant.avatar,
    presetAgentType: runtimeKey,
  };
}

type UseGuidAgentSelectionOptions = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  localeKey: string;
  resetAssistant?: boolean;
  /** Pre-select a specific agent by key (e.g. from "Go to Chat" deep-links). */
  preselectAgentKey?: string;
  /** React Router location.key — changes on every navigation, used to detect new resets. */
  locationKey?: string;
};

/**
 * Hook that manages agent selection, availability, and preset assistant logic.
 */
export const useGuidAgentSelection = ({
  modelList,
  isGoogleAuth,
  localeKey,
  resetAssistant,
  preselectAgentKey,
  locationKey,
}: UseGuidAgentSelectionOptions): GuidAgentSelectionResult => {
  const [selectedAgentKey, _setSelectedAgentKey] = useState<string>(resolveOplDefaultAgentKey(undefined));
  const [selectedMode, _setSelectedMode] = useState<string>(CODEX_MODE_NATIVE_FULL_ACCESS);
  // Track whether mode was loaded from preferences to avoid overwriting during initial load
  const selectedAgentRef = useRef<string | null>(null);
  // Guard: only run the initial restore once; user selections are never overwritten
  const initialRestoreDoneRef = useRef(false);
  const [selectedAcpModel, _setSelectedAcpModel] = useState<string | null>(null);
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<OplCodexReasoningEffort | null>(null);

  // Wrap setSelectedAgentKey to also save to storage
  const setSelectedAgentKey = useCallback((key: string) => {
    initialRestoreDoneRef.current = true;
    _setSelectedAgentKey(key);
    configService.set('guid.lastSelectedAgent', key).catch((error) => {
      console.error('Failed to save selected agent:', error);
    });
  }, []);

  // Wrap setSelectedMode to also save preferred mode to the agent's own config
  const setSelectedMode = useCallback((mode: React.SetStateAction<string>) => {
    _setSelectedMode((prev) => {
      const newMode = typeof mode === 'function' ? mode(prev) : mode;
      const agentKey = selectedAgentRef.current;
      if (agentKey) {
        void savePreferredMode(agentKey, newMode);
      }
      return newMode;
    });
  }, []);

  // Wrap setSelectedAcpModel to also save preferred model to the agent's config
  const setSelectedAcpModel = useCallback((model_id: React.SetStateAction<string | null>) => {
    _setSelectedAcpModel((prev) => {
      const newModelId = typeof model_id === 'function' ? model_id(prev) : model_id;
      const agentKey = selectedAgentRef.current;
      if (agentKey && agentKey !== 'gemini' && agentKey !== 'custom') {
        void savePreferredModelId(agentKey, newModelId);
      }
      return newModelId;
    });
  }, []);

  const getAgentKey = getAgentKeyUtil;

  // --- Sub-hooks ---
  const { assistants, catalogAssistants, customAgentAvatarMap } = useCustomAgentsLoader();
  const oplAssistants = useMemo(() => withOplFoundryAssistantDefaults(assistants), [assistants]);
  const managedAgentRuntimeCatalog = useManagedAgentRuntimeCatalog();
  const businessAssistants = useMemo(() => {
    const oplIds = new Set(oplAssistants.map((assistant) => assistant.id));
    const nonOplAssistants = catalogAssistants.filter(
      (assistant) => !oplIds.has(canonicalizeOplProfessionalAgentId(assistant.id))
    );
    return [...nonOplAssistants, ...oplAssistants];
  }, [catalogAssistants, oplAssistants]);
  const backendAssistantIdByCanonicalId = useMemo(
    () =>
      new Map(
        catalogAssistants.map((assistant) => [canonicalizeOplProfessionalAgentId(assistant.id), assistant.id] as const)
      ),
    [catalogAssistants]
  );
  const availableAgents = useMemo<AvailableAgent[]>(() => {
    const defaultBackend = getOplDefaultExecutorAgentKey();
    const defaultAssistant = businessAssistants.find(
      (assistant) =>
        assistant.enabled !== false &&
        assistant.source === 'generated' &&
        assistantRuntimeKey(assistant) === defaultBackend
    );
    const entries: AvailableAgent[] = [];
    if (defaultAssistant) {
      const defaultEntry = assistantToAvailableAgent(
        defaultAssistant,
        false,
        backendAssistantIdByCanonicalId.get(canonicalizeOplProfessionalAgentId(defaultAssistant.id))
      );
      if (defaultEntry) entries.push(defaultEntry);
    }
    for (const assistant of businessAssistants) {
      if (assistant === defaultAssistant || assistant.enabled === false) continue;
      const entry = assistantToAvailableAgent(
        assistant,
        true,
        backendAssistantIdByCanonicalId.get(canonicalizeOplProfessionalAgentId(assistant.id))
      );
      if (entry) entries.push(entry);
    }
    return entries;
  }, [backendAssistantIdByCanonicalId, businessAssistants]);

  const {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  } = usePresetAssistantResolver({ assistants: businessAssistants, localeKey });

  const { isMainAgentAvailable, getEffectiveAgentType } = useAgentAvailability({
    modelList,
    isGoogleAuth,
    availableAgents,
    resolvePresetAgentType,
  });

  /**
   * Find agent by key.
   *
   * Key formats:
   *   - Plain id (custom ACP / remote rows) → resolved by `AvailableAgent.id`.
   *   - Plain backend or agent_type (builtin rows) → resolved by `backend` or
   *     `agent_type` fallback.
   *   - `custom:<assistantId>` → preset assistant from the assistant catalog
   *     (kept as the only surviving prefix path; preset assistants are a
   *     different selection surface from AgentRegistry rows).
   */
  const findAgentByKey = (key: string): AvailableAgent | undefined => {
    if (key.startsWith('custom:')) {
      const assistantId = key.slice(7);
      const assistant = businessAssistants.find((a) => a.id === assistantId);
      if (assistant) {
        const runtimeKey = assistantRuntimeKey(assistant) || getOplDefaultExecutorAgentKey();
        return {
          agent_type: assistant.agent?.type || 'acp',
          backend: runtimeKey,
          name: assistant.name,
          id: assistant.id,
          custom_agent_id: assistant.id,
          assistant_id: assistant.id,
          backend_assistant_id: backendAssistantIdByCanonicalId.get(
            canonicalizeOplProfessionalAgentId(assistant.id)
          ),
          managed_agent_id: assistant.agent_id,
          is_preset: true,
          context: '',
          avatar: assistant.avatar,
          presetAgentType: runtimeKey,
        };
      }
      return undefined;
    }
    // Row id (custom ACP / remote) takes precedence, so two rows sharing
    // the same backend do not collide.
    const byId = availableAgents?.find((a) => a.id === key);
    if (byId) return byId;
    return availableAgents?.find((a) => a.backend === key || a.agent_type === key);
  };

  const getDefaultAgentKey = useCallback(
    (agents: AvailableAgent[] | undefined): string => {
      const oplDefaultKey = resolveOplDefaultAgentKey(agents);
      const defaultAgent = agents?.find((agent) => getAgentKey(agent) === oplDefaultKey);
      if (defaultAgent) return getAgentKey(defaultAgent);

      const firstCliAgent = agents?.find((agent) => !agent.is_preset);
      return firstCliAgent ? getAgentKey(firstCliAgent) : oplDefaultKey;
    },
    [getAgentKey]
  );

  // Derived state: collapse row-scoped rows to a stable slot key so shared
  // config namespaces (acp.config / mode preferences) are not fragmented
  // per row.
  const selectedAgent: string = ((): string => {
    if (selectedAgentKey.startsWith('custom:')) return 'custom';
    const info = availableAgents?.find((a) => a.id === selectedAgentKey);
    if (info?.agent_source === 'custom') return 'custom';
    return selectedAgentKey;
  })();
  const selectedAgentInfo = useMemo(() => {
    return findAgentByKey(selectedAgentKey);
  }, [selectedAgentKey, availableAgents, backendAssistantIdByCanonicalId, businessAssistants]);
  const is_presetAgent = Boolean(selectedAgentInfo?.is_preset);
  const selectedBusinessAssistant = useMemo(() => {
    const assistantId = selectedAgentInfo?.assistant_id || selectedAgentInfo?.custom_agent_id;
    return assistantId ? businessAssistants.find((assistant) => assistant.id === assistantId) : undefined;
  }, [businessAssistants, selectedAgentInfo?.assistant_id, selectedAgentInfo?.custom_agent_id]);

  // Track whether the resetAssistant flag has been consumed so it only fires once
  // per navigation. Use locationKey (changes on every navigate()) to reset the guard,
  // because window.history.replaceState does NOT update React Router's location.state.
  const resetHandledRef = useRef(false);
  const prevLocationKeyRef = useRef(locationKey);
  if (locationKey !== prevLocationKeyRef.current) {
    prevLocationKeyRef.current = locationKey;
    resetHandledRef.current = false;
  }

  // Apply sidebar "new chat" resets and explicit "Go to Chat" pre-selections
  // before paint so the previous assistant selection does not flash for a
  // frame when navigating to /guid again.
  useLayoutEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (resetHandledRef.current) return;

    // Explicit pre-selection (e.g. from Settings → Agent "Go to Chat") wins
    // over reset and saved-selection when the agent is actually present.
    if (preselectAgentKey) {
      const matched = availableAgents.find((a) => getAgentKey(a) === preselectAgentKey);
      if (matched) {
        resetHandledRef.current = true;
        const key = getAgentKey(matched);
        _setSelectedAgentKey(key);
        configService.set('guid.lastSelectedAgent', key).catch((error) => {
          console.error('Failed to save preselected agent key:', error);
        });
        return;
      }
    }

    if (resetAssistant) {
      resetHandledRef.current = true;
      const fallbackKey = getDefaultAgentKey(availableAgents);
      _setSelectedAgentKey(fallbackKey);
      configService.set('guid.lastSelectedAgent', fallbackKey).catch((error) => {
        console.error('Failed to save reset agent key:', error);
      });
    }
  }, [availableAgents, resetAssistant, preselectAgentKey, locationKey, getDefaultAgentKey]);

  // Load last selected agent when no explicit reset was requested.
  useEffect(() => {
    if (!availableAgents || availableAgents.length === 0) return;
    if (resetAssistant) return;
    // An explicit pre-selection from navigation state wins over the
    // persisted last-selected key — skip the saved-restore path so
    // useLayoutEffect's preselect remains the authoritative pick.
    if (preselectAgentKey && availableAgents.some((a) => getAgentKey(a) === preselectAgentKey)) return;

    let cancelled = false;
    initialRestoreDoneRef.current = true;

    const restoreSavedSelection = async () => {
      try {
        const savedKey = configService.get('guid.lastSelectedAgent');
        if (cancelled) return;

        if (savedKey) {
          // Preset assistant key — trust directly, assistants list resolves later
          if (savedKey.startsWith('custom:')) {
            _setSelectedAgentKey(savedKey);
            return;
          }
          // Plain row key — verify it still exists in detected engines
          if (availableAgents.some((agent) => getAgentKey(agent) === savedKey)) {
            _setSelectedAgentKey(savedKey);
            return;
          }
        }

        _setSelectedAgentKey(getDefaultAgentKey(availableAgents));
      } catch (error) {
        console.error('Failed to load last selected agent:', error);
      }
    };

    void restoreSavedSelection();

    return () => {
      cancelled = true;
    };
  }, [availableAgents, resetAssistant, preselectAgentKey, locationKey, getDefaultAgentKey]);

  const currentEffectiveAgentInfo = useMemo(() => {
    if (!is_presetAgent) {
      const isAvailable = isMainAgentAvailable(selectedAgent as string);
      return {
        agent_type: selectedAgent as string,
        isFallback: false,
        originalType: selectedAgent as string,
        isAvailable,
      };
    }
    return getEffectiveAgentType(selectedAgentInfo);
  }, [is_presetAgent, selectedAgent, selectedAgentInfo, getEffectiveAgentType, isMainAgentAvailable]);
  const runtimeBackend = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;
  const selectedManagedRuntimeAgent = useMemo(
    () =>
      findManagedRuntimeAgent(managedAgentRuntimeCatalog, {
        agentId: selectedBusinessAssistant?.agent_id || selectedAgentInfo?.managed_agent_id,
        backend: runtimeBackend,
      }),
    [
      managedAgentRuntimeCatalog,
      runtimeBackend,
      selectedAgentInfo?.managed_agent_id,
      selectedBusinessAssistant?.agent_id,
    ]
  );
  const selectedRuntimeModelInfo = useMemo(
    () => buildAgentRuntimeModelInfo(selectedManagedRuntimeAgent),
    [selectedManagedRuntimeAgent]
  );

  // Reset selected ACP model when agent changes. Null means auto/latest for
  // Codex and handshake default for other ACP agents.
  useEffect(() => {
    // For preset agents, resolve to the actual backend type for config lookup
    const backend = runtimeBackend;
    const config = configService.get('acp.config');
    const preferred = (config?.[backend as string] as Record<string, unknown>)?.preferredModelId as string | undefined;
    if (backend === 'codex') {
      const codexModelInfo = buildCodexDefaultModelInfo(selectedRuntimeModelInfo);
      if (preferred && codexModelInfo.available_models.some((model) => model.id === preferred)) {
        _setSelectedAcpModel(preferred);
        return;
      }
      _setSelectedAcpModel(null);
      if (preferred) void savePreferredModelId(backend, null);
      return;
    }

    if (preferred) {
      _setSelectedAcpModel(preferred);
      return;
    }

    _setSelectedAcpModel(selectedRuntimeModelInfo?.current_model_id ?? null);
  }, [runtimeBackend, selectedAgentKey, selectedRuntimeModelInfo]);

  // Read preferred mode or fallback to legacy yoloMode config
  useEffect(() => {
    // For preset agents, use the effective backend type for config lookup and mode saving
    const configKey = is_presetAgent ? currentEffectiveAgentInfo.agent_type : selectedAgent;
    selectedAgentRef.current = configKey;
    // Reset to the backend's actual default (from handshake.available_modes),
    // not the literal 'default' — codex/opencode/cursor don't have that value.
    const fallbackMode = resolveDefaultMode(configKey, selectedManagedRuntimeAgent);
    _setSelectedMode(fallbackMode);
    if (!configKey) return;

    let cancelled = false;

    const loadPreferredMode = async () => {
      try {
        // Read preferredMode from the agent's own config, fallback to legacy yoloMode
        let preferred: string | undefined;
        let yoloMode = false;

        if (configKey === 'aionrs') {
          const config = configService.get('aionrs.config');
          preferred = config?.preferredMode;
        } else {
          const config = configService.get('acp.config');
          const backendConfig = config?.[configKey as string] as Record<string, unknown> | undefined;
          preferred = backendConfig?.preferredMode as string | undefined;
          yoloMode = (backendConfig?.yoloMode as boolean) ?? false;
        }

        if (cancelled) return;

        // 1. Use preferredMode if valid
        const normalizedPreferred = configKey === 'codex' ? normalizeCodexMode(preferred) : preferred;
        if (normalizedPreferred && configKey !== 'codex') {
          const modes = getAgentModes(configKey);
          if (modes.some((m) => m.value === normalizedPreferred)) {
            _setSelectedMode(normalizedPreferred);
            return;
          }
        }

        // 2. Fallback: legacy yoloMode
        if (configKey === 'codex') {
          _setSelectedMode(CODEX_MODE_NATIVE_FULL_ACCESS);
        } else if (yoloMode) {
          const yoloValues: Record<string, string> = {
            claude: 'bypassPermissions',
            gemini: 'yolo',
            codex: CODEX_MODE_NATIVE_FULL_ACCESS,
            qwen: 'yolo',
          };
          _setSelectedMode(yoloValues[configKey] || 'yolo');
        }
      } catch {
        /* silent */
      }
    };

    void loadPreferredMode();

    return () => {
      cancelled = true;
    };
  }, [selectedAgent, is_presetAgent, currentEffectiveAgentInfo.agent_type, selectedManagedRuntimeAgent]);

  const currentAcpCachedModelInfo = useMemo(() => {
    // For preset agents, resolve to the actual backend type for model list lookup
    if (runtimeBackend === 'codex') {
      return buildCodexDefaultModelInfo(selectedRuntimeModelInfo);
    }

    if (selectedRuntimeModelInfo?.available_models.length) {
      return selectedRuntimeModelInfo;
    }

    return null;
  }, [runtimeBackend, selectedRuntimeModelInfo]);

  // Key of the first non-preset CLI agent (used as fallback when leaving preset mode)
  const defaultAgentKey = useMemo(() => {
    return getDefaultAgentKey(availableAgents);
  }, [availableAgents, getDefaultAgentKey]);

  return {
    selectedAgentKey,
    setSelectedAgentKey,
    defaultAgentKey,
    selectedAgent,
    selectedAgentInfo,
    is_presetAgent,
    availableAgents,
    assistants: oplAssistants,
    selectedMode,
    setSelectedMode,
    selectedAcpModel,
    setSelectedAcpModel,
    selectedReasoningEffort,
    setSelectedReasoningEffort,
    currentAcpCachedModelInfo,
    currentEffectiveAgentInfo,
    getAgentKey,
    findAgentByKey,
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
    isMainAgentAvailable,
    getEffectiveAgentType,
    customAgentAvatarMap,
  };
};
