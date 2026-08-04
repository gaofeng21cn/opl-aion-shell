/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BackendStartupFailureInfo } from '@/common/types/platform/electron';
import type { ReactNode } from 'react';
import React, { useEffect, useState } from 'react';

export type BackendStartupGateProps = {
  renderStarting: () => ReactNode;
  renderFailure: (failure: BackendStartupFailureInfo) => ReactNode;
  renderApp: () => ReactNode;
};

const BackendStartupGate: React.FC<BackendStartupGateProps> = ({ renderStarting, renderFailure, renderApp }) => {
  const [state, setState] = useState<BackendStartupFailureInfo | null>(
    () => window.__backendStartupBridge?.getState() ?? window.__backendStartupFailure ?? null
  );

  useEffect(() => {
    const bridge = window.__backendStartupBridge;
    if (!bridge) return;
    setState(bridge.getState());
    return bridge.subscribe(setState);
  }, []);

  if (state?.reason === 'backend_startup_pending_slow') {
    return <>{renderStarting()}</>;
  }
  if (state) {
    return <>{renderFailure(state)}</>;
  }
  return <>{renderApp()}</>;
};

export default BackendStartupGate;
