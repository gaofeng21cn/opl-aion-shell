/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import {
  getOplCodexAutoModelPolicy,
  isOplCodexCliFixedExecutor,
  shouldShowOplCodexModelList,
} from '@/common/config/oplProductProfile';
import {
  buildCodexDefaultModelInfo,
  normalizeCodexModelInfo,
  resolveOplCodexAutoSelection,
} from '@/common/types/codex/codexModels';
import type {
  AcpAvailableModel,
  AcpConfigOptionDto,
  AcpModelInfo,
  EnsureConversationRuntimeResponse,
} from '@/common/types/platform/acpTypes';
import { configService } from '@/common/config/configService';
import { savePreferredCodexSelection, savePreferredModelId } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { useManagedAgentRuntimeCatalog } from './useManagedAgents';
import { buildAgentRuntimeModelInfo } from '@/renderer/utils/model/agentRuntimeCatalog';
import {
  findConfigOption,
  type AcpConfigSetStatus,
  type AcpDerivedOption,
  useAcpConfigOptions,
} from './useAcpConfigOptions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

type AcpModelInfoKey = readonly ['acp-model-info', string];
type AcpModelInfoFetchResult = {
  model_info: AcpModelInfo | null;
  missing_active_session: boolean;
};

const getAcpModelInfoKey = (conversation_id: string): AcpModelInfoKey => ['acp-model-info', conversation_id] as const;
const CODEX_AUTO_PERSISTENCE_POLICY = getOplCodexAutoModelPolicy().persistence_policy;

const summarizeModelInfo = (info: AcpModelInfo | null | undefined) => {
  if (!info) return null;
  return {
    current_model_id: info.current_model_id,
    current_model_label: info.current_model_label,
    available_models: info.available_models,
    catalog_models: info.catalog_models,
  };
};

function normalizeReasoningEfforts(value: unknown): AcpAvailableModel['supportedReasoningEfforts'] {
  if (!Array.isArray(value)) return undefined;
  const efforts = value.flatMap((entry) => {
    if (typeof entry === 'string' && entry.trim()) return [{ reasoningEffort: entry.trim() }];
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const reasoningEffort =
      typeof record.reasoningEffort === 'string'
        ? record.reasoningEffort.trim()
        : typeof record.reasoning_effort === 'string'
          ? record.reasoning_effort.trim()
          : '';
    if (!reasoningEffort) return [];
    return [
      {
        reasoningEffort,
        description: typeof record.description === 'string' ? record.description : undefined,
      },
    ];
  });
  return efforts.length ? efforts : undefined;
}

function normalizeAcpModelOptions(value: unknown): AcpModelInfo['available_models'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) return [];
    const id = record.id.trim();
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id;
    const supportedReasoningEfforts = normalizeReasoningEfforts(
      record.supportedReasoningEfforts ?? record.supported_reasoning_efforts
    );
    const defaultReasoningEffortValue = record.defaultReasoningEffort ?? record.default_reasoning_effort;
    const upgradeValue = record.upgrade;
    return [
      {
        id,
        label,
        ...(typeof record.isDefault === 'boolean'
          ? { isDefault: record.isDefault }
          : typeof record.is_default === 'boolean'
            ? { isDefault: record.is_default }
            : {}),
        ...(supportedReasoningEfforts ? { supportedReasoningEfforts } : {}),
        ...(typeof defaultReasoningEffortValue === 'string'
          ? { defaultReasoningEffort: defaultReasoningEffortValue.trim() || null }
          : {}),
        ...(typeof record.hidden === 'boolean' ? { hidden: record.hidden } : {}),
        ...(typeof upgradeValue === 'string'
          ? { upgrade: upgradeValue }
          : upgradeValue === null
            ? { upgrade: null }
            : {}),
      },
    ];
  });
}

