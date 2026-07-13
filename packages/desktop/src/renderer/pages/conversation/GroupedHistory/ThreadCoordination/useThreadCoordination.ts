/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { CODEX_THREAD_COORDINATION_METHODS } from '@/common/types/codex/threadCoordination';
import type {
  CodexThreadServerRequest,
  ThreadCoordinationActionRequest,
  ThreadCoordinationActionResult,
  ThreadCoordinationOverview,
  ThreadCoordinationReadResult,
  ThreadCoordinationResolveServerRequest,
  ThreadCoordinationResolveServerRequestResult,
} from '@/common/types/codex/threadCoordination';
import { canonicalCodexThreadId } from '@/renderer/pages/conversation/GroupedHistory/hooks/canonicalThreadLifecycle';

const PENDING_REQUEST_POLL_MS = 2_000;

function unavailableOverview(error: unknown): ThreadCoordinationOverview {
  return {
    schema: 'opl_codex_thread_coordination_overview.v1',
    availability: {
      status: 'unavailable',
      host: null,
      protocolVersion: null,
      methods: [...CODEX_THREAD_COORDINATION_METHODS],
      reasonCode: 'protocol_unavailable',
      detail: error instanceof Error ? error.message : null,
    },
    currentThreadId: null,
    currentProjectId: null,
    threads: [],
    audit: [],
  };
}

async function sourceThreadHint(conversationId: string | undefined): Promise<string | undefined> {
  if (!conversationId) return undefined;
  try {
    const conversation = await ipcBridge.conversation.get.invoke({ id: conversationId });
    return canonicalCodexThreadId(conversation) ?? undefined;
  } catch {
    return undefined;
  }
}

export function useThreadCoordination(conversationId?: string): {
  overview: ThreadCoordinationOverview | null;
  pendingRequests: CodexThreadServerRequest[];
  loading: boolean;
  refresh: () => Promise<void>;
  refreshPendingRequests: () => Promise<void>;
  readThread: (threadId: string) => Promise<ThreadCoordinationReadResult>;
  execute: (request: ThreadCoordinationActionRequest) => Promise<ThreadCoordinationActionResult>;
  resolveServerRequest: (
    request: ThreadCoordinationResolveServerRequest
  ) => Promise<ThreadCoordinationResolveServerRequestResult>;
} {
  const [overview, setOverview] = useState<ThreadCoordinationOverview | null>(null);
  const [pendingRequests, setPendingRequests] = useState<CodexThreadServerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshPendingRequests = useCallback(async () => {
    try {
      const result = await ipcBridge.threadCoordination.listPendingRequests.invoke();
      setPendingRequests(result.requests);
    } catch {
      setPendingRequests([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sourceThreadIdHint = await sourceThreadHint(conversationId);
      setOverview(await ipcBridge.threadCoordination.getOverview.invoke({ includeArchived: true, sourceThreadIdHint }));
      await refreshPendingRequests();
    } catch (error) {
      setOverview(unavailableOverview(error));
    } finally {
      setLoading(false);
    }
  }, [conversationId, refreshPendingRequests]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval((): void => {
      void refreshPendingRequests();
    }, PENDING_REQUEST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshPendingRequests]);

  const readThread = useCallback((threadId: string) => {
    return ipcBridge.threadCoordination.readThread.invoke({ threadId });
  }, []);

  const execute = useCallback(
    async (request: ThreadCoordinationActionRequest) => {
      const result = await ipcBridge.threadCoordination.execute.invoke({ request });
      await refresh();
      return result;
    },
    [refresh]
  );

  const resolveServerRequest = useCallback(
    async (request: ThreadCoordinationResolveServerRequest) => {
      const result = await ipcBridge.threadCoordination.resolveServerRequest.invoke(request);
      await refreshPendingRequests();
      return result;
    },
    [refreshPendingRequests]
  );

  return {
    overview,
    pendingRequests,
    loading,
    refresh,
    refreshPendingRequests,
    readThread,
    execute,
    resolveServerRequest,
  };
}
