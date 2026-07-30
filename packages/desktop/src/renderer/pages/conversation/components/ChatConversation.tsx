/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationMcpStatus, IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { usePresetAssistantInfo, resolveAssistantConfigId } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Message, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../../utils/emitter';
import AcpChat from '../platforms/acp/AcpChat';
import ChatLayout from './ChatLayout';
import ChatSlider from './ChatSlider.tsx';
import ConversationEnvironmentPopover from './ChatLayout/ConversationEnvironmentPopover';
import { saveAionrsDefaultModel } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { getConversationCreateErrorMessage } from '@/renderer/pages/conversation/utils/conversationCreateError';
import AionrsChat from '../platforms/aionrs/AionrsChat';
import { useAionrsModelSelection } from '../platforms/aionrs/useAionrsModelSelection';
import LegacyReadOnlyConversation from '../platforms/legacy/LegacyReadOnlyConversation';
import { useConversationRuntimeView } from '../runtime/useConversationRuntimeView';
import CurrentTaskAwareness, { hasCurrentTaskAwareness } from '../runtime/CurrentTaskAwareness';
import { isLegacyReadOnlyConversationType } from '../utils/conversationRuntime';
import { sanitizeOplOrdinaryConversationExtra } from '@/common/config/oplProductProfile';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

const getConversationBranch = (conversation: TChatConversation | undefined): string | undefined => {
  const extra = conversation?.extra as Record<string, unknown> | undefined;
  const branch = extra?.git_branch ?? extra?.branch_name ?? extra?.branch;
  return typeof branch === 'string' && branch.trim() ? branch.trim() : undefined;
};

const _AssociatedConversation: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const { data } = useSWR(['getAssociateConversation', conversation_id], () =>
    ipcBridge.conversation.getAssociateConversation.invoke({ conversation_id })
  );
  const navigate = useNavigate();
  const list = useMemo(() => {
    if (!data?.length) return [];
    return data.filter((conversation) => conversation.id !== conversation_id);
  }, [data]);
  if (!list.length) return null;
  return (
    <Dropdown
      droplist={
        <Menu
          onClickMenuItem={(key) => {
            Promise.resolve(navigate(`/conversation/${key}`)).catch((error) => {
              console.error('Navigation failed:', error);
            });
          }}
        >
          {list.map((conversation) => {
            return (
              <Menu.Item key={conversation.id}>
                <Typography.Ellipsis className={'max-w-300px'}>{conversation.name}</Typography.Ellipsis>
              </Menu.Item>
            );
          })}
        </Menu>
      }
      trigger={['click']}
    >
      <Button
        size='mini'
        aria-label={t('conversation.history.title')}
        icon={
          <History
            theme='filled'
            size='14'
            fill={iconColors.primary}
            strokeWidth={2}
            strokeLinejoin='miter'
            strokeLinecap='square'
          />
        }
      ></Button>
    </Dropdown>
  );
};

export const _AddNewConversation: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isCreatingRef = useRef(false);
  if (!conversation.extra?.workspace) return null;
  return (
    <Tooltip content={t('conversation.workspace.createNewConversation')}>
      <Button
        size='mini'
        aria-label={t('conversation.workspace.createNewConversation')}
        icon={<img src={addChatIcon} alt='' aria-hidden='true' className='w-14px h-14px block m-auto' />}
        onClick={async () => {
          if (isCreatingRef.current) return;
          isCreatingRef.current = true;
          try {
            // Fetch latest conversation from DB to ensure session_mode is current
            const latest = await getConversationOrNull(conversation.id);
            const source = latest || conversation;
            const sourceExtra: Record<string, unknown> | undefined =
              source.type === 'acp'
                ? {
                    ...(source.extra as Record<string, unknown> | undefined),
                    acp_session_id: undefined,
                    acp_session_updated_at: undefined,
                  }
                : (source.extra as Record<string, unknown> | undefined);
            const createdConversation = await ipcBridge.conversation.createWithConversation.invoke({
              conversation: {
                ...source,
                created_at: Date.now(),
                modified_at: Date.now(),
                // Clear runtime session fields so ordinary OPL conversations do not inherit Team MCP state.
                extra: sanitizeOplOrdinaryConversationExtra(sourceExtra),
              } as TChatConversation,
            });
            void navigate(`/conversation/${createdConversation.id}`);
            emitter.emit('chat.history.refresh');
          } catch (error) {
            console.error('Failed to create conversation:', error);
            Message.error(getConversationCreateErrorMessage(error, t));
          } finally {
            isCreatingRef.current = false;
          }
        }}
      />
    </Tooltip>
  );
};

