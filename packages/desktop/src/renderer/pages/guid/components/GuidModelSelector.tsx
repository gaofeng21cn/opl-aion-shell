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
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import OplCodexSessionMenu, { type OplCodexSessionMenuChoice } from '@/renderer/components/agent/OplCodexSessionMenu';
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
  const [sessionMenuOpen, setSessionMenuOpen] = React.useState(false);
  const sessionMenuKeyboardOpenRef = React.useRef(false);
  const sessionMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const closeSessionMenu = React.useCallback(() => {
    setSessionMenuOpen(false);
    sessionMenuKeyboardOpenRef.current = false;
    requestAnimationFrame(() => sessionMenuTriggerRef.current?.focus({ preventScroll: true }));
  }, []);
  const handleSessionMenuTriggerKeyDown = React.useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
    sessionMenuKeyboardOpenRef.current = true;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSessionMenuOpen(true);
    }
  }, []);
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
                    <OplIcon name='plus' size={12} />
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
                    <OplIcon name='plus' size={12} />
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
            <OplIcon name='chevronDown' size={16} className='shrink-0' />
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
      const selectReasoningEffort = (effort: string) => {
        if (!setSelectedReasoningEffort) return;
        if (effectiveModelId && setCodexModelSelection) {
          setCodexModelSelection(effectiveModelId, effort);
          return;
        }
        if (effectiveModelId && selectedAcpModel === null) setSelectedAcpModel(effectiveModelId);
        setSelectedReasoningEffort(effort);
      };
      const codexReasoningChoices: OplCodexSessionMenuChoice[] =
        useOplCodexModelDisplay && setSelectedReasoningEffort
          ? codexDisplayOptions.user_reasoning_effort_options.map((effort) => ({
              id: effort,
              label: formatOplCodexReasoningMenuLabel(effort, localeKey),
              selected: effectiveReasoningEffort === effort,
              onSelect: () => selectReasoningEffort(effort),
            }))
          : [];
      const codexModelChoices: OplCodexSessionMenuChoice[] = useOplCodexModelDisplay
        ? [
            {
              id: '__auto',
              label: autoModelDisplay.label,
              description: autoModelDisplay.description,
              selected: selectedAcpModel === null,
              onSelect: restoreCodexAutoSelection,
            },
            ...(unavailableFixedModelId
              ? [
                  {
                    id: `unavailable:${unavailableFixedModelId}`,
                    label: unavailableFixedModelId,
                    description: t('conversation.currentTask.unavailable', { defaultValue: 'Unavailable' }),
                    selected: true,
                    disabled: true,
                    onSelect: () => {},
                  },
                ]
              : []),
            ...currentAcpCachedModelInfo.available_models.map((model) => {
              const modelDisplay = formatOplCodexModelDisplay({
                id: model.id,
                label: model.label,
                reasoningEffort: effectiveReasoningEffort,
                localeKey,
              });
              return {
                id: model.id,
                label: modelDisplay.modelLabel,
                description: modelDisplay.description,
                selected: model.id === selectedAcpModel,
                onSelect: () => {
                  if (setCodexModelSelection) {
                    setCodexModelSelection(model.id, effectiveReasoningEffort);
                    return;
                  }
                  setSelectedAcpModel(model.id);
                },
              };
            }),
          ]
        : [];
      return (
        <Dropdown
          trigger='click'
          popupVisible={sessionMenuOpen}
          onVisibleChange={(visible) => {
            if (visible) setSessionMenuOpen(true);
            else closeSessionMenu();
          }}
          droplist={
            useOplCodexModelDisplay ? (
              <OplCodexSessionMenu
                autoFocusOnMount={sessionMenuKeyboardOpenRef.current}
                modelValue={modelSubmenuTitle}
                modelChoices={codexModelChoices}
                reasoningValue={formatOplCodexReasoningMenuLabel(effectiveReasoningEffort, localeKey)}
                reasoningChoices={codexReasoningChoices}
                reasoningDisabled={!setSelectedReasoningEffort}
                onReset={restoreCodexAutoSelection}
                onRequestClose={closeSessionMenu}
              />
            ) : (
              <Menu
                mode='pop'
                selectedKeys={selectedAcpModel ? [selectedAcpModel] : ['__auto']}
                style={{ minWidth: 220 }}
              >
                <Menu.Item key='__auto' onClick={restoreCodexAutoSelection}>
                  {t('conversation.welcome.autoModel', {
                    model: currentAcpCachedModelInfo.current_model_label || currentAcpCachedModelInfo.current_model_id,
                  })}
                </Menu.Item>
                {unavailableFixedModelId && (
                  <Menu.Item key={`unavailable:${unavailableFixedModelId}`} disabled>
                    {unavailableFixedModelId}
                  </Menu.Item>
                )}
                <Menu.SubMenu
                  key='__models'
                  title={<span className='text-12px text-t-secondary'>{modelSubmenuTitle}</span>}
                >
                  {currentAcpCachedModelInfo.available_models.map((model) => {
                    const providerConfig = modelConfig?.find((provider) => provider.platform?.includes(''));
                    const healthStatus = providerConfig?.model_health?.[model.id]?.status || 'unknown';
                    const healthColor =
                      healthStatus === 'healthy'
                        ? 'bg-green-500'
                        : healthStatus === 'unhealthy'
                          ? 'bg-red-500'
                          : 'bg-gray-400';
                    return (
                      <Menu.Item key={model.id} onClick={() => setSelectedAcpModel(model.id)}>
                        <div className='flex items-center justify-between gap-16px w-full'>
                          <div className='flex items-center gap-8px'>
                            {healthStatus !== 'unknown' && (
                              <div className={`w-6px h-6px rounded-full shrink-0 ${healthColor}`} />
                            )}
                            <span>{model.label}</span>
                          </div>
                          {model.id === selectedAcpModel && (
                            <OplIcon name='checkSmall' size={14} className='shrink-0 text-t-secondary' />
                          )}
                        </div>
                      </Menu.Item>
                    );
                  })}
                </Menu.SubMenu>
              </Menu>
            )
          }
        >
          <Button
            ref={sessionMenuTriggerRef}
            className={'sendbox-model-btn guid-config-btn'}
            shape='round'
            size='small'
            data-testid='guid-model-selector'
            aria-haspopup='menu'
            aria-expanded={sessionMenuOpen}
            onPointerDown={() => {
              sessionMenuKeyboardOpenRef.current = false;
            }}
            onKeyDown={handleSessionMenuTriggerKeyDown}
          >
            <span className='flex items-center gap-6px min-w-0'>
              <span>{acpButtonLabel}</span>
              <OplIcon name='chevronDown' size={16} className='shrink-0' />
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
