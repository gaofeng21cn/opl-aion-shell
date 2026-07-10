import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const layout = vi.hoisted(() => ({ isMobile: false }));
const preview = vi.hoisted(() => ({ isOpen: false }));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layout,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => preview,
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: () => ({
    splitRatio: 380,
    setSplitRatio: vi.fn(),
    createDragHandle: () => null,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: 1200 }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [] }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useTitleRename', () => ({
  useTitleRename: () => ({
    editingTitle: false,
    setEditingTitle: vi.fn(),
    titleDraft: '',
    setTitleDraft: vi.fn(),
    renameLoading: false,
    canRenameTitle: false,
    submitTitleRename: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatTitleEditor', () => ({
  default: ({ leading, title }: { leading?: React.ReactNode; title?: React.ReactNode }) => (
    <div data-testid='chat-title'>
      {leading}
      {title}
    </div>
  ),
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({ AgentLogoIcon: () => <span /> }));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay', () => ({
  default: ({ rightSiderCollapsed }: { rightSiderCollapsed: boolean }) => (
    <div data-testid='mobile-side-panel' data-collapsed={String(rightSiderCollapsed)} />
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'conversation.sidePanel.open': 'Open tools',
        'conversation.sidePanel.close': 'Close tools',
        'conversation.sidePanel.title': 'Tools',
        'conversation.navigation.back': 'Back',
        'conversation.navigation.forward': 'Forward',
      })[key] ?? key,
  }),
}));

const previewTransitionView = () => (
  <ChatLayout title='Conversation' conversation_id='conversation-1' sider={<div>Preview surface</div>}>
    <div>Timeline</div>
  </ChatLayout>
);

describe('ChatLayout conversation context surfaces', () => {
  beforeEach(() => {
    layout.isMobile = false;
    preview.isOpen = false;
    localStorage.clear();
    document.getElementById('app-titlebar-actions-slot')?.remove();
  });

  it('keeps environment in the header and opens the desktop side panel only by user request', () => {
    render(
      <ChatLayout
        title='Conversation'
        conversation_id='conversation-1'
        environmentSlot={<div data-testid='environment'>Environment</div>}
        sider={<div data-testid='side-content'>Side content</div>}
      >
        <div>Timeline</div>
      </ChatLayout>
    );

    expect(screen.getByTestId('environment')).toBeTruthy();
    expect(screen.queryByRole('complementary')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open tools' }));

    expect(screen.getByRole('complementary')).toBeTruthy();
    expect(screen.getByTestId('side-content')).toBeTruthy();
    expect(screen.getByTestId('environment').closest('[data-testid="conversation-header-tools"]')).toBeTruthy();
  });

  it('uses a closed mobile overlay and opens it from the titlebar action', async () => {
    layout.isMobile = true;
    const slot = document.createElement('div');
    slot.id = 'app-titlebar-actions-slot';
    document.body.appendChild(slot);

    render(
      <ChatLayout
        title='Conversation'
        conversation_id='conversation-1'
        environmentSlot={<div data-testid='mobile-environment'>Environment</div>}
        sider={<div>Side content</div>}
      >
        <div>Timeline</div>
      </ChatLayout>
    );

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'true');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open tools' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Open tools' }));

    expect(screen.getByTestId('mobile-side-panel')).toHaveAttribute('data-collapsed', 'false');
    expect(slot.contains(screen.getByTestId('mobile-environment'))).toBe(true);
  });

  it('ignores initial persisted preview state but opens tools on a later preview transition', () => {
    preview.isOpen = true;
    const { rerender } = render(previewTransitionView());

    expect(screen.queryByRole('complementary')).toBeNull();

    preview.isOpen = false;
    rerender(previewTransitionView());
    expect(screen.queryByRole('complementary')).toBeNull();

    preview.isOpen = true;
    rerender(previewTransitionView());
    expect(screen.getByRole('complementary')).toBeTruthy();
  });
});
