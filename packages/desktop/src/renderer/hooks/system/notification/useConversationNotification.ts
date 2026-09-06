/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { getSnapshotConversationName } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  createBrowserNotificationController,
  shouldShowNotification,
  truncateConversationName,
} from './browserNotificationCore';

export const useConversationNotification = (): void => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const presentation = useRef({ t, navigate });
  presentation.current = { t, navigate };
  useEffect(() => {
    const desktop = isElectronDesktop();
    const controller = createBrowserNotificationController({
      shouldShow: () => {
        const settingEnabled = configService.get('system.notificationEnabled') !== false;
        if (desktop) return settingEnabled;
        return shouldShowNotification({
          isElectron: false,
          hasNotificationApi: typeof Notification !== 'undefined',
          isSecureContext: window.isSecureContext,
          permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
          settingEnabled,
          documentHidden: document.hidden,
        });
      },
      bodyFor: (kind, conversationId) => {
        const translate = presentation.current.t;
        const name = conversationId ? getSnapshotConversationName(conversationId) : undefined;
        if (kind === 'confirmation') {
          return name
            ? translate('settings.browserNotification.bodyConfirmationNamed', { name: truncateConversationName(name) })
            : translate('settings.browserNotification.bodyConfirmation');
        }
        return name
          ? translate('settings.browserNotification.bodyTurnCompletedNamed', { name: truncateConversationName(name) })
          : translate('settings.browserNotification.bodyTurnCompleted');
      },
      show: ({ body, conversationId }) => {
        if (desktop) {
          void ipcBridge.notification.show
            .invoke({ title: 'One Person Lab', body, conversation_id: conversationId })
            .catch(() => {});
          return;
        }
        try {
          const notification = new Notification('One Person Lab', { body });
          notification.addEventListener('click', () => {
            notification.close();
            window.focus();
            if (conversationId)
              void presentation.current.navigate(`/conversation/${encodeURIComponent(conversationId)}`);
          });
        } catch {
          // Browser policy can change between the permission check and delivery.
        }
      },
    });
    const streams = [ipcBridge.conversation?.responseStream, ipcBridge.codexThreads?.responseStream];
    const turnEmitters = [ipcBridge.conversation?.turnCompleted, ipcBridge.codexThreads?.turnCompleted];
    const disposers = streams.map((emitter) => emitter?.on(controller.onStreamMessage));
    turnEmitters.forEach((emitter) => {
      disposers.push(
        emitter?.on((event) => {
          controller.onStreamMessage({
            type: event.status === 'finished' ? 'finish' : 'error',
            conversation_id: event.session_id,
            turn_id: event.turn_id,
          });
        })
      );
    });
    return () => disposers.forEach((dispose) => dispose?.());
  }, []);
};
