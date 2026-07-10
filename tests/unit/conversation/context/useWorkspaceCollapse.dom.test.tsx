import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { WORKSPACE_HAS_FILES_EVENT, WORKSPACE_TOGGLE_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

const Harness: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const { rightSiderCollapsed } = useWorkspaceCollapse({
    workspaceEnabled: true,
    isMobile,
    conversation_id: 'conversation-1',
    preferenceKey: 'conversation-1',
  });

  return <output data-testid='panel-state'>{rightSiderCollapsed ? 'closed' : 'open'}</output>;
};

describe('useWorkspaceCollapse explicit-open contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stays closed for both initial and mid-session file events', () => {
    render(<Harness />);

    for (const isInitial of [true, false]) {
      act(() => {
        window.dispatchEvent(
          new CustomEvent(WORKSPACE_HAS_FILES_EVENT, {
            detail: { hasFiles: true, isInitial },
          })
        );
      });
      expect(screen.getByTestId('panel-state')).toHaveTextContent('closed');
    }
  });

  it('restores an explicit desktop preference without waiting for a file event', () => {
    localStorage.setItem('workspace-preference-conversation-1', 'expanded');

    render(<Harness />);

    expect(screen.getByTestId('panel-state')).toHaveTextContent('open');
  });

  it('keeps mobile closed on entry but allows a manual open for the current view', () => {
    localStorage.setItem('workspace-preference-conversation-1', 'expanded');
    render(<Harness isMobile />);

    expect(screen.getByTestId('panel-state')).toHaveTextContent('closed');

    act(() => {
      window.dispatchEvent(new Event(WORKSPACE_TOGGLE_EVENT));
    });

    expect(screen.getByTestId('panel-state')).toHaveTextContent('open');
  });
});
