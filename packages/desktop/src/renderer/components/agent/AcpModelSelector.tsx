/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useAcpModelInfo, type UseAcpModelInfoResult } from '@/renderer/hooks/agent/useAcpModelInfo';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import { getModelDisplayLabel } from '@/renderer/utils/model/agentLogo';
import { OplIcon } from '@/renderer/components/opl/OplVisualProvider';
import OplCodexSessionMenu, { type OplCodexSessionMenuChoice } from './OplCodexSessionMenu';
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
import React, { useCallback, useRef, useState } from 'react';
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
  /** Optional direct Codex App Server controller for canonical threads. */
  modelInfoController?: UseAcpModelInfoResult;
}> = ({ conversation_id, backend, initialModelId, waitForWarmup = false, modelInfoController }) => {
  const { t, i18n } = useTranslation();
  const layout = useLayoutContext();
  const isMobileHeaderCompact = Boolean(layout?.isMobile);
  const prepareRuntime = useCallback(() => warmupConversation(conversation_id), [conversation_id]);
  const acpModelInfo = useAcpModelInfo({
    conversation_id,
    backend,
    initialModelId,
    prepareRuntime: waitForWarmup ? prepareRuntime : undefined,
    enabled: !modelInfoController,
    onSelectModelSuccess: () => Message.success(t('agent.model.switchSuccess')),
    onSelectModelFailed: () => Message.error(t('agent.model.switchFailed')),
  });
  const {
    model_info,
    canSwitch,
    isAutoModelSelection,
    selectModel,
    selectAutoModel,
    selectReasoningEffort,
    thoughtLevel,
    setStatus,
  } = modelInfoController ?? acpModelInfo;
  const hideCodexModelList = backend === 'codex' && isOplCodexCliFixedExecutor() && !shouldShowOplCodexModelList();
  const useOplCodexModelDisplay = backend === 'codex' && isOplCodexCliFixedExecutor();
  const showCodexAutoOption =
    backend === 'codex' && isOplCodexCliFixedExecutor() && shouldShowOplCodexModelAutoOption();
  const localeKey: OplModelDisplayLocale = i18n.language?.startsWith('en') ? 'en-US' : 'zh-CN';
  const defaultCodexReasoningEffort = getOplDefaultCodexReasoningEffort();
  const oplReasoningEfforts = getOplCodexModelDisplayOptions().user_reasoning_effort_options;
  const runtimeReasoningEffort = thoughtLevel?.currentValue as OplCodexReasoningEffort | null | undefined;
  const currentCodexReasoningEffort =
    runtimeReasoningEffort && oplReasoningEfforts.includes(runtimeReasoningEffort)
      ? runtimeReasoningEffort
      : defaultCodexReasoningEffort;
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
      ? `${formatOplCodexCompactModelLabel(oplCurrentModelDisplay.modelLabel)} ${formatOplCodexReasoningMenuLabel(
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
    showCodexAutoOption && model_info?.available_models.length
      ? buildOplCodexAutoModelOption({
          modelInfo: model_info,
          localeKey,
        })
      : null;
  const isSettingReasoning = setStatus.state === 'setting' && setStatus.optionId === thoughtLevel?.id;
  const isSettingConfig = setStatus.state === 'setting';
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const sessionMenuKeyboardOpenRef = useRef(false);
  const sessionMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSessionMenu = useCallback(() => {
    setSessionMenuOpen(false);
    sessionMenuKeyboardOpenRef.current = false;
    requestAnimationFrame(() => sessionMenuTriggerRef.current?.focus({ preventScroll: true }));
  }, []);
  const handleSessionMenuTriggerKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['Enter', ' ', 'ArrowDown'].includes(event.key)) return;
    sessionMenuKeyboardOpenRef.current = true;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSessionMenuOpen(true);
    }
  }, []);
  const handleReasoningSelect = useCallback(
    (value: string) => {
      if (!thoughtLevel || value === thoughtLevel.currentValue || isSettingReasoning) return;
      void selectReasoningEffort(value)
        .then(() => Message.success(t('agent.thoughtLevel.switchSuccess')))
        .catch((error) => Message.error(t(configErrorMessageKey(error))));
    },
    [isSettingReasoning, selectReasoningEffort, thoughtLevel, t]
  );
  const handleAutoSelect = useCallback(() => {
    if (!model_info || isSettingConfig) return;
    void selectAutoModel().catch(() => {});
  }, [isSettingConfig, model_info, selectAutoModel]);
  const reasoningOptions =
    useOplCodexModelDisplay && thoughtLevel
      ? thoughtLevel.options.filter((option) => oplReasoningEfforts.includes(option.value as OplCodexReasoningEffort))
      : (thoughtLevel?.options ?? []);
  const shouldShowReasoningOptions = backend === 'codex' && reasoningOptions.length > 0;
  const reasoningMenuItems =
    shouldShowReasoningOptions && thoughtLevel
      ? reasoningOptions.map((option) => {
          const selected = option.value === currentCodexReasoningEffort;
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
                {selected && <OplIcon name='checkSmall' size={14} className='shrink-0 text-t-secondary' />}
              </div>
            </Menu.Item>
          );
        })
      : null;
  const modelSubmenuTitle =
    oplCurrentModelDisplay?.modelLabel || rawDisplayLabel || t('common.model', { defaultValue: 'Model' });
  const codexModelChoices: OplCodexSessionMenuChoice[] = useOplCodexModelDisplay
    ? [
        ...(showCodexAutoOption
          ? [
              {
                id: '__auto',
                label:
                  autoModelDisplay?.label ??
                  t('conversation.welcome.autoModel', { model: rawDisplayLabel || display_label }),
                description: autoModelDisplay?.description,
                selected: isAutoModelSelection,
                disabled: isSettingConfig,
                onSelect: handleAutoSelect,
              },
            ]
          : []),
        ...(model_info?.available_models ?? []).map((model) => {
          const modelDisplay = formatOplCodexModelDisplay({
            id: model.id,
            label: model.label,
            reasoningEffort: currentCodexReasoningEffort,
            localeKey,
          });
          return {
            id: model.id,
            label: modelDisplay.modelLabel,
            description: modelDisplay.description,
            selected: !isAutoModelSelection && model.id === model_info?.current_model_id,
            disabled: isSettingConfig,
            onSelect: () => selectModel(model.id),
          };
        }),
      ]
    : [];
  const codexReasoningChoices: OplCodexSessionMenuChoice[] = shouldShowReasoningOptions
    ? reasoningOptions.map((option) => ({
        id: option.value,
        label: formatOplCodexReasoningMenuLabel(option.value, localeKey),
        description: option.description,
        selected: option.value === currentCodexReasoningEffort,
        disabled: isSettingConfig,
        onSelect: () => handleReasoningSelect(option.value),
      }))
    : [];

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
            <MarqueePillLabel>{display_label}</MarqueePillLabel>
          </span>
        </Button>
      </Tooltip>
    );
  }

  return (
    <Dropdown
      trigger='click'
      popupVisible={sessionMenuOpen}
      onVisibleChange={(visible) => {
        if (visible) setSessionMenuOpen(true);
        else closeSessionMenu();
      }}
      // Mobile: portal the popup to <body> so it escapes the titlebar slot.
      // Desktop: leave default container so click events reach Menu.Item normally.
      {...(isMobileHeaderCompact ? { getPopupContainer: () => document.body } : {})}
      droplist={
        useOplCodexModelDisplay ? (
          <OplCodexSessionMenu
            autoFocusOnMount={sessionMenuKeyboardOpenRef.current}
            modelValue={modelSubmenuTitle}
            modelChoices={codexModelChoices}
            reasoningValue={formatOplCodexReasoningMenuLabel(currentCodexReasoningEffort, localeKey)}
            reasoningChoices={codexReasoningChoices}
            reasoningDisabled={!thoughtLevel}
            onReset={handleAutoSelect}
            onRequestClose={closeSessionMenu}
            resetDisabled={isSettingConfig}
          />
        ) : (
          <Menu
            mode='pop'
            selectedKeys={model_info.current_model_id ? [model_info.current_model_id] : []}
            style={{ minWidth: 220 }}
          >
            {reasoningMenuItems}
            <Menu.SubMenu
              key='__models'
              title={<span className='text-12px text-t-secondary'>{modelSubmenuTitle}</span>}
            >
              {model_info.available_models.map((model) => (
                <Menu.Item
                  key={model.id}
                  className={model.id === model_info.current_model_id ? 'bg-2!' : ''}
                  onClick={() => selectModel(model.id)}
                >
                  <div className='flex items-center justify-between gap-16px w-full'>
                    <span>{model.label || model.id}</span>
                    {model.id === model_info.current_model_id && (
                      <OplIcon name='checkSmall' size={14} className='shrink-0 text-t-secondary' />
                    )}
                  </div>
                </Menu.Item>
              ))}
            </Menu.SubMenu>
          </Menu>
        )
      }
    >
      <Button
        ref={sessionMenuTriggerRef}
        className='sendbox-model-btn header-model-btn agent-mode-compact-pill'
        shape='round'
        size='small'
        aria-haspopup='menu'
        aria-expanded={sessionMenuOpen}
        onPointerDown={() => {
          sessionMenuKeyboardOpenRef.current = false;
        }}
        onKeyDown={handleSessionMenuTriggerKeyDown}
      >
        <span className='flex items-center gap-6px min-w-0 leading-none'>
          <MarqueePillLabel>{display_label}</MarqueePillLabel>
          <OplIcon name='chevronDown' size={12} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default AcpModelSelector;
