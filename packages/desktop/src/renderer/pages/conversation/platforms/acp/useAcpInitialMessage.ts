/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { parseError, uuid } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getConversationRuntimeWorkspaceErrorMessage } from '../../utils/conversationCreateError';
import { warmupConversation } from '../../utils/warmupConversation';
import { buildSendFailureError } from './buildSendFailureError';

type UseAcpInitialMessageParams = {
  conversation_id: string;
  backend: string;
  workspacePath?: string;
  disabled?: boolean;
  setAiProcessing: (value: boolean) => void;
  resetState: () => void;
  markSendStarted?: () => void;
  markSendAccepted?: (turn_id: string, runtime: TConversationRuntimeSummary, msg_id?: string) => void;
  markSendFailed?: (reason: string) => void;
  checkAndUpdateTitle: (conversation_id: string, input: string) => void;
  addOrUpdateMessage: (message: TMessage, prepend?: boolean) => void;
  restoreFailedSend: (input: string, files: string[]) => void;
};

/**
 * Side-effect-only hook that checks sessionStorage for an initial message
 * and sends it when the ACP conversation first mounts.
 */
export const useAcpInitialMessage = ({
  conversation_id,
  backend,
  workspacePath,
  disabled = false,
  setAiProcessing,
  resetState,
  markSendStarted,
  markSendAccepted,
  markSendFailed,
  checkAndUpdateTitle,
  addOrUpdateMessage,
  restoreFailedSend,
}: UseAcpInitialMessageParams): void => {
  const { t } = useTranslation();

  useEffect(() => {
    if (disabled) return;
    const storageKey = `acp_initial_message_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    // Clear immediately to prevent duplicate sends (e.g., if component remounts while sendMessage is pending)
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      let input = '';
      let files: string[] = [];
      try {
        const initialMessage = JSON.parse(storedMessage);
        input = typeof initialMessage.input === 'string' ? initialMessage.input : '';
        files = Array.isArray(initialMessage.files)
          ? initialMessage.files.filter((file: unknown): file is string => typeof file === 'string')
          : [];
        const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

        markSendStarted?.();
        setAiProcessing(true);

        await warmupConversation(conversation_id);

        // POST first to obtain the server-assigned msg_id, then render the
        // optimistic user bubble with that canonical id. Doing it in this
        // order prevents `useMessageLstCache` from treating the optimistic
        // row as a separate "streaming-only" entry when the DB load races
        // with sendMessage — which previously produced two duplicated user
        // bubbles on the first conversation render.
        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id: conversation_id,
          files,
        });
        markSendAccepted?.(result.turn_id, result.runtime, result.msg_id);

        // Initial message sent successfully
        emitter.emit('chat.history.refresh');
      } catch (error) {
        const errorMessageText =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        markSendFailed?.(errorMessageText);
        console.error('[useAcpInitialMessage] Error sending initial message:', error);
        console.error('[useAcpInitialMessage] Error details:', {
          name: (error as Error)?.name,
          message: errorMessageText,
          conversation_id,
        });

        const errorMessage: TMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id: conversation_id,
          type: 'tips',
          position: 'center',
          content: {
            content: errorMessageText,
            type: 'error',
            error: buildSendFailureError(error, errorMessageText),
          },
          created_at: Date.now() + 2,
        };
        addOrUpdateMessage(errorMessage, true);
        restoreFailedSend(input, files);
        resetState();
        setAiProcessing(false); // Keep the prop-setter in sync with the hook reset
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });
  }, [
    addOrUpdateMessage,
    backend,
    checkAndUpdateTitle,
    conversation_id,
    disabled,
    markSendAccepted,
    markSendFailed,
    markSendStarted,
    resetState,
    restoreFailedSend,
    setAiProcessing,
    t,
    workspacePath,
  ]);
};
