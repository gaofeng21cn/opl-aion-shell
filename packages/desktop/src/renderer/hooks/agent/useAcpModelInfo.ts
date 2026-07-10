/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { isOplCodexCliFixedExecutor, shouldShowOplCodexModelList } from '@/common/config/oplProductProfile';
import {
  buildCodexDefaultModelInfo,
  normalizeCodexModelInfo,
  selectDefaultCodexModelId,
} from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { savePreferredModelId } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { DETECTED_AGENTS_SWR_KEY, fetchDetectedAgents, type AgentMetadata } from '@/renderer/utils/model/agentTypes';
import { type AcpConfigSetStatus, type AcpDerivedOption, useAcpConfigOptions } from './useAcpConfigOptions';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';

type AcpModelInfoKey = readonly ['acp-model-info', string];
type AcpModelInfoFetchResult = {
  model_info: AcpModelInfo | null;
  missing_active_session: boolean;
};

const getAcpModelInfoKey = (conversation_id: string): AcpModelInfoKey => ['acp-model-info', conversation_id] as const;

const summarizeModelInfo = (info: AcpModelInfo | null | undefined) => {
  if (!info) return null;
  return {
    current_model_id: info.current_model_id,
    current_model_label: info.current_model_label,
    available_models: (info.available_models ?? []).map((model) => ({ id: model.id, label: model.label })),
  };
};

function normalizeAcpModelOptions(value: unknown): AcpModelInfo['available_models'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) return [];
    const id = record.id.trim();
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : id;
    return [{ id, label }];
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
  if (!currentModelId && !currentModelLabel && !hasExplicitAvailableModels) return null;
  return {
    current_model_id: currentModelId,
    current_model_label: currentModelLabel,
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
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.current_model_id !== right.current_model_id ||
    left.current_model_label !== right.current_model_label ||
    left.available_models.length !== right.available_models.length
  ) {
    return false;
  }
  return left.available_models.every((model, index) => {
    const other = right.available_models[index];
    return other && other.id === model.id && other.label === model.label;
  });
}

export interface UseAcpModelInfoResult {
  model_info: AcpModelInfo | null;
  /** True when the agent exposes a switchable model list */
  canSwitch: boolean;
  /** Switch the active model and persist via IPC */
  selectModel: (model_id: string) => void;
  /** Restore App automatic model selection and clear any fixed-model preference. */
  selectAutoModel: () => void;
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
  prepareRuntime?: () => Promise<void>;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
}): UseAcpModelInfoResult => {
  const prepareRuntimePromiseRef = useRef<Promise<void> | null>(null);
  const prepareRuntimeOnce = useCallback(async () => {
    if (!prepareRuntime) return;
    if (!prepareRuntimePromiseRef.current) {
      prepareRuntimePromiseRef.current = prepareRuntime().finally(() => {
        prepareRuntimePromiseRef.current = null;
      });
    }
    await prepareRuntimePromiseRef.current;
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
  const scheduledReloadTimersRef = useRef<number[]>([]);
  const modelInfoKey = useMemo(() => getAcpModelInfoKey(conversation_id), [conversation_id]);
  const {
    data: cachedModelInfo,
    isLoading: isModelInfoLoading,
    mutate: mutateModelInfo,
  } = useSWR<AcpModelInfo | null>(enabled ? modelInfoKey : null, fetchAcpModelInfo, { revalidateOnMount: false });
  const model_info = enabled ? normalizeAcpModelInfo(cachedModelInfo) : null;

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

  const { data: agentsData } = useSWR<AgentMetadata[]>(enabled ? DETECTED_AGENTS_SWR_KEY : null, fetchDetectedAgents);
  const handshakeModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!backend || !agentsData?.length) return null;
    const matched = agentsData.find((a) => (a.backend ?? a.agent_type) === backend);
    const info = normalizeAcpModelInfo(matched?.handshake?.available_models);
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
    async (options?: { preserveInitialModel?: boolean }): Promise<boolean> => {
      if (!enabled) return false;
      try {
        await prepareRuntimeOnce();
      } catch (error) {
        logAcpModelInfo('prepare_runtime_failed_before_model_reload', {
          conversation_id,
          backend,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
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
          void reloadModelInfo().catch(() => {});
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
      void reloadModelInfo().catch(() => {});
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
          const selected = current?.available_models.find((model) => model.id === data.model);
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
    (model_id: string, persistFixedPreference: boolean) => {
      if (!enabled) return;
      hasUserChangedModel.current = true;
      const previousModelInfo = model_info;
      logAcpModelInfo('select_model_requested', {
        conversation_id,
        backend,
        requested_model_id: model_id,
        previous_model_info: summarizeModelInfo(previousModelInfo),
      });

      void (async () => {
        let confirmedModelInfo: AcpModelInfo | null = null;
        try {
          await prepareRuntime?.();
          const confirmed = await ipcBridge.acpConversation.setModel.invoke({ conversation_id, model_id });
          confirmedModelInfo = confirmed.model_info ?? null;
          if (confirmedModelInfo) {
            updateModelInfo(confirmedModelInfo);
          }
        } catch (error) {
          hasUserChangedModel.current = false;
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
          onSelectModelFailed?.(model_id, error);
          void reloadModelInfo().catch(() => {});
          return;
        }

        logAcpModelInfo('select_model_confirmed', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          confirmed_model_info: summarizeModelInfo(confirmedModelInfo),
        });
        const refreshed = await reloadModelInfo().catch(() => false);
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
            const selectedModel = normalizedPrev.available_models.find((m) => m.id === model_id);
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
        onSelectModelSuccess?.(confirmedModelId);

        // Persist only after the active ACP session accepts the model switch.
        if (backend) {
          void savePreferredModelId(backend, persistFixedPreference ? confirmedModelId : null);
        }
        logAcpModelInfo('select_model_preference_save_queued', {
          conversation_id,
          backend,
          requested_model_id: model_id,
          confirmed_model_id: confirmedModelId,
          preference_mode: persistFixedPreference ? 'fixed' : 'auto',
        });
      })().catch((error) => {
        console.error('[useAcpModelInfo] Failed to finalize model selection:', error);
      });
    },
    [
      backend,
      conversation_id,
      enabled,
      model_info,
      mutateModelInfo,
      onSelectModelFailed,
      onSelectModelSuccess,
      prepareRuntime,
      reloadModelInfo,
      updateModelInfo,
    ]
  );

  const selectModel = useCallback((model_id: string) => requestModelSelection(model_id, true), [requestModelSelection]);

  const canSwitch = Boolean(
    enabled &&
    model_info &&
    model_info.available_models.length > 0 &&
    !(backend === 'codex' && isOplCodexCliFixedExecutor() && !shouldShowOplCodexModelList())
  );

  const selectAutoModel = useCallback(() => {
    if (!enabled || backend !== 'codex' || !model_info) return;
    const defaultModelId =
      model_info.available_models.length > 0 ? selectDefaultCodexModelId(model_info.available_models) : null;
    const reportedCurrentModelId = reportedCodexCurrentModelIdRef.current ?? model_info.current_model_id;
    if (!defaultModelId || defaultModelId === reportedCurrentModelId) {
      void savePreferredModelId(backend, null);
      return;
    }
    requestModelSelection(defaultModelId, false);
  }, [backend, enabled, model_info, requestModelSelection]);

  return { model_info, canSwitch, selectModel, selectAutoModel, thoughtLevel, setStatus, setConfigOption };
};
