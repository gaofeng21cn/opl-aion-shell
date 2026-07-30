/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexModel,
  getOplDefaultCodexReasoningEffort,
  getOplCodexDefaultPermissionMode,
} from '@/common/config/oplProductProfile';
import { configService } from '@/common/config/configService';
import type {
  CodexThreadConfigurationUpdateRequest,
  CodexThreadDetail,
  CodexThreadSettings,
} from '@/common/types/codex/appServerThreads';
import {
  buildCodexDefaultModelInfo,
  normalizeCodexModelInfo,
  resolveOplCodexAutoSelection,
} from '@/common/types/codex/codexModels';
import type { AcpModelInfo } from '@/common/types/platform/acpTypes';
import { savePreferredCodexSelection } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AcpConfigSetStatus, AcpDerivedOption } from './useAcpConfigOptions';
import type { UseAcpModelInfoResult } from './useAcpModelInfo';

export type CanonicalCodexSettingsController = UseAcpModelInfoResult & {
  permissionMode: string;
  selectPermissionMode: (mode: string) => Promise<CodexThreadSettings['permissionMode']>;
};

type UseCanonicalCodexSettingsOptions = {
  conversationId: string;
  threadId?: string;
  onSelectModelSuccess?: (modelId: string) => void;
  onSelectModelFailed?: (modelId: string, error: unknown) => void;
};

function modelInfoFromDetail(detail: CodexThreadDetail | null): AcpModelInfo {
  if (!detail?.models?.length) return buildCodexDefaultModelInfo();
  const models = detail.models.map((model) => ({
    id: model.id,
    label: model.label,
    description: model.description,
    supportedReasoningEfforts: model.supportedReasoningEfforts.map((reasoningEffort) => ({ reasoningEffort })),
    defaultReasoningEffort: model.defaultReasoningEffort,
    isDefault: model.isDefault,
  }));
  return normalizeCodexModelInfo({
    current_model_id: detail.settings?.model ?? null,
    current_model_label: detail.settings?.model ?? null,
    available_models: models,
    catalog_models: models,
  });
}

export function useCanonicalCodexSettings({
  conversationId,
  threadId,
  onSelectModelSuccess,
  onSelectModelFailed,
}: UseCanonicalCodexSettingsOptions): CanonicalCodexSettingsController | null {
  const [detail, setDetail] = useState<CodexThreadDetail | null>(null);
  const [setStatus, setSetStatus] = useState<AcpConfigSetStatus>({ state: 'idle' });
  const [isAutoModelSelection, setIsAutoModelSelection] = useState(() => !configuredCodexSelection().model);

  useEffect(() => {
    if (!threadId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void ipcBridge.codexThreads.read
      .invoke({ threadId, conversationId })
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((error) => {
        console.error('[useCanonicalCodexSettings] Failed to read canonical thread settings:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, threadId]);

  const model_info = useMemo(() => modelInfoFromDetail(detail), [detail]);
  const settings: CodexThreadSettings = detail?.settings ?? {
    model: configuredCodexSelection().model ?? getOplDefaultCodexModel(),
    effort: configuredCodexSelection().effort ?? getOplDefaultCodexReasoningEffort(),
    permissionMode: normalizePermissionMode(getOplCodexDefaultPermissionMode()),
  };
  const reasoningOptions = useMemo(() => {
    const currentModel = detail?.models?.find((model) => model.id === model_info.current_model_id);
    const values = currentModel?.supportedReasoningEfforts.length
      ? currentModel.supportedReasoningEfforts
      : getOplCodexModelDisplayOptions().user_reasoning_effort_options;
    return values.map((value) => ({
      value,
      label: value,
    }));
  }, [detail?.models, model_info.current_model_id]);
  const thoughtLevel: AcpDerivedOption = {
    id: 'reasoning_effort',
    category: 'reasoning',
    currentValue: settings.effort,
    options: reasoningOptions,
  };

  const configure = useCallback(
    async (
      optionId: string,
      update: Omit<CodexThreadConfigurationUpdateRequest, 'threadId'>
    ): Promise<CodexThreadDetail> => {
      if (!threadId) throw new Error('Canonical Codex thread is unavailable.');
      const requestedValue = update.model ?? update.effort ?? update.permissionMode ?? '';
      setSetStatus({ state: 'setting', optionId, requestedValue });
      try {
        const next = await ipcBridge.codexThreads.configure.invoke({
          threadId,
          ...update,
        });
        setDetail(next);
        return next;
      } finally {
        setSetStatus({ state: 'idle' });
      }
    },
    [threadId]
  );

  const selectModel = useCallback(
    (modelId: string) => {
      const effort = settings.effort;
      void configure('model', { model: modelId })
        .then(async () => {
          setIsAutoModelSelection(false);
          await savePreferredCodexSelection('codex', modelId, effort);
          onSelectModelSuccess?.(modelId);
        })
        .catch((error) => onSelectModelFailed?.(modelId, error));
    },
    [configure, onSelectModelFailed, onSelectModelSuccess, settings.effort]
  );

  const selectAutoModel = useCallback(async () => {
    const selection = resolveOplCodexAutoSelection(model_info);
    await configure('model', {
      model: selection.modelId,
      ...(selection.reasoningEffort ? { effort: selection.reasoningEffort } : {}),
    });
    setIsAutoModelSelection(true);
    await savePreferredCodexSelection('codex', null, null);
    onSelectModelSuccess?.(selection.modelId);
  }, [configure, model_info, onSelectModelSuccess]);

  const selectReasoningEffort = useCallback(
    async (value: string) => {
      const modelId = model_info.current_model_id ?? getOplDefaultCodexModel();
      await configure('reasoning_effort', { model: modelId, effort: value });
      setIsAutoModelSelection(false);
      await savePreferredCodexSelection('codex', modelId, value);
    },
    [configure, model_info.current_model_id]
  );

  const setConfigOption = useCallback(
    async (optionId: string, value: string): Promise<unknown> => {
      if (optionId !== 'reasoning_effort') throw new Error(`Unsupported canonical Codex option: ${optionId}`);
      await selectReasoningEffort(value);
      return undefined;
    },
    [selectReasoningEffort]
  );

  const selectPermissionMode = useCallback(
    async (mode: string) => {
      const requestedMode = normalizePermissionMode(mode);
      const next = await configure('permission_mode', { permissionMode: requestedMode });
      return next.settings?.permissionMode ?? requestedMode;
    },
    [configure]
  );

  if (!threadId) return null;
  return {
    model_info,
    canSwitch: model_info.available_models.length > 0,
    isAutoModelSelection,
    selectModel,
    selectAutoModel,
    selectReasoningEffort,
    thoughtLevel,
    setStatus,
    setConfigOption,
    permissionMode: settings.permissionMode,
    selectPermissionMode,
  };
}

function configuredCodexSelection(): { model: string | null; effort: string | null } {
  const config = configService.get('acp.config')?.codex;
  return {
    model: config?.preferredModelId?.trim() || null,
    effort: config?.preferredReasoningEffort?.trim() || null,
  };
}

function normalizePermissionMode(mode: string): CodexThreadSettings['permissionMode'] {
  if (mode === 'read-only' || mode === 'plan') return 'read-only';
  if (mode === 'full-access') return 'full-access';
  return 'default';
}
