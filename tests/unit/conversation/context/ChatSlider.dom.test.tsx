import type { TChatConversation } from '@/common/config/storage';
import ChatSlider from '@/renderer/pages/conversation/components/ChatSlider';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const workspaceLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock('@/renderer/pages/conversation/Workspace', () => ({
  default: ({
    eventPrefix,
    showCurrentTask,
    showTabBar,
  }: {
    eventPrefix?: string;
    showCurrentTask?: boolean;
    showTabBar?: boolean;
  }) => {
    React.useEffect(() => {
      workspaceLifecycle.mounts += 1;
      return () => {
        workspaceLifecycle.unmounts += 1;
      };
    }, []);
    return (
      <div
        data-testid='workspace'
        data-event-prefix={eventPrefix}
        data-show-current-task={String(showCurrentTask)}
        data-show-tab-bar={String(showTabBar)}
      >
        Files and changes
      </div>
    );
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.sidePanel.noWorkspace': 'No workspace is active for this conversation.',
      })[key] ?? key,
  }),
}));

const conversation = {
  id: 'conversation-1',
  name: 'Conversation',
  type: 'codex',
  created_at: 1,
  modified_at: 1,
  extra: { workspace: '/projects/demo' },
} as TChatConversation;

describe('ChatSlider workspace surface', () => {
  beforeEach(() => {
    workspaceLifecycle.mounts = 0;
    workspaceLifecycle.unmounts = 0;
  });

  it('renders one Files/Changes workspace without the former inspector tools or Runtime duplicate', () => {
    render(
      <ChatSlider
        conversation={conversation}
        currentTask={{ title: 'Current task' }}
        actionsSlot={<div>Legacy actions</div>}
      />
    );

    expect(screen.getByTestId('workspace')).toHaveAttribute('data-event-prefix', 'codex');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-show-tab-bar', 'true');
    expect(screen.getByTestId('workspace')).toHaveAttribute('data-show-current-task', 'false');
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByText('Legacy actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Runtime')).not.toBeInTheDocument();
    expect(workspaceLifecycle.mounts).toBe(1);
    expect(workspaceLifecycle.unmounts).toBe(0);
  });

  it('shows a clear empty state when no workspace is active', () => {
    render(<ChatSlider conversation={{ ...conversation, extra: {} } as TChatConversation} />);

    expect(screen.getByText('No workspace is active for this conversation.')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace')).not.toBeInTheDocument();
    expect(workspaceLifecycle.mounts).toBe(0);
  });
});
