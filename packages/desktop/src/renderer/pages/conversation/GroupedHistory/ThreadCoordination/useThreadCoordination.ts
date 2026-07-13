/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { CODEX_THREAD_COORDINATION_METHODS } from '@/common/types/codex/threadCoordination';
import type {
  ThreadCoordinationActionRequest,
  ThreadCoordinationActionResult,
  ThreadCoordinationOverview,
  ThreadCoordinationReadResult,
} from '@/common/types/codex/threadCoordination';

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
    if (conversation?.type !== 'acp' || conversation.extra.backend !== 'codex') return undefined;
    const sessionId = conversation.extra.acp_session_id?.trim();
    return sessionId || undefined;
  } catch {
    return undefined;
  }
}

export function useThreadCoordination(conversationId?: string): {
  overview: ThreadCoordinationOverview | null;
  loading: boolean;
  refresh: () => Promise<void>;
  readThread: (threadId: string) => Promise<ThreadCoordinationReadResult>;
  execute: (request: ThreadCoordinationActionRequest) => Promise<ThreadCoordinationActionResult>;
} {
  const [overview, setOverview] = useState<ThreadCoordinationOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const sourceThreadIdHint = await sourceThreadHint(conversationId);
      setOverview(
        await ipcBridge.threadCoordination.getOverview.invoke({ includeArchived: false, sourceThreadIdHint })
      );
    } catch (error) {
      setOverview(unavailableOverview(error));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return { overview, loading, refresh, readThread, execute };
}
