/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useMemo } from 'react';
import useSWR from 'swr';

type UseCustomAgentsLoaderResult = {
  /** Real backend assistant catalog used for executor selection and binding. */
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
  const assistants = catalogAssistants;
  const customAgentAvatarMap = useMemo(
    () => new Map(catalogAssistants.map((assistant) => [assistant.id, assistant.avatar])),
    [catalogAssistants]
  );

  return { assistants, catalogAssistants, customAgentAvatarMap };
};
