/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { ipcBridge } from '@/common';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  getOplFlowContextPolicy,
  isOplCodexCliFixedExecutor,
  shouldShowOplCodexModelAutoOption,
  shouldShowOplCodexModelList,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import { configService } from '@/common/config/configService';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexCompactModelLabel,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Check, Down } from '@icon-park/react';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

const OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE = getOplFlowContextPolicy().optional_user_modes?.intelligence_enhancement;

const configErrorMessageKey = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'agent.config.commandAck';
    if (error.message.includes('confirmation_timeout')) return 'agent.config.timeout';
    if (error.message.includes('config_update_in_progress')) return 'agent.config.busy';
  }
  return 'agent.config.failed';
};

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

/**
 * Model selector for ACP-based agents. Renders three states:
 * - null model info: disabled "Use CLI model" button (backward compatible)
 * - no available_models: read-only display of current model name
 * - has available_models: clickable dropdown selector
 *
 * Data fetching/syncing lives in `useAcpModelInfo` so the mobile action
 * sheet can read from the same source.
 */
const AcpModelSelector: React.FC<{
  conversation_id: string;
  /** ACP backend name for loading cached models (e.g., 'claude', 'qwen') */
  backend?: string;
  /** Pre-selected model ID from Guid page */
  initialModelId?: string;
  /** Wait for ACP warmup before reading runtime model info. */
  waitForWarmup?: boolean;
}> = ({ conversation_id, backend, initialModelId, waitForWarmup = false }) => {
  const { t, i18n } = useTranslation();
  const [intelligenceEnhancementMode, setIntelligenceEnhancementMode] = useConfig(
    'codex.oplFlowIntelligenceEnhancementMode'
  );
  const [isSettingIntelligenceEnhancementMode, setIsSettingIntelligenceEnhancementMode] = useState(false);
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const prepareRuntime = useCallback(() => warmupConversation(conversation_id), [conversation_id]);
  const { model_info, canSwitch, selectModel, thoughtLevel, setStatus, setConfigOption } = useAcpModelInfo({
    conversation_id,
    backend,
    initialModelId,
    prepareRuntime: waitForWarmup ? prepareRuntime : undefined,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });
  const hideCodexModelList = backend === 'codex' && isOplCodexCliFixedExecutor() && !shouldShowOplCodexModelList();
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const showCodexAutoOption =
    backend === 'codex' && isOplCodexCliFixedExecutor() && shouldShowOplCodexModelAutoOption();
  const localeKey: OplModelDisplayLocale = i18n.language?.startsWith('en') ? 'en-US' : 'zh-CN';
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const currentCodexReasoningEffort =
    (thoughtLevel?.currentValue as OplCodexReasoningEffort | null | undefined) ?? defaultCodexReasoningEffort;
  const codexAutoLabel =
    localeKey === 'en-US'
      ? getOplCodexModelDisplayOptions().auto_option.label_en
      : getOplCodexModelDisplayOptions().auto_option.label_zh;
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

  const defaultModelLabel = t('common.defaultModel');
  const rawDisplayLabel =
    (model_info?.current_model_id &&
      model_info.available_models.find((m) => m.id === model_info.current_model_id)?.label) ||
    model_info?.current_model_label ||
    model_info?.current_model_id ||
    '';
  const selectedModelValue = model_info?.current_model_id;
  const oplCurrentModelDisplay =
    useOplCodexModelDisplay && selectedModelValue
      ? formatOplCodexModelDisplay({
          id: selectedModelValue,
          label: rawDisplayLabel,
          reasoningEffort: currentCodexReasoningEffort,
          localeKey,
        })
      : null;
  const selectedModelLabel =
    useOplCodexModelDisplay && oplCurrentModelDisplay
      ? showCodexAutoOption
        ? `${codexAutoLabel} · ${formatOplCodexCompactModelLabel(oplCurrentModelDisplay.modelLabel)} ${formatOplCodexReasoningMenuLabel(
            currentCodexReasoningEffort,
            localeKey
          )}`
        : `${formatOplCodexCompactModelLabel(oplCurrentModelDisplay.modelLabel)} ${formatOplCodexReasoningMenuLabel(
            currentCodexReasoningEffort,
            localeKey
          )}`
      : hideCodexModelList && rawDisplayLabel
        ? t('conversation.welcome.autoModel', { model: rawDisplayLabel })
        : rawDisplayLabel;
  const display_label = getModelDisplayLabel({
    selected_value: selectedModelValue,
    selectedLabel: selectedModelLabel,
    defaultModelLabel,
    fallbackLabel: t('conversation.welcome.useCliModel'),
  });
  const tooltipContent = display_label;
  const autoModelDisplay =
    showCodexAutoOption && selectedModelValue
      ? buildOplCodexAutoModelOption({
          currentModelId: selectedModelValue,
          currentModelLabel: rawDisplayLabel,
          reasoningEffort: currentCodexReasoningEffort,
          localeKey,
        })
      : null;
  const isSettingReasoning = setStatus.state === 'setting' && setStatus.optionId === thoughtLevel?.id;
  const handleReasoningSelect = useCallback(
    (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isSettingReasoning) return;
      void setConfigOption(thoughtLevel.id, value)
        .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
        .catch((error) => Message.error(t(configErrorMessageKey(error))));
    },
    [isSettingReasoning, setConfigOption, thoughtLevel, t]
  );
  const handleAutoSelect = useCallback(() => {
    if (!model_info || isSettingReasoning) return;
    const defaultModelId =
      getOplCodexModelDisplayOptions().auto_option.resolved_model || model_info.available_models[0]?.id;
    const tasks: Array<Promise<unknown>> = [];
    if (defaultModelId && defaultModelId !== model_info.current_model_id) {
      selectModel(defaultModelId);
    }
    if (thoughtLevel && thoughtLevel.currentValue !== defaultCodexReasoningEffort) {
      tasks.push(setConfigOption(thoughtLevel.id, defaultCodexReasoningEffort));
    }
    if (tasks.length) {
      void Promise.all(tasks)
        .then(() => Message.success(t('agent.model.switchSuccess')))
        .catch((error) => Message.error(t(configErrorMessageKey(error))));
    }
  }, [defaultCodexReasoningEffort, isSettingReasoning, model_info, selectModel, setConfigOption, thoughtLevel, t]);
  const handleIntelligenceEnhancementSelect = useCallback(
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
        Message.error(t(configErrorMessageKey(error)));
      } finally {
        setIsSettingIntelligenceEnhancementMode(false);
      }
    },
    [intelligenceEnhancementEnabled, isSettingIntelligenceEnhancementMode, setIntelligenceEnhancementMode, t]
  );
  const refreshIntelligenceEnhancementStatus = useCallback(async () => {
    const mode = OPL_FLOW_INTELLIGENCE_ENHANCEMENT_MODE;
    if (!mode || !useOplCodexModelDisplay) return;
    try {
      const result = await ipcBridge.oplRuntime.executeAction.invoke({
        actionId: mode.status_action_id,
        dryRun: false,
      });
      if (result.ok === false) return;
      const enabled = readIntelligenceEnhancementEnabled(result.parsed);
      if (enabled === null) return;
      configService.setLocal(mode.settings_key, enabled);
    } catch {
      // The menu can still use the cached preference when runtime status is unavailable.
    }
  }, [useOplCodexModelDisplay]);

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;
  const shouldShowReasoningOptions = backend === 'codex' && thoughtLevel && thoughtLevel.options.length > 0;
  const reasoningMenuItems =
    shouldShowReasoningOptions && thoughtLevel
      ? thoughtLevel.options.map((option) => {
          const selected = option.value === thoughtLevel.currentValue;
          const label = formatOplCodexReasoningMenuLabel(option.value, localeKey);
          return (
            <Menu.Item
              key={`reasoning:${option.value}`}
              className={selected ? 'bg-2!' : ''}
              disabled={isSettingReasoning}
              onClick={() => handleReasoningSelect(option.value)}
            >
              <div className='flex items-center justify-between gap-16px w-full'>
                <div className='flex flex-col gap-2px'>
                  <span>{label}</span>
                  {option.description && <span className='text-12px text-t-secondary'>{option.description}</span>}
                </div>
                {selected && <Check theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />}
              </div>
            </Menu.Item>
          );
        })
      : null;
  const modelSubmenuTitle =
    oplCurrentModelDisplay?.modelLabel || rawDisplayLabel || t('common.model', { defaultValue: 'Model' });

  if (!model_info) {
    return (
      <Tooltip content={t('conversation.welcome.modelSwitchNotSupported')} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {renderLogo()}
            <MarqueePillLabel>{t('conversation.welcome.useCliModel')}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  if (!canSwitch) {
    return (
      <Tooltip content={tooltipContent} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {renderLogo()}
            <MarqueePillLabel>{display_label}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  if (hideCodexModelList) {
    return (
      <Tooltip content={tooltipContent} position='top'>
        <Button
          className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
          shape='round'
          size='small'
          style={{ cursor: 'default' }}
        >
          <span className='flex items-center gap-6px min-w-0 leading-none'>
            {renderLogo()}
            <MarqueePillLabel>{display_label}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      onVisibleChange={(visible) => {
        if (visible) void refreshIntelligenceEnhancementStatus();
      }}
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        <Menu
          mode='pop'
          selectedKeys={model_info.current_model_id ? [model_info.current_model_id] : []}
          style={{ minWidth: 220 }}
        >
          {showCodexAutoOption && (
            <Menu.Item key='__auto' className='bg-2!' disabled={isSettingReasoning} onClick={handleAutoSelect}>
              <div className='flex flex-col gap-2px w-full'>
                <span className='font-medium'>
                  {autoModelDisplay?.label ??
                    t('conversation.welcome.autoModel', { model: rawDisplayLabel || display_label })}
                </span>
                {autoModelDisplay?.description && (
                  <span className='text-12px text-t-secondary'>{autoModelDisplay.description}</span>
                )}
              </div>
            </Menu.Item>
          )}
          {reasoningMenuItems}
          <Menu.SubMenu key='__models' title={<span className='text-12px text-t-secondary'>{modelSubmenuTitle}</span>}>
            {model_info.available_models.map((model) => {
              const modelDisplay = useOplCodexModelDisplay
                ? formatOplCodexModelDisplay({
                    id: model.id,
                    label: model.label,
                    reasoningEffort: currentCodexReasoningEffort,
                    localeKey,
                  })
                : null;
              return (
                <Menu.Item
                  key={model.id}
                  className={model.id === model_info.current_model_id ? 'bg-2!' : ''}
                  onClick={() => selectModel(model.id)}
                >
                  <div className='flex items-center justify-between gap-16px w-full'>
                    <div className='flex flex-col gap-2px'>
                      <span>{modelDisplay?.modelLabel ?? (model.label || model.id)}</span>
                      {modelDisplay?.description && (
                        <span className='text-12px text-t-secondary'>{modelDisplay.description}</span>
                      )}
                    </div>
                    {model.id === model_info.current_model_id && (
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
                className={intelligenceEnhancementEnabled ? 'bg-2!' : ''}
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
                className={!intelligenceEnhancementEnabled ? 'bg-2!' : ''}
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
      <Button className='sendbox-model-btn header-model-btn agent-mode-compact-pill' shape='round' size='small'>
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          {renderLogo()}
          <MarqueePillLabel>{display_label}</MarqueePillLabel>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
