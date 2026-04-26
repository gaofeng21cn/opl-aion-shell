/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { CronJobManager } from '@/renderer/pages/cron';
import { usePresetAssistantInfo, resolveAssistantConfigId } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { iconColors } from '@/renderer/styles/colors';
import { Button, Dropdown, Menu, Tooltip, Typography } from '@arco-design/web-react';
import { History } from '@icon-park/react';
import React, { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { emitter } from '../../../utils/emitter';
import AcpChat from '../platforms/acp/AcpChat';
import ChatLayout from './ChatLayout';
import ChatSider from './ChatSider';
import NanobotChat from '../platforms/nanobot/NanobotChat';
import OpenClawChat from '../platforms/openclaw/OpenClawChat';
import RemoteChat from '../platforms/remote/RemoteChat';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import { usePreviewContext } from '../Preview';
import StarOfficeMonitorCard from '../platforms/openclaw/StarOfficeMonitorCard.tsx';
import ConversationSkillsIndicator from './ConversationSkillsIndicator';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

/** Check whether a specific skill is loaded for the conversation */
const hasLoadedSkill = (conversation: TChatConversation | undefined, skillName: string): boolean => {
  const loadedSkills = (conversation?.extra as { loadedSkills?: Array<{ name: string }> })?.loadedSkills;
  return loadedSkills?.some((s) => s.name === skillName) ?? false;
};

const _AssociatedConversation: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
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

const _AddNewConversation: React.FC<{ conversation: TChatConversation }> = ({ conversation }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isCreatingRef = useRef(false);
  if (!conversation.extra?.workspace) return null;
  return (
    <Tooltip content={t('conversation.workspace.createNewConversation')}>
      <Button
        size='mini'
        icon={<img src={addChatIcon} alt='Add chat' className='w-14px h-14px block m-auto' />}
        onClick={async () => {
          if (isCreatingRef.current) return;
          isCreatingRef.current = true;
          try {
            const id = uuid();
            // Fetch latest conversation from DB to ensure sessionMode is current
            const latest = await ipcBridge.conversation.get.invoke({ id: conversation.id }).catch((): null => null);
            const source = latest || conversation;
            await ipcBridge.conversation.createWithConversation.invoke({
              conversation: {
                ...source,
                id,
                createTime: Date.now(),
                modifyTime: Date.now(),
                // Clear ACP session fields to prevent new conversation from inheriting old session context
                extra:
                  source.type === 'acp'
                    ? { ...source.extra, acpSessionId: undefined, acpSessionUpdatedAt: undefined }
                    : source.extra,
              } as TChatConversation,
            });
            void navigate(`/conversation/${id}`);
            emitter.emit('chat.history.refresh');
          } catch (error) {
            console.error('Failed to create conversation:', error);
          } finally {
            isCreatingRef.current = false;
          }
        }}
      />
    </Tooltip>
  );
};

const ChatConversation: React.FC<{
  conversation?: TChatConversation;
  hideSendBox?: boolean;
}> = ({ conversation, hideSendBox }) => {
  const { t } = useTranslation();
  const { openPreview } = usePreviewContext();
  const workspaceEnabled = Boolean(conversation?.extra?.workspace);

  const isUnsupportedProviderConversation = conversation?.type === 'gemini' || conversation?.type === 'aionrs';

  // 使用统一的 Hook 获取预设助手信息（ACP/Codex 会话）
  // Use unified hook for preset assistant info (ACP/Codex conversations)
  const acpConversation = isUnsupportedProviderConversation ? undefined : conversation;
  const { info: presetAssistantInfo, isLoading: isLoadingPreset } = usePresetAssistantInfo(acpConversation);
  const acpAssistantId = acpConversation ? (resolveAssistantConfigId(acpConversation) ?? undefined) : undefined;

  const conversationAgentName = (conversation?.extra as { agentName?: string } | undefined)?.agentName;
  const assistantDisplayName = presetAssistantInfo?.name || conversationAgentName;

  const conversationNode = useMemo(() => {
    if (!conversation || isUnsupportedProviderConversation) return null;
    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            sessionMode={conversation.extra?.sessionMode}
            cachedConfigOptions={conversation.extra?.cachedConfigOptions}
            agentName={assistantDisplayName}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
            hideSendBox={hideSendBox}
          ></AcpChat>
        );
      case 'codex': // Legacy: codex now uses ACP protocol
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend='codex'
            agentName={assistantDisplayName}
            cachedConfigOptions={
              (
                conversation.extra as {
                  cachedConfigOptions?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
                }
              )?.cachedConfigOptions
            }
            hideSendBox={hideSendBox}
          />
        );
      case 'openclaw-gateway':
        return (
          <OpenClawChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      case 'nanobot':
        return (
          <NanobotChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      case 'remote':
        return (
          <RemoteChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            cronJobId={(conversation.extra as { cronJobId?: string })?.cronJobId}
          />
        );
      default:
        return null;
    }
  }, [conversation, isUnsupportedProviderConversation, assistantDisplayName, hideSendBox]);

  const sliderTitle = useMemo(() => {
    return (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    );
  }, [t]);

  // For ACP/Codex conversations, use AcpModelSelector that can show/switch models.
  // NOTE: This must be placed before the Gemini early return to maintain consistent hook order.
  const modelSelector = useMemo(() => {
    if (!conversation || isUnsupportedProviderConversation) return undefined;
    if (conversation.type === 'acp') {
      const extra = conversation.extra as { backend?: string; currentModelId?: string };
      return (
        <AcpModelSelector
          conversationId={conversation.id}
          backend={extra.backend}
          initialModelId={extra.currentModelId}
        />
      );
    }
    if (conversation.type === 'codex') {
      return <AcpModelSelector conversationId={conversation.id} />;
    }
    return undefined;
  }, [conversation, isUnsupportedProviderConversation]);

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
              : conversation?.type === 'codex'
                ? 'codex'
                : conversation?.type === 'openclaw-gateway'
                  ? 'openclaw-gateway'
                  : conversation?.type === 'nanobot'
                    ? 'nanobot'
                    : conversation?.type === 'remote'
                      ? 'remote'
                      : undefined,
          agentName: conversationAgentName,
        };

  const headerExtraNode = (
    <div className='flex items-center gap-8px'>
      {conversation?.type === 'openclaw-gateway' && (
        <div className='shrink-0'>
          <StarOfficeMonitorCard
            conversationId={conversation.id}
            onOpenUrl={(url, metadata) => {
              openPreview(url, 'url', metadata);
            }}
          />
        </div>
      )}
      <ConversationSkillsIndicator conversation={conversation} />
      {conversation && (
        <div className='shrink-0'>
          <CronJobManager
            conversationId={conversation.id}
            cronJobId={conversation.extra?.cronJobId as string | undefined}
            hasCronSkill={hasLoadedSkill(conversation, 'cron')}
          />
        </div>
      )}
    </div>
  );

  return (
    <ChatLayout
      title={conversation?.name}
      {...chatLayoutProps}
      headerLeft={modelSelector}
      headerExtra={headerExtraNode}
      siderTitle={sliderTitle}
      sider={<ChatSider conversation={conversation} />}
      workspaceEnabled={workspaceEnabled}
      workspacePath={conversation?.extra?.workspace}
      conversationId={conversation?.id}
    >
      {conversationNode}
    </ChatLayout>
  );
};

export default ChatConversation;