function normalizeAcpModelInfo(value: unknown): AcpModelInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const currentModelId =
    typeof record.current_model_id === 'string' && record.current_model_id.trim()
      ? record.current_model_id.trim()
      : null;
  const currentModelLabel =
    typeof record.current_model_label === 'string' && record.current_model_label.trim()
      ? record.current_model_label.trim()
      : currentModelId;
  const hasExplicitAvailableModels = Array.isArray(record.available_models);
  const availableModels = normalizeAcpModelOptions(record.available_models);
  const catalogModels = normalizeAcpModelOptions(record.catalog_models);
  if (!currentModelId && !currentModelLabel && !hasExplicitAvailableModels) return null;
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelLabel,
    available_models: availableModels,
    catalog_models: catalogModels.length ? catalogModels : undefined,
  };
}

function buildModelInfoFromPreparedConfigOptions(configOptions: AcpConfigOptionDto[]): AcpModelInfo | null {
  const modelOption = findConfigOption(configOptions, 'model', ['model']);
  if (!modelOption || (modelOption.option_type ?? modelOption.type) !== 'select') return null;
  const availableModels = modelOption.options.map((option) => ({
    id: option.value,
    label: option.name || option.label || option.value,
  }));
  if (availableModels.length === 0) return null;
  const currentModelId = modelOption.current_value?.trim() || null;
  return {
    current_model_id: currentModelId,
    current_model_label:
      (currentModelId && availableModels.find((model) => model.id === currentModelId)?.label) || currentModelId,
    available_models: availableModels,
  };
}

const logAcpModelInfo = (event: string, data: Record<string, unknown>) => {
  const entry = { event, ...data };
  console.info('[useAcpModelInfo]', entry);
  void ipcBridge.application.writeRendererLog
    .invoke({
      level: 'info',
      tag: 'useAcpModelInfo',
      message: event,
      data: entry,
    })
    .catch(() => {});
};

