/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationMcpStatus } from '@/common/config/storage';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  useMessageLstCache,
} from '@renderer/pages/conversation/Messages/hooks';
import { usePendingConfirmationsRecovery } from '@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import AcpE2EStreamInjector from './AcpE2EStreamInjector';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';
import { useCanonicalCodexHistory } from './useCanonicalCodexHistory';

const AcpChat: React.FC<{
  conversation_id: string;
  canonicalThreadId?: string;
  workspace?: string;
  backend: string;
  session_mode?: string;
  agent_name?: string;
  branch?: string;
  activeCapabilityLabel?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  emptySlot?: React.ReactNode;
  timelineHeaderSlot?: React.ReactNode;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
}> = ({
  conversation_id,
  canonicalThreadId,
  workspace,
  backend,
  session_mode,
  agent_name,
  branch,
  activeCapabilityLabel,
  cron_job_id,
  hideSendBox,
  emptySlot,
  timelineHeaderSlot,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
}) => {
  useMessageLstCache(conversation_id);
  const teamPermission = useTeamPermission();
  const messageState = useAcpMessage(conversation_id, {
    skipWarmup: Boolean(teamPermission) || Boolean(canonicalThreadId),
  });
  useCanonicalCodexHistory(conversation_id, canonicalThreadId, {
    reconcileCanonicalThread: messageState.reconcileCanonicalThread,
    markCanonicalSnapshotCovered: messageState.markCanonicalSnapshotCovered,
    replayCanonicalMessages: messageState.replayCanonicalMessages,
  });
  usePendingConfirmationsRecovery(conversation_id, canonicalThreadId);

  return (
    <ConversationProvider
      value={{
        conversation_id: conversation_id,
        workspace,
        type: 'acp',
        cron_job_id,
        hideSendBox,
        loadedSkills,
        loadedMcpServers,
        loadedMcpStatuses,
      }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className='flex-1 flex flex-col px-20px min-h-0'>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} timelineHeaderSlot={timelineHeaderSlot} />
          </FlexFullContainer>
          <AcpE2EStreamInjector conversationId={conversation_id} />
          {!hideSendBox && (
            <AcpSendBox
              conversation_id={conversation_id}
              canonicalThreadId={canonicalThreadId}
              backend={backend}
              session_mode={session_mode}
              agent_name={agent_name}
              workspacePath={workspace}
              branch={branch}
              activeCapabilityLabel={activeCapabilityLabel}
              messageState={messageState}
            ></AcpSendBox>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC.Wrapper(MessageListProvider, MessageListLoadingProvider)(AcpChat);
