/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ConfigStorage, type TChatConversation } from '@/common/config/storage';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpModelInfo, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { DEFAULT_CODEX_MODEL_ID } from '@/common/types/codex/codexModels';
import { uuid } from '@/common/utils';
import addChatIcon from '@/renderer/assets/icons/add-chat.svg';
import { CronJobManager } from '@/renderer/pages/cron';
import { usePresetAssistantInfo, resolveAssistantConfigId } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { AgentLogoIcon } from '@/renderer/components/agent/AgentBadge';
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
import { usePreviewContext } from '../Preview';
import StarOfficeMonitorCard from '../platforms/openclaw/StarOfficeMonitorCard.tsx';
import ConversationSkillsIndicator from './ConversationSkillsIndicator';
// import SkillRuleGenerator from './components/SkillRuleGenerator'; // Temporarily hidden

type SystemCodexConfig = {
  model?: string;
  reasoningEffort?: string;
};

type ConversationHeaderExtra = {
  backend?: string;
  currentModelId?: string;
  cachedConfigOptions?: AcpSessionConfigOption[];
  pendingConfigOptions?: Record<string, string>;
};

/** Check whether a specific skill is loaded for the conversation */
const hasLoadedSkill = (conversation: TChatConversation | undefined, skillName: string): boolean => {
  const loadedSkills = (conversation?.extra as { loadedSkills?: Array<{ name: string }> })?.loadedSkills;
  return loadedSkills?.some((s) => s.name === skillName) ?? false;
};

const getConversationBackend = (conversation: TChatConversation | undefined): string | undefined => {
  if (!conversation) return undefined;
  if (conversation.type === 'acp') return conversation.extra?.backend;
  if (conversation.type === 'codex') return 'codex';
  if (conversation.type === 'openclaw-gateway') return 'openclaw-gateway';
  if (conversation.type === 'nanobot') return 'nanobot';
  if (conversation.type === 'remote') return 'remote';
  return undefined;
};

const extractSystemCodexConfig = async (): Promise<SystemCodexConfig> => {
  try {
    const home = await ipcBridge.application.getPath.invoke({ name: 'home' });
    const configPath = `${home}/.codex/config.toml`;
    const content = await ipcBridge.fs.readFile.invoke({ path: configPath });
    const readString = (key: string) => {
      const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]+)"`, 'm'));
      return match?.[1]?.trim();
    };
    return {
      model: readString('model'),
      reasoningEffort: readString('model_reasoning_effort'),
    };
  } catch {
    return {};
  }
};

const isReasoningOption = (option: AcpSessionConfigOption): boolean => {
  const fields = [option.id, option.name, option.label].filter(Boolean).join(' ').toLowerCase();
  return fields.includes('reasoning') || fields.includes('thought');
};

const extractReasoningEffort = (
  options: AcpSessionConfigOption[] | undefined,
  pendingOptions: Record<string, string> | undefined
): string | undefined => {
  const option = options?.find(isReasoningOption);
  if (!option) return undefined;
  const rawValue = (option.id ? pendingOptions?.[option.id] : undefined) || option.currentValue || option.selectedValue;
  if (!rawValue) return undefined;
  return option.options?.find((item) => item.value === rawValue)?.name || option.options?.find((item) => item.value === rawValue)?.label || rawValue;
};

const splitModelAndReasoning = (model: string | undefined): { model?: string; reasoning?: string } => {
  const trimmed = model?.trim();
  if (!trimmed) return {};
  const match = trimmed.match(/^(.+)\/(minimal|low|medium|high|xhigh)$/i);
  if (!match) return { model: trimmed };
  return { model: match[1].trim(), reasoning: match[2].trim() };
};

const buildModelSummary = (
  modelInfo: AcpModelInfo | null,
  conversation: TChatConversation | undefined,
  systemCodexConfig: SystemCodexConfig,
  fallbackLabel: string
): string => {
  const extra = conversation?.extra as ConversationHeaderExtra | undefined;
  const rawModel =
    modelInfo?.currentModelLabel ||
    modelInfo?.currentModelId ||
    extra?.currentModelId ||
    systemCodexConfig.model ||
    (conversation ? DEFAULT_CODEX_MODEL_ID : undefined);
  const parsed = splitModelAndReasoning(rawModel);
  const reasoning =
    extractReasoningEffort(extra?.cachedConfigOptions, extra?.pendingConfigOptions) ||
    parsed.reasoning ||
    systemCodexConfig.reasoningEffort;
  const model = parsed.model || rawModel;

  if (!model) return fallbackLabel;
  return reasoning ? `${model} / ${reasoning}` : model;
};