const fetchAcpModelInfoResult = async ([, conversation_id]: AcpModelInfoKey): Promise<AcpModelInfoFetchResult> => {
  try {
    const result = await ipcBridge.acpConversation.getModel.invoke({ conversation_id });
    return { model_info: normalizeAcpModelInfo(result?.model_info), missing_active_session: false };
  } catch (error) {
    const missingActiveSession = isBackendHttpError(error) && error.status === 404;
    if (!missingActiveSession) {
      logAcpModelInfo('fetch_failed', {
        conversation_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // 404 before warmup or between ACP evict/rebuild. reloadModelInfo must
    // not fall back directly; the no-cache fallback effect handles genuine
    // first-load cases without overwriting an established model cache.
    return { model_info: null, missing_active_session: missingActiveSession };
  }
};

const fetchAcpModelInfo = async (key: AcpModelInfoKey): Promise<AcpModelInfo | null> =>
  (await fetchAcpModelInfoResult(key)).model_info;

function isSameModelInfo(a: AcpModelInfo | null | undefined, b: AcpModelInfo | null | undefined): boolean {
  const left = normalizeAcpModelInfo(a);
  const right = normalizeAcpModelInfo(b);
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface UseAcpModelInfoResult {
  model_info: AcpModelInfo | null;
  /** True when the agent exposes a switchable model list */
  canSwitch: boolean;
  /** True when Codex follows the App Auto policy instead of a persisted fixed model. */
  isAutoModelSelection: boolean;
  /** Switch the active model and persist via IPC */
  selectModel: (model_id: string) => void;
  /** Restore App automatic model selection and clear any fixed-model preference. */
  selectAutoModel: () => Promise<void>;
  /** Pin the resolved model and leave Auto before applying a reasoning override. */
  selectReasoningEffort: (value: string) => Promise<void>;
  /** Runtime reasoning/thought-level config exposed by ACP, when available. */
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  setConfigOption: (optionId: string, value: string) => Promise<unknown>;
}

/**
 * Loads ACP model info for a conversation, syncs it from real-time
 * `acp_model_info` / `codex_model_info` stream events, and exposes a
 * setter that calls `setModel` over IPC. Mirrors the logic that
 * AcpModelSelector previously kept inline so both the dropdown and the
 * mobile action sheet can drive the same source of truth.
 */
export const useAcpModelInfo = ({
  conversation_id,
  backend,
  initialModelId,
  prepareRuntime,
  enabled = true,
  onSelectModelSuccess,
  onSelectModelFailed,
}: {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
  prepareRuntime?: () => Promise<EnsureConversationRuntimeResponse | void>;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
}): UseAcpModelInfoResult => {
  const prepareRuntimePromiseRef = useRef<Promise<EnsureConversationRuntimeResponse | void> | null>(null);
  const prepareRuntimeOnce = useCallback(async () => {
    if (!prepareRuntime) return undefined;
    if (!prepareRuntimePromiseRef.current) {
      prepareRuntimePromiseRef.current = prepareRuntime().finally(() => {
        prepareRuntimePromiseRef.current = null;
      });
    }
    return await prepareRuntimePromiseRef.current;
  }, [prepareRuntime]);
  const { thoughtLevel, setStatus, setConfigOption } = useAcpConfigOptions({
    conversation_id,
    prepareRuntime: prepareRuntimeOnce,
    enabled,
  });
  const hasUserChangedModel = useRef(false);
  const prevConversationIdRef = useRef(conversation_id);
  const modelInfoRef = useRef<AcpModelInfo | null>(null);
  const reportedCodexCurrentModelIdRef = useRef<string | null>(null);
  const handshakeModelInfoRef = useRef<AcpModelInfo | null>(null);
  const attemptedAutoResolutionKeysRef = useRef(new Set<string>());
  const autoSelectionRunningRef = useRef(false);
  const [autoSelectionRevision, setAutoSelectionRevision] = useState(0);
  const scheduledReloadTimersRef = useRef<number[]>([]);
  const modelInfoKey = useMemo(() => getAcpModelInfoKey(conversation_id), [conversation_id]);
  const {
    data: cachedModelInfo,
    isLoading: isModelInfoLoading,
    mutate: mutateModelInfo,
  } = useSWR<AcpModelInfo | null>(enabled ? modelInfoKey : null, fetchAcpModelInfo, { revalidateOnMount: false });
  const baselineCodexModelInfo = useMemo(() => (backend === 'codex' ? buildCodexDefaultModelInfo() : null), [backend]);
  const model_info = enabled ? normalizeAcpModelInfo(cachedModelInfo ?? baselineCodexModelInfo) : null;

  useEffect(() => {
    modelInfoRef.current = model_info;
  }, [model_info]);

  const updateModelInfo = useCallback(
    (nextModelInfo: AcpModelInfo) => {
      if (backend === 'codex') {
        reportedCodexCurrentModelIdRef.current = nextModelInfo.current_model_id?.trim() || null;
      }
      const normalizedNextModelInfo = backend === 'codex' ? normalizeCodexModelInfo(nextModelInfo) : nextModelInfo;
      modelInfoRef.current = normalizedNextModelInfo;
      void mutateModelInfo((prev) => {
        return isSameModelInfo(prev, normalizedNextModelInfo) ? prev : normalizedNextModelInfo;
      }, false);
    },
    [backend, mutateModelInfo]
  );

  const agentsData = useManagedAgentRuntimeCatalog();
  const handshakeModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!backend || !agentsData?.length) return null;
    const matched = agentsData.find((a) => (a.backend ?? a.agent_type) === backend);
    const info = normalizeAcpModelInfo(buildAgentRuntimeModelInfo(matched));
    if (backend === 'codex') return buildCodexDefaultModelInfo(info);
    if (!info || info.available_models.length === 0) return null;
    return info;
  }, [agentsData, backend]);

  useEffect(() => {
    handshakeModelInfoRef.current = handshakeModelInfo;
  }, [handshakeModelInfo]);

  const loadFallbackModelInfo = useCallback(
    (options?: { preserveInitialModel?: boolean }) => {
      if (!enabled) return false;
      const source = handshakeModelInfoRef.current;
      if (!source || source.available_models.length === 0) return false;

      const effectiveModelId =
        options?.preserveInitialModel && initialModelId ? initialModelId : (source.current_model_id ?? null);

      logAcpModelInfo('fallback_from_handshake', {
        conversation_id,
        backend,
        preserve_initial_model: Boolean(options?.preserveInitialModel),
        initial_model_id: initialModelId,
        effective_model_id: effectiveModelId,
        source_model_info: summarizeModelInfo(source),
      });

      updateModelInfo({
        ...source,
        current_model_id: effectiveModelId,
        current_model_label:
          (effectiveModelId && source.available_models.find((m) => m.id === effectiveModelId)?.label) ||
          effectiveModelId,
      });
      return true;
    },
    [backend, conversation_id, enabled, initialModelId, updateModelInfo]
  );

  const reloadModelInfo = useCallback(
    async (options?: { preserveInitialModel?: boolean; preferPreparedSnapshot?: boolean }): Promise<boolean> => {
      if (!enabled) return false;
      let prepared: EnsureConversationRuntimeResponse | void;
      try {
        prepared = await prepareRuntimeOnce();
      } catch (error) {
        logAcpModelInfo('prepare_runtime_failed_before_model_reload', {
          conversation_id,
          backend,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }

      if (options?.preferPreparedSnapshot !== false && prepared) {
        const preparedModelInfo = buildModelInfoFromPreparedConfigOptions(prepared.config_options);
        if (preparedModelInfo) {
          updateModelInfo(preparedModelInfo);
          return true;
        }
      }

      const { model_info: info, missing_active_session: missingActiveSession } =
        await fetchAcpModelInfoResult(modelInfoKey);

      if (info && (backend === 'codex' || info.available_models.length > 0)) {
        // Backend's `current_model_id` is the source of truth for an active
        // session. Only fall back to `initialModelId` when the backend has
        // no current model yet (genuine pre-handshake case); never
        // override a known backend value, otherwise re-entering an old
        // conversation would clobber a switch the user already made
        // (ELECTRON-1RV).
        if (
          options?.preserveInitialModel &&
          initialModelId &&
          !info.current_model_id &&
          info.available_models.some((m) => m.id === initialModelId)
        ) {
          const match = info.available_models.find((m) => m.id === initialModelId);
          if (match) {
            updateModelInfo({
              ...info,
              current_model_id: initialModelId,
              current_model_label: match.label || initialModelId,
            });
            return true;
          }
        }
        updateModelInfo(info);
        return true;
      }

      if (backend) {
        const cached = modelInfoRef.current;
        if (cached?.available_models?.length) {
          logAcpModelInfo('reload_no_backend_model_keep_cached_model', {
            conversation_id,
            backend,
            missing_active_session: missingActiveSession,
            cached_model_info: summarizeModelInfo(cached),
          });
          return false;
        }
        if (missingActiveSession) {
          return false;
        }
        return loadFallbackModelInfo(options);
      }
      return false;
    },
    [
      backend,
      conversation_id,
      enabled,
      initialModelId,
      loadFallbackModelInfo,
      modelInfoKey,
      prepareRuntimeOnce,
      updateModelInfo,
    ]
  );

  const clearScheduledReloads = useCallback(() => {
    scheduledReloadTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    scheduledReloadTimersRef.current = [];
  }, []);

  const scheduleModelInfoReload = useCallback(
    (_reason: string, delays: number[]) => {
      clearScheduledReloads();
      scheduledReloadTimersRef.current = delays.map((delay) =>
        window.setTimeout(() => {
          void reloadModelInfo({ preferPreparedSnapshot: false }).catch(() => {});
        }, delay)
      );
    },
    [clearScheduledReloads, reloadModelInfo]
  );

  useEffect(() => {
    return () => {
      clearScheduledReloads();
    };
  }, [clearScheduledReloads, conversation_id]);

  useEffect(() => {
    if (!enabled) {
      clearScheduledReloads();
      return;
    }
    if (prevConversationIdRef.current !== conversation_id) {
      // Resetting on conversation change is intentional; the in-flight
      // model selection belongs to the previous conversation, not this one.
      hasUserChangedModel.current = false;
      reportedCodexCurrentModelIdRef.current = null;
      attemptedAutoResolutionKeysRef.current.clear();
      prevConversationIdRef.current = conversation_id;
    }
    void reloadModelInfo({ preserveInitialModel: true }).catch(() => {});
  }, [conversation_id, backend, enabled, initialModelId, reloadModelInfo, clearScheduledReloads]);

  useEffect(() => {
    if (!enabled) return;
    if (!backend || !handshakeModelInfo) return;
    if (model_info) return;
    if (isModelInfoLoading) return;
    if (hasUserChangedModel.current) return;
    loadFallbackModelInfo({ preserveInitialModel: true });
  }, [backend, enabled, handshakeModelInfo, isModelInfoLoading, model_info, loadFallbackModelInfo]);

  // Claude doesn't push acp_model_info on warmup; poll while window has focus.
  useEffect(() => {
    if (!enabled) return;
    if (backend !== 'claude') return;
    if (model_info) return;
    const refresh = () => {
      void reloadModelInfo({ preferPreparedSnapshot: false }).catch(() => {});
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = window.setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [backend, enabled, model_info, reloadModelInfo]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'start') {
        scheduleModelInfoReload('start', [250, 1500]);
      } else if (message.type === 'finish' || message.type === 'error') {
        scheduleModelInfoReload(message.type, [250, 1500]);
      } else if (message.type === 'agent_status') {
        const data = message.data as { status?: string } | undefined;
        if (data?.status === 'session_active') {
          scheduleModelInfoReload('session_active', [250]);
        }
      }

      if (message.type === 'acp_model_info' && message.data) {
        const incoming = normalizeAcpModelInfo(message.data);
        if (!incoming) return;
        // Same rule as reloadModelInfo: backend's current_model_id wins.
        // Only honor initialModelId when the stream payload has none.
        if (
          initialModelId &&
          !incoming.current_model_id &&
          incoming.available_models?.length > 0 &&
          incoming.available_models.some((m) => m.id === initialModelId)
        ) {
          const match = incoming.available_models.find((m) => m.id === initialModelId);
          if (match) {
            updateModelInfo({
              ...incoming,
              current_model_id: initialModelId,
              current_model_label: match.label || initialModelId,
            });
            return;
          }
        }
        updateModelInfo(incoming);
      } else if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model: string };
        if (data.model) {
          const current = modelInfoRef.current;
          const selected = [...(current?.available_models ?? []), ...(current?.catalog_models ?? [])].find(
            (model) => model.id === data.model
          );
          if (current && selected) {
            updateModelInfo({
              ...current,
              current_model_id: selected.id,
              current_model_label: selected.label,
            });
          } else {
            scheduleModelInfoReload('codex_model_info', [250]);
          }
        }
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, enabled, initialModelId, scheduleModelInfoReload, updateModelInfo]);

  const requestModelSelection = useCallback(
    async (model_id: string, persistFixedPreference: boolean): Promise<string> => {
      if (!enabled) throw new Error('model_selection_disabled');
      const previousModelInfo = model_info;
      logAcpModelInfo('select_model_requested', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        previous_model_info: summarizeModelInfo(previousModelInfo),
      });

      let confirmedModelInfo: AcpModelInfo | null = null;
      try {
        await prepareRuntimeOnce();
        const confirmed = await ipcBridge.acpConversation.setModel.invoke({ conversation_id, model_id });
        confirmedModelInfo = confirmed.model_info ?? null;
        if (confirmedModelInfo) {
          updateModelInfo(confirmedModelInfo);
        }
      } catch (error) {
        logAcpModelInfo('select_model_failed', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('[useAcpModelInfo] Failed to set model:', error);
        if (previousModelInfo) {
          updateModelInfo(previousModelInfo);
        } else {
          void mutateModelInfo(null, false);
        }
        void reloadModelInfo({ preferPreparedSnapshot: false }).catch(() => {});
        throw error;
      }

      logAcpModelInfo('select_model_confirmed', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        confirmed_model_info: summarizeModelInfo(confirmedModelInfo),
      });
      const refreshed = await reloadModelInfo({ preferPreparedSnapshot: false }).catch(() => false);
      logAcpModelInfo('select_model_refresh_completed', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        refreshed,
      });
      if (!refreshed) {
        if (backend === 'codex') {
          reportedCodexCurrentModelIdRef.current = model_id;
        }
        void mutateModelInfo((prev) => {
          const normalizedPrev = normalizeAcpModelInfo(prev);
          if (!normalizedPrev) return null;
          const selectedModel = [...normalizedPrev.available_models, ...(normalizedPrev.catalog_models ?? [])].find(
            (model) => model.id === model_id
          );
          logAcpModelInfo('select_model_local_fallback', {
            conversation_id,
            backend,
            requested_model_id: model_id,
            previous_model_info: summarizeModelInfo(normalizedPrev),
            selected_model_label: selectedModel?.label,
          });
          return {
            ...normalizedPrev,
            current_model_id: model_id,
            current_model_label: selectedModel?.label || model_id,
          };
        }, false);
      }

      const confirmedModelId =
        (confirmedModelInfo || refreshed ? modelInfoRef.current?.current_model_id : model_id) || model_id;
      if (backend) {
        if (backend === 'codex' && !persistFixedPreference) {
          await savePreferredCodexSelection(backend, null, null);
        } else {
          await savePreferredModelId(backend, persistFixedPreference ? confirmedModelId : null);
        }
      }
      logAcpModelInfo('select_model_preference_saved', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        confirmed_model_id: confirmedModelId,
        preference_mode: persistFixedPreference ? 'fixed' : 'auto',
      });
      return confirmedModelId;
    },
    [
      backend,
      conversation_id,
      enabled,
      model_info,
      mutateModelInfo,
      prepareRuntimeOnce,
      reloadModelInfo,
      updateModelInfo,
    ]
  );

  const selectModel = useCallback(
    (model_id: string) => {
      hasUserChangedModel.current = true;
      void requestModelSelection(model_id, true)
        .then((confirmedModelId) => onSelectModelSuccess?.(confirmedModelId))
        .catch((error) => {
          hasUserChangedModel.current = false;
          onSelectModelFailed?.(model_id, error);
        });
    },
    [onSelectModelFailed, onSelectModelSuccess, requestModelSelection]
  );

  const canSwitch = Boolean(
    enabled &&
    model_info &&
    model_info.available_models.length > 0 &&
    !(backend === 'codex' && isOplCodexCliFixedExecutor() && !shouldShowOplCodexModelList())
  );
  const isAutoModelSelection = backend === 'codex' && !configService.get('acp.config')?.codex?.preferredModelId?.trim();

  const applyAutoSelection = useCallback(
    async (notify: boolean): Promise<void> => {
      if (!enabled || backend !== 'codex' || !model_info) return;
      const selection = resolveOplCodexAutoSelection(model_info);
      try {
        const reportedCurrentModelId = reportedCodexCurrentModelIdRef.current ?? model_info.current_model_id;
        if (selection.modelId !== reportedCurrentModelId) {
          await requestModelSelection(selection.modelId, false);
        } else {
          await savePreferredCodexSelection(backend, null, null);
        }
        if (thoughtLevel && selection.reasoningEffort && thoughtLevel.currentValue !== selection.reasoningEffort) {
          await setConfigOption(thoughtLevel.id, selection.reasoningEffort);
        }
        if (notify) onSelectModelSuccess?.(selection.modelId);
      } catch (error) {
        if (notify) onSelectModelFailed?.(selection.modelId, error);
        throw error;
      }
    },
    [
      backend,
      enabled,
      model_info,
      onSelectModelFailed,
      onSelectModelSuccess,
      requestModelSelection,
      setConfigOption,
      thoughtLevel,
    ]
  );

  const selectAutoModel = useCallback(async () => {
    hasUserChangedModel.current = false;
    attemptedAutoResolutionKeysRef.current.clear();
    autoSelectionRunningRef.current = true;
    if (backend === 'codex') await savePreferredCodexSelection(backend, null, null);
    try {
      await applyAutoSelection(true);
    } finally {
      autoSelectionRunningRef.current = false;
      setAutoSelectionRevision((revision) => revision + 1);
    }
  }, [applyAutoSelection, backend]);

  const selectReasoningEffort = useCallback(
    async (value: string): Promise<void> => {
      if (!thoughtLevel || value === thoughtLevel.currentValue) return;
      if (backend !== 'codex') {
        await setConfigOption(thoughtLevel.id, value);
        return;
      }
      const currentModelId = reportedCodexCurrentModelIdRef.current ?? model_info?.current_model_id;
      if (!currentModelId) throw new Error('codex_reasoning_override_requires_resolved_model');
      if (CODEX_AUTO_PERSISTENCE_POLICY.reasoning_override_from_auto !== 'pin_current_resolved_model_and_exit_auto') {
        throw new Error('unsupported_codex_reasoning_override_persistence_policy');
      }
      hasUserChangedModel.current = true;
      try {
        await setConfigOption(thoughtLevel.id, value);
        await savePreferredCodexSelection(backend, currentModelId, value);
      } catch (error) {
        hasUserChangedModel.current = false;
        throw error;
      }
    },
    [backend, model_info?.current_model_id, setConfigOption, thoughtLevel]
  );

  useEffect(() => {
    if (
      !enabled ||
      backend !== 'codex' ||
      !model_info ||
      hasUserChangedModel.current ||
      autoSelectionRunningRef.current
    )
      return;
    const fixedPreference = configService.get('acp.config')?.codex?.preferredModelId?.trim();
    if (fixedPreference) return;
    const selection = resolveOplCodexAutoSelection(model_info);
    const catalogSignature = JSON.stringify(
      (model_info.catalog_models ?? model_info.available_models).map((model) => ({
        id: model.id,
        isDefault: model.isDefault,
        supportedReasoningEfforts: model.supportedReasoningEfforts,
      }))
    );
    const currentModelId = reportedCodexCurrentModelIdRef.current ?? model_info.current_model_id;
    const key = `${conversation_id}:${selection.modelId}:${selection.reasoningEffort ?? ''}:${currentModelId ?? ''}:${thoughtLevel?.currentValue ?? 'unavailable'}:${catalogSignature}`;
    if (attemptedAutoResolutionKeysRef.current.has(key)) return;
    attemptedAutoResolutionKeysRef.current.add(key);
    autoSelectionRunningRef.current = true;
    void applyAutoSelection(false)
      .catch(() => {})
      .finally(() => {
        autoSelectionRunningRef.current = false;
        setAutoSelectionRevision((revision) => revision + 1);
      });
  }, [
    applyAutoSelection,
    autoSelectionRevision,
    backend,
    conversation_id,
    enabled,
    model_info,
    thoughtLevel?.currentValue,
  ]);

  return {
    model_info,
    canSwitch,
    isAutoModelSelection,
    selectModel,
    selectAutoModel,
    selectReasoningEffort,
    thoughtLevel,
    setStatus,
    setConfigOption,
  };
};
