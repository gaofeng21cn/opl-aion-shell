/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { iconColors } from '@/renderer/styles/colors';
import {
  getOplCodexModelDisplayOptions,
  getOplDefaultCodexReasoningEffort,
  isOplCodexCliFixedExecutor,
  shouldShowOplCodexModelAutoOption,
  shouldShowOplCodexModelList,
  type OplCodexReasoningEffort,
} from '@/common/config/oplProductProfile';
import {
  buildOplCodexAutoModelOption,
  formatOplCodexCompactModelLabel,
  formatOplCodexModelDisplay,
  formatOplCodexReasoningMenuLabel,
  type OplModelDisplayLocale,
} from '@/renderer/utils/model/oplCodexModelDisplay';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { Brain, Check, Down } from '@icon-park/react';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import MarqueePillLabel from './MarqueePillLabel';

const configErrorMessageKey = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes('command_ack')) return 'agent.config.commandAck';
    if (error.message.includes('confirmation_timeout')) return 'agent.config.timeout';
    if (error.message.includes('config_update_in_progress')) return 'agent.config.busy';
  }
  return 'agent.config.failed';
};

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

  const renderLogo = () => <Brain theme='outline' size='14' fill={iconColors.secondary} className='shrink-0' />;
  const shouldShowReasoningOptions = backend === 'codex' && thoughtLevel && thoughtLevel.options.length > 0;
  const reasoningMenuTitle = localeKey === 'en-US' ? t('agent.thoughtLevel.label', { defaultValue: 'Reasoning' }) : '推理';
  const reasoningMenuItems =
    shouldShowReasoningOptions && thoughtLevel
      ? [
          <Menu.Item key='__reasoning_header' disabled className='pointer-events-none'>
            <span className='text-12px text-t-secondary'>{reasoningMenuTitle}</span>
          </Menu.Item>,
          ...thoughtLevel.options.map((option) => {
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
          }),
        ]
      : null;

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
            <Menu.Item key='__auto' className='bg-2! pointer-events-none'>
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
          <Menu.SubMenu
            key='__models'
            title={<span className='text-12px text-t-secondary'>{t('common.model', { defaultValue: 'Model' })}</span>}
          >
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
