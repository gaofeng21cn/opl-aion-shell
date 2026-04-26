/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { hasAvailableModels } from '../utils/modelUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

/**
 * Build a unique key for a provider/model pair.
 */
const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

/**
 * Check if a model key still exists in the provider list.
 */
const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.model?.length) return false;
    return provider.model.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

type GeminiModeOption = {
  value: string;
  label: string;
  description: string;
};

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  geminiModeOptions: GeminiModeOption[];
  geminiModeLookup: Map<string, GeminiModeOption>;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (modelInfo: TProviderWithModel) => Promise<void>;
};

/**
 * Hook that manages the provider model list for the Guid page.
 * OPL defaults to Codex execution, so Gemini Google Auth synthetic models are intentionally not exposed.
 */
export const useGuidModelSelection = (_agentKey?: string): GuidModelSelectionResult => {
  const { data: modelConfig } = useSWR('model.config.welcome', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      return (data || []).filter((platform) => !!platform.model.length);
    });
  });

  const modelList = useMemo(() => {
    return (modelConfig || []).filter(hasAvailableModels);
  }, [modelConfig]);

  const formatGeminiModelLabel = useCallback(
    (_provider: { platform?: string } | undefined, modelName?: string) => modelName || '',
    []
  );

  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);

  const setCurrentModel = useCallback(async (modelInfo: TProviderWithModel) => {
    selectedModelKeyRef.current = buildModelKey(modelInfo.id, modelInfo.useModel);
    _setCurrentModel(modelInfo);
  }, []);

  // Set default model when modelList changes.
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }

      const currentKey = selectedModelKeyRef.current || buildModelKey(currentModel?.id, currentModel?.useModel);
      if (isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }
      const defaultModel = modelList[0];
      const resolvedUseModel = defaultModel?.model[0] ?? '';

      if (!defaultModel || !resolvedUseModel) return;

      await setCurrentModel({
        ...defaultModel,
        useModel: resolvedUseModel,
      });
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [modelList, currentModel?.id, currentModel?.useModel, setCurrentModel]);
  return {
    modelList,
    isGoogleAuth: false,
    geminiModeOptions: [],
    geminiModeLookup: new Map(),
    formatGeminiModelLabel,
    currentModel,
    setCurrentModel,
  };
};
