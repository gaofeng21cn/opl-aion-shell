import { ipcBridge } from '@/common';
import type { IDesktopNavigationCommand, IDesktopNavigationState } from '@/common/adapter/ipcBridge';
import { useNavigationHistory } from '@/renderer/hooks/context/NavigationHistoryContext';
import { useVisibleConversationIds } from '@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { useCallback, useEffect, useMemo } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { useLocation } from 'react-router-dom';

type UseConversationShortcutsParams = {
  navigate: NavigateFunction;
};

export const getAdjacentConversationId = (
  visibleConversationIds: string[],
  activeConversationId: string | null,
  direction: 1 | -1
): string | null => {
  if (visibleConversationIds.length < 2 || !activeConversationId) {
    return null;
  }

  const activeIndex = visibleConversationIds.findIndex((conversationId) => conversationId === activeConversationId);
  if (activeIndex === -1) {
    return null;
  }

  return visibleConversationIds[activeIndex + direction] ?? null;
};

const isNewConversationShortcut = (event: KeyboardEvent): boolean => {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 't';
};

export const useConversationShortcuts = ({ navigate }: UseConversationShortcutsParams): void => {
  const location = useLocation();
  const navigationHistory = useNavigationHistory();
  const visibleConversationIds = useVisibleConversationIds();
  const activeConversationId = location.pathname.match(/^\/conversation\/([^/]+)/)?.[1] ?? null;
  const activeConversationIndex = activeConversationId ? visibleConversationIds.indexOf(activeConversationId) : -1;
  const menuState = useMemo<IDesktopNavigationState>(
    () => ({
      canBack: navigationHistory?.canBack ?? false,
      canForward: navigationHistory?.canForward ?? false,
      canPreviousTask: activeConversationIndex > 0,
      canNextTask: activeConversationIndex >= 0 && activeConversationIndex < visibleConversationIds.length - 1,
    }),
    [activeConversationIndex, navigationHistory?.canBack, navigationHistory?.canForward, visibleConversationIds.length]
  );

  const navigateToAdjacentTask = useCallback(
    (direction: 1 | -1) => {
      const targetConversationId = getAdjacentConversationId(visibleConversationIds, activeConversationId, direction);
      if (targetConversationId) {
        void navigate(`/conversation/${targetConversationId}`);
      }
    },
    [activeConversationId, navigate, visibleConversationIds]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || !isElectronDesktop()) {
        return;
      }

      if (isNewConversationShortcut(event)) {
        event.preventDefault();
        void navigate('/guid');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]);

  useEffect(() => {
    if (!isElectronDesktop()) return;

    const handleNavigationCommand = ({ command }: { command: IDesktopNavigationCommand }) => {
      if (!document.hasFocus()) return;

      if (command === 'back' && menuState.canBack) {
        navigationHistory?.back();
      } else if (command === 'forward' && menuState.canForward) {
        navigationHistory?.forward();
      } else if (command === 'previous-task' && menuState.canPreviousTask) {
        navigateToAdjacentTask(-1);
      } else if (command === 'next-task' && menuState.canNextTask) {
        navigateToAdjacentTask(1);
      }
    };

    return ipcBridge.application.desktopNavigationCommand.on(handleNavigationCommand);
  }, [menuState, navigateToAdjacentTask, navigationHistory]);

  useEffect(() => {
    if (!isElectronDesktop()) return;

    const syncMenuState = () => {
      if (!document.hasFocus()) return;
      void ipcBridge.application.setDesktopNavigationState.invoke(menuState).catch((error) => {
        console.error('[DesktopNavigation] Failed to update application menu state:', error);
      });
    };

    syncMenuState();
    window.addEventListener('focus', syncMenuState);
    return () => {
      window.removeEventListener('focus', syncMenuState);
    };
  }, [menuState]);
};
