/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';

/**
 * Hook to listen for notification click events from main process.
 * Navigates to the corresponding conversation page when a notification is clicked.
 */
export const useNotificationClick = () => {
  const navigate = useNavigate();

  const handler = useCallback(
    (payload: { conversation_id?: string }) => {
      if (payload.conversation_id) {
        // Navigate to the conversation page / 导航到会话页面
        void navigate(`/conversation/${encodeURIComponent(payload.conversation_id)}`);
      }
    },
    [navigate]
  );

  useEffect(() => {
    return ipcBridge.notification.clicked.on(handler);
  }, [handler]);
};