const useConversationModelInfo = (
  conversation: TChatConversation | undefined,
  backend: string | undefined
): { modelInfo: AcpModelInfo | null; systemCodexConfig: SystemCodexConfig } => {
  const [modelInfo, setModelInfo] = React.useState<AcpModelInfo | null>(null);
  const [systemCodexConfig, setSystemCodexConfig] = React.useState<SystemCodexConfig>({});
  const conversationId = conversation?.id;

  React.useEffect(() => {
    let cancelled = false;
    if (!conversation || !conversationId) {
      setModelInfo(null);
      return;
    }

    const load = async () => {
      const result = await ipcBridge.acpConversation.getModelInfo
        .invoke({ conversationId })
        .catch((): null => null);
      if (cancelled) return;
      if (result?.success && result.data?.modelInfo) {
        setModelInfo(result.data.modelInfo);
        return;
      }

      if (backend) {
        const cached = await ConfigStorage.get('acp.cachedModels').catch((): null => null);
        if (cancelled) return;
        const cachedInfo = cached?.[backend];
        if (cachedInfo) setModelInfo(cachedInfo);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [backend, conversation, conversationId]);

  React.useEffect(() => {
    let cancelled = false;
    void extractSystemCodexConfig().then((config) => {
      if (!cancelled) setSystemCodexConfig(config);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  React.useEffect(() => {
    if (!conversationId) return undefined;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) return;
      if (message.type === 'acp_model_info' && message.data) {
        setModelInfo(message.data as AcpModelInfo);
        return;
      }
      if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model?: string };
        if (data.model) {
          setModelInfo({
            source: 'models',
            sourceDetail: 'codex-stream',
            currentModelId: data.model,
            currentModelLabel: data.model,
            canSwitch: false,
            availableModels: [],
          });
        }
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversationId]);

  return { modelInfo, systemCodexConfig };
};

const ConversationAssistantStatus: React.FC<{
  assistantName?: string;
  modelSummary: string;
  backend?: string;
  status?: TChatConversation['status'];
  logo?: string;
  logoIsEmoji?: boolean;
}> = ({ assistantName, modelSummary, backend, status, logo, logoIsEmoji }) => {
  const { t } = useTranslation();
  const displayName = assistantName || t('conversation.header.assistantFallback');
  const statusMeta =
    status === 'running'
      ? {
          label: t('conversation.header.status.running'),
          dotClassName: 'bg-[rgb(var(--primary-6))]',
        }
      : status === 'pending'
        ? {
            label: t('conversation.header.status.pending'),
            dotClassName: 'bg-[rgb(var(--warning-6))]',
          }
        : {
            label: t('conversation.header.status.ready'),
            dotClassName: 'bg-[rgb(var(--success-6))]',
          };

  return (
    <div
      className='inline-flex h-32px max-w-420px items-center gap-8px overflow-hidden rounded-full bg-2 px-10px py-2px text-t-primary'
      data-testid='conversation-assistant-status'
      aria-label={t('conversation.header.assistantStatusLabel', {
        assistant: displayName,
        model: modelSummary,
        status: statusMeta.label,
      })}
      title={`${displayName} · ${modelSummary} · ${statusMeta.label}`}
    >
      <AgentLogoIcon backend={backend} agentLogo={logo} agentLogoIsEmoji={logoIsEmoji} agentName={displayName} />
      <span className='min-w-0 truncate text-13px font-medium leading-none'>{displayName}</span>
      <span className='h-14px w-1px shrink-0 bg-[var(--color-border-2)]' aria-hidden='true' />
      <span className='min-w-0 truncate text-12px text-t-secondary leading-none'>{modelSummary}</span>
      <span className='h-14px w-1px shrink-0 bg-[var(--color-border-2)]' aria-hidden='true' />
      <span className='inline-flex shrink-0 items-center gap-5px text-12px text-t-secondary leading-none'>
        <span className={`h-6px w-6px rounded-full ${statusMeta.dotClassName}`} aria-hidden='true' />
        {statusMeta.label}
      </span>
    </div>
  );
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
  const conversationBackend = getConversationBackend(conversation);
  const { modelInfo, systemCodexConfig } = useConversationModelInfo(conversation, conversationBackend);
  const modelSummary = useMemo(
    () =>
      buildModelSummary(
        modelInfo,
        conversation,
        systemCodexConfig,
        t('conversation.welcome.codexDefaultConfigFallback')
      ),
    [conversation, modelInfo, systemCodexConfig, t]
  );

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

  const assistantStatusNode = conversation && !isUnsupportedProviderConversation ? (
    <ConversationAssistantStatus
      assistantName={assistantDisplayName}
      modelSummary={modelSummary}
      backend={conversationBackend}
      status={conversation.status}
      logo={presetAssistantInfo?.logo}
      logoIsEmoji={presetAssistantInfo?.isEmoji}
    />
  ) : undefined;

  // 如果有预设助手信息，使用预设助手的 logo 和名称；加载中时不进入 fallback；否则使用 backend 的 logo
  // If preset assistant info exists, use preset logo/name; while loading, avoid fallback; otherwise use backend logo
  const chatLayoutProps = presetAssistantInfo
    ? {
        presetAssistant: { ...presetAssistantInfo, id: acpAssistantId },
      }
    : isLoadingPreset
      ? {} // Still loading custom agents — avoid showing backend logo prematurely
      : {
          backend: conversationBackend,
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
      headerLeft={assistantStatusNode}
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
