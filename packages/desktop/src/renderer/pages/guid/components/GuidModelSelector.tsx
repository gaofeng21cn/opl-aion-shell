/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  isOplCodexCliFixedExecutor,
} from '@/common/config/oplProductProfile';
import { resolveOplCodexAutoSelection } from '@/common/types/codex/codexModels';
import { resolveLegacySettingsRoute } from '@/renderer/pages/settings/registry/settingsRegistry';
import { iconColors } from '@/renderer/styles/colors';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexCompactModelLabel,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import type { AcpModelInfo } from '../types';
import { getAvailableModels } from '../utils/modelUtils';
import { Button, Dropdown, Menu, Tooltip } from '@arco-design/web-react';
import { Check, Down, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';

type GuidModelSelectorProps = {
  // Gemini model state
  isGeminiMode: boolean;
  modelList: IProvider[];
  current_model: TProviderWithModel | undefined;
  setCurrentModel: (model: TProviderWithModel) => Promise<void>;

  // ACP model state
  currentAcpCachedModelInfo: AcpModelInfo | null;
  selectedAcpModel: string | null;
  setSelectedAcpModel: React.Dispatch<React.SetStateAction<string | null>>;
  selectedReasoningEffort?: string | null;
  setSelectedReasoningEffort?: React.Dispatch<React.SetStateAction<string | null>>;
  setCodexModelSelection?: (modelId: string | null, reasoningEffort: string | null) => void;
  backend?: string;
};

const GuidModelSelector: React.FC<GuidModelSelectorProps> = ({
  isGeminiMode,
  modelList,
  current_model,
  setCurrentModel,
  currentAcpCachedModelInfo,
  selectedAcpModel,
  setSelectedAcpModel,
  selectedReasoningEffort = null,
  setSelectedReasoningEffort,
  setCodexModelSelection,
  backend,
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const modelSettingsRoute = resolveLegacySettingsRoute('model');
  const defaultModelLabel = t('common.defaultModel');
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const localeKey: OplModelDisplayLocale = i18n.language?.startsWith('en') ? 'en-US' : 'zh-CN';
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const autoCodexSelection = React.useMemo(
    () =>
      useOplCodexModelDisplay && selectedAcpModel === null && currentAcpCachedModelInfo
        ? resolveOplCodexAutoSelection(currentAcpCachedModelInfo)
        : null,
    [currentAcpCachedModelInfo, selectedAcpModel, useOplCodexModelDisplay]
  );
  const effectiveReasoningEffort =
    selectedReasoningEffort ?? autoCodexSelection?.reasoningEffort ?? defaultCodexReasoningEffort;
  const codexDisplayOptions = getOplCodexModelDisplayOptions();
  const restoreCodexAutoSelection = () => {
    if (useOplCodexModelDisplay && setCodexModelSelection) {
      setCodexModelSelection(null, null);
      return;
    }
    setSelectedAcpModel(null);
    setSelectedReasoningEffort?.(null);
  };
  // 获取模型配置数据（包含健康状态）
  const { data: modelConfig } = useProvidersQuery();

  // 过滤掉被禁用的 provider
  const enabledModelList = React.useMemo(() => {
    return modelList.filter((p) => p.enabled !== false);
  }, [modelList]);

  const geminiSelectedLabel = React.useMemo(() => {
    if (!current_model?.use_model) return '';
    return current_model.use_model;
  }, [current_model?.use_model]);

  const geminiButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selected_value: current_model?.use_model,
      selectedLabel: geminiSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [current_model?.use_model, defaultModelLabel, geminiSelectedLabel]);

  const acpSelectedLabel = React.useMemo(() => {
    if (selectedAcpModel === null && currentAcpCachedModelInfo?.current_model_id) {
      if (useOplCodexModelDisplay) {
        const currentDisplay = formatOplCodexModelDisplay({
          id: currentAcpCachedModelInfo.current_model_id,
          label: currentAcpCachedModelInfo.current_model_label,
          reasoningEffort: effectiveReasoningEffort,
          localeKey,
        });
        return `${formatOplCodexCompactModelLabel(currentDisplay.modelLabel)} ${formatOplCodexReasoningMenuLabel(
          effectiveReasoningEffort,
          localeKey
        )}`;
      }
      return t('conversation.welcome.autoModel', {
        model: currentAcpCachedModelInfo.current_model_label || currentAcpCachedModelInfo.current_model_id,
      });
    }
    const selectedModel = currentAcpCachedModelInfo?.available_models?.find((m) => m.id === selectedAcpModel);
    if (useOplCodexModelDisplay && selectedModel) {
      const modelDisplay = formatOplCodexModelDisplay({
        id: selectedModel.id,
        label: selectedModel.label,
        reasoningEffort: effectiveReasoningEffort,
        localeKey,
      });
      return `${formatOplCodexCompactModelLabel(modelDisplay.modelLabel)} ${formatOplCodexReasoningMenuLabel(
        effectiveReasoningEffort,
        localeKey
      )}`;
    }
    return (
      selectedModel?.label ||
      selectedAcpModel ||
      currentAcpCachedModelInfo?.current_model_label ||
      currentAcpCachedModelInfo?.current_model_id ||
      ''
    );
  }, [
    currentAcpCachedModelInfo?.available_models,
    currentAcpCachedModelInfo?.current_model_id,
    currentAcpCachedModelInfo?.current_model_label,
    localeKey,
    t,
    selectedAcpModel,
    effectiveReasoningEffort,
    useOplCodexModelDisplay,
  ]);

  const acpButtonLabel = React.useMemo(() => {
    return getModelDisplayLabel({
      selected_value: selectedAcpModel || currentAcpCachedModelInfo?.current_model_id,
      selectedLabel: acpSelectedLabel,
      defaultModelLabel,
      fallbackLabel: defaultModelLabel,
    });
  }, [acpSelectedLabel, currentAcpCachedModelInfo?.current_model_id, defaultModelLabel, selectedAcpModel]);

  if (isGeminiMode) {
    return (
      <Dropdown
        trigger='hover'
        droplist={
          <Menu
            className='aion-model-menu--sticky-group'
            selectedKeys={current_model ? [current_model.id + current_model.use_model] : []}
          >
            {!enabledModelList || enabledModelList.length === 0
              ? [
                  <Menu.Item
                    key='no-models'
                    className='px-12px py-12px text-t-secondary text-14px text-center flex justify-center items-center'
                    disabled
                  >
                    {t('settings.noAvailableModels')}
                  </Menu.Item>,
                  <Menu.Item
                    key='add-model'
                    className='text-12px text-t-secondary'
                    onClick={() => navigate(modelSettingsRoute)}
                  >
                    <Plus theme='outline' size='12' />
                    {t('settings.addModel')}
                  </Menu.Item>,
                ]
              : [
                  ...(enabledModelList || []).map((provider) => {
                    const available_models = getAvailableModels(provider);
                    if (available_models.length === 0) return null;
                    return (
                      <Menu.ItemGroup title={provider.name} key={provider.id}>
                        {available_models.map((modelName) => {
                          // 获取模型健康状态
                          const matchedProvider = modelConfig?.find((p) => p.id === provider.id);
                          const healthStatus = matchedProvider?.model_health?.[modelName]?.status || 'unknown';
                          const healthColor =
                            healthStatus === 'healthy'
                              ? 'bg-green-500'
                              : healthStatus === 'unhealthy'
                                ? 'bg-red-500'
                                : 'bg-gray-400';

                          return (
                            <Menu.Item
                              key={provider.id + modelName}
                              className={
                                current_model?.id + current_model?.use_model === provider.id + modelName ? '!bg-2' : ''
                              }
                              onClick={() => {
                                setCurrentModel({ ...provider, use_model: modelName }).catch((error) => {
                                  console.error('Failed to set current model:', error);
                                });
                              }}
                            >
                              <div className='flex items-center gap-8px w-full'>
                                {healthStatus !== 'unknown' && (
                                  <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                                )}
                                <span>{modelName}</span>
                              </div>
                            </Menu.Item>
                          );
                        })}
                      </Menu.ItemGroup>
                    );
                  }),
                  <Menu.Item
                    key='add-model'
                    className='text-12px text-t-secondary'
                    onClick={() => navigate(modelSettingsRoute)}
                  >
                    <Plus theme='outline' size='12' />
                    {t('settings.addModel')}
                  </Menu.Item>,
                ]}
          </Menu>
        }
      >
        <Button
          className={'sendbox-model-btn guid-config-btn'}
          shape='round'
          size='small'
          data-testid='guid-model-selector'
        >
          <span className='flex items-center gap-6px min-w-0'>
            <span>{geminiButtonLabel}</span>
            <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
          </span>
        </Button>
      </Dropdown>
    );
  }

  // ACP cached model selector
  if (currentAcpCachedModelInfo && currentAcpCachedModelInfo.available_models?.length > 0) {
    if (currentAcpCachedModelInfo.available_models.length > 0) {
      const autoModelDisplay = buildOplCodexAutoModelOption({
        modelInfo: currentAcpCachedModelInfo,
        localeKey,
      });
      const effectiveModelId = selectedAcpModel ?? currentAcpCachedModelInfo.current_model_id;
      const effectiveModel = currentAcpCachedModelInfo.available_models.find((model) => model.id === effectiveModelId);
      const unavailableFixedModelId = selectedAcpModel && !effectiveModel ? selectedAcpModel : null;
      const modelSubmenuTitle =
        useOplCodexModelDisplay && effectiveModelId
          ? formatOplCodexModelDisplay({
              id: effectiveModelId,
              label: effectiveModel?.label ?? currentAcpCachedModelInfo.current_model_label,
              reasoningEffort: effectiveReasoningEffort,
              localeKey,
            }).modelLabel
          : t('common.model', { defaultValue: 'Model' });
      const reasoningMenuItems =
        useOplCodexModelDisplay && setSelectedReasoningEffort
          ? codexDisplayOptions.user_reasoning_effort_options.map((effort) => {
              const selected = effectiveReasoningEffort === effort;
              return (
                <Menu.Item
                  key={`reasoning:${effort}`}
                  className={selected ? '!bg-2' : ''}
                  onClick={() => {
                    if (effectiveModelId && setCodexModelSelection) {
                      setCodexModelSelection(effectiveModelId, effort);
                      return;
                    }
                    if (effectiveModelId && selectedAcpModel === null) setSelectedAcpModel(effectiveModelId);
                    setSelectedReasoningEffort(effort);
                  }}
                >
                  <div className='flex items-center justify-between gap-16px w-full'>
                    <span>{formatOplCodexReasoningMenuLabel(effort, localeKey)}</span>
                    {selected && <Check theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />}
                  </div>
                </Menu.Item>
              );
            })
          : null;
      return (
        <Dropdown
          trigger='click'
          droplist={
            <Menu
              mode='pop'
              selectedKeys={selectedAcpModel ? [selectedAcpModel] : ['__auto']}
              style={{ minWidth: 220 }}
            >
              <Menu.Item
                key='__auto'
                className={selectedAcpModel === null ? '!bg-2' : ''}
                onClick={restoreCodexAutoSelection}
              >
                <div
                  className={
                    useOplCodexModelDisplay ? 'flex flex-col gap-2px w-full' : 'flex items-center gap-8px w-full'
                  }
                >
                  <span className={useOplCodexModelDisplay ? 'font-medium' : ''}>
                    {useOplCodexModelDisplay
                      ? autoModelDisplay.label
                      : t('conversation.welcome.autoModel', {
                          model:
                            currentAcpCachedModelInfo.current_model_label || currentAcpCachedModelInfo.current_model_id,
                        })}
                  </span>
                  {useOplCodexModelDisplay && (
                    <span className='text-12px text-t-secondary'>{autoModelDisplay.description}</span>
                  )}
                </div>
              </Menu.Item>
              {unavailableFixedModelId && (
                <Menu.Item key={`unavailable:${unavailableFixedModelId}`} disabled>
                  <div className='flex items-center justify-between gap-16px w-full'>
                    <span>{unavailableFixedModelId}</span>
                    <span className='text-12px text-t-secondary'>
                      {t('conversation.currentTask.unavailable', { defaultValue: 'Unavailable' })}
                    </span>
                  </div>
                </Menu.Item>
              )}
              {reasoningMenuItems}
              <Menu.SubMenu
                key='__models'
                title={<span className='text-12px text-t-secondary'>{modelSubmenuTitle}</span>}
              >
                {currentAcpCachedModelInfo.available_models.map((model) => {
                  // 获取模型健康状态
                  const providerConfig = modelConfig?.find((p) => p.platform?.includes(''));
                  const healthStatus = providerConfig?.model_health?.[model.id]?.status || 'unknown';
                  const healthColor =
                    healthStatus === 'healthy'
                      ? 'bg-green-500'
                      : healthStatus === 'unhealthy'
                        ? 'bg-red-500'
                        : 'bg-gray-400';
                  const modelDisplay = useOplCodexModelDisplay
                    ? formatOplCodexModelDisplay({
                        id: model.id,
                        label: model.label,
                        reasoningEffort: effectiveReasoningEffort,
                        localeKey,
                      })
                    : null;

                  return (
                    <Menu.Item
                      key={model.id}
                      className={model.id === selectedAcpModel ? '!bg-2' : ''}
                      onClick={() => {
                        if (useOplCodexModelDisplay && setCodexModelSelection) {
                          setCodexModelSelection(model.id, effectiveReasoningEffort);
                          return;
                        }
                        setSelectedAcpModel(model.id);
                      }}
                    >
                      <div
                        className={
                          useOplCodexModelDisplay
                            ? 'flex items-center justify-between gap-16px w-full'
                            : 'flex items-center gap-8px w-full'
                        }
                      >
                        <div className='flex items-center gap-8px'>
                          {healthStatus !== 'unknown' && (
                            <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                          )}
                          {useOplCodexModelDisplay ? (
                            <div className='flex flex-col gap-2px'>
                              <span>{modelDisplay?.modelLabel}</span>
                              <span className='text-12px text-t-secondary'>{modelDisplay?.description}</span>
                            </div>
                          ) : (
                            <span>{model.label}</span>
                          )}
                        </div>
                        {model.id === selectedAcpModel && (
                          <Check theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
                        )}
                      </div>
                    </Menu.Item>
                  );
                })}
              </Menu.SubMenu>
            </Menu>
          }
        >
          <Button
            className={'sendbox-model-btn guid-config-btn'}
            shape='round'
            size='small'
            data-testid='guid-model-selector'
          >
            <span className='flex items-center gap-6px min-w-0'>
              <span>{acpButtonLabel}</span>
              <Down theme='outline' size='12' fill={iconColors.secondary} className='shrink-0' />
            </span>
          </Button>
        </Dropdown>
      );
    }

    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className={'sendbox-model-btn guid-config-btn'}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
          data-testid='guid-model-selector'
        >
          <span className='flex items-center gap-6px min-w-0'>
            <span>{acpButtonLabel}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  if (currentAcpCachedModelInfo) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className={'sendbox-model-btn guid-config-btn'}
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
          data-testid='guid-model-selector'
        >
          <span className='flex items-center gap-6px min-w-0'>
            <span>{acpButtonLabel}</span>
          </span>
        </Button>
      </Tooltip>
    );
  }

  // Fallback: no model switching
  return (
    <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
      <Button
        className={'sendbox-model-btn guid-config-btn'}
        shape='round'
        size='small'
        style={{ cursor: 'default' }}
        data-testid='guid-model-selector'
      >
        <span className='flex items-center gap-6px min-w-0'>
          <span>{defaultModelLabel}</span>
        </span>
      </Button>
    </Tooltip>
  );
};

export default GuidModelSelector;