type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

const AionrsConversationPanel: React.FC<{ conversation: AionrsConversation; sliderTitle: React.ReactNode }> = ({
  conversation,
  sliderTitle,
}) => {
  const runtimeView = useConversationRuntimeView(conversation.id);
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      // Kill running agent on model switch — will be rebuilt with new model on next message
      if (runtimeView.activeTurnId) {
        const result = await ipcBridge.conversation.stop.invoke({
          conversation_id: conversation.id,
          turn_id: runtimeView.activeTurnId,
        });
        runtimeView.markStopAcknowledged(runtimeView.activeTurnId, result.runtime);
      }
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      if (ok) void saveAionrsDefaultModel(_provider.id, modelName);
      return Boolean(ok);
    },
    [conversation.id, runtimeView]
  );

  const modelSelection = useAionrsModelSelection({
    initialModel: conversation.model,
    onSelectModel,
  });
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);
  const aionrsAssistantId = resolveAssistantConfigId(conversation) ?? undefined;
  const timelineHeaderSlot = hasCurrentTaskAwareness(runtimeView.currentTask) ? (
    <CurrentTaskAwareness
      task={runtimeView.currentTask}
      compact
      statusLabel={runtimeView.view.state}
      stopDisabled={!runtimeView.activeTurnId || !runtimeView.isProcessing}
      onStop={runtimeView.stopActiveTurn}
    />
  ) : undefined;

  const chatLayoutProps = {
    title: conversation.name,
    siderTitle: sliderTitle,
    sider: <ChatSlider conversation={conversation} currentTask={runtimeView.currentTask} />,
    environmentSlot: (
      <ConversationEnvironmentPopover conversation={conversation} currentTask={runtimeView.currentTask} />
    ),
    workspaceEnabled: true,
    workspacePath: conversation.extra?.workspace,
    isTemporaryWorkspace: (conversation.extra as { is_temporary_workspace?: boolean } | undefined)
      ?.is_temporary_workspace,
    backend: 'aionrs' as const,
    presetAssistant: presetAssistantInfo ? { ...presetAssistantInfo, id: aionrsAssistantId } : undefined,
  };
  const ordinaryExtra = useMemo(
    () => sanitizeOplOrdinaryConversationExtra(conversation.extra as Record<string, unknown> | undefined),
    [conversation.extra]
  );

  return (
    <ChatLayout {...chatLayoutProps} conversation_id={conversation.id}>
      <AionrsChat
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        modelSelection={modelSelection}
        session_mode={conversation.extra?.session_mode}
        cron_job_id={(conversation.extra as { cron_job_id?: string })?.cron_job_id}
        loadedSkills={(ordinaryExtra as { skills?: string[] } | undefined)?.skills}
        loadedMcpServers={(ordinaryExtra as { mcp_servers?: string[] } | undefined)?.mcp_servers}
        loadedMcpStatuses={(ordinaryExtra as { mcp_statuses?: IConversationMcpStatus[] } | undefined)?.mcp_statuses}
        agent_name={presetAssistantInfo?.name}
        branch={getConversationBranch(conversation)}
        activeCapabilityLabel={presetAssistantInfo?.name}
        timelineHeaderSlot={timelineHeaderSlot}
      />
    </ChatLayout>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
  hideSendBox?: boolean;
}> = ({ conversation, hideSendBox }) => {
  const { t } = useTranslation();

  const isAionrsConversation = conversation?.type === 'aionrs';
  const isLegacyReadOnlyConversation = isLegacyReadOnlyConversationType(conversation?.type);
  const resolvedHideSendBox = hideSendBox || isLegacyReadOnlyConversationType(conversation?.type);

  // 使用统一的 Hook 获取预设助手信息（ACP/Codex 会话）
  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const acpConversation = isAionrsConversation ? undefined : conversation;
  const { info: presetAssistantInfo, isLoading: isLoadingPreset } = usePresetAssistantInfo(acpConversation);
  const acpAssistantId = acpConversation ? (resolveAssistantConfigId(acpConversation) ?? undefined) : undefined;

  const conversationAgentName = (conversation?.extra as { agent_name?: string } | undefined)?.agent_name;
  const canonicalThreadId =
    (conversation?.extra as { canonical_thread_id?: string } | undefined)?.canonical_thread_id?.trim() || undefined;
  const runtimeView = useConversationRuntimeView(conversation?.id ?? '', canonicalThreadId);
  const currentTask = runtimeView.currentTask ?? conversation?.runtime?.current_task ?? null;
  const assistantDisplayName = presetAssistantInfo?.name || conversationAgentName;
  const ordinaryExtra = useMemo(
    () => sanitizeOplOrdinaryConversationExtra(conversation?.extra as Record<string, unknown> | undefined),
    [conversation?.extra]
  );
  const timelineHeaderSlot = useMemo(
    () =>
      hasCurrentTaskAwareness(currentTask) ? (
        <CurrentTaskAwareness
          task={currentTask}
          compact
          statusLabel={runtimeView.view.state}
          stopDisabled={!runtimeView.activeTurnId || !runtimeView.isProcessing}
          onStop={runtimeView.stopActiveTurn}
        />
      ) : undefined,
    [
      currentTask,
      runtimeView.activeTurnId,
      runtimeView.isProcessing,
      runtimeView.stopActiveTurn,
      runtimeView.view.state,
    ]
  );

  const conversationNode = useMemo(() => {
    if (!conversation || isAionrsConversation) return null;
    if (isLegacyReadOnlyConversation) {
      return (
        <LegacyReadOnlyConversation
          key={conversation.id}
          conversation={conversation}
          timelineHeaderSlot={timelineHeaderSlot}
        />
      );
    }
    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            canonicalThreadId={canonicalThreadId}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            session_mode={conversation.extra?.session_mode}
            agent_name={assistantDisplayName}
            branch={getConversationBranch(conversation)}
            activeCapabilityLabel={presetAssistantInfo?.name}
            cron_job_id={(ordinaryExtra as { cron_job_id?: string } | undefined)?.cron_job_id}
            hideSendBox={resolvedHideSendBox}
            loadedSkills={(ordinaryExtra as { skills?: string[] } | undefined)?.skills}
            loadedMcpServers={(ordinaryExtra as { mcp_servers?: string[] } | undefined)?.mcp_servers}
            loadedMcpStatuses={(ordinaryExtra as { mcp_statuses?: IConversationMcpStatus[] } | undefined)?.mcp_statuses}
            timelineHeaderSlot={timelineHeaderSlot}
          ></AcpChat>
        );
      default:
        return null;
    }
  }, [
    conversation,
    canonicalThreadId,
    isAionrsConversation,
    isLegacyReadOnlyConversation,
    assistantDisplayName,
    resolvedHideSendBox,
    ordinaryExtra,
    timelineHeaderSlot,
  ]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-13px font-medium text-t-primary'>{t('conversation.sidePanel.title')}</span>
      </div>
    );
  }, [t]);

  if (conversation && conversation.type === 'aionrs') {
    return <AionrsConversationPanel key={conversation.id} conversation={conversation} sliderTitle={sliderTitle} />;
  }

  // 如果有预设助手信息，使用预设助手的 logo 和名称；加载中时不进入 fallback；否则使用 backend 的 logo
  // If preset assistant info exists, use preset logo/name; while loading, avoid fallback; otherwise use backend logo
  const chatLayoutProps = presetAssistantInfo
    ? {
        presetAssistant: { ...presetAssistantInfo, id: acpAssistantId },
      }
    : isLoadingPreset
      ? {} // Still loading custom agents — avoid showing backend logo prematurely
      : {
          backend:
            conversation?.type === 'acp'
              ? conversation?.extra?.backend
              : conversation?.type === 'aionrs'
                ? 'aionrs'
                : conversation?.type === 'codex'
                  ? 'codex'
                  : conversation?.type === 'openclaw-gateway'
                    ? 'openclaw-gateway'
                    : conversation?.type === 'nanobot'
                      ? 'nanobot'
                      : conversation?.type === 'remote'
                        ? 'remote'
                        : undefined,
          agent_name: conversationAgentName,
        };

  return (
    <ChatLayout
      title={conversation?.name}
      {...chatLayoutProps}
      environmentSlot={<ConversationEnvironmentPopover conversation={conversation} currentTask={currentTask} />}
      siderTitle={sliderTitle}
      sider={<ChatSlider conversation={conversation} currentTask={currentTask} />}
      workspaceEnabled={Boolean(conversation)}
      workspacePath={conversation?.extra?.workspace}
      isTemporaryWorkspace={
        (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)?.is_temporary_workspace
      }
      conversation_id={conversation?.id}
    >
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
