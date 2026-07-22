/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  canonicalizeOplProfessionalAgentId,
  getOplDefaultExecutorAgentKey,
  getOplProfessionalAgentPackages,
} from '@/common/config/oplProductProfile';
import type { TChatConversation } from '@/common/config/storage';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';
import { resolveAssistantConfigId } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import {
  type ConversationAgent,
  useConversationAgents,
} from '@/renderer/pages/conversation/hooks/useConversationAgents';
import { emitter } from '@/renderer/utils/emitter';
import { Button, Dropdown, Menu, Message, Tooltip } from '@arco-design/web-react';
import { CheckOne, Down } from '@icon-park/react';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate } from 'swr';

export type ConversationRebindOption = {
  assistantId: string;
  label: string;
};

function localizedAssistantName(assistant: Assistant, language: string): string {
  const locale = language.startsWith('zh') ? 'zh-CN' : 'en-US';
  return assistant.name_i18n?.[locale] || assistant.name_i18n?.[language] || assistant.name || assistant.id;
}

/**
 * Resolve real backend assistants admitted by the App-owned owner-selection policy.
 */
export function resolveConversationRebindOptions(
  cliAgents: ConversationAgent[],
  presetAssistants: Assistant[],
  language: string
): ConversationRebindOption[] {
  const options: ConversationRebindOption[] = [];
  const seen = new Set<string>();
  const add = (assistant: Assistant | undefined) => {
    if (!assistant || assistant.enabled === false || seen.has(assistant.id)) return;
    seen.add(assistant.id);
    options.push({ assistantId: assistant.id, label: localizedAssistantName(assistant, language) });
  };

  const defaultExecutor = getOplDefaultExecutorAgentKey();
  add(cliAgents.find((assistant) => assistantRuntimeKey(assistant) === defaultExecutor));

  const catalog: Assistant[] = [...cliAgents, ...presetAssistants];
  for (const agentPackage of getOplProfessionalAgentPackages()) {
    add(catalog.find((assistant) => canonicalizeOplProfessionalAgentId(assistant.id) === agentPackage.package_id));
  }
  return options;
}

function isConversationRebindBusy(conversation: TChatConversation): boolean {
  const runtime = conversation.runtime;
  if (!runtime) return false;
  return (
    runtime.is_processing ||
    runtime.pending_confirmations > 0 ||
    runtime.state === 'starting' ||
    runtime.state === 'running' ||
    runtime.state === 'waiting_confirmation'
  );
}

function isSameAssistant(left: string | null, right: string): boolean {
  if (!left) return false;
  return left === right || canonicalizeOplProfessionalAgentId(left) === canonicalizeOplProfessionalAgentId(right);
}

const ConversationAgentRebindControl: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t, i18n } = useTranslation();
  const { cliAgents, presetAssistants } = useConversationAgents();
  const [pendingAssistantId, setPendingAssistantId] = useState<string | null>(null);
  const options = useMemo(
    () => resolveConversationRebindOptions(cliAgents, presetAssistants, i18n.language),
    [cliAgents, i18n.language, presetAssistants]
  );
  const currentAssistantId = resolveAssistantConfigId(conversation);
  const currentOption = options.find((option) => isSameAssistant(currentAssistantId, option.assistantId));
  const extra = conversation.extra as { agent_name?: string; backend?: string };
  const currentLabel =
    conversation.assistant?.name || currentOption?.label || extra.agent_name || extra.backend || currentAssistantId;
  const busy = isConversationRebindBusy(conversation);
  const disabled = busy || pendingAssistantId !== null || options.length === 0;

  if (!conversation.assistant) return null;

  const selectAssistant = async (assistantId: string): Promise<void> => {
    if (disabled || isSameAssistant(currentAssistantId, assistantId)) return;
    const target = options.find((option) => option.assistantId === assistantId);
    if (!target) return;

    setPendingAssistantId(assistantId);
    try {
      const authoritativeConversation = await ipcBridge.conversation.rebindAssistant.invoke({
        id: conversation.id,
        assistant: { id: assistantId, locale: i18n.language },
      });
      if (authoritativeConversation.id !== conversation.id || authoritativeConversation.assistant?.id !== assistantId) {
        throw new Error('Conversation assistant rebind authoritative readback mismatch');
      }
      await mutate<TChatConversation>(`conversation/${conversation.id}`, authoritativeConversation, false);
      emitter.emit('chat.history.refresh');
      Message.success(t('conversation.chat.switchedToAgent', { agent: target.label }));
    } catch (error) {
      console.error('Conversation assistant rebind failed:', error);
      Message.error(t('conversation.chat.switchAgentFailed'));
    } finally {
      setPendingAssistantId(null);
    }
  };

  if (!currentLabel) return null;

  const menu = (
    <Menu
      selectedKeys={currentOption ? [currentOption.assistantId] : currentAssistantId ? [currentAssistantId] : []}
      onClickMenuItem={(key) => void selectAssistant(String(key))}
    >
      {options.map((option) => {
        const isCurrent = isSameAssistant(currentAssistantId, option.assistantId);
        return (
          <Menu.Item key={option.assistantId} disabled={disabled || isCurrent}>
            <div className='flex min-w-140px items-center justify-between gap-12px'>
              <span>@{option.label}</span>
              {isCurrent ? <CheckOne theme='outline' size={14} fill='currentColor' aria-hidden='true' /> : null}
            </div>
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Tooltip content={t('conversation.chat.tryAnotherAgent')} mini>
      <Dropdown trigger='click' position='bl' droplist={menu} disabled={disabled}>
        <Button
          type='text'
          size='mini'
          loading={pendingAssistantId !== null}
          disabled={busy || options.length === 0}
          aria-label={t('conversation.chat.tryAnotherAgent')}
          data-testid='conversation-agent-owner-selector'
        >
          <span className='flex min-w-0 items-center gap-4px'>
            <span className='max-w-160px truncate'>@{currentLabel}</span>
            <Down theme='outline' size={12} fill='currentColor' aria-hidden='true' />
          </span>
        </Button>
      </Dropdown>
    </Tooltip>
  );
};

export default ConversationAgentRebindControl;
