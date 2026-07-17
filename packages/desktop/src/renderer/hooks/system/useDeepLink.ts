/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { DeepLinkNavigatePayload } from '@/common/adapter/ipcBridge';
import { isOplAppDeepLinkRoute } from '@/common/config/oplProductProfile';

/**
 * Listen for validated opl:// navigation events from the main process.
 */
export const useDeepLink = () => {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const handler = useCallback((payload: DeepLinkNavigatePayload) => {
    if (!isOplAppDeepLinkRoute(payload.params.route)) {
      console.warn('[DeepLink] rejected: route_not_allowed');
      return;
    }
    void navigateRef.current(payload.params.route);
  }, []);

  useEffect(() => {
    const off = ipcBridge.deepLink.received.on(handler);
    void ipcBridge.deepLink.takePending
      .invoke()
      .then((pendingPayloads) => pendingPayloads.forEach(handler))
      .catch(() => {});
    return off;
  }, [handler]);
};
