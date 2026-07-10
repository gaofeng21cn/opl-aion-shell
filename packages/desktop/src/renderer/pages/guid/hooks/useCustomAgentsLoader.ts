/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useMemo } from 'react';
import useSWR from 'swr';
import { resolveOplHomeAssistants } from '../utils/oplHomeAssistants';

type UseCustomAgentsLoaderResult = {
  /** OPL Home projection derived from the backend assistant catalog. */
  assistants: Assistant[];
  /** Unfiltered backend catalog used for assistant-to-managed-agent association. */
  catalogAssistants: Assistant[];
  customAgentAvatarMap: Map<string, string | undefined>;
};

/** Loads business assistant candidates exclusively from `/api/assistants`. */
export const useCustomAgentsLoader = (): UseCustomAgentsLoaderResult => {
  const { data: assistantList } = useSWR('assistants.list', async () => {
    try {
      return await ipcBridge.assistants.list.invoke();
    } catch (error) {
      console.error('Failed to load assistants:', error);
      return [] as Assistant[];
    }
  });
  const catalogAssistants = assistantList ?? [];
  const assistants = useMemo(() => resolveOplHomeAssistants(catalogAssistants), [catalogAssistants]);
  const customAgentAvatarMap = useMemo(
    () => new Map([...catalogAssistants, ...assistants].map((assistant) => [assistant.id, assistant.avatar])),
    [assistants, catalogAssistants]
  );

  return { assistants, catalogAssistants, customAgentAvatarMap };
};
