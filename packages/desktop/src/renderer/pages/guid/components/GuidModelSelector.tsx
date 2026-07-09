/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  getOplFlowContextPolicy,
  isOplCodexCliFixedExecutor,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import { configService } from '@/common/config/configService';
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
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Check, Down, Plus } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { useConfig } from '@/renderer/hooks/config/useConfig';

const OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE = getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement;

function oplRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readIntelligenceEnhancementEnabled(value: unknown): boolean | null {
  const parsed = oplRecord(value);
  const execution = oplRecord(parsed.app_action_execution);
  const result = oplRecord(execution.result);
  const directStatus = oplRecord(result.opl_flow_intelligence_enhancement);
  const actionStatus = oplRecord(oplRecord(result.opl_flow_intelligence_enhancement_action).status_readback);
  const enabled = typeof directStatus.enabled === 'boolean' ? directStatus.enabled : actionStatus.enabled;
  return typeof enabled === 'boolean' ? enabled : null;
}

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
  selectedReasoningEffort?: OplCodexReasoningEffort | null;
  setSelectedReasoningEffort?: React.Dispatch<React.SetStateAction<OplCodexReasoningEffort | null>>;
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
  backend,
}) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [intelligenceEnhancementMode, setIntelligenceEnhancementMode] = useConfig(
    'codex.oplFlowIntelligenceEnhancementMode'
  );
  const [isSettingIntelligenceEnhancementMode, setIsSettingIntelligenceEnhancementMode] = React.useState(false);
  const modelSettingsRoute = resolveLegacySettingsRoute('model');
  const defaultModelLabel = t('common.defaultModel');
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const localeKey: OplModelDisplayLocale = i18n.language?.startsWith('en') ? 'en-US' : 'zh-CN';
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const effectiveReasoningEffort = selectedReasoningEffort ?? defaultCodexReasoningEffort;
  const codexDisplayOptions = getOplCodexModelDisplayOptions();
  const codexAutoLabel =
    localeKey === 'en-US' ? codexDisplayOptions.auto_option.label_en : codexDisplayOptions.auto_option.label_zh;
  const intelligenceEnhancementTitle = t(
    OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE?.label_key ?? 'settings.oplFlowIntelligenceEnhancementMode',
    {
      defaultValue: localeKey === 'en-US' ? 'Intelligence enhancement mode' : '智力增强模式',
    }
  )
    .replace(/\s+mode$/i, '')
    .replace(/模式$/, '');
  const intelligenceEnhancementOnLabel =
    localeKey === 'en-US'
      ? t('settings.capabilitiesPage.packageManager.actions.enable', { defaultValue: 'Enable' })
      : t('settings.capabilitiesPage.packageManager.actions.enable', { defaultValue: '启用' }).replace(
          /^启用$/,
          '开启'
        );
  const intelligenceEnhancementOffLabel =
    localeKey === 'en-US'
      ? t('settings.capabilitiesPage.packageManager.actions.disable', { defaultValue: 'Disable' })
      : t('common.close', { defaultValue: '关闭' });
  const intelligenceEnhancementEnabled = intelligenceEnhancementMode ?? true;
  const restoreCodexAutoSelection = () => {
    setSelectedAcpModel(null);
    setSelectedReasoningEffort?.(null);
  };
  const handleIntelligenceEnhancementSelect = React.useCallback(
    async (enabled: boolean) => {
      const mode = OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE;
      if (!mode || enabled === intelligenceEnhancementEnabled || isSettingIntelligenceEnhancementMode) return;
      const previous = intelligenceEnhancementEnabled;
      setIsSettingIntelligenceEnhancementMode(true);
      try {
        const result = await ipcBridge.oplRuntime.executeAction.invoke({
          actionId: enabled ? mode.enable_action_id : mode.disable_action_id,
          dryRun: false,
        });
        if (result.ok === false) {
          throw new Error(result.error?.message || 'OPL Flow intelligence enhancement action failed');
        }
        const readbackEnabled = readIntelligenceEnhancementEnabled(result.parsed) ?? enabled;
        await setIntelligenceEnhancementMode(readbackEnabled);
      } catch (error) {
        configService.setLocal(mode.settings_key, previous);
        Message.error(error instanceof Error ? error.message : String(error));
      } finally {
        setIsSettingIntelligenceEnhancementMode(false);
      }
    },
    [intelligenceEnhancementEnabled, isSettingIntelligenceEnhancementMode, setIntelligenceEnhancementMode]
  );

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
        return `${codexAutoLabel} · ${formatOplCodexCompactModelLabel(
          currentDisplay.modelLabel
        )} ${formatOplCodexReasoningMenuLabel(effectiveReasoningEffort, localeKey)}`;
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
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
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
        currentModelId: currentAcpCachedModelInfo.current_model_id,
        currentModelLabel: currentAcpCachedModelInfo.current_model_label,
        reasoningEffort: effectiveReasoningEffort,
        localeKey,
      });
      const effectiveModelId = selectedAcpModel ?? currentAcpCachedModelInfo.current_model_id;
      const effectiveModel = currentAcpCachedModelInfo.available_models.find((model) => model.id === effectiveModelId);
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
                  onClick={() => setSelectedReasoningEffort(effort === defaultCodexReasoningEffort ? null : effort)}
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
                      onClick={() => setSelectedAcpModel(model.id)}
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
              {useOplCodexModelDisplay && OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE && (
                <Menu.SubMenu
                  key='__intelligence_enhancement'
                  title={<span className='text-12px text-t-secondary'>{intelligenceEnhancementTitle}</span>}
                >
                  <Menu.Item
                    key='intelligence_enhancement:on'
                    className={intelligenceEnhancementEnabled ? '!bg-2' : ''}
                    disabled={isSettingIntelligenceEnhancementMode}
                    onClick={() => handleIntelligenceEnhancementSelect(true)}
                  >
                    <div className='flex items-center justify-between gap-16px w-full'>
                      <span>{intelligenceEnhancementOnLabel}</span>
                      {intelligenceEnhancementEnabled && (
                        <Check theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
                      )}
                    </div>
                  </Menu.Item>
                  <Menu.Item
                    key='intelligence_enhancement:off'
                    className={!intelligenceEnhancementEnabled ? '!bg-2' : ''}
                    disabled={isSettingIntelligenceEnhancementMode}
                    onClick={() => handleIntelligenceEnhancementSelect(false)}
                  >
                    <div className='flex items-center justify-between gap-16px w-full'>
                      <span>{intelligenceEnhancementOffLabel}</span>
                      {!intelligenceEnhancementEnabled && (
                        <Check theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
                      )}
                    </div>
                  </Menu.Item>
                </Menu.SubMenu>
              )}
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
              <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
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
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
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
            <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
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
          <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />
          <span>{defaultModelLabel}</span>
        </span>
      </Button>
    </Tooltip>
  );
};

export default GuidModelSelector;
