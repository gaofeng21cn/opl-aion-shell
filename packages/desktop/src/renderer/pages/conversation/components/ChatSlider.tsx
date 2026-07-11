import type { TChatConversation, TConversationRuntimeSummary } from '@/common/config/storage';
import { Empty } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import ChatWorkspace from '../Workspace';

type ChatSliderProps = {
  conversation?: TChatConversation;
  currentTask?: TConversationRuntimeSummary['current_task'] | null;
  actionsSlot?: React.ReactNode;
};

const ChatSlider: React.FC<ChatSliderProps> = ({ conversation }) => {
  const { t } = useTranslation();
  const workspace = conversation?.extra?.workspace;
  const supportsWorkspace =
    conversation?.type === 'acp' || conversation?.type === 'codex' || conversation?.type === 'aionrs';
  const isTemporaryWorkspace = Boolean(
    (conversation?.extra as { is_temporary_workspace?: boolean } | undefined)?.is_temporary_workspace
  );

  if (!conversation?.id || !workspace || !supportsWorkspace) {
    return (
      <div className='conversation-side-panel conversation-side-panel--empty' data-testid='conversation-side-panel'>
        <Empty description={t('conversation.sidePanel.noWorkspace')} />
      </div>
    );
  }

  return (
    <div className='conversation-side-panel' data-testid='conversation-side-panel'>
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={workspace}
        isTemporaryWorkspace={isTemporaryWorkspace}
        eventPrefix={conversation.type === 'codex' ? 'codex' : conversation.type === 'aionrs' ? 'aionrs' : 'acp'}
        showTabBar
        showCurrentTask={false}
      />
    </div>
  );
};

export default ChatSlider;
