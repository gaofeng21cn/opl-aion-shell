import type { TChatConversation } from '@/common/config/storage';
import ConversationEnvironmentPopover from '@/renderer/pages/conversation/components/ChatLayout/ConversationEnvironmentPopover';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.environment.title': 'Environment',
        'conversation.environment.workspace': 'Workspace',
        'conversation.environment.location': 'Location',
        'conversation.environment.local': 'Local',
        'conversation.environment.git': 'Git',
        'conversation.environment.subtasks': 'Subtasks',
        'conversation.environment.sources': 'Sources',
        'conversation.environment.unavailable': 'Unavailable',
      })[key] ?? key,
  }),
}));

describe('ConversationEnvironmentPopover', () => {
  it('projects only existing conversation and current-task state', async () => {
    const conversation = {
      id: 'conversation-1',
      name: 'Conversation',
      type: 'codex',
      created_at: 1,
      modified_at: 1,
      extra: { workspace: '/projects/demo', git_branch: 'feature/context' },
    } as TChatConversation;

    render(
      <ConversationEnvironmentPopover
        conversation={conversation}
        currentTask={
          {
            title: 'Task',
            subtasks: [{ id: 'one' }, { id: 'two' }],
            resource_source_refs: ['source://workspace'],
          } as never
        }
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Environment' }));

    await waitFor(() => expect(screen.getByTestId('conversation-environment-popover')).toBeTruthy());
    const popover = screen.getByTestId('conversation-environment-popover');
    expect(popover).toHaveTextContent('/projects/demo');
    expect(popover).toHaveTextContent('Local');
    expect(popover).toHaveTextContent('feature/context');
    expect(popover).toHaveTextContent('2');
    expect(popover).toHaveTextContent('source://workspace');
  });
});
