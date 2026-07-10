import { blurActiveElement } from '@/renderer/utils/ui/focus';
import { WORKSPACE_TOGGLE_EVENT, dispatchWorkspaceStateEvent } from '@/renderer/utils/workspace/workspaceEvents';
import { useEffect, useState } from 'react';

type UseWorkspaceCollapseParams = {
  workspaceEnabled: boolean;
  isMobile: boolean;
  /**
   * Identifier whose change forces a mobile collapse (typically the active
   * conversation id; in team mode, the active agent's conversation id).
   */
  conversation_id?: string;
  /**
   * Stable key used to persist the user's manual toggle preference. Single-chat
   * uses `conversation_id`; team mode passes `team_id` so the preference
   * survives agent-tab switches and follows the team as a whole.
   */
  preferenceKey?: string;
};

type UseWorkspaceCollapseReturn = {
  rightSiderCollapsed: boolean;
  setRightSiderCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Manages workspace panel collapse/expand state.
 *
 * Desktop restores an explicit saved preference. Mobile always enters closed.
 * File discovery never changes panel visibility; only the user's toggle does.
 */
export function useWorkspaceCollapse({
  workspaceEnabled,
  isMobile,
  conversation_id,
  preferenceKey,
}: UseWorkspaceCollapseParams): UseWorkspaceCollapseReturn {
  const [rightSiderCollapsed, setRightSiderCollapsed] = useState(true);

  // Restore only an explicit desktop preference. Mobile entry is always closed.
  useEffect(() => {
    if (!workspaceEnabled || isMobile || !preferenceKey) {
      setRightSiderCollapsed(true);
      return;
    }
    try {
      setRightSiderCollapsed(localStorage.getItem(`workspace-preference-${preferenceKey}`) !== 'expanded');
    } catch {
      setRightSiderCollapsed(true);
    }
  }, [isMobile, preferenceKey, workspaceEnabled]);

  // Listen for workspace toggle events
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const handleWorkspaceToggle = () => {
      if (!workspaceEnabled) {
        return;
      }
      setRightSiderCollapsed((prev) => {
        const newState = !prev;
        if (!isMobile && preferenceKey) {
          try {
            localStorage.setItem(`workspace-preference-${preferenceKey}`, newState ? 'collapsed' : 'expanded');
          } catch {
            // ignore errors
          }
        }
        return newState;
      });
    };
    window.addEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    return () => {
      window.removeEventListener(WORKSPACE_TOGGLE_EVENT, handleWorkspaceToggle);
    };
  }, [isMobile, workspaceEnabled, preferenceKey]);

  // Broadcast workspace state event
  useEffect(() => {
    if (!workspaceEnabled) {
      dispatchWorkspaceStateEvent(true);
      return;
    }
    dispatchWorkspaceStateEvent(rightSiderCollapsed);
  }, [rightSiderCollapsed, workspaceEnabled]);

  // Force collapse when workspace is disabled
  useEffect(() => {
    if (!workspaceEnabled) {
      setRightSiderCollapsed(true);
    }
  }, [workspaceEnabled]);

  // Mobile: force collapse when entering mobile mode
  useEffect(() => {
    if (!workspaceEnabled || !isMobile) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [isMobile, workspaceEnabled]);

  // Mobile: force collapse workspace on conversation switch to prevent overlay
  useEffect(() => {
    if (!workspaceEnabled || !isMobile) {
      return;
    }
    setRightSiderCollapsed(true);
  }, [conversation_id, isMobile, workspaceEnabled]);

  // Mobile: blur active element on conversation switch to prevent soft keyboard
  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      blurActiveElement();
    });
    return () => cancelAnimationFrame(rafId);
  }, [conversation_id, isMobile]);

  return { rightSiderCollapsed, setRightSiderCollapsed };
}
