import { useEffect, useState } from 'react';

export const WORKSPACE_EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';
export const WORKSPACE_EXPANSION_EVENT = 'aionui:workspace-expansion-changed';
export const ARCHIVED_WORKSPACE_EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion_archived';
export const ARCHIVED_WORKSPACE_EXPANSION_EVENT = 'aionui:archived-workspace-expansion-changed';

type WorkspaceExpansionChangeDetail = {
  expandedWorkspaces: string[];
};

const getWorkspaceExpansionStorageKey = (archived: boolean): string =>
  archived ? ARCHIVED_WORKSPACE_EXPANSION_STORAGE_KEY : WORKSPACE_EXPANSION_STORAGE_KEY;

const getWorkspaceExpansionEvent = (archived: boolean): string =>
  archived ? ARCHIVED_WORKSPACE_EXPANSION_EVENT : WORKSPACE_EXPANSION_EVENT;

export const readExpandedWorkspaces = (archived = false): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = localStorage.getItem(getWorkspaceExpansionStorageKey(archived));
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const dispatchWorkspaceExpansionChange = (expandedWorkspaces: string[], archived = false): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<WorkspaceExpansionChangeDetail>(getWorkspaceExpansionEvent(archived), {
      detail: { expandedWorkspaces },
    })
  );
};

export const useWorkspaceExpansionState = (archived = false): string[] => {
  const storageKey = getWorkspaceExpansionStorageKey(archived);
  const expansionEvent = getWorkspaceExpansionEvent(archived);
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => readExpandedWorkspaces(archived));

  useEffect(() => {
    const handleWorkspaceExpansionChange = (event: Event) => {
      const customEvent = event as CustomEvent<WorkspaceExpansionChangeDetail>;
      setExpandedWorkspaces(customEvent.detail?.expandedWorkspaces ?? readExpandedWorkspaces(archived));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setExpandedWorkspaces(readExpandedWorkspaces(archived));
      }
    };

    setExpandedWorkspaces(readExpandedWorkspaces(archived));
    window.addEventListener(expansionEvent, handleWorkspaceExpansionChange as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(expansionEvent, handleWorkspaceExpansionChange as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, [archived, expansionEvent, storageKey]);

  return expandedWorkspaces;
};
